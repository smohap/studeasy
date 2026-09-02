--
-- badges.sql — makes the badge tables mean something.
--
-- Run AFTER supabase/platform.sql. Safe to re-run.
--
-- studeasy.badges and studeasy.badge_awards have existed since platform.sql
-- with correct RLS and grants, and nothing has ever written a row to either.
-- The achievements page could show XP and a streak because touch_streak()
-- records those; badges had no catalogue and no way to be earned.
--
-- Two decisions worth stating:
--
--   1. Every badge here is derived from something already recorded elsewhere —
--      a passed attempt, an issued certificate, a streak the student actually
--      kept. Nothing is awarded for signing up or for opening a page. A badge
--      that costs nothing is worth nothing.
--
--   2. Awarding happens inside touch_streak(), which the app already calls
--      wherever progress is recorded. That means no new call sites to forget,
--      which is exactly how release_attempt() ended up existing for months
--      without anything ever calling it.
--

-- ---------------------------------------------------------------------------
-- Display order. Without it the catalogue comes back in whatever order the
-- planner likes, and the locked badges shuffle between page loads.
-- ---------------------------------------------------------------------------

alter table studeasy.badges add column if not exists sort integer not null default 0;

-- ---------------------------------------------------------------------------
-- The catalogue, seeded per organization
-- ---------------------------------------------------------------------------

/*
 * badges is scoped by organization_id, so the catalogue is seeded per org
 * rather than held in one global table. MVP ships one org; this keeps the
 * Phase 1 white-labelling story intact, and lets an org drop a badge it does
 * not want by deleting the row.
 */
create or replace function studeasy.seed_badges(org uuid)
returns void
language sql
security definer
set search_path = studeasy, public
as $$
  insert into studeasy.badges (organization_id, code, name, description, sort)
  select org, v.code, v.name, v.description, v.sort
  from (values
    ('first_pass',  'First pass',       'Passed an assessment.', 10),
    ('five_passes', 'Five passed',      'Passed five assessments.', 20),
    ('certified',   'Certified',        'Earned a certificate anyone can verify.', 30),
    ('streak_7',    'Seven days',       'Worked seven days in a row.', 40),
    ('streak_30',   'Thirty days',      'Worked thirty days in a row.', 50),
    ('level_5',     'Level five',       'Reached level five.', 60),
    ('reviewer',    'Said their piece', 'Reviewed a course you took.', 70)
  ) as v(code, name, description, sort)
  on conflict (organization_id, code) do nothing;
$$;

/* A new organization starts with the catalogue, not with nothing. */
create or replace function studeasy.seed_badges_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  perform studeasy.seed_badges(new.id);
  return new;
end;
$$;

drop trigger if exists organizations_seed_badges on studeasy.organizations;
create trigger organizations_seed_badges
  after insert on studeasy.organizations
  for each row execute function studeasy.seed_badges_for_new_org();

/* Backfill the organizations that already exist. */
select studeasy.seed_badges(id) from studeasy.organizations;

-- ---------------------------------------------------------------------------
-- Awarding
-- ---------------------------------------------------------------------------

/*
 * Awards every badge the caller now qualifies for and returns the codes of the
 * ones that were new, so the UI can say something about them.
 *
 * Idempotent: the unique (badge_id, profile_id) plus ON CONFLICT DO NOTHING
 * means re-running awards nothing twice, and RETURNING only yields rows that
 * were genuinely inserted.
 *
 * SECURITY DEFINER because badge_awards deliberately has no insert policy —
 * a student may read their awards, never write one.
 */
create or replace function studeasy.evaluate_badges()
returns text[]
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  org uuid;
  fresh text[];
begin
  if caller is null then return '{}'::text[]; end if;

  select organization_id into org from studeasy.profiles where id = caller;
  if org is null then return '{}'::text[]; end if;

  with facts as (
    select
      coalesce((select g.longest_streak from studeasy.gamification g
                 where g.profile_id = caller), 0) as streak,
      coalesce((select g.level from studeasy.gamification g
                 where g.profile_id = caller), 1) as lvl,
      -- `passed` is nullable while an attempt waits on a marker; a null is
      -- not a pass, and `where a.passed` reads it that way.
      (select count(*) from studeasy.attempts a
        where a.student_id = caller and a.passed) as passes,
      (select count(*) from studeasy.certificates c
        where c.student_id = caller) as certs,
      (select count(*) from studeasy.reviews r
        where r.student_id = caller) as revs
  ),
  qualified as (
    select c.code from (
      select 'first_pass'  as code, f.passes >= 1  as ok from facts f
      union all select 'five_passes', f.passes >= 5     from facts f
      union all select 'certified',   f.certs  >= 1     from facts f
      union all select 'streak_7',    f.streak >= 7     from facts f
      union all select 'streak_30',   f.streak >= 30    from facts f
      union all select 'level_5',     f.lvl    >= 5     from facts f
      union all select 'reviewer',    f.revs   >= 1     from facts f
    ) c where c.ok
  ),
  awarded as (
    insert into studeasy.badge_awards (badge_id, profile_id)
    select b.id, caller
    from studeasy.badges b
    join qualified q on q.code = b.code
    where b.organization_id = org
    on conflict (badge_id, profile_id) do nothing
    returning badge_id
  )
  select coalesce(array_agg(b.code), '{}'::text[]) into fresh
  from awarded a
  join studeasy.badges b on b.id = a.badge_id;

  return fresh;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hook it into the one function that already runs on every piece of progress
-- ---------------------------------------------------------------------------

/*
 * Identical signature to the original in platform.sql, so this replaces it
 * rather than creating a second overload. The only change is the final line.
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

  -- Awarded from the row we just wrote, so a streak or level badge lands on
  -- the same activity that earned it rather than one action later.
  perform studeasy.evaluate_badges();
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- seed_badges() is deliberately not granted: it is a migration and trigger
-- helper, and nothing a signed-in user does should add to the catalogue.
grant execute on function studeasy.evaluate_badges() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill, so badges already earned are not held back until the next login
-- ---------------------------------------------------------------------------

/*
 * evaluate_badges() reads auth.uid(), which is null here. This does the same
 * work for everyone at once, which is a migration's job rather than a
 * function's, so it is written out rather than looping over the function.
 */
insert into studeasy.badge_awards (badge_id, profile_id)
select b.id, p.id
from studeasy.profiles p
join studeasy.badges b on b.organization_id = p.organization_id
where case b.code
        when 'first_pass'  then (select count(*) from studeasy.attempts a
                                  where a.student_id = p.id and a.passed) >= 1
        when 'five_passes' then (select count(*) from studeasy.attempts a
                                  where a.student_id = p.id and a.passed) >= 5
        when 'certified'   then exists (select 1 from studeasy.certificates c
                                         where c.student_id = p.id)
        when 'streak_7'    then coalesce((select g.longest_streak
                                           from studeasy.gamification g
                                           where g.profile_id = p.id), 0) >= 7
        when 'streak_30'   then coalesce((select g.longest_streak
                                           from studeasy.gamification g
                                           where g.profile_id = p.id), 0) >= 30
        when 'level_5'     then coalesce((select g.level
                                           from studeasy.gamification g
                                           where g.profile_id = p.id), 1) >= 5
        when 'reviewer'    then exists (select 1 from studeasy.reviews r
                                         where r.student_id = p.id)
        else false
      end
on conflict (badge_id, profile_id) do nothing;
