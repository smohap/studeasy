-- StudEasy — who may take a seat, and when they are already busy.
--
-- Run AFTER supabase/family.sql. Safe to re-run.
--
-- Three rules:
--
--   1. You cannot register for a class you teach. Someone holding both the
--      student and tutor roles could otherwise fill their own seat, promote
--      themselves off their own waiting list, and pay themselves for it.
--   2. A parent can register their own child. The child still has to be
--      genuinely theirs — the same is_my_child() link the rest of the parent
--      portal runs on, which the student approved.
--   3. Nobody can be in two places at once. One person's teaching and
--      attending are checked together, so a tutor who is also a student cannot
--      publish a class over one they are sitting in.

-- ---------------------------------------------------------------------------
-- Being in two places at once
-- ---------------------------------------------------------------------------

/*
 * The title of something this person is already committed to across that
 * window, or null if they are free.
 *
 * Teaching and attending are one calendar. Checking them separately would let
 * a tutor who is also a student book over their own lesson.
 *
 * Overlap is half-open: a class ending at 16:00 does not clash with one
 * starting at 16:00. Back-to-back is a normal timetable, not a conflict.
 */
create or replace function studeasy.has_time_clash(
  person uuid,
  window_start timestamptz,
  window_end timestamptz,
  exclude_class uuid default null
)
returns text
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select busy.title
  from (
    -- Classes they teach.
    select c.title, c.starts_at, c.ends_at
    from studeasy.class_sessions c
    where c.teacher_id = person
      and c.status in ('published', 'in_progress')
      and (exclude_class is null or c.id <> exclude_class)

    union all

    -- Classes they hold a seat in. A waiting-list place is not a commitment,
    -- so it blocks nothing.
    select c.title, c.starts_at, c.ends_at
    from studeasy.class_registrations r
    join studeasy.class_sessions c on c.id = r.class_id
    where r.student_id = person
      and r.status in ('confirmed', 'offered')
      and c.status <> 'cancelled'
      and (exclude_class is null or c.id <> exclude_class)
  ) busy
  where busy.starts_at < window_end
    and window_start < busy.ends_at
  limit 1;
$$;

/*
 * Stops a teacher publishing a class over something they are already doing.
 *
 * Only on the way to published or in_progress — a draft is still being planned,
 * and refusing to let someone sketch two options would be obstructive. The
 * class excludes itself, so editing a published class does not clash with it.
 */
create or replace function studeasy.guard_class_schedule()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  clash text;
begin
  if new.status in ('published', 'in_progress') and new.teacher_id is not null then
    clash := studeasy.has_time_clash(
      new.teacher_id, new.starts_at, new.ends_at, new.id
    );
    if clash is not null then
      raise exception
        'That overlaps "%", which is already in your timetable. Move one of them first.',
        clash;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists class_sessions_schedule on studeasy.class_sessions;
create trigger class_sessions_schedule
  before insert or update on studeasy.class_sessions
  for each row execute function studeasy.guard_class_schedule();

-- ---------------------------------------------------------------------------
-- Taking a seat
-- ---------------------------------------------------------------------------

/*
 * The seat-taking itself, for whichever student is named.
 *
 * No authorisation here at all — the two wrappers below decide who may ask,
 * which is why this is revoked from every client role. Splitting it out means a
 * parent registering a child and a student registering themselves run exactly
 * the same capacity, waiting-list and pricing rules.
 */
create or replace function studeasy.place_in_class(class uuid, student uuid)
returns table (
  outcome text,
  waitlist_position integer,
  amount_due_cents integer,
  access_code text
)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  c studeasy.class_sessions%rowtype;
  existing studeasy.class_registrations%rowtype;
  clash text;
  taken integer;
  queued integer;
  next_pos integer;
  new_status text;
  due integer;
