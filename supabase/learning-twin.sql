--
-- learning-twin.sql — what a student knows, and what grade that predicts.
--
-- Run AFTER supabase/taxonomy.sql. Safe to re-run.
--
-- Three decisions worth stating:
--
--   1. Mastery is shrunk, not raw. A student who answered their only question
--      correctly is not fully mastered, and a twin that believes otherwise
--      sends the revision planner to the wrong topic and tells a parent a
--      projected grade built on one data point.
--
--   2. Evidence decays. A mistake from last term should not hold a student
--      down after they have learned the thing.
--
--   3. Nothing here is a model. Every figure traces to counted rows, which is
--      what section 10's guardrail asks for — and it means a tutor can argue
--      with a projection rather than having to trust it.
--

-- ---------------------------------------------------------------------------
-- Time on task
-- ---------------------------------------------------------------------------

/*
 * attempts gives whole-paper duration; there was no per-question timing
 * anywhere. This is advisory client data — a student can leave the tab open —
 * so the aggregate uses a median rather than a mean, and the UI clamps
 * outliers before they are ever sent.
 */
alter table studeasy.answers
  add column if not exists seconds_spent integer;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'answers_seconds_spent_sane'
  ) then
    alter table studeasy.answers add constraint answers_seconds_spent_sane
      check (seconds_spent is null or seconds_spent >= 0);
  end if;
end;
$mig$;

-- ---------------------------------------------------------------------------
-- Tuning, in one row rather than scattered through function bodies
-- ---------------------------------------------------------------------------

create table if not exists studeasy.twin_config (
  id boolean primary key default true check (id),   -- exactly one row
  shrink_alpha numeric not null default 3,
  shrink_prior numeric not null default 0.5,
  half_life_days numeric not null default 60,
  mastery_threshold numeric not null default 0.6,
  min_band_sample integer not null default 5,
  recent_days integer not null default 30,
  updated_at timestamptz not null default now()
);

insert into studeasy.twin_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- What a student knows, per topic
-- ---------------------------------------------------------------------------

create table if not exists studeasy.topic_mastery (
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,

  seen_count integer not null default 0,
  correct_count integer not null default 0,
  marks_awarded integer not null default 0,
  marks_available integer not null default 0,

  /* Split by band, because a grade is the band you can reliably do. */
  achieved_seen integer not null default 0,
  achieved_correct integer not null default 0,
  merit_seen integer not null default 0,
  merit_correct integer not null default 0,
  excellence_seen integer not null default 0,
  excellence_correct integer not null default 0,

  median_seconds integer,
  /* Unattempted over seen. A student who leaves Merit questions blank rather
     than getting them wrong is telling you something a mark cannot. */
  blank_rate numeric not null default 0,

  mastery numeric not null default 0,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (profile_id, topic_id)
);

create index if not exists topic_mastery_topic_idx on studeasy.topic_mastery (topic_id);

alter table studeasy.twin_config enable row level security;
alter table studeasy.topic_mastery enable row level security;

/* Tuning is readable by anyone signed in so the UI can explain a number. */
drop policy if exists twin_config_select on studeasy.twin_config;
create policy twin_config_select on studeasy.twin_config for select
  to authenticated using (true);

/*
 * Your own row, your linked child's row, a student you teach, or everything
 * if you are an admin. Nothing is writable from here at all: mastery is only
 * ever written by refresh_topic_mastery(), which is SECURITY DEFINER.
 */
drop policy if exists topic_mastery_select on studeasy.topic_mastery;
create policy topic_mastery_select on studeasy.topic_mastery for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from studeasy.profiles c
      where c.id = topic_mastery.profile_id and c.parent_id = auth.uid()
    )
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor')
      and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = topic_mastery.profile_id
          and co.teacher_id = auth.uid()
      )
    )
  );

grant select on studeasy.twin_config, studeasy.topic_mastery to authenticated;
