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
 * Nothing populates this yet. Per-question timing needs a paper UI that
 * shows one question at a time, so a "shown" moment can be pinned to the
 * question rather than the whole attempt, and a submit_attempt() that
 * carries the value through from the client's payload — neither exists.
 * The column and its check constraint are added now, ahead of that work,
 * because they are harmless sitting empty and a later slice can populate
 * them without another migration.
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
 * Four things are deliberate:
 *
 *   1. Score is continuous, not a boolean. awarded_marks over marks handles
 *      partial credit, which a right/wrong flag throws away. A question with
 *      no marks recorded falls back to auto_correct.
 *
 *   2. Evidence rolls up. A question tagged to a sub-topic also counts toward
 *      its parent standard, because a projection is per standard and would
 *      otherwise see nothing. question_topics is many-to-many, so the same
 *      answer can arrive at a topic both directly and via roll-up; `rolled`
 *      deduplicates on (topic_id, answer_id) so it is never counted twice.
 *
 *   3. A blank counts as seen and scores zero. Leaving a question unattempted
 *      is evidence about what a student can do, and dropping it would make a
 *      student who skips the hard half look stronger than one who tries it.
 *      An answer awaiting marking is different from a blank and is excluded
 *      entirely until a tutor marks it, rather than silently scoring zero.
 *
 * SECURITY DEFINER because topic_mastery has no write policy at all. Bounded
 * by one student's answers, so it stays cheap enough to run on every piece of
 * progress.
 *
 * SECURITY DEFINER also means this bypasses RLS entirely, and the parameter
 * accepts any student id — so without a caller check, any signed-in user
 * could force a recompute against any other student. That is wasted compute
 * at worst on this function, but touch_streak() calls this and
 * refresh_projections() together, and the latter clears released_to_parent
 * on a falling grade — so the same missing check there would let a stranger
 * revoke a tutor's release of another family's child's grade. Same predicate
 * review_projection() below already uses: self, admin, or a tutor who
 * teaches this student. touch_streak() calls this with caller as `student`,
 * so the self case is what keeps that call working.
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
  caller uuid := auth.uid();
  cfg studeasy.twin_config%rowtype;
  org uuid;