begin
  -- Serialises everyone trying to register for this class.
  select * into c from studeasy.class_sessions where id = class for update;
  if not found then
    raise exception 'That class does not exist.';
  end if;
  if c.status not in ('published', 'in_progress') then
    raise exception 'That class is not open for registration.';
  end if;
  if c.starts_at < now() and c.status = 'published' then
    raise exception 'That class has already started.';
  end if;

  -- Give up the seats nobody paid for before deciding whether this is full.
  perform studeasy.release_expired_offers(class);

  select * into existing from studeasy.class_registrations
  where class_id = class and student_id = student;

  if found and existing.status <> 'cancelled' then
    return query select existing.status, existing.waitlist_position, 0,
      case when existing.status = 'confirmed' then c.access_code else null end;
    return;
  end if;

  clash := studeasy.has_time_clash(student, c.starts_at, c.ends_at, class);
  if clash is not null then
    raise exception 'That clashes with "%", which is already booked at that time.', clash;
  end if;

  select count(*) into taken from studeasy.class_registrations
  where class_id = class and status in ('confirmed', 'offered');

  select count(*) into queued from studeasy.class_registrations
  where class_id = class and status = 'waitlisted';

  if taken < c.capacity then
    -- A free class confirms outright; a paid one holds the seat until payment.
    if c.price_cents = 0 then
      new_status := 'confirmed';
      due := 0;
    else
      new_status := 'offered';
      due := c.price_cents;
    end if;
    next_pos := null;

  elsif queued < c.waitlist_cap then
    new_status := 'waitlisted';
    due := 0;
    -- Aliased because waitlist_position is also an output parameter here.
    select coalesce(max(r.waitlist_position), 0) + 1 into next_pos
    from studeasy.class_registrations r
    where r.class_id = class and r.status = 'waitlisted';

  else
    raise exception 'This class is full and the waiting list is closed. Please try again later.';
  end if;

  insert into studeasy.class_registrations
    (class_id, student_id, status, waitlist_position, offer_expires_at, paid, registered_at, cancelled_at)
  values (
    class, student, new_status, next_pos,
    case when new_status = 'offered' then least(now() + interval '48 hours', c.starts_at) end,
    new_status = 'confirmed' and c.price_cents = 0,
    now(), null
  )
  on conflict (class_id, student_id) do update
    set status = excluded.status,
        waitlist_position = excluded.waitlist_position,
        offer_expires_at = excluded.offer_expires_at,
        paid = excluded.paid,
        registered_at = now(),
        cancelled_at = null,
        refund_cents = null,
        refund_reason = null;

  return query select
    new_status,
    next_pos,
    due,
    case when new_status = 'confirmed' then c.access_code else null end;
end;
$$;

/* A student takes their own seat. */
create or replace function studeasy.register_for_class(class uuid)
returns table (
  outcome text,
  waitlist_position integer,
  amount_due_cents integer,
  access_code text
)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in to register for a class.';
  end if;

  /*
   * You cannot attend your own class. Somebody holding both roles would
   * otherwise occupy one of their own seats, promote themselves off their own
   * waiting list, and — on a paid class — pay themselves for the privilege.
   */
  if exists (
    select 1 from studeasy.class_sessions
    where id = class and teacher_id = caller
  ) then
    raise exception 'You are teaching this class, so you cannot register for it.';
  end if;

  return query select * from studeasy.place_in_class(class, caller);
end;
$$;

/*
 * A parent registers one of their children.
 *
 * is_my_child() is the same link the rest of the parent portal runs on, and the
 * student approved it — so this cannot book a seat for a stranger.
 */
create or replace function studeasy.register_child_for_class(class uuid, student uuid)
returns table (
  outcome text,
  waitlist_position integer,
  amount_due_cents integer,
  access_code text
)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;
  if not studeasy.has_role('parent') then
    raise exception 'Only a parent account can register a child.';
  end if;
  if not studeasy.is_my_child(student) then
    raise exception 'That student is not linked to your account.';
  end if;
  if exists (
    select 1 from studeasy.class_sessions
    where id = class and teacher_id = student
  ) then
    raise exception 'They are teaching this class, so they cannot register for it.';
  end if;

  return query select * from studeasy.place_in_class(class, student);
end;
$$;

-- ---------------------------------------------------------------------------
-- Promotion, now that a seat can clash
-- ---------------------------------------------------------------------------

/*
 * Fills empty seats from the waiting list, in order, skipping anyone who has
 * since booked something else at that time.
 *
 * Without the skip, promotion would hand somebody a seat the registration rules
 * would have refused them a moment earlier. They keep their place rather than
 * being dropped — the clash may well be the thing that gets cancelled.
 */
create or replace function studeasy.promote_waitlist(class uuid)
returns integer
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  c studeasy.class_sessions%rowtype;
  taken integer;
  promoted integer := 0;
  r studeasy.class_registrations%rowtype;
  skipped uuid[] := '{}';
