-- StudEasy — content, assignments, assessments, messaging, certificates,
-- gamification, reviews and the audit log.
--
-- Run AFTER supabase/payments.sql. Safe to re-run.
--
-- This is the backend structure for MVP PRD sections 9, 10, 11, 14, 16 and 18.
-- Every table is scoped by organization_id and protected by RLS on the same
-- principle used elsewhere: you see your own row, a teacher sees their course's
-- rows, a parent sees their linked child's, an admin sees everything.

-- ---------------------------------------------------------------------------
-- Helpers used by the policies below
-- ---------------------------------------------------------------------------

/* Is the caller the teacher who owns this course? */
create or replace function studeasy.owns_course(course uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.courses where id = course and teacher_id = auth.uid()
  );
$$;

/* Is the caller enrolled on this course? */
create or replace function studeasy.enrolled_in(course uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.enrolments
    where course_id = course and student_id = auth.uid() and status <> 'cancelled'
  );
$$;

/* Is this student the caller's linked child? */
create or replace function studeasy.is_my_child(student uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.profiles where id = student and parent_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Section 9 — Learning content
--
-- Files live in Supabase Storage; this table holds the pointer and the ordering.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0,
  content_type text not null default 'video'
    check (content_type in ('video', 'youtube', 'pdf', 'slides', 'image', 'document', 'link', 'text')),
  -- Storage object path, or an external URL for youtube/link.
  storage_path text,
  external_url text,
  body text,                        -- for content_type = 'text'
  duration_minutes integer,
  is_preview boolean not null default false,   -- visible before enrolling
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_course_idx on studeasy.lessons (course_id, position);

alter table studeasy.lessons enable row level security;

drop policy if exists lessons_select on studeasy.lessons;
create policy lessons_select on studeasy.lessons
  for select using (
    is_preview
    or studeasy.owns_course(course_id)
    or studeasy.enrolled_in(course_id)
    or studeasy.is_admin()
  );

drop policy if exists lessons_write on studeasy.lessons;
create policy lessons_write on studeasy.lessons
  for all using (studeasy.owns_course(course_id) or studeasy.is_admin())
  with check (studeasy.owns_course(course_id) or studeasy.is_admin());

/* Per-student progress through a course's lessons. */
create table if not exists studeasy.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references studeasy.lessons (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  completed_at timestamptz,
  seconds_spent integer not null default 0,
  unique (lesson_id, student_id)
);

alter table studeasy.lesson_progress enable row level security;

drop policy if exists lesson_progress_all on studeasy.lesson_progress;
create policy lesson_progress_all on studeasy.lesson_progress
  for all using (
    student_id = auth.uid() or studeasy.is_my_child(student_id) or studeasy.is_admin()
  )
  with check (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Section 10 — Assignments
-- ---------------------------------------------------------------------------

create table if not exists studeasy.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  teacher_id uuid references studeasy.profiles (id) on delete set null,
  title text not null,
  instructions text,
  due_at timestamptz,
  max_marks integer not null default 100 check (max_marks > 0),
  allow_late boolean not null default true,
  resource_path text,                        -- optional attached brief
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists assignments_course_idx
  on studeasy.assignments (course_id, due_at);

alter table studeasy.assignments enable row level security;

drop policy if exists assignments_select on studeasy.assignments;
create policy assignments_select on studeasy.assignments
  for select using (
    (status = 'published' and studeasy.enrolled_in(course_id))
    or studeasy.owns_course(course_id)
    or studeasy.is_admin()
  );

drop policy if exists assignments_write on studeasy.assignments;
create policy assignments_write on studeasy.assignments
  for all using (studeasy.owns_course(course_id) or studeasy.is_admin())
  with check (studeasy.owns_course(course_id) or studeasy.is_admin());

create table if not exists studeasy.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references studeasy.assignments (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  note text,
  file_path text,                            -- Storage object
  file_name text,

  -- AI marks first, the teacher releases. Nothing reaches a student unreviewed.
  ai_marks integer,
  ai_feedback text,
  marks integer,
  feedback text,
  graded_by uuid references studeasy.profiles (id) on delete set null,
  graded_at timestamptz,
  released boolean not null default false,

  unique (assignment_id, student_id)
);

create index if not exists submissions_assignment_idx
  on studeasy.submissions (assignment_id, released);

alter table studeasy.submissions enable row level security;

/*
 * A student sees their own submission, but a mark only exists for them once the
 * teacher releases it — enforced in the read helper below rather than by
 * hiding columns, which RLS cannot do.
 */
drop policy if exists submissions_select on studeasy.submissions;
create policy submissions_select on studeasy.submissions
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or exists (
      select 1 from studeasy.assignments a
      where a.id = submissions.assignment_id and studeasy.owns_course(a.course_id)
    )
    or studeasy.is_admin()
  );

drop policy if exists submissions_insert on studeasy.submissions;
create policy submissions_insert on studeasy.submissions
  for insert with check (student_id = auth.uid());

drop policy if exists submissions_update on studeasy.submissions;
create policy submissions_update on studeasy.submissions
  for update using (
    -- a student may replace their own work only before it is graded
    (student_id = auth.uid() and graded_at is null)
    or exists (
      select 1 from studeasy.assignments a
      where a.id = submissions.assignment_id and studeasy.owns_course(a.course_id)
    )
    or studeasy.is_admin()
  );

/* Teacher grades and releases in one deliberate step. */
create or replace function studeasy.grade_submission(
  submission uuid,
  awarded integer,
  comment text,
  release boolean default true
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  s studeasy.submissions%rowtype;
  a studeasy.assignments%rowtype;
begin
  select * into s from studeasy.submissions where id = submission;
  if not found then raise exception 'No such submission.'; end if;

  select * into a from studeasy.assignments where id = s.assignment_id;
  if not studeasy.owns_course(a.course_id) and not studeasy.is_admin() then
    raise exception 'Only the teacher of this course can grade it.';
  end if;
  if awarded < 0 or awarded > a.max_marks then
    raise exception 'Mark must be between 0 and %.', a.max_marks;
  end if;

  update studeasy.submissions
  set marks = awarded,
      feedback = comment,
      graded_by = auth.uid(),
      graded_at = now(),
      released = release
  where id = submission;
end;
$$;

-- ---------------------------------------------------------------------------
-- Section 11 — Assessments
-- ---------------------------------------------------------------------------

create table if not exists studeasy.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid references studeasy.courses (id) on delete cascade,
  teacher_id uuid references studeasy.profiles (id) on delete set null,
  title text not null,
  description text,
  time_limit_minutes integer,
  attempts_allowed integer not null default 1,
  pass_mark_pct integer not null default 50 check (pass_mark_pct between 0 and 100),
  randomize boolean not null default false,
  negative_marking boolean not null default false,
  issues_certificate boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

alter table studeasy.assessments enable row level security;

drop policy if exists assessments_select on studeasy.assessments;
create policy assessments_select on studeasy.assessments
  for select using (
    (status = 'published' and (course_id is null or studeasy.enrolled_in(course_id)))
    or teacher_id = auth.uid()
    or studeasy.is_admin()
  );

drop policy if exists assessments_write on studeasy.assessments;
create policy assessments_write on studeasy.assessments
  for all using (teacher_id = auth.uid() or studeasy.is_admin())
  with check (teacher_id = auth.uid() or studeasy.is_admin());

/* All eleven question types from section 11 live in one table. */
create table if not exists studeasy.questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references studeasy.assessments (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in (
    'mcq', 'multi_select', 'true_false', 'fill_blank', 'numerical',
    'matching', 'ordering', 'short_answer', 'essay', 'image', 'formula'
  )),
  prompt text not null,
  image_path text,
  marks integer not null default 1,
  -- Shape varies by kind: options for mcq, pairs for matching, tolerance for
  -- numerical. Kept as jsonb so a new question type needs no migration.
  payload jsonb not null default '{}'::jsonb,
  -- Absent for essay and short answer, which a teacher marks by hand.
  correct jsonb,
  explanation text
);

create index if not exists questions_assessment_idx
  on studeasy.questions (assessment_id, position);

alter table studeasy.questions enable row level security;

/*
 * Students never read this table directly — `correct` is in it. Serving a paper
 * is a function's job, so the answers can be stripped first.
 */
drop policy if exists questions_teacher on studeasy.questions;
create policy questions_teacher on studeasy.questions
  for all using (
    exists (
      select 1 from studeasy.assessments a
      where a.id = questions.assessment_id
        and (a.teacher_id = auth.uid() or studeasy.is_admin())
    )
  )
  with check (
    exists (
      select 1 from studeasy.assessments a
      where a.id = questions.assessment_id
        and (a.teacher_id = auth.uid() or studeasy.is_admin())
    )
  );

create table if not exists studeasy.attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references studeasy.assessments (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  auto_marks integer,
  manual_marks integer,
  total_marks integer,
  passed boolean,
  released boolean not null default false
);

create index if not exists attempts_student_idx
  on studeasy.attempts (student_id, assessment_id);

alter table studeasy.attempts enable row level security;

drop policy if exists attempts_select on studeasy.attempts;
create policy attempts_select on studeasy.attempts
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or exists (
      select 1 from studeasy.assessments a
      where a.id = attempts.assessment_id and a.teacher_id = auth.uid()
    )
    or studeasy.is_admin()
  );

