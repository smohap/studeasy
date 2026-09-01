-- StudEasy — how an assessment is sat, what it costs, and when it closes.
--
-- Run AFTER supabase/scheduling.sql. Safe to re-run.
--
-- An assessment used to be one thing: a set of questions answered in the
-- browser, free, available forever. It is now three:
--
--   online     answered in the browser, optionally against a clock
--   classroom  sat in person, so it needs a place and a time
--   offline    a paper to download, and optionally an answer file to upload
--
-- Any of them can be free or paid, and any of them can hang off a class — in
-- which case the people registered for that class sit it for nothing.

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------

alter table studeasy.assessments
  add column if not exists delivery text not null default 'online',
  add column if not exists price_cents integer not null default 0,
  add column if not exists currency text not null default 'NZD',
  add column if not exists class_id uuid references studeasy.class_sessions (id) on delete set null,
  add column if not exists location text,
  add column if not exists meeting_url text,
  -- The window the assessment is open. An online test is set at a date and
  -- time and closes on its own when it passes; a classroom sitting uses the
  -- same pair for when it is held; offline uses closes_at as the hand-in date.
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  -- Offline only: the paper students download.
  add column if not exists paper_url text,
  add column if not exists paper_path text,
  add column if not exists allow_upload boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessments_delivery_check'
  ) then
    alter table studeasy.assessments
      add constraint assessments_delivery_check
      check (delivery in ('online', 'classroom', 'offline'));
  end if;
end $$;

alter table studeasy.attempts
  add column if not exists upload_path text,
  add column if not exists upload_name text,
  -- Set when the sweep submitted this on the student's behalf, so a zero here
  -- can be told apart from a zero they earned.
  add column if not exists auto_closed boolean not null default false;

create index if not exists assessments_class_idx
  on studeasy.assessments (class_id);
create index if not exists assessments_window_idx
  on studeasy.assessments (status, opens_at, closes_at);

/*
 * A published assessment has to be sittable.
 *
 * Checked on publish rather than as a table constraint, because a draft is
 * still being written and half-filled drafts are the normal case.
 */
create or replace function studeasy.guard_assessment_shape()
returns trigger
language plpgsql
set search_path = studeasy, public
as $$
begin
  new.updated_at := now();

  if new.status = 'published' then
    if new.delivery = 'classroom' then
      if coalesce(trim(new.location), '') = '' then
        raise exception 'A classroom assessment needs a location.';
      end if;
      if new.opens_at is null then
        raise exception 'A classroom assessment needs a date and time.';
      end if;
    end if;

    if new.delivery = 'offline'
       and coalesce(trim(new.paper_url), '') = ''
       and coalesce(trim(new.paper_path), '') = '' then
      raise exception 'An offline assessment needs a paper for students to download.';
    end if;

    if new.opens_at is not null and new.closes_at is not null
       and new.closes_at <= new.opens_at then
      raise exception 'It cannot close before it opens.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists assessments_shape on studeasy.assessments;
create trigger assessments_shape
  before insert or update on studeasy.assessments
  for each row execute function studeasy.guard_assessment_shape();

-- ---------------------------------------------------------------------------
-- Paying for one
-- ---------------------------------------------------------------------------

create table if not exists studeasy.assessment_purchases (
  assessment_id uuid not null references studeasy.assessments (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  order_id uuid references studeasy.orders (id) on delete set null,
  amount_paid_cents integer not null default 0,
  purchased_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);

alter table studeasy.assessment_purchases enable row level security;

drop policy if exists assessment_purchases_select on studeasy.assessment_purchases;
create policy assessment_purchases_select on studeasy.assessment_purchases
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or studeasy.is_admin()
  );

-- Written by the webhook only — no insert policy.

alter table studeasy.order_items
  add column if not exists assessment_id uuid
    references studeasy.assessments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Who may sit it
-- ---------------------------------------------------------------------------

/*
 * Whether the caller is entitled to sit this assessment at all.
 *
 * Deliberately says nothing about timing — being allowed in and the door being
 * open are separate questions, and merging them would make "you have not paid"
 * and "you are too late" the same message.
 */
