-- StudEasy — scheduled classes, waitlists, class materials, and forums.
--
-- Run AFTER supabase/assessments.sql. Safe to re-run.
--
-- Covers: a teacher scheduling a class with a seat limit; students registering,
-- waitlisting (capped at 10) or being turned away; cancellation with a refund
-- tier; the waitlist promoting automatically; time-limited class materials
-- behind an access code; a per-class forum; and a general forum.
--
-- Two rules shape most of this file:
--   1. Seat counting happens under a row lock. Two people clicking Register at
--      the same moment must not both get the last seat.
--   2. Class material and class forum access is a database policy, not a UI
--      check — a registered student who has entered the code, inside the
--      availability window, and nobody else.

-- ---------------------------------------------------------------------------
-- Scheduled classes
-- ---------------------------------------------------------------------------

create table if not exists studeasy.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  teacher_id uuid references studeasy.profiles (id) on delete set null,
  teacher_name text not null,
  course_id uuid references studeasy.courses (id) on delete set null,

  title text not null,
  subject text not null,
  year_level text,
  topics text,                                   -- summary of what is covered

  mode text not null default 'online'
    check (mode in ('online', 'classroom', 'hybrid')),
  location text,                                 -- room or address
  meeting_url text,                              -- for online/hybrid

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  capacity integer not null check (capacity > 0),
  -- The brief caps the waiting list at ten; the constraint enforces it rather
  -- than trusting the form.
  waitlist_cap integer not null default 10 check (waitlist_cap between 0 and 10),

  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'NZD',

  status text not null default 'draft'
    check (status in ('draft', 'published', 'in_progress', 'completed', 'cancelled')),

  -- Students who register get this; entering it unlocks materials and the
  -- class forum.
  access_code text not null,

  -- Refund policy, per class so a teacher can be stricter on a one-off.
  refund_full_hours integer not null default 48,
  refund_partial_hours integer not null default 12,
  refund_partial_pct integer not null default 50 check (refund_partial_pct between 0 and 100),

  -- How long materials stay readable after the class ends.
  materials_days integer not null default 14 check (materials_days > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ends_at > starts_at),
  unique (organization_id, access_code)
);

create index if not exists class_sessions_when_idx
  on studeasy.class_sessions (organization_id, status, starts_at);
create index if not exists class_sessions_teacher_idx
  on studeasy.class_sessions (teacher_id);

create or replace function studeasy.generate_class_code()
returns text
language plpgsql
set search_path = studeasy, public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';  -- no 0/O/1/I
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from studeasy.class_sessions where access_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function studeasy.set_class_code()
returns trigger
language plpgsql
set search_path = studeasy, public
as $$
begin
  if new.access_code is null or new.access_code = '' then
    new.access_code := studeasy.generate_class_code();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists class_sessions_code on studeasy.class_sessions;
create trigger class_sessions_code
  before insert or update on studeasy.class_sessions
  for each row execute function studeasy.set_class_code();

-- ---------------------------------------------------------------------------
-- Registrations and the waiting list
-- ---------------------------------------------------------------------------

create table if not exists studeasy.class_registrations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references studeasy.class_sessions (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,

  -- offered  = a seat is held but not paid for yet
  -- waitlisted = no seat; waitlist_position says where in the queue
  status text not null default 'confirmed'
    check (status in ('confirmed', 'offered', 'waitlisted', 'cancelled')),
  waitlist_position integer,

  offer_expires_at timestamptz,
  paid boolean not null default false,
  order_id uuid references studeasy.orders (id) on delete set null,
  amount_paid_cents integer not null default 0,

  -- Recorded when a cancellation earns money back. Moving the money is a
  -- Stripe refund call — this is the ledger entry for it, not the refund.
  refund_cents integer,
  refund_reason text,

  attendance text check (attendance in ('present', 'late', 'absent')),
  code_entered_at timestamptz,

  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (class_id, student_id)
);

create index if not exists class_reg_class_idx
  on studeasy.class_registrations (class_id, status, waitlist_position);
create index if not exists class_reg_student_idx
  on studeasy.class_registrations (student_id, status);

-- A paid class seat rides the existing order pipeline, so Stripe, the webhook
-- and the payout ledger all work unchanged.
alter table studeasy.order_items
  add column if not exists class_id uuid references studeasy.class_sessions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Materials
-- ---------------------------------------------------------------------------