create table if not exists studeasy.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references studeasy.attempts (id) on delete cascade,
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  response jsonb,
  auto_correct boolean,
  awarded_marks integer,
  teacher_comment text,
  unique (attempt_id, question_id)
);

alter table studeasy.answers enable row level security;

drop policy if exists answers_select on studeasy.answers;
create policy answers_select on studeasy.answers
  for select using (
    exists (
      select 1 from studeasy.attempts t
      where t.id = answers.attempt_id
        and (t.student_id = auth.uid() or studeasy.is_my_child(t.student_id))
    )
    or studeasy.is_admin()
  );

/* Serves a paper with the answers removed. */
create or replace function studeasy.get_paper(assessment uuid)
returns table (
  id uuid, position integer, kind text, prompt text,
  image_path text, marks integer, payload jsonb
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select q.id, q.position, q.kind, q.prompt, q.image_path, q.marks, q.payload
  from studeasy.questions q
  join studeasy.assessments a on a.id = q.assessment_id
  where q.assessment_id = assessment
    and a.status = 'published'
    and (a.course_id is null or studeasy.enrolled_in(a.course_id))
  order by q.position;
$$;

-- ---------------------------------------------------------------------------
-- Section 14 — Messaging and notifications
-- ---------------------------------------------------------------------------

create table if not exists studeasy.threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid references studeasy.courses (id) on delete set null,
  subject text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists studeasy.thread_participants (
  thread_id uuid not null references studeasy.threads (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, profile_id)
);

create table if not exists studeasy.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references studeasy.threads (id) on delete cascade,
  sender_id uuid references studeasy.profiles (id) on delete set null,
  body text not null,
  attachment_path text,
  sent_at timestamptz not null default now()
);