begin
  select * into c from studeasy.class_sessions where id = class for update;
  if not found then return 0; end if;

  select count(*) into taken from studeasy.class_registrations
  where class_id = class and status in ('confirmed', 'offered');

  while taken < c.capacity loop
    select * into r from studeasy.class_registrations
    where class_id = class
      and status = 'waitlisted'
      and not (student_id = any (skipped))
    order by waitlist_position
    limit 1;

    exit when not found;

    if studeasy.has_time_clash(r.student_id, c.starts_at, c.ends_at, class) is not null then
      -- Leave them queued; try the next person.
      skipped := skipped || r.student_id;
      continue;
    end if;

    update studeasy.class_registrations
    set status = case when c.price_cents = 0 then 'confirmed' else 'offered' end,
        waitlist_position = null,
        paid = (c.price_cents = 0),
        offer_expires_at = case
          when c.price_cents > 0 then least(now() + interval '48 hours', c.starts_at)
        end
    where id = r.id;

    insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
    values (
      c.organization_id, r.student_id, 'waitlist_promoted',
      'A seat opened up: ' || c.title,
      case when c.price_cents = 0
        then 'You are in. The class details are in your portal.'
        else 'You have 48 hours to pay and keep the seat.'
      end,
      '/classes/' || class::text
    );

    taken := taken + 1;
    promoted := promoted + 1;
  end loop;

  -- Close the gaps so positions stay 1, 2, 3…
  with ranked as (
    select id, row_number() over (order by waitlist_position, registered_at) as rn
    from studeasy.class_registrations
    where class_id = class and status = 'waitlisted'
  )
  update studeasy.class_registrations reg
  set waitlist_position = ranked.rn
  from ranked where ranked.id = reg.id;

  return promoted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelling, now that a parent may have booked it
-- ---------------------------------------------------------------------------

/*
 * Recreated rather than replaced: adding a defaulted second parameter to the
 * existing one-argument function would leave every single-argument call
 * ambiguous between the two.
 */
drop function if exists studeasy.cancel_class_registration(uuid);

create or replace function studeasy.cancel_class_registration(
  class uuid,
  student uuid default null
)
returns table (refund_cents integer, refund_reason text)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  target uuid := coalesce(student, auth.uid());
  c studeasy.class_sessions%rowtype;
  r studeasy.class_registrations%rowtype;
  hours numeric;
  back integer := 0;
  why text;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;
  -- A parent may cancel for a child they booked. Nobody else may cancel for
  -- anybody.
  if target <> caller and not studeasy.is_my_child(target) and not studeasy.is_admin() then
    raise exception 'You cannot cancel that registration.';
  end if;

  select * into r from studeasy.class_registrations
  where class_id = class and student_id = target;
  if not found or r.status = 'cancelled' then
    raise exception 'That registration does not exist.';
  end if;

  select * into c from studeasy.class_sessions where id = class;
  hours := extract(epoch from (c.starts_at - now())) / 3600.0;

  if not r.paid or r.amount_paid_cents = 0 then
    back := 0;
    why := 'Nothing was paid, so there is nothing to refund.';
  elsif hours >= c.refund_full_hours then
    back := r.amount_paid_cents;
    why := format('Cancelled more than %s hours before the class — full refund.', c.refund_full_hours);
  elsif hours >= c.refund_partial_hours then
    back := round(r.amount_paid_cents * c.refund_partial_pct / 100.0);
    why := format('Cancelled inside %s hours — %s%% refund.', c.refund_full_hours, c.refund_partial_pct);
  else
    back := 0;
    why := format('Cancelled less than %s hours before the class — no refund.', c.refund_partial_hours);
  end if;

  update studeasy.class_registrations
  set status = 'cancelled',
      waitlist_position = null,
      cancelled_at = now(),
      refund_cents = back,
      refund_reason = why
  where id = r.id;

  perform studeasy.promote_waitlist(class);

  return query select back, why;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paying for somebody else's seat
-- ---------------------------------------------------------------------------

/*
 * Which student an order line is for.
 *
 * Without this, mark_order_paid() confirmed the seat for orders.user_id — the
 * person who paid. A parent buying a seat for their child would have confirmed
 * their own, and the child would still have been waiting to pay.
 */
alter table studeasy.order_items
  add column if not exists student_id uuid references studeasy.profiles (id) on delete set null;

drop function if exists studeasy.begin_class_checkout(uuid);