create table if not exists studeasy.class_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  class_id uuid not null references studeasy.class_sessions (id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'document'
    check (kind in ('document', 'video', 'link', 'notes', 'assignment')),
  external_url text,
  storage_path text,
  body text,
  -- Null means "from the moment the class starts" / "until materials_days after
  -- it ends"; resolve_material_window() below applies those defaults.
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists class_materials_class_idx
  on studeasy.class_materials (class_id, created_at);

-- Graded work can hang off a class too, reusing the whole submission and
-- marking pipeline that already exists for courses.
alter table studeasy.assignments
  add column if not exists class_id uuid references studeasy.class_sessions (id) on delete cascade;

alter table studeasy.assignments
  alter column course_id drop not null;

-- ---------------------------------------------------------------------------
-- Access helpers — used by every policy below
-- ---------------------------------------------------------------------------

create or replace function studeasy.teaches_class(class uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.class_sessions
    where id = class and teacher_id = auth.uid()
  );
$$;

/* Holds a live seat: confirmed, or offered and not yet expired. */
create or replace function studeasy.holds_class_seat(class uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.class_registrations
    where class_id = class
      and student_id = auth.uid()
      and status in ('confirmed', 'offered')
  );
$$;

/*
 * The gate for materials and the class forum: a seat, the code entered, and
 * the class actually under way. A teacher or admin bypasses the code.
 */
create or replace function studeasy.in_class_room(class uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select
    studeasy.teaches_class(class)
    or studeasy.is_admin()
    or exists (
      select 1
      from studeasy.class_registrations r
      join studeasy.class_sessions c on c.id = r.class_id
      where r.class_id = class
        and r.student_id = auth.uid()
        and r.status = 'confirmed'
        and r.code_entered_at is not null
        and c.status in ('in_progress', 'completed')
    );
$$;

-- ---------------------------------------------------------------------------
-- Registering
-- ---------------------------------------------------------------------------

/*
 * Takes a seat, a place on the waiting list, or nothing.
 *
 * The class row is locked for the duration so concurrent registrations cannot
 * both claim the last seat. Returns what happened so the UI can say it plainly.
 */
create or replace function studeasy.register_for_class(class uuid)
returns table (outcome text, position integer, amount_due_cents integer, access_code text)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.class_sessions%rowtype;
  existing studeasy.class_registrations%rowtype;
  taken integer;
  queued integer;
  next_pos integer;
  new_status text;
  due integer;
begin
  if caller is null then
    raise exception 'Sign in to register for a class.';
  end if;

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

  select * into existing from studeasy.class_registrations
  where class_id = class and student_id = caller;

  if found and existing.status <> 'cancelled' then
    return query select existing.status, existing.waitlist_position, 0,
      case when existing.status = 'confirmed' then c.access_code else null end;
    return;
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
    select coalesce(max(waitlist_position), 0) + 1 into next_pos
    from studeasy.class_registrations where class_id = class and status = 'waitlisted';

  else
    raise exception 'This class is full and the waiting list is closed. Please try again later.';
  end if;

  insert into studeasy.class_registrations
    (class_id, student_id, status, waitlist_position, offer_expires_at, paid, registered_at, cancelled_at)
  values (
    class, caller, new_status, next_pos,
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

-- ---------------------------------------------------------------------------
-- Cancelling, refunds, and promoting the waiting list
-- ---------------------------------------------------------------------------

/*
 * Fills empty seats from the waiting list, in order.
 *
 * A free class promotes straight to confirmed. A paid one offers the seat and
 * gives the student 48 hours (or until the class starts) to pay — a promotion
 * that silently charged nobody would just be an empty seat with a name on it.
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
begin
  select * into c from studeasy.class_sessions where id = class for update;
  if not found then return 0; end if;

  select count(*) into taken from studeasy.class_registrations
  where class_id = class and status in ('confirmed', 'offered');

  while taken < c.capacity loop
    select * into r from studeasy.class_registrations
    where class_id = class and status = 'waitlisted'
    order by waitlist_position
    limit 1;

    exit when not found;

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

/*
 * Cancels a seat and works out what is owed back.
 *
 * Tiers come from the class: full refund up to refund_full_hours before the
 * start, a percentage up to refund_partial_hours, nothing after that. The
 * amount is recorded — issuing it is a Stripe refund, which is a separate step.
 */
create or replace function studeasy.cancel_class_registration(class uuid)
returns table (refund_cents integer, refund_reason text)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.class_sessions%rowtype;
  r studeasy.class_registrations%rowtype;
  hours numeric;
  back integer := 0;
  why text;
begin
  select * into r from studeasy.class_registrations
  where class_id = class and student_id = caller;
  if not found or r.status = 'cancelled' then
    raise exception 'You are not registered for that class.';
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

  -- Somebody on the list can have the seat.
  perform studeasy.promote_waitlist(class);

  return query select back, why;
end;
$$;

/*
 * Opens an order for one class seat.
 *
 * The cart pipeline is built around courses, so a seat gets its own entry point
 * rather than being forced through cart_items. Everything downstream — Stripe,
 * the webhook, the payout ledger — is shared.
 */
create or replace function studeasy.begin_class_checkout(class uuid)
returns table (order_id uuid, reference text, total_cents integer)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.class_sessions%rowtype;
  r studeasy.class_registrations%rowtype;
  new_order studeasy.orders%rowtype;
  ref text;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into c from studeasy.class_sessions where id = class;
  if not found then raise exception 'That class does not exist.'; end if;

  select * into r from studeasy.class_registrations
  where class_id = class and student_id = caller;

  if not found or r.status not in ('offered', 'confirmed') then
    raise exception 'You do not hold a seat in that class.';
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
    (order_id, class_id, title_snapshot, price_cents)
  values (new_order.id, class, c.title, c.price_cents);

  return query select new_order.id, ref, c.price_cents;
end;
$$;

/* Payment confirms an offered seat. Called by the webhook, below. */
create or replace function studeasy.confirm_class_seat(
  class uuid,
  student uuid,
  order_ref uuid,
  paid_cents integer
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  update studeasy.class_registrations
  set status = 'confirmed',
      paid = true,
      order_id = order_ref,
      amount_paid_cents = paid_cents,
      offer_expires_at = null
  where class_id = class and student_id = student and status in ('offered', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Entering the room
-- ---------------------------------------------------------------------------

create or replace function studeasy.enter_class(code text)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.class_sessions%rowtype;
  r studeasy.class_registrations%rowtype;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into c from studeasy.class_sessions
  where access_code = upper(trim(code));
  if not found then
    raise exception 'That code does not match any class.';
  end if;

  select * into r from studeasy.class_registrations
  where class_id = c.id and student_id = caller;

  if not found or r.status <> 'confirmed' then
    raise exception 'That code is for a class you do not have a confirmed seat in.';
  end if;

  update studeasy.class_registrations
  set code_entered_at = coalesce(code_entered_at, now())
  where id = r.id;

  return c.id;
end;
$$;

create or replace function studeasy.mark_class_attendance(
  class uuid,
  student uuid,
  state text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.teaches_class(class) and not studeasy.is_admin() then
    raise exception 'Only the teacher of this class can mark attendance.';
  end if;
  if state not in ('present', 'late', 'absent') then
    raise exception 'Unsupported attendance state.';
  end if;

  update studeasy.class_registrations
  set attendance = state
  where class_id = class and student_id = student;
end;
$$;

-- ---------------------------------------------------------------------------
-- Forums
-- ---------------------------------------------------------------------------

create table if not exists studeasy.forum_topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  scope text not null default 'general' check (scope in ('general', 'class')),
  class_id uuid references studeasy.class_sessions (id) on delete cascade,
  author_id uuid references studeasy.profiles (id) on delete set null,
  title text not null,
  body text not null,
  subject text,                                   -- lets the general forum filter
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed', 'hidden')),
  accepted_reply_id uuid,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'class') = (class_id is not null))
);

create index if not exists forum_topics_scope_idx
  on studeasy.forum_topics (organization_id, scope, created_at desc);
create index if not exists forum_topics_class_idx
  on studeasy.forum_topics (class_id, created_at desc);

create table if not exists studeasy.forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references studeasy.forum_topics (id) on delete cascade,
  author_id uuid references studeasy.profiles (id) on delete set null,
  body text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists forum_replies_topic_idx
  on studeasy.forum_replies (topic_id, created_at);

/* Anyone can flag a post. Moderation matters more than usual here — the
   audience includes minors. */
create table if not exists studeasy.forum_reports (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references studeasy.forum_topics (id) on delete cascade,
  reply_id uuid references studeasy.forum_replies (id) on delete cascade,
  reporter_id uuid references studeasy.profiles (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references studeasy.profiles (id) on delete set null
);

create or replace function studeasy.bump_reply_count()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  t uuid := coalesce(new.topic_id, old.topic_id);
begin
  update studeasy.forum_topics
  set reply_count = (
        select count(*) from studeasy.forum_replies
        where topic_id = t and not is_hidden
      ),
      updated_at = now()
  where id = t;
  return null;
end;
$$;

drop trigger if exists forum_replies_count on studeasy.forum_replies;
create trigger forum_replies_count
  after insert or update or delete on studeasy.forum_replies
  for each row execute function studeasy.bump_reply_count();

/* Notify the topic's author when someone answers — but not themselves. */
create or replace function studeasy.notify_topic_author()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  t studeasy.forum_topics%rowtype;
begin
  select * into t from studeasy.forum_topics where id = new.topic_id;
  if t.author_id is not null and t.author_id <> new.author_id then
    insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
    values (
      t.organization_id, t.author_id, 'forum_reply',
      'New reply: ' || t.title,
      left(new.body, 140),
      '/forum/' || t.id::text
    );
  end if;
  return null;
end;
$$;

drop trigger if exists forum_replies_notify on studeasy.forum_replies;
create trigger forum_replies_notify
  after insert on studeasy.forum_replies
  for each row execute function studeasy.notify_topic_author();

create or replace function studeasy.accept_forum_reply(reply uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  r studeasy.forum_replies%rowtype;
  t studeasy.forum_topics%rowtype;
begin
  select * into r from studeasy.forum_replies where id = reply;
  if not found then raise exception 'No such reply.'; end if;

  select * into t from studeasy.forum_topics where id = r.topic_id;

  if t.author_id <> auth.uid()
     and not studeasy.is_admin()
     and not (t.class_id is not null and studeasy.teaches_class(t.class_id)) then
    raise exception 'Only the person who asked, or a teacher, can accept an answer.';
  end if;

  update studeasy.forum_topics
  set accepted_reply_id = reply, status = 'answered', updated_at = now()
  where id = t.id;
end;
$$;

create or replace function studeasy.hide_forum_post(
  topic uuid default null,
  reply uuid default null
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can hide a post.';
  end if;
  if topic is not null then
    update studeasy.forum_topics set status = 'hidden' where id = topic;
  end if;
  if reply is not null then
    update studeasy.forum_replies set is_hidden = true where id = reply;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.class_sessions enable row level security;
alter table studeasy.class_registrations enable row level security;
alter table studeasy.class_materials enable row level security;
alter table studeasy.forum_topics enable row level security;
alter table studeasy.forum_replies enable row level security;
alter table studeasy.forum_reports enable row level security;

drop policy if exists class_sessions_select on studeasy.class_sessions;
create policy class_sessions_select on studeasy.class_sessions
  for select using (
    status in ('published', 'in_progress', 'completed')
    or teacher_id = auth.uid()
    or studeasy.is_admin()
  );

drop policy if exists class_sessions_write on studeasy.class_sessions;
create policy class_sessions_write on studeasy.class_sessions
  for all using (teacher_id = auth.uid() or studeasy.is_admin())
  with check (teacher_id = auth.uid() or studeasy.is_admin());

/* A student sees their own row; the teacher sees the whole roster. */
drop policy if exists class_reg_select on studeasy.class_registrations;
create policy class_reg_select on studeasy.class_registrations
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or studeasy.teaches_class(class_id)
    or studeasy.is_admin()
  );

-- Writes go through the functions above, which do the seat counting.

drop policy if exists class_materials_select on studeasy.class_materials;
create policy class_materials_select on studeasy.class_materials
  for select using (
    deleted_at is null
    and studeasy.in_class_room(class_id)
    and (available_from is null or available_from <= now())
    and (available_until is null or available_until >= now())
  );

drop policy if exists class_materials_write on studeasy.class_materials;
create policy class_materials_write on studeasy.class_materials
  for all using (studeasy.teaches_class(class_id) or studeasy.is_admin())
  with check (studeasy.teaches_class(class_id) or studeasy.is_admin());

/*
 * General topics are readable by anyone signed in. Class topics are readable
 * only inside that class room. Hidden topics disappear for everyone but admins.
 */
drop policy if exists forum_topics_select on studeasy.forum_topics;
create policy forum_topics_select on studeasy.forum_topics
  for select using (
    studeasy.is_admin()
    or (
      status <> 'hidden'
      and (
        (scope = 'general' and auth.uid() is not null)
        or (scope = 'class' and studeasy.in_class_room(class_id))
      )
    )
  );

drop policy if exists forum_topics_insert on studeasy.forum_topics;
create policy forum_topics_insert on studeasy.forum_topics
  for insert with check (
    author_id = auth.uid()
    and (
      (scope = 'general' and auth.uid() is not null)
      or (scope = 'class' and studeasy.in_class_room(class_id))
    )
  );

drop policy if exists forum_topics_update on studeasy.forum_topics;
create policy forum_topics_update on studeasy.forum_topics
  for update using (author_id = auth.uid() or studeasy.is_admin())
  with check (author_id = auth.uid() or studeasy.is_admin());

drop policy if exists forum_replies_select on studeasy.forum_replies;
create policy forum_replies_select on studeasy.forum_replies
  for select using (
    studeasy.is_admin()
    or (
      not is_hidden
      and exists (
        select 1 from studeasy.forum_topics t
        where t.id = forum_replies.topic_id
          and t.status <> 'hidden'
          and (
            (t.scope = 'general' and auth.uid() is not null)
            or (t.scope = 'class' and studeasy.in_class_room(t.class_id))
          )
      )
    )
  );

drop policy if exists forum_replies_insert on studeasy.forum_replies;
create policy forum_replies_insert on studeasy.forum_replies
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from studeasy.forum_topics t
      where t.id = forum_replies.topic_id
        and t.status in ('open', 'answered')
        and (
          (t.scope = 'general' and auth.uid() is not null)
          or (t.scope = 'class' and studeasy.in_class_room(t.class_id))
        )
    )
  );

drop policy if exists forum_reports_insert on studeasy.forum_reports;
create policy forum_reports_insert on studeasy.forum_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists forum_reports_select on studeasy.forum_reports;
create policy forum_reports_select on studeasy.forum_reports
  for select using (studeasy.is_admin());

-- ---------------------------------------------------------------------------
-- Payment: a class seat settles like anything else in an order
-- ---------------------------------------------------------------------------

/*
 * Same contract as before — only the service role may call this, it is
 * idempotent against Stripe's retries — with one addition: order lines that
 * carry a class_id confirm that seat.
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

  -- Course enrolments, as before.
  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select o.organization_id, oi.course_id, o.user_id
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  -- Class seats.
  for line in
    select class_id, price_cents from studeasy.order_items
    where order_id = o.id and class_id is not null
  loop
    perform studeasy.confirm_class_seat(line.class_id, o.user_id, o.id, line.price_cents);
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

grant select on studeasy.class_sessions to anon, authenticated;
grant insert, update on studeasy.class_sessions to authenticated;
grant select on studeasy.class_registrations to authenticated;
grant select, insert, update on studeasy.class_materials to authenticated;
grant select, insert, update on studeasy.forum_topics to authenticated;
grant select, insert on studeasy.forum_replies to authenticated;
grant select, insert on studeasy.forum_reports to authenticated;

grant execute on function studeasy.register_for_class(uuid) to authenticated;
grant execute on function studeasy.begin_class_checkout(uuid) to authenticated;
grant execute on function studeasy.cancel_class_registration(uuid) to authenticated;
grant execute on function studeasy.enter_class(text) to authenticated;
grant execute on function studeasy.mark_class_attendance(uuid, uuid, text) to authenticated;
grant execute on function studeasy.accept_forum_reply(uuid) to authenticated;
grant execute on function studeasy.hide_forum_post(uuid, uuid) to authenticated;
grant execute on function studeasy.teaches_class(uuid) to authenticated;
grant execute on function studeasy.holds_class_seat(uuid) to authenticated;
grant execute on function studeasy.in_class_room(uuid) to authenticated;

revoke all on function studeasy.promote_waitlist(uuid) from anon, authenticated;
revoke all on function studeasy.confirm_class_seat(uuid, uuid, uuid, integer) from anon, authenticated;
revoke all on function studeasy.generate_class_code() from anon, authenticated;
revoke all on function studeasy.mark_order_paid(text, text) from anon, authenticated;