begin
  if student is null then return; end if;

  if not (
    student = caller
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor') and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = student and co.teacher_id = caller
      )
    )
  ) then
    raise exception 'You may only refresh your own mastery, or a student you teach.';
  end if;

  select * into cfg from studeasy.twin_config where id;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  with tagged as (
    select
      a.id as answer_id,
      qt.topic_id,
      q.grade_band,
      q.marks,
      a.response,
      a.seconds_spent,
      /*
       * A row that was submitted but not yet marked (response given,
       * awarded_marks and auto_correct both null) is excluded here rather
       * than scored — the case below is total, so left in it would silently
       * read as wrong until a tutor clears the marking queue. A genuine
       * BLANK (response is null) is NOT excluded: it still counts as seen
       * and scores zero, because a student who skips the hard half should
       * not look stronger than one who attempts it.
       */
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
      and not (a.response is not null and a.awarded_marks is null and a.auto_correct is null)
  ),
  /*
   * A sub-topic's evidence counts for its parent standard as well. Rolled up
   * separately rather than folded into `tagged` itself, because
   * question_topics is many-to-many by design: a tutor can tag one question
   * to BOTH a parent standard and one of that standard's own child
   * sub-topics, in which case `tagged` already holds a direct parent row and
   * this derived one would be a second, spurious count of the same answer.
   * `distinct on (topic_id, answer_id)` keeps exactly one row per pair,
   * preferring the direct tag when both exist.
   */
  rolled as (
    select distinct on (topic_id, answer_id)
      topic_id, answer_id, grade_band, marks, response, seconds_spent,
      score, awarded, happened_at
    from (
      select 0 as origin, * from tagged
      union all
      select
        1 as origin,
        t.answer_id,
        tp.parent_id as topic_id,
        t.grade_band, t.marks, t.response, t.seconds_spent,
        t.score, t.awarded, t.happened_at
      from tagged t
      join studeasy.topics tp on tp.id = t.topic_id
      where tp.parent_id is not null
    ) both_sources
    order by topic_id, answer_id, origin
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
  perform studeasy.refresh_projections(caller);

  /*
   * The economy is a later migration, so these may not exist yet. Guarding on
   * to_regprocedure rather than assuming makes this definition correct in both
   * worlds, and — the point of the exercise — makes re-running learning-twin.sql
   * after economy.sql harmless. Three migrations all doing create or replace on
   * one function means the last paste wins, and without these guards a re-run
   * of this file silently switched the whole economy off: no streak coins, no
   * house points, no challenge progress, and nothing raised to say so.
   *
   * plpgsql binds a statement when it runs, not when the function is created,
   * so naming a function that does not exist yet inside an unreached branch is
   * safe.
   */
  if to_regprocedure('studeasy.award_coins(uuid,text,text,uuid)') is not null then
    perform studeasy.award_coins(caller, 'streak_day', 'gamification_day',
                                 md5(caller::text || today::text)::uuid);
    perform studeasy.award_house_points(caller, 'streak_day', 'gamification_day',
                                        md5(caller::text || today::text)::uuid);
  end if;

  if to_regprocedure('studeasy.advance_challenges(uuid)') is not null then
    perform studeasy.advance_challenges(caller);
  end if;

  -- Awarded from the row we just wrote, so a streak or level badge lands on
  -- the same activity that earned it rather than one action later.
  perform studeasy.evaluate_badges();
end;
$$;

-- ---------------------------------------------------------------------------
-- Projections — root standards only, because a sub-topic has no grade
-- ---------------------------------------------------------------------------

/*
 * Text comparison would put 'merit' before 'not_achieved', which would make a
 * fall look like a rise and quietly leave a worse grade released to a parent.
 */
create or replace function studeasy.grade_rank(grade text)
returns integer
language sql
immutable
as $fn$
  select case grade
    when 'not_achieved' then 0
    when 'achieved' then 1
    when 'merit' then 2
    when 'excellence' then 3
    else 0
  end;
$fn$;

create table if not exists studeasy.standard_projections (
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,

  current_grade text not null
    check (current_grade in ('not_achieved','achieved','merit','excellence')),
  projected_grade text not null
    check (projected_grade in ('not_achieved','achieved','merit','excellence')),
  confidence text not null check (confidence in ('low','moderate','high')),

  /* The counts the grade came from, so it can be opened up rather than
     asserted. A tutor who disagrees can see exactly what it read. */
  evidence jsonb not null default '{}',
  /* Lowest-mastery sub-topics at the next band up. */
  levers jsonb not null default '[]',

  computed_at timestamptz not null default now(),
  tutor_reviewed_by uuid references studeasy.profiles (id) on delete set null,
  tutor_reviewed_at timestamptz,
  tutor_note text,
  released_to_parent boolean not null default false,

  primary key (profile_id, topic_id)
);

alter table studeasy.standard_projections enable row level security;

/*
 * A student always sees their own. A parent sees a linked child's only once a
 * tutor has released it — the PRD's own "AI-drafted, tutor-reviewed" rule,
 * applied to the number most likely to upset a family if it arrives with
 * nobody beside it to explain it.
 */
drop policy if exists standard_projections_select on studeasy.standard_projections;
create policy standard_projections_select on studeasy.standard_projections for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      released_to_parent
      and exists (
        select 1 from studeasy.profiles c
        where c.id = standard_projections.profile_id and c.parent_id = auth.uid()
      )
    )
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor')
      and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = standard_projections.profile_id
          and co.teacher_id = auth.uid()
      )
    )
  );

grant select on studeasy.standard_projections to authenticated;

/*
 * The method, stated so it can be argued with:
 *
 *   current   — the highest band cleared on evidence from the last N days
 *   projected — the highest band cleared on the full decayed history
 *
 * "Cleared" means the correct rate at that band is at or above the threshold
 * across at least min_band_sample questions seen. Below the lowest band the
 * grade is not_achieved. There is no model here and no weighting nobody can
 * see; every input is written into `evidence`.
 *
 * Same caller check as refresh_topic_mastery() above, and for a sharper
 * reason than wasted compute: the on-conflict clause below clears
 * released_to_parent when a projected grade falls, so without this check a
 * stranger could call this against any student and revoke a tutor's release
 * of that family's grade. Self, admin, or a tutor who teaches this student —
 * touch_streak() calls this with caller as `student`, so the self case keeps
 * that call working.
 */
