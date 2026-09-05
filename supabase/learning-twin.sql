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

-- ---------------------------------------------------------------------------
-- Computing mastery
-- ---------------------------------------------------------------------------

/*
 * Recomputes every topic for one student from their whole answer history.
 *
 * Three things are deliberate:
 *
 *   1. Score is continuous, not a boolean. awarded_marks over marks handles
 *      partial credit, which a right/wrong flag throws away. A question with
 *      no marks recorded falls back to auto_correct.
 *
 *   2. Evidence rolls up. A question tagged to a sub-topic also counts toward
 *      its parent standard, because a projection is per standard and would
 *      otherwise see nothing.
 *
 *   3. A blank counts as seen and scores zero. Leaving a question unattempted
 *      is evidence about what a student can do, and dropping it would make a
 *      student who skips the hard half look stronger than one who tries it.
 *
 * SECURITY DEFINER because topic_mastery has no write policy at all. Bounded
 * by one student's answers, so it stays cheap enough to run on every piece of
 * progress.
 */
create or replace function studeasy.refresh_topic_mastery(
  student uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  cfg studeasy.twin_config%rowtype;
  org uuid;
begin
  if student is null then return; end if;

  select * into cfg from studeasy.twin_config where id;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  with tagged as (
    select
      qt.topic_id,
      q.grade_band,
      q.marks,
      a.response,
      a.seconds_spent,
      least(1, greatest(0, coalesce(
        a.awarded_marks::numeric / nullif(q.marks, 0),
        case when a.auto_correct then 1 else 0 end,
        0
      ))) as score,
      coalesce(a.awarded_marks, 0) as awarded,
      coalesce(at.submitted_at, at.started_at) as happened_at
    from studeasy.answers a
    join studeasy.attempts at on at.id = a.attempt_id
    join studeasy.questions q on q.id = a.question_id
    join studeasy.question_topics qt on qt.question_id = q.id
    where at.student_id = student
  ),
  /* A sub-topic's evidence counts for its parent standard as well. */
  rolled as (
    select * from tagged
    union all
    select
      tp.parent_id as topic_id,
      t.grade_band, t.marks, t.response, t.seconds_spent,
      t.score, t.awarded, t.happened_at
    from tagged t
    join studeasy.topics tp on tp.id = t.topic_id
    where tp.parent_id is not null
  ),
  weighted as (
    select
      r.*,
      power(0.5, greatest(0, extract(epoch from (now() - r.happened_at))
                             / 86400.0) / cfg.half_life_days) as w
    from rolled r
  ),
  agg as (
    select
      topic_id,
      count(*)::int as seen_count,
      count(*) filter (where score >= 0.5)::int as correct_count,
      sum(awarded)::int as marks_awarded,
      sum(coalesce(marks, 0))::int as marks_available,
      count(*) filter (where grade_band = 'achieved')::int as achieved_seen,
      count(*) filter (where grade_band = 'achieved' and score >= 0.5)::int as achieved_correct,
      count(*) filter (where grade_band = 'merit')::int as merit_seen,
      count(*) filter (where grade_band = 'merit' and score >= 0.5)::int as merit_correct,
      count(*) filter (where grade_band = 'excellence')::int as excellence_seen,
      count(*) filter (where grade_band = 'excellence' and score >= 0.5)::int as excellence_correct,
      percentile_cont(0.5) within group (order by seconds_spent)
        filter (where seconds_spent is not null) as median_seconds,
      (count(*) filter (where response is null))::numeric
        / nullif(count(*), 0) as blank_rate,
      /* Shrunk and decayed. Both guards matter: without the decay a bad term
         never washes out; without the shrinkage one lucky answer reads as
         mastery. */
      (sum(w * score) + cfg.shrink_alpha * cfg.shrink_prior)
        / (sum(w) + cfg.shrink_alpha) as mastery,
      max(happened_at) as last_seen_at
    from weighted
    group by topic_id
  )
  insert into studeasy.topic_mastery (
    profile_id, topic_id, organization_id,
    seen_count, correct_count, marks_awarded, marks_available,
    achieved_seen, achieved_correct, merit_seen, merit_correct,
    excellence_seen, excellence_correct,
    median_seconds, blank_rate, mastery, last_seen_at, updated_at
  )
  select
    student, agg.topic_id, org,
    agg.seen_count, agg.correct_count, agg.marks_awarded, agg.marks_available,
    agg.achieved_seen, agg.achieved_correct, agg.merit_seen, agg.merit_correct,
    agg.excellence_seen, agg.excellence_correct,
    agg.median_seconds::int, coalesce(agg.blank_rate, 0),
    round(agg.mastery, 4), agg.last_seen_at, now()
  from agg
  on conflict (profile_id, topic_id) do update set
    seen_count = excluded.seen_count,
    correct_count = excluded.correct_count,
    marks_awarded = excluded.marks_awarded,
    marks_available = excluded.marks_available,
    achieved_seen = excluded.achieved_seen,
    achieved_correct = excluded.achieved_correct,
    merit_seen = excluded.merit_seen,
    merit_correct = excluded.merit_correct,
    excellence_seen = excluded.excellence_seen,
    excellence_correct = excluded.excellence_correct,
    median_seconds = excluded.median_seconds,
    blank_rate = excluded.blank_rate,
    mastery = excluded.mastery,
    last_seen_at = excluded.last_seen_at,
    updated_at = now();
end;
$fn$;

grant execute on function studeasy.refresh_topic_mastery(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hook it into the one function that already runs on every piece of progress
-- ---------------------------------------------------------------------------

/*
 * Identical signature to the one in badges.sql, so this replaces it rather
 * than creating a second overload. badges.sql wrote the reasoning down
 * already: hook into the one function that already runs on every piece of
 * progress, so there are no new call sites to forget — this is how
 * release_attempt() ended up existing for months without anything calling
 * it, and how mastery avoids the same fate.
 */
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

  -- Mastery moves on the same activity that earned it, for the same reason
  -- badges are awarded here rather than one action later.
  perform studeasy.refresh_topic_mastery(caller);

  -- Awarded from the row we just wrote, so a streak or level badge lands on
  -- the same activity that earned it rather than one action later.
  perform studeasy.evaluate_badges();
end;
$$;