create or replace function studeasy.can_take_assessment(assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1
    from studeasy.assessments a
    where a.id = assessment
      and (
        a.teacher_id = auth.uid()
        or studeasy.is_admin()
        or (
          a.status = 'published'
          and (
            -- Attached to a class: everyone holding a seat sits it for free.
            (a.class_id is not null and studeasy.holds_class_seat(a.class_id))
            -- Part of a course they are enrolled in.
            or (a.course_id is not null and studeasy.enrolled_in(a.course_id))
            -- Free and standing on its own.
            or (a.price_cents = 0 and a.class_id is null and a.course_id is null)
            -- Bought.
            or exists (
              select 1 from studeasy.assessment_purchases p
              where p.assessment_id = a.id and p.student_id = auth.uid()
            )
          )
        )
      )
  );
$$;

/* Open right now? A null bound means no bound. */
create or replace function studeasy.assessment_is_open(assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.assessments a
    where a.id = assessment
      and (a.opens_at is null or a.opens_at <= now())
      and (a.closes_at is null or a.closes_at > now())
  );
$$;

/*
 * When this attempt must be finished by: the earlier of the personal clock and
 * the assessment's own closing time. Null when neither applies.
 *
 * The clock runs from started_at and nothing resets it. That is the whole of
 * the no-pause rule — closing the tab, signing out and coming back all resume
 * the same attempt with the same deadline, because start_attempt() returns the
 * open attempt rather than making a new one.
 */
create or replace function studeasy.attempt_deadline(attempt uuid)
returns timestamptz
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select least(
    case
      when a.time_limit_minutes is null then null
      else t.started_at + make_interval(mins => a.time_limit_minutes)
    end,
    a.closes_at
  )
  from studeasy.attempts t
  join studeasy.assessments a on a.id = t.assessment_id
  where t.id = attempt;
$$;

-- ---------------------------------------------------------------------------
-- Sitting it
-- ---------------------------------------------------------------------------

create or replace function studeasy.start_attempt(assessment uuid)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  a studeasy.assessments%rowtype;
  used integer;
  existing uuid;
begin
  if caller is null then
    raise exception 'Sign in to take this assessment.';
  end if;

  select * into a from studeasy.assessments where id = assessment;
  if not found or a.status <> 'published' then
    raise exception 'That assessment is not available.';
  end if;

  if not studeasy.can_take_assessment(assessment) then
    if a.class_id is not null then
      raise exception 'This assessment is for students registered in its class.';
    elsif a.course_id is not null then
      raise exception 'You need to be enrolled in the course to take this.';
    else
      raise exception 'This assessment has to be bought before you can sit it.';
    end if;
  end if;

  if a.opens_at is not null and a.opens_at > now() then
    raise exception 'This opens at %.', to_char(a.opens_at, 'DD Mon YYYY HH24:MI');
  end if;
  if a.closes_at is not null and a.closes_at <= now() then
    raise exception 'This closed at %.', to_char(a.closes_at, 'DD Mon YYYY HH24:MI');
  end if;

  /*
   * Resume rather than start again. This is the rest of the no-pause rule: the
   * original started_at comes back with it, so time spent away still counted.
   */
  select id into existing from studeasy.attempts
  where assessment_id = assessment and student_id = caller and submitted_at is null
  limit 1;
  if existing is not null then
    return existing;
  end if;

  select count(*) into used from studeasy.attempts
  where assessment_id = assessment and student_id = caller and submitted_at is not null;

  if used >= a.attempts_allowed then
    raise exception 'You have used all % attempts.', a.attempts_allowed;
  end if;

  insert into studeasy.attempts (assessment_id, student_id)
  values (assessment, caller)
  returning id into existing;

  return existing;
end;
$$;

/*
 * Attaches an uploaded answer file to an offline attempt.
 *
 * The object itself lives in Storage under the student's own folder; this only
 * records where it is, so a teacher can find it when marking.
 */