create index if not exists messages_thread_idx on studeasy.messages (thread_id, sent_at);

alter table studeasy.threads enable row level security;
alter table studeasy.thread_participants enable row level security;
alter table studeasy.messages enable row level security;

create or replace function studeasy.in_thread(thread uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.thread_participants
    where thread_id = thread and profile_id = auth.uid()
  );
$$;

drop policy if exists threads_select on studeasy.threads;
create policy threads_select on studeasy.threads
  for select using (studeasy.in_thread(id) or studeasy.is_admin());

drop policy if exists participants_select on studeasy.thread_participants;
create policy participants_select on studeasy.thread_participants
  for select using (studeasy.in_thread(thread_id) or studeasy.is_admin());

drop policy if exists messages_select on studeasy.messages;
create policy messages_select on studeasy.messages
  for select using (studeasy.in_thread(thread_id) or studeasy.is_admin());

drop policy if exists messages_insert on studeasy.messages;
create policy messages_insert on studeasy.messages
  for insert with check (sender_id = auth.uid() and studeasy.in_thread(thread_id));

create table if not exists studeasy.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on studeasy.notifications (profile_id, read_at, created_at desc);

alter table studeasy.notifications enable row level security;

drop policy if exists notifications_all on studeasy.notifications;
create policy notifications_all on studeasy.notifications
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Section 16 — Certificates and gamification
-- ---------------------------------------------------------------------------

create table if not exists studeasy.certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  course_id uuid references studeasy.courses (id) on delete set null,
  assessment_id uuid references studeasy.assessments (id) on delete set null,
  title text not null,
  -- Public verification code, so a certificate can be checked without a login.
  serial text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  issued_at timestamptz not null default now()
);

alter table studeasy.certificates enable row level security;

drop policy if exists certificates_select on studeasy.certificates;
create policy certificates_select on studeasy.certificates
  for select using (
    student_id = auth.uid() or studeasy.is_my_child(student_id) or studeasy.is_admin()
  );

create table if not exists studeasy.gamification (
  profile_id uuid primary key references studeasy.profiles (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  xp integer not null default 0,
  level integer not null default 1,
  streak_days integer not null default 0,
  longest_streak integer not null default 0,
  last_active_on date,
  updated_at timestamptz not null default now()
);

create table if not exists studeasy.badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  unique (organization_id, code)
);

create table if not exists studeasy.badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references studeasy.badges (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (badge_id, profile_id)
);

alter table studeasy.gamification enable row level security;
alter table studeasy.badges enable row level security;
alter table studeasy.badge_awards enable row level security;

drop policy if exists gamification_select on studeasy.gamification;
create policy gamification_select on studeasy.gamification
  for select using (
    profile_id = auth.uid() or studeasy.is_my_child(profile_id) or studeasy.is_admin()
  );

drop policy if exists badges_select on studeasy.badges;
create policy badges_select on studeasy.badges for select using (true);

drop policy if exists badge_awards_select on studeasy.badge_awards;
create policy badge_awards_select on studeasy.badge_awards
  for select using (
    profile_id = auth.uid() or studeasy.is_my_child(profile_id) or studeasy.is_admin()
  );