create or replace function studeasy.refresh_projections(
  student uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  cfg studeasy.twin_config%rowtype;
  org uuid;
begin
  if student is null then return; end if;

  if not (
    student = caller
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor') and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = student and co.teacher_id = caller
      )
    )
  ) then
    raise exception 'You may only refresh your own projection, or a student you teach.';
  end if;

  select * into cfg from studeasy.twin_config where id;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  with standards as (
    select m.*, t.id as std_id
    from studeasy.topic_mastery m
    join studeasy.topics t on t.id = m.topic_id
    where m.profile_id = student and t.parent_id is null
  ),
  graded as (
    select
      s.std_id, s.seen_count, s.mastery, s.last_seen_at,
      s.achieved_seen, s.achieved_correct,
      s.merit_seen, s.merit_correct,
      s.excellence_seen, s.excellence_correct,
      case
        when s.excellence_seen >= cfg.min_band_sample
         and s.excellence_correct::numeric / nullif(s.excellence_seen, 0)
             >= cfg.mastery_threshold then 'excellence'
        when s.merit_seen >= cfg.min_band_sample
         and s.merit_correct::numeric / nullif(s.merit_seen, 0)
             >= cfg.mastery_threshold then 'merit'
        when s.achieved_seen >= cfg.min_band_sample
         and s.achieved_correct::numeric / nullif(s.achieved_seen, 0)
             >= cfg.mastery_threshold then 'achieved'
        else 'not_achieved'
      end as band
    from standards s
  )
  insert into studeasy.standard_projections (
    profile_id, topic_id, organization_id,
    current_grade, projected_grade, confidence, evidence, levers, computed_at
  )
  select
    student, g.std_id, org,
    g.band,
    g.band,
    case
      when g.seen_count < cfg.min_band_sample then 'low'
      when g.seen_count < cfg.min_band_sample * 2
        or g.last_seen_at < now() - make_interval(days => cfg.recent_days)
        then 'moderate'
      else 'high'
    end,
    jsonb_build_object(
      'seen', g.seen_count,
      'achieved', jsonb_build_object('seen', g.achieved_seen, 'correct', g.achieved_correct),
      'merit', jsonb_build_object('seen', g.merit_seen, 'correct', g.merit_correct),
      'excellence', jsonb_build_object('seen', g.excellence_seen, 'correct', g.excellence_correct),
      'mastery', g.mastery,
      'threshold', cfg.mastery_threshold,
      'min_sample', cfg.min_band_sample
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object('topic_id', sm.topic_id,
                                          'name', st.name,
                                          'mastery', sm.mastery)
                       order by sm.mastery)
      from studeasy.topic_mastery sm
      join studeasy.topics st on st.id = sm.topic_id
      where sm.profile_id = student and st.parent_id = g.std_id
        and sm.mastery < cfg.mastery_threshold
    ), '[]'::jsonb),
    now()
  from graded g
  on conflict (profile_id, topic_id) do update set
    current_grade = excluded.current_grade,
    projected_grade = excluded.projected_grade,
    confidence = excluded.confidence,
    evidence = excluded.evidence,
    levers = excluded.levers,
    computed_at = now(),
    /*
     * A grade that falls loses its release, so a worse number never reaches a
     * parent without a tutor seeing it first. A rise keeps the release.
     */
    released_to_parent = case
      when studeasy.grade_rank(excluded.projected_grade)
         < studeasy.grade_rank(studeasy.standard_projections.projected_grade)
        then false
      else studeasy.standard_projections.released_to_parent
    end;
end;
$fn$;

grant execute on function studeasy.refresh_projections(uuid) to authenticated;

-- current_grade and projected_grade are computed identically in this first
-- version. Splitting them means running the same graded CTE twice, once over
-- answers inside cfg.recent_days — pending until there is enough real data
-- for the distinction to mean anything.

-- ---------------------------------------------------------------------------
-- Releasing a grade to a parent
-- ---------------------------------------------------------------------------

/*
 * The only thing that may set released_to_parent. A projection is a serious
 * claim about a child; it reaches their parent when a person who teaches them
 * has read it and can attach a sentence explaining it, and not before.
 */
create or replace function studeasy.review_projection(
  student uuid,
  topic uuid,
  note text,
  release boolean
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'You are not signed in.';
  end if;

  if not (studeasy.is_admin() or (
    studeasy.has_role('tutor') and exists (
      select 1
      from studeasy.enrolments e
      join studeasy.courses co on co.id = e.course_id
      where e.student_id = student and co.teacher_id = caller
    )
  )) then
    raise exception 'Only a tutor who teaches this student may review their projection.';
  end if;

  update studeasy.standard_projections
  set tutor_reviewed_by = caller,
      tutor_reviewed_at = now(),
      tutor_note = nullif(btrim(coalesce(note, '')), ''),
      released_to_parent = release
  where profile_id = student and topic_id = topic;

  if not found then
    raise exception 'There is no projection for that student and standard.';
  end if;
end;
$fn$;

grant execute on function studeasy.review_projection(uuid, uuid, text, boolean)
  to authenticated;