create or replace function studeasy.attach_attempt_upload(
  attempt uuid,
  path text,
  file_name text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  t studeasy.attempts%rowtype;
  a studeasy.assessments%rowtype;
begin
  select * into t from studeasy.attempts where id = attempt;
  if not found or t.student_id <> caller then
    raise exception 'That attempt is not yours.';
  end if;
  if t.submitted_at is not null then
    raise exception 'You have already handed this in.';
  end if;

  select * into a from studeasy.assessments where id = t.assessment_id;
  if not a.allow_upload then
    raise exception 'This assessment does not take uploaded answers.';
  end if;

  update studeasy.attempts
  set upload_path = path, upload_name = file_name
  where id = attempt;
end;
$$;

/*
 * Same marking contract as before, with the clock enforced.
 *
 * A short grace period past the deadline is allowed so a slow network does not
 * lose somebody's paper. Past that the sweep has already closed it.
 */
create or replace function studeasy.submit_attempt(attempt uuid, responses jsonb)
returns table (auto_marks integer, max_marks integer, needs_marking boolean, passed boolean)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  t studeasy.attempts%rowtype;
  a studeasy.assessments%rowtype;
  q studeasy.questions%rowtype;
  item jsonb;
  resp jsonb;
  is_right boolean;
  earned integer := 0;
  total integer := 0;
  manual boolean := false;
  negative boolean;
  due timestamptz;
begin
  select * into t from studeasy.attempts where id = attempt;
  if not found or t.student_id <> caller then
    raise exception 'That attempt is not yours.';
  end if;
  if t.submitted_at is not null then
    raise exception 'You have already submitted this attempt.';
  end if;

  due := studeasy.attempt_deadline(attempt);
  if due is not null and now() > due + interval '2 minutes' then
    raise exception 'Time ran out at %, and this attempt has been closed.',
      to_char(due, 'HH24:MI');
  end if;

  select * into a from studeasy.assessments where id = t.assessment_id;
  negative := a.negative_marking;

  for q in select * from studeasy.questions where assessment_id = t.assessment_id loop
    total := total + q.marks;

    resp := null;
    for item in select * from jsonb_array_elements(responses) loop
      if (item ->> 'question_id') = q.id::text then
        resp := item -> 'response';
        exit;
      end if;
    end loop;

    is_right := studeasy.mark_answer(q, resp);

    if is_right is null then
      manual := true;
      insert into studeasy.answers (attempt_id, question_id, response)
      values (attempt, q.id, resp)
      on conflict (attempt_id, question_id) do update set response = excluded.response;
    else
      if is_right then
        earned := earned + q.marks;
      elsif negative and resp is not null then
        earned := earned - 1;
      end if;
      insert into studeasy.answers (attempt_id, question_id, response, correct, marks)
      values (attempt, q.id, resp, is_right, case when is_right then q.marks else 0 end)
      on conflict (attempt_id, question_id) do update
        set response = excluded.response,
            correct = excluded.correct,
            marks = excluded.marks;
    end if;
  end loop;

  /*
   * An offline paper has no questions here — the work is in the uploaded file,
   * and a classroom sitting happened on paper. Both always wait for a person.
   */
  if a.delivery <> 'online' or total = 0 then
    manual := true;
  end if;

  earned := greatest(earned, 0);

  update studeasy.attempts
  set submitted_at = now(),
      auto_marks = earned,
      total_marks = case when manual then null else earned end,
      passed = case
        when manual or total = 0 then null
        else (earned::numeric / total) * 100 >= a.pass_mark_pct
      end,
      released = not manual
  where id = attempt;

  if not manual then
    perform studeasy.touch_streak(20);
  end if;

  return query select earned, total, manual,
    case when manual or total = 0 then null
         else (earned::numeric / total) * 100 >= a.pass_mark_pct end;
end;
$$;

/*
 * Closes attempts whose time is up.
 *
 * "Automatically closed once the time is over" cannot rest on the browser — a
 * student who shuts the tab with five minutes left would otherwise leave an
 * attempt open indefinitely. This marks them submitted at the deadline and
 * flags them, so a zero here is not mistaken for a zero they sat for.
 */
create or replace function studeasy.close_expired_attempts()
returns integer
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  closed integer := 0;
  t record;
begin
  for t in
    select at.id, studeasy.attempt_deadline(at.id) as due
    from studeasy.attempts at
    where at.submitted_at is null
  loop
    if t.due is not null and t.due < now() then
      update studeasy.attempts
      set submitted_at = t.due,
          auto_closed = true,
          auto_marks = coalesce(auto_marks, 0),
          total_marks = null,
          released = false
      where id = t.id;
      closed := closed + 1;
    end if;
  end loop;

  return closed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Buying one
-- ---------------------------------------------------------------------------

create or replace function studeasy.begin_assessment_checkout(assessment uuid)
returns table (order_id uuid, reference text, total_cents integer)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  a studeasy.assessments%rowtype;
  new_order studeasy.orders%rowtype;
  ref text;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into a from studeasy.assessments where id = assessment;
  if not found or a.status <> 'published' then
    raise exception 'That assessment is not available.';
  end if;
  if a.price_cents = 0 then
    raise exception 'That assessment is free — there is nothing to pay.';
  end if;
  if studeasy.can_take_assessment(assessment) then
    raise exception 'You can already sit this one.';
  end if;

  ref := 'ASM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into studeasy.orders
    (organization_id, user_id, reference, status, total_cents, currency)
  values (a.organization_id, caller, ref, 'pending', a.price_cents, a.currency)
  returning * into new_order;

  insert into studeasy.order_items
    (order_id, assessment_id, student_id, title_snapshot, price_cents)
  values (new_order.id, assessment, caller, a.title, a.price_cents);

  return query select new_order.id, ref, a.price_cents;
end;
$$;

/* Same contract; assessment lines now grant access too. */
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

  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select o.organization_id, oi.course_id, coalesce(oi.student_id, o.user_id)
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  for line in
    select class_id, student_id, price_cents from studeasy.order_items
    where order_id = o.id and class_id is not null
  loop
    perform studeasy.confirm_class_seat(
      line.class_id, coalesce(line.student_id, o.user_id), o.id, line.price_cents
    );
  end loop;

  insert into studeasy.assessment_purchases
    (assessment_id, student_id, order_id, amount_paid_cents)
  select oi.assessment_id, coalesce(oi.student_id, o.user_id), o.id, oi.price_cents
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.assessment_id is not null
  on conflict (assessment_id, student_id) do nothing;

  insert into studeasy.payouts
    (organization_id, teacher_id, order_id, course_id,
     gross_cents, platform_fee_cents, net_cents)
  select
    o.organization_id,
    coalesce(c.teacher_id, cs.teacher_id, asm.teacher_id),
    o.id,
    c.id,
    oi.price_cents,
    round(oi.price_cents * coalesce(fee_pct, 20) / 100.0),
    oi.price_cents - round(oi.price_cents * coalesce(fee_pct, 20) / 100.0)
  from studeasy.order_items oi
  left join studeasy.courses c on c.id = oi.course_id
  left join studeasy.class_sessions cs on cs.id = oi.class_id
  left join studeasy.assessments asm on asm.id = oi.assessment_id
  where oi.order_id = o.id and oi.price_cents > 0;

  delete from studeasy.cart_items where user_id = o.user_id;

  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

/*
 * A student may see that a paid assessment exists — otherwise they could never
 * decide to buy it. can_take_assessment() is what gates sitting it, and
 * students still have no read policy on `questions` at all.
 */
drop policy if exists assessments_select on studeasy.assessments;
create policy assessments_select on studeasy.assessments
  for select using (
    status = 'published'
    or teacher_id = auth.uid()
    or studeasy.is_admin()
  );

drop policy if exists assessments_write on studeasy.assessments;
create policy assessments_write on studeasy.assessments
  for all using (teacher_id = auth.uid() or studeasy.is_admin())
  with check (teacher_id = auth.uid() or studeasy.is_admin());

-- ---------------------------------------------------------------------------
-- Storage for offline answer files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('assessment-uploads', 'assessment-uploads', false)
on conflict (id) do nothing;

/*
 * Objects live at <student_id>/<attempt_id>/<filename>, so the first path
 * segment is the owner and these policies are a string comparison rather than
 * a join back into the app schema.
 */
drop policy if exists assessment_uploads_insert on storage.objects;
create policy assessment_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assessment-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists assessment_uploads_select on storage.objects;
create policy assessment_uploads_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assessment-uploads'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or studeasy.is_admin()
      -- The teacher marking it, and the parent of the student who wrote it.
      or exists (
        select 1
        from studeasy.attempts t
        join studeasy.assessments a on a.id = t.assessment_id
        where t.upload_path = storage.objects.name
          and (a.teacher_id = auth.uid() or studeasy.is_my_child(t.student_id))
      )
    )
  );

drop policy if exists assessment_uploads_update on storage.objects;
create policy assessment_uploads_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assessment-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on studeasy.assessment_purchases to authenticated;

grant execute on function studeasy.can_take_assessment(uuid) to authenticated;
grant execute on function studeasy.assessment_is_open(uuid) to authenticated;
grant execute on function studeasy.attempt_deadline(uuid) to authenticated;
grant execute on function studeasy.attach_attempt_upload(uuid, text, text) to authenticated;
grant execute on function studeasy.begin_assessment_checkout(uuid) to authenticated;

revoke all on function studeasy.close_expired_attempts() from anon, authenticated;
revoke all on function studeasy.mark_order_paid(text, text) from anon, authenticated;
revoke all on function studeasy.guard_assessment_shape() from anon, authenticated;