/* Records a day's activity and keeps the streak honest across gaps. */
create or replace function studeasy.touch_streak(award_xp integer default 0)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  g studeasy.gamification%rowtype;
  today date := (now() at time zone 'Pacific/Auckland')::date;
begin
  if caller is null then return; end if;

  insert into studeasy.gamification (profile_id, organization_id, last_active_on, streak_days)
  values (caller, studeasy.current_org(), today, 1)
  on conflict (profile_id) do nothing;

  select * into g from studeasy.gamification where profile_id = caller;

  update studeasy.gamification
  set streak_days = case
        when g.last_active_on = today then g.streak_days
        when g.last_active_on = today - 1 then g.streak_days + 1
        else 1
      end,
      longest_streak = greatest(
        g.longest_streak,
        case
          when g.last_active_on = today then g.streak_days
          when g.last_active_on = today - 1 then g.streak_days + 1
          else 1
        end
      ),
      last_active_on = today,
      xp = g.xp + greatest(award_xp, 0),
      level = 1 + ((g.xp + greatest(award_xp, 0)) / 500),
      updated_at = now()
  where profile_id = caller;
end;
$$;

-- ---------------------------------------------------------------------------
-- Section 18 — Reviews, wishlist, audit log
-- ---------------------------------------------------------------------------

create table if not exists studeasy.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (course_id, student_id)
);

alter table studeasy.reviews enable row level security;

drop policy if exists reviews_select on studeasy.reviews;
create policy reviews_select on studeasy.reviews for select using (true);

/* Only someone who actually took the course may review it. */
drop policy if exists reviews_write on studeasy.reviews;
create policy reviews_write on studeasy.reviews
  for all using (student_id = auth.uid())
  with check (student_id = auth.uid() and studeasy.enrolled_in(course_id));

/* Keeps courses.rating_avg in step without a nightly job. */
create or replace function studeasy.refresh_course_rating()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  target uuid := coalesce(new.course_id, old.course_id);
begin
  update studeasy.courses c
  set rating_avg = sub.avg_rating, rating_count = sub.n
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*) as n
    from studeasy.reviews where course_id = target
  ) sub
  where c.id = target;
  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating on studeasy.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on studeasy.reviews
  for each row execute function studeasy.refresh_course_rating();

create table if not exists studeasy.wishlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  user_id uuid not null references studeasy.profiles (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table studeasy.wishlist enable row level security;

drop policy if exists wishlist_all on studeasy.wishlist;
create policy wishlist_all on studeasy.wishlist
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists studeasy.audit_log (
  id bigserial primary key,
  organization_id uuid references studeasy.organizations (id) on delete set null,
  actor_id uuid references studeasy.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_log_at_idx on studeasy.audit_log (at desc);

alter table studeasy.audit_log enable row level security;

drop policy if exists audit_log_select on studeasy.audit_log;
create policy audit_log_select on studeasy.audit_log
  for select using (studeasy.is_admin());

/* Soft delete, per section 18. Nothing here is hard-deleted by the app. */
alter table studeasy.courses add column if not exists deleted_at timestamptz;
alter table studeasy.lessons add column if not exists deleted_at timestamptz;
alter table studeasy.assignments add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on studeasy.lessons to authenticated;
grant select, insert, update on studeasy.lesson_progress to authenticated;
grant select, insert, update on studeasy.assignments to authenticated;
grant select, insert, update on studeasy.submissions to authenticated;
grant select, insert, update on studeasy.assessments to authenticated;
grant select, insert, update on studeasy.questions to authenticated;
grant select, insert, update on studeasy.attempts to authenticated;
grant select, insert, update on studeasy.answers to authenticated;
grant select on studeasy.threads to authenticated;
grant select on studeasy.thread_participants to authenticated;
grant select, insert on studeasy.messages to authenticated;
grant select, insert, update on studeasy.notifications to authenticated;
grant select on studeasy.certificates to authenticated;
grant select on studeasy.gamification to authenticated;
grant select on studeasy.badges to authenticated;
grant select on studeasy.badge_awards to authenticated;
grant select, insert, update, delete on studeasy.reviews to authenticated;
grant select, insert, delete on studeasy.wishlist to authenticated;
grant select on studeasy.audit_log to authenticated;

grant execute on function studeasy.grade_submission(uuid, integer, text, boolean) to authenticated;
grant execute on function studeasy.get_paper(uuid) to authenticated;
grant execute on function studeasy.touch_streak(integer) to authenticated;
grant execute on function studeasy.owns_course(uuid) to authenticated;
grant execute on function studeasy.enrolled_in(uuid) to authenticated;
grant execute on function studeasy.is_my_child(uuid) to authenticated;
grant execute on function studeasy.in_thread(uuid) to authenticated;