create or replace function studeasy.begin_class_checkout(
  class uuid,
  student uuid default null
)
returns table (order_id uuid, reference text, total_cents integer)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  target uuid := coalesce(student, auth.uid());
  c studeasy.class_sessions%rowtype;
  r studeasy.class_registrations%rowtype;
  new_order studeasy.orders%rowtype;
  ref text;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;
  if target <> caller and not studeasy.is_my_child(target) then
    raise exception 'You cannot pay for that seat.';
  end if;

  select * into c from studeasy.class_sessions where id = class;
  if not found then raise exception 'That class does not exist.'; end if;

  select * into r from studeasy.class_registrations
  where class_id = class and student_id = target;

  if not found or r.status not in ('offered', 'confirmed') then
    raise exception 'There is no seat held in that class.';
  end if;
  if r.paid then
    raise exception 'That seat is already paid for.';
  end if;

  ref := 'CLS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into studeasy.orders
    (organization_id, user_id, reference, status, total_cents, currency)
  values (c.organization_id, caller, ref, 'pending', c.price_cents, c.currency)
  returning * into new_order;

  insert into studeasy.order_items
    (order_id, class_id, student_id, title_snapshot, price_cents)
  values (new_order.id, class, target, c.title, c.price_cents);

  return query select new_order.id, ref, c.price_cents;
end;
$$;

/*
 * Same contract as before — service role only, idempotent against Stripe's
 * retries — with one correction: a class line confirms the seat for the student
 * named on it, who is not always the person who paid.
 */
create or replace function studeasy.mark_order_paid(
  session_id text,
  payment_intent text
)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  o studeasy.orders%rowtype;
  fee_pct numeric;
  line record;
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(
       (current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''
     ) <> 'service_role' then
    raise exception 'Only the payment webhook can settle an order.';
  end if;

  select * into o from studeasy.orders where stripe_session_id = session_id;
  if not found then
    raise exception 'Unknown checkout session.';
  end if;
  if o.status = 'paid' then
    return 'already_paid';
  end if;

  select platform_fee_pct into fee_pct
  from studeasy.organizations where id = o.organization_id;

  update studeasy.orders
  set status = 'paid',
      paid_at = now(),
      stripe_payment_intent = payment_intent,
      platform_fee_cents = round(o.total_cents * coalesce(fee_pct, 20) / 100.0)
  where id = o.id;

  -- Course enrolments, for whoever the line names.
  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select o.organization_id, oi.course_id, coalesce(oi.student_id, o.user_id)
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  -- Class seats, likewise.
  for line in
    select class_id, student_id, price_cents from studeasy.order_items
    where order_id = o.id and class_id is not null
  loop
    perform studeasy.confirm_class_seat(
      line.class_id, coalesce(line.student_id, o.user_id), o.id, line.price_cents
    );
  end loop;

  -- Teacher payouts for both kinds of line.
  insert into studeasy.payouts
    (organization_id, teacher_id, order_id, course_id,
     gross_cents, platform_fee_cents, net_cents)
  select
    o.organization_id,
    coalesce(c.teacher_id, cs.teacher_id),
    o.id,
    c.id,
    oi.price_cents,
    round(oi.price_cents * coalesce(fee_pct, 20) / 100.0),
    oi.price_cents - round(oi.price_cents * coalesce(fee_pct, 20) / 100.0)
  from studeasy.order_items oi
  left join studeasy.courses c on c.id = oi.course_id
  left join studeasy.class_sessions cs on cs.id = oi.class_id
  where oi.order_id = o.id and oi.price_cents > 0;

  delete from studeasy.cart_items where user_id = o.user_id;

  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function studeasy.has_time_clash(uuid, timestamptz, timestamptz, uuid)
  to authenticated;
grant execute on function studeasy.register_for_class(uuid) to authenticated;
grant execute on function studeasy.register_child_for_class(uuid, uuid) to authenticated;
grant execute on function studeasy.cancel_class_registration(uuid, uuid) to authenticated;
grant execute on function studeasy.begin_class_checkout(uuid, uuid) to authenticated;

-- The wrappers above are the only way in; this one asks no questions.
revoke all on function studeasy.place_in_class(uuid, uuid) from anon, authenticated;
revoke all on function studeasy.promote_waitlist(uuid) from anon, authenticated;
revoke all on function studeasy.mark_order_paid(text, text) from anon, authenticated;
revoke all on function studeasy.guard_class_schedule() from anon, authenticated;
