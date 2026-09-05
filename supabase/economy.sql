--
-- economy.sql — coins, a shop, houses, challenges and battles.
--
-- Run AFTER supabase/learning-twin.sql. Safe to re-run.
--
-- Three decisions worth stating:
--
--   1. Coins are a ledger, not a balance column. Same posture payouts already
--      takes: a record of what happened rather than a number somebody
--      updates. It also makes a double-award impossible to hide — the second
--      row would be there to see.
--
--   2. Every coin is cosmetic. Nothing in the shop carries real-world value,
--      so coins never touch orders, refunds or a tutor's payout, and a coin
--      exploit costs nobody money.
--
--   3. Houses are ranked and children are not. Section 11 warns against
--      discouraging struggling students, so house points weight effort —
--      streaks, questions attempted, lessons finished — above accuracy.
--

-- ---------------------------------------------------------------------------
-- Rates, tunable without a migration
-- ---------------------------------------------------------------------------

create table if not exists studeasy.coin_rates (
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  reason text not null,
  coins integer not null check (coins >= 0),
  house_points integer not null default 0 check (house_points >= 0),
  primary key (organization_id, reason)
);

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table if not exists studeasy.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'assessment_passed', 'streak_day', 'challenge_completed', 'battle_won',
    'badge_awarded', 'lesson_completed', 'purchase', 'admin_adjustment')),
  ref_table text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);

/*
 * The idempotency guarantee. award_coins() is called from touch_streak(),
 * which runs on every piece of progress — without this index a student would
 * be paid again for the same passed assessment every time they opened a page.
 */
create unique index if not exists coin_ledger_once
  on studeasy.coin_ledger (profile_id, reason, ref_table, ref_id)
  where ref_id is not null;

create index if not exists coin_ledger_profile_idx
  on studeasy.coin_ledger (profile_id, created_at desc);

/*
 * security_invoker = true so this view runs under the CALLER's row security,
 * not the migration role's that owns coin_ledger — otherwise every profile's
 * balance in every organization would read out to any signed-in user, which
 * is both a cross-tenant leak and the individual leaderboard this platform
 * refuses to have. With the caller's own coin_ledger_select policy applied,
 * this returns exactly what that policy allows: your own rows, a linked
 * child's, or (for an admin) everything.
 *
 * Contrast house_standings below, which sets security_invoker = false on
 * purpose — that view needs to sum across rows the caller could not see
 * individually, and re-imposes the tenant boundary itself instead of relying
 * on RLS. Two views, opposite settings, because one aggregates only the
 * caller's own visible rows and the other must aggregate everyone's.
 */
create or replace view studeasy.coin_balances
with (security_invoker = true) as
  select profile_id, coalesce(sum(delta), 0)::integer as balance
  from studeasy.coin_ledger
  group by profile_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.coin_rates enable row level security;
alter table studeasy.coin_ledger enable row level security;

drop policy if exists coin_rates_select on studeasy.coin_rates;
create policy coin_rates_select on studeasy.coin_rates for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists coin_rates_write on studeasy.coin_rates;
create policy coin_rates_write on studeasy.coin_rates for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/*
 * You see your own ledger, a parent sees a linked child's, an admin sees the
 * org's. There is no insert or update policy at all: every row is written by
 * award_coins() or spend_coins(), both SECURITY DEFINER. A client that could
 * insert here could mint currency.
 */
drop policy if exists coin_ledger_select on studeasy.coin_ledger;
create policy coin_ledger_select on studeasy.coin_ledger for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from studeasy.profiles c
      where c.id = coin_ledger.profile_id and c.parent_id = auth.uid()
    )
    or studeasy.is_admin()
  );

grant select on studeasy.coin_rates, studeasy.coin_ledger, studeasy.coin_balances
  to authenticated;
grant insert, update, delete on studeasy.coin_rates to authenticated;

-- ---------------------------------------------------------------------------
-- Awarding
-- ---------------------------------------------------------------------------

/*
 * Pays the configured rate for an event, at most once. The ON CONFLICT is the
 * whole safety story: callers never have to remember whether they have
 * already paid for this attempt, and a retry is free.
 *
 * An unconfigured reason pays nothing rather than raising — a missing rate row
 * should not break the activity that triggered it.
 */
create or replace function studeasy.award_coins(
  student uuid,
  reason text,
  ref_table text default null,
  ref_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
  rate studeasy.coin_rates%rowtype;
begin
  if student is null then return; end if;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  select * into rate from studeasy.coin_rates
   where organization_id = org and coin_rates.reason = award_coins.reason;
  if rate.coins is null or rate.coins = 0 then return; end if;

  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason,
                                    ref_table, ref_id)
  values (student, org, rate.coins, award_coins.reason, ref_table, ref_id)
  on conflict do nothing;
end;
$fn$;

grant execute on function studeasy.award_coins(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Default rates, weighted toward effort
-- ---------------------------------------------------------------------------

insert into studeasy.coin_rates (organization_id, reason, coins, house_points)
select o.id, v.reason, v.coins, v.hp
from studeasy.organizations o
cross join (values
  ('streak_day', 10, 5),
  ('lesson_completed', 15, 5),
  ('challenge_completed', 50, 20),
  ('battle_won', 25, 5),
  ('badge_awarded', 30, 5),
  ('assessment_passed', 20, 3)
) as v(reason, coins, hp)
on conflict (organization_id, reason) do nothing;

-- ---------------------------------------------------------------------------
-- The shop. Every kind is cosmetic.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.shop_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  /* Adding 'perk' here is where real-world value would enter. It is
     deliberately absent: a coin that buys a discount is a currency, and drags
     orders, refunds and tax in behind it. */
  kind text not null check (kind in ('avatar', 'theme', 'frame', 'title')),
  /* Names a bundled asset. Not a URL, so an item can never be pointed at an
     arbitrary external image. */
  asset_key text not null,
  cost_coins integer not null check (cost_coins > 0),
  min_level integer not null default 1,
  active boolean not null default true,
  sort integer not null default 0,
  unique (organization_id, code)
);

create table if not exists studeasy.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  item_id uuid not null references studeasy.shop_items (id) on delete cascade,
  coins_spent integer not null,
  created_at timestamptz not null default now(),
  unique (profile_id, item_id)
);

create table if not exists studeasy.avatar_state (
  profile_id uuid primary key references studeasy.profiles (id) on delete cascade,
  equipped jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- A balance that cannot go negative, even if a future caller forgets the lock
-- ---------------------------------------------------------------------------

create or replace function studeasy.coin_balance_not_negative()
returns trigger
language plpgsql
as $fn$
begin
  if (select coalesce(sum(delta), 0) from studeasy.coin_ledger
       where profile_id = new.profile_id) < 0 then
    raise exception 'That would leave a negative coin balance.'
      using errcode = '23514';
  end if;
  return null;
end;
$fn$;

drop trigger if exists coin_ledger_no_debt on studeasy.coin_ledger;
create constraint trigger coin_ledger_no_debt
  after insert on studeasy.coin_ledger
  for each row execute function studeasy.coin_balance_not_negative();

-- ---------------------------------------------------------------------------
-- Spending
-- ---------------------------------------------------------------------------

/*
 * The failure this guards against is two shop clicks half a second apart both
 * reading the old balance and both succeeding. The row lock is taken first,
 * so the second call waits for the first to commit and then reads the balance
 * the first left behind.
 *
 * gamification already holds exactly one row per profile, so it serves as the
 * lock row rather than inventing one. The constraint trigger above is the belt
 * to this braces: even a future path that forgets to lock cannot leave a debt.
 */
create or replace function studeasy.spend_coins(item uuid)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  it studeasy.shop_items%rowtype;
  balance integer;
  lvl integer;
  purchase uuid;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;

  insert into studeasy.gamification (profile_id, organization_id)
  values (caller, studeasy.current_org())
  on conflict (profile_id) do nothing;

  perform 1 from studeasy.gamification where profile_id = caller for update;

  select * into it from studeasy.shop_items
   where id = item and active and organization_id = studeasy.current_org();
  if it.id is null then raise exception 'That item is not for sale.'; end if;

  select coalesce(level, 1) into lvl
    from studeasy.gamification where profile_id = caller;
  if lvl < it.min_level then
    raise exception 'That unlocks at level %.', it.min_level;
  end if;

  if exists (select 1 from studeasy.shop_purchases
              where profile_id = caller and item_id = item) then
    raise exception 'You already own that.';
  end if;

  select coalesce(sum(delta), 0) into balance
    from studeasy.coin_ledger where profile_id = caller;
  if balance < it.cost_coins then
    raise exception 'That costs % coins and you have %.', it.cost_coins, balance;
  end if;

  insert into studeasy.shop_purchases (profile_id, item_id, coins_spent)
  values (caller, item, it.cost_coins)
  returning id into purchase;

  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason,
                                    ref_table, ref_id)
  values (caller, it.organization_id, -it.cost_coins, 'purchase',
          'shop_purchases', purchase);

  return purchase;
end;
$fn$;

/* You may only wear what you have bought. */
create or replace function studeasy.equip_item(item uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  it studeasy.shop_items%rowtype;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;

  select * into it from studeasy.shop_items where id = item;
  if it.id is null then raise exception 'No such item.'; end if;

  if not exists (select 1 from studeasy.shop_purchases
                  where profile_id = caller and item_id = item) then
    raise exception 'You do not own that.';
  end if;

  insert into studeasy.avatar_state (profile_id, equipped)
  values (caller, jsonb_build_object(it.kind, it.asset_key))
  on conflict (profile_id) do update
    set equipped = studeasy.avatar_state.equipped
                   || jsonb_build_object(it.kind, it.asset_key),
        updated_at = now();
end;
$fn$;

alter table studeasy.shop_items enable row level security;
alter table studeasy.shop_purchases enable row level security;
alter table studeasy.avatar_state enable row level security;

drop policy if exists shop_items_select on studeasy.shop_items;
create policy shop_items_select on studeasy.shop_items for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists shop_items_write on studeasy.shop_items;
create policy shop_items_write on studeasy.shop_items for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/* Read your own purchases. Writing them is spend_coins()'s business alone. */
drop policy if exists shop_purchases_select on studeasy.shop_purchases;
create policy shop_purchases_select on studeasy.shop_purchases for select
  to authenticated using (profile_id = auth.uid() or studeasy.is_admin());

/*
 * Readable by every signed-in user within the same org — an avatar is meant
 * to be seen by classmates, and that stays true here. avatar_state carries no
 * organization_id of its own, so the boundary is enforced by joining through
 * the owning profile rather than by a blanket `true`, which would let any
 * tenant read every other tenant's equipped cosmetics.
 */
drop policy if exists avatar_state_select on studeasy.avatar_state;
create policy avatar_state_select on studeasy.avatar_state for select
  to authenticated
  using (
    exists (
      select 1 from studeasy.profiles p
      where p.id = avatar_state.profile_id
        and p.organization_id = studeasy.current_org()
    )
  );

grant select on studeasy.shop_items, studeasy.shop_purchases,
                studeasy.avatar_state to authenticated;
grant insert, update, delete on studeasy.shop_items to authenticated;
grant execute on function studeasy.spend_coins(uuid) to authenticated;
grant execute on function studeasy.equip_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Houses — the only ranking on the platform
-- ---------------------------------------------------------------------------

create table if not exists studeasy.houses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  colour text not null default '#334155',
  sort integer not null default 0,
  unique (organization_id, code)
);

alter table studeasy.profiles
  add column if not exists house_id uuid references studeasy.houses (id) on delete set null;

create table if not exists studeasy.house_points (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references studeasy.houses (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  delta integer not null check (delta > 0),
  reason text not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists house_points_once
  on studeasy.house_points (profile_id, reason, ref_table, ref_id)
  where ref_id is not null;

/*
 * Aggregates only. There is no view anywhere on this platform that ranks
 * individuals, and adding one would undo the decision this table exists to
 * express.
 *
 * security_invoker = false so a student reading the standings sees whole-house
 * totals rather than only their own rows — house_points RLS restricts reads to
 * the caller, which is right for the table and wrong for the aggregate. But
 * bypassing RLS also removes the tenant check RLS would otherwise have given
 * us for free, so the organization_id filter below is load-bearing, not
 * decorative: without it a student reads every organization's houses.
 *
 * house_points is summed in its own subquery, one row per house, before it
 * ever meets profiles. Joining both tables straight to houses fans out: a
 * house with 20 points and 4 members would join into 4 point-rows apiece,
 * and sum(hp.delta) would double-count every point by the member count while
 * count(distinct p.id) quietly survives the same join because of the
 * distinct. Pre-aggregating removes the fan-out instead of masking it —
 * don't re-flatten this into a single join.
 */
create or replace view studeasy.house_standings
with (security_invoker = false) as
  select h.id as house_id, h.organization_id, h.name, h.colour, h.sort,
         coalesce(hp.points, 0)::integer as points,
         count(distinct p.id)::integer as members
  from studeasy.houses h
  left join (
    select house_id, sum(delta)::integer as points
    from studeasy.house_points
    group by house_id
  ) hp on hp.house_id = h.id
  left join studeasy.profiles p on p.house_id = h.id
  where h.organization_id = studeasy.current_org()
  group by h.id, h.organization_id, h.name, h.colour, h.sort, hp.points;

insert into studeasy.houses (organization_id, code, name, colour, sort)
select o.id, v.code, v.name, v.colour, v.sort
from studeasy.organizations o
cross join (values
  ('kauri',    'Kauri',    '#166534', 10),
  ('rata',     'Rātā',     '#991b1b', 20),
  ('kowhai',   'Kōwhai',   '#a16207', 30),
  ('harakeke', 'Harakeke', '#1e40af', 40)
) as v(code, name, colour, sort)
on conflict (organization_id, code) do nothing;

/*
 * Balanced round-robin: the house with the fewest members wins, ties broken at
 * random. Students do not choose — self-selection produces one strong house
 * and three weak ones, and the point of a house is that it mixes.
 */
create or replace function studeasy.assign_house()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  chosen uuid;
begin
  if new.role is distinct from 'student' or new.house_id is not null then
    return new;
  end if;

  select h.id into chosen
  from studeasy.houses h
  left join studeasy.profiles p on p.house_id = h.id
  where h.organization_id = new.organization_id
  group by h.id
  order by count(p.id), random()
  limit 1;

  new.house_id := chosen;
  return new;
end;
$fn$;

drop trigger if exists profiles_assign_house on studeasy.profiles;
create trigger profiles_assign_house
  before insert on studeasy.profiles
  for each row execute function studeasy.assign_house();

/* Backfill the students who already exist. */
update studeasy.profiles p
set house_id = (
  select h.id from studeasy.houses h
  where h.organization_id = p.organization_id
  order by random() limit 1
)
where p.role = 'student' and p.house_id is null;

create or replace function studeasy.award_house_points(
  student uuid,
  reason text,
  ref_table text default null,
  ref_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
  house uuid;
  points integer;
begin
  if student is null then return; end if;
  select organization_id, house_id into org, house
    from studeasy.profiles where id = student;
  if org is null or house is null then return; end if;

  select coin_rates.house_points into points from studeasy.coin_rates
   where organization_id = org and coin_rates.reason = award_house_points.reason;
  if points is null or points = 0 then return; end if;

  insert into studeasy.house_points (house_id, profile_id, organization_id,
                                     delta, reason, ref_table, ref_id)
  values (house, student, org, points, award_house_points.reason, ref_table, ref_id)
  on conflict do nothing;
end;
$fn$;

alter table studeasy.houses enable row level security;
alter table studeasy.house_points enable row level security;

drop policy if exists houses_select on studeasy.houses;
create policy houses_select on studeasy.houses for select
  to authenticated using (organization_id = studeasy.current_org());

/*
 * Your own contributions only. The standings view is what everybody reads, and
 * it exposes totals per house and nothing per child. This is the leaderboard
 * decision enforced rather than described.
 */
drop policy if exists house_points_select on studeasy.house_points;
create policy house_points_select on studeasy.house_points for select
  to authenticated
  using (profile_id = auth.uid() or studeasy.is_admin());

grant select on studeasy.houses, studeasy.house_points, studeasy.house_standings
  to authenticated;
grant execute on function studeasy.award_house_points(uuid, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Choosing what to ask next
-- ---------------------------------------------------------------------------

/*
 * Excludes what the student recently got right, and aims one band above where
 * they are — the range where they succeed about seven times in ten, which is
 * where practice actually moves someone. A set they ace teaches nothing and a
 * set they fail discourages.
 *
 * When the pool runs dry it re-includes older correct answers, oldest first,
 * rather than returning fewer questions than were asked for.
 */
create or replace function studeasy.select_questions(
  student uuid,
  topics uuid[],
  count integer,
  band text default null
)
returns setof uuid
language sql
security definer
set search_path = studeasy, public
as $fn$
  with recent_correct as (
    select a.question_id, max(coalesce(at.submitted_at, at.started_at)) as last_ok
    from studeasy.answers a
    join studeasy.attempts at on at.id = a.attempt_id
    where at.student_id = student
      and coalesce(a.auto_correct, a.awarded_marks > 0)
    group by a.question_id
  ),
  pool as (
    select distinct q.id,
           rc.last_ok,
           (rc.last_ok is null
            or rc.last_ok < now() - interval '21 days') as eligible
    from studeasy.questions q
    join studeasy.question_topics qt on qt.question_id = q.id
    left join recent_correct rc on rc.question_id = q.id
    where qt.topic_id = any(topics)
      and (band is null or q.grade_band = band)
  )
  select id from pool
  order by eligible desc, last_ok nulls first, random()
  limit greatest(count, 0);
$fn$;

grant execute on function studeasy.select_questions(uuid, uuid[], integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Quiz battles, asynchronous
-- ---------------------------------------------------------------------------

create table if not exists studeasy.battles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  challenger_id uuid not null references studeasy.profiles (id) on delete cascade,
  opponent_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  question_count integer not null default 10 check (question_count between 3 and 20),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','complete','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  winner_id uuid references studeasy.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists studeasy.battle_questions (
  battle_id uuid not null references studeasy.battles (id) on delete cascade,
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  position integer not null default 0,
  primary key (battle_id, question_id)
);

create table if not exists studeasy.battle_answers (
  battle_id uuid not null references studeasy.battles (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  response jsonb,
  correct boolean not null default false,
  seconds integer not null default 0,
  answered_at timestamptz not null default now(),
  primary key (battle_id, profile_id, question_id)
);

alter table studeasy.battles enable row level security;
alter table studeasy.battle_questions enable row level security;
alter table studeasy.battle_answers enable row level security;

drop policy if exists battles_select on studeasy.battles;
create policy battles_select on studeasy.battles for select
  to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid()
         or studeasy.is_admin());

drop policy if exists battle_questions_select on studeasy.battle_questions;
create policy battle_questions_select on studeasy.battle_questions for select
  to authenticated
  using (exists (select 1 from studeasy.battles b
                  where b.id = battle_id
                    and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid())));

/*
 * Your own answers always; your opponent's only once the battle is complete.
 * In the UI this would be a rule somebody could forget; here it is the only
 * way the rows can be read at all.
 */
drop policy if exists battle_answers_select on studeasy.battle_answers;
create policy battle_answers_select on studeasy.battle_answers for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from studeasy.battles b
                where b.id = battle_id and b.status = 'complete'
                  and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid()))
  );

grant select on studeasy.battles, studeasy.battle_questions,
                studeasy.battle_answers to authenticated;

create or replace function studeasy.create_battle(
  opponent uuid, topic uuid, questions integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  battle uuid;
  opponent_org uuid;
  topic_org uuid;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;
  if caller = opponent then raise exception 'You cannot battle yourself.'; end if;

  -- battles_select is pure identity matching (challenger or opponent), with
  -- no organization check of its own — so without this, a battle across two
  -- orgs would be visible to both sides and leak a user and a topic across
  -- the tenant boundary they belong to.
  select organization_id into opponent_org
    from studeasy.profiles where id = create_battle.opponent;
  if opponent_org is null or opponent_org <> studeasy.current_org() then
    raise exception 'That person is not in your organization.';
  end if;

  -- A topic is either a seeded national standard (organization_id null,
  -- shared by every org) or a tutor sub-topic scoped to one org. Anything
  -- else belongs to a different org and must not be battled over.
  select organization_id into topic_org
    from studeasy.topics where id = create_battle.topic;
  if topic_org is not null and topic_org <> studeasy.current_org() then
    raise exception 'That topic is not available in your organization.';
  end if;

  insert into studeasy.battles (organization_id, challenger_id, opponent_id,
                                topic_id, question_count)
  values (studeasy.current_org(), caller, opponent, topic, questions)
  returning id into battle;

  return battle;
end;
$fn$;

/*
 * The question set is drawn once, on accept, so both players face identical
 * questions. Drawing per player would make the result meaningless.
 */
create or replace function studeasy.accept_battle(battle uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  b studeasy.battles%rowtype;
  q uuid;
  i integer := 0;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null then raise exception 'No such battle.'; end if;
  if b.opponent_id <> caller then
    raise exception 'Only the person challenged may accept.';
  end if;
  if b.status <> 'pending' then
    raise exception 'That battle is already %.', b.status;
  end if;

  for q in
    select studeasy.select_questions(b.challenger_id, array[b.topic_id],
                                     b.question_count)
  loop
    insert into studeasy.battle_questions (battle_id, question_id, position)
    values (battle, q, i) on conflict do nothing;
    i := i + 1;
  end loop;

  if i = 0 then
    raise exception 'There are no tagged questions on that topic yet.';
  end if;

  update studeasy.battles set status = 'accepted' where id = battle;
end;
$fn$;

/*
 * The opponent may decline instead of playing. Mirrors accept_battle()'s own
 * guard — only the person challenged, and only while still pending — because
 * declining an already-accepted or already-decided battle should not be
 * possible from here either.
 */
create or replace function studeasy.decline_battle(battle uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  b studeasy.battles%rowtype;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null then raise exception 'No such battle.'; end if;
  if b.opponent_id <> caller then
    raise exception 'Only the person challenged may decline.';
  end if;
  if b.status <> 'pending' then
    raise exception 'That battle is already %.', b.status;
  end if;

  update studeasy.battles set status = 'declined' where id = battle;
end;
$fn$;

/* Completes when both players have answered every question. */
create or replace function studeasy.complete_battle(battle uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  b studeasy.battles%rowtype;
  total integer;
  ch_done integer; op_done integer;
  ch_score integer; op_score integer;
  ch_secs integer; op_secs integer;
  won uuid;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null or b.status <> 'accepted' then return; end if;

  select count(*) into total from studeasy.battle_questions where battle_id = battle;

  select count(*), coalesce(sum(case when correct then 1 else 0 end), 0),
         coalesce(sum(seconds), 0)
    into ch_done, ch_score, ch_secs
    from studeasy.battle_answers
   where battle_id = battle and profile_id = b.challenger_id;

  select count(*), coalesce(sum(case when correct then 1 else 0 end), 0),
         coalesce(sum(seconds), 0)
    into op_done, op_score, op_secs
    from studeasy.battle_answers
   where battle_id = battle and profile_id = b.opponent_id;

  if ch_done < total or op_done < total then return; end if;

  -- Higher score wins; a tie goes to the faster player; a dead heat has no
  -- winner rather than an arbitrary one.
  won := case
    when ch_score > op_score then b.challenger_id
    when op_score > ch_score then b.opponent_id
    when ch_secs < op_secs then b.challenger_id
    when op_secs < ch_secs then b.opponent_id
    else null
  end;

  update studeasy.battles
     set status = 'complete', winner_id = won, completed_at = now()
   where id = battle;

  if won is not null then
    perform studeasy.award_coins(won, 'battle_won', 'battles', battle);
    perform studeasy.award_house_points(won, 'battle_won', 'battles', battle);
  end if;
end;
$fn$;

/*
 * One marking rule rather than two that can disagree: mark_answer() already
 * decides correctness for every question kind, so answer_battle() defers to
 * it instead of comparing q.correct itself.
 */
create or replace function studeasy.answer_battle(
  battle uuid, question uuid, response jsonb, seconds integer
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  b studeasy.battles%rowtype;
  q studeasy.questions%rowtype;
  is_right boolean;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null then raise exception 'No such battle.'; end if;
  if caller not in (b.challenger_id, b.opponent_id) then
    raise exception 'You are not in that battle.';
  end if;
  if b.status <> 'accepted' then
    raise exception 'That battle is not open for answers.';
  end if;

  select * into q from studeasy.questions where id = question;
  is_right := coalesce(studeasy.mark_answer(q, response), false);

  insert into studeasy.battle_answers (battle_id, profile_id, question_id,
                                       response, correct, seconds)
  values (battle, caller, question, response, coalesce(is_right, false),
          greatest(0, least(600, coalesce(seconds, 0))))
  on conflict (battle_id, profile_id, question_id) do nothing;

  perform studeasy.complete_battle(battle);
end;
$fn$;

/* Swept alongside expired seat offers rather than on its own schedule. */
create or replace function studeasy.expire_battles()
returns void
language sql
security definer
set search_path = studeasy, public
as $fn$
  update studeasy.battles set status = 'expired'
   where status in ('pending', 'accepted') and expires_at < now();
$fn$;

grant execute on function studeasy.create_battle(uuid, uuid, integer) to authenticated;
grant execute on function studeasy.accept_battle(uuid) to authenticated;
grant execute on function studeasy.decline_battle(uuid) to authenticated;
grant execute on function studeasy.answer_battle(uuid, uuid, jsonb, integer) to authenticated;
grant execute on function studeasy.complete_battle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Challenges. Every metric is effort, not accuracy.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  title text not null,
  description text,
  /* topics_improved counts topics whose topic_mastery row was touched in the
     period (updated_at, not a rise in the mastery value) — a touched row
     means the student worked that topic in the period, which is the effort
     signal this metric rewards, not whether they got better at it. */
  metric text not null check (metric in (
    'questions_attempted', 'topics_improved', 'lessons_completed',
    'streak_days', 'battles_played')),
  target integer not null check (target > 0),
  coin_reward integer not null default 0,
  house_points_reward integer not null default 0,
  subject text,
  topic_id uuid references studeasy.topics (id) on delete set null,
  unique (organization_id, kind, period_start),
  check (period_end >= period_start)
);

create table if not exists studeasy.challenge_progress (
  challenge_id uuid not null references studeasy.challenges (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  value integer not null default 0,
  completed_at timestamptz,
  primary key (challenge_id, profile_id)
);

alter table studeasy.challenges enable row level security;
alter table studeasy.challenge_progress enable row level security;

drop policy if exists challenges_select on studeasy.challenges;
create policy challenges_select on studeasy.challenges for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists challenges_write on studeasy.challenges;
create policy challenges_write on studeasy.challenges for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/* Your own progress. Nobody browses another child's. */
drop policy if exists challenge_progress_select on studeasy.challenge_progress;
create policy challenge_progress_select on studeasy.challenge_progress for select
  to authenticated using (profile_id = auth.uid() or studeasy.is_admin());

grant select on studeasy.challenges, studeasy.challenge_progress to authenticated;
grant insert, update, delete on studeasy.challenges to authenticated;

/*
 * Recomputes progress on every open challenge for one student and pays out the
 * ones newly completed. Recomputed rather than incremented: an increment that
 * runs twice overcounts, and this runs on every piece of progress.
 *
 * lessons_completed reads lesson_progress.completed_at, not updated_at — that
 * column does not exist on this table. It also filters completed_at is not
 * null: a row appears there as soon as a lesson is opened, so without the
 * filter a student would earn credit for lessons they never finished.
 */
create or replace function studeasy.advance_challenges(student uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  ch studeasy.challenges%rowtype;
  org uuid;
  v integer;
  already timestamptz;
begin
  if student is null then return; end if;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  for ch in
    select * from studeasy.challenges
     where organization_id = org
       and current_date between period_start and period_end
  loop
    v := case ch.metric
      when 'questions_attempted' then (
        select count(*)::int from studeasy.answers a
        join studeasy.attempts at on at.id = a.attempt_id
        where at.student_id = student
          and coalesce(at.submitted_at, at.started_at)::date
              between ch.period_start and ch.period_end)
      when 'lessons_completed' then (
        select count(*)::int from studeasy.lesson_progress lp
        where lp.student_id = student
          and lp.completed_at is not null
          and lp.completed_at::date between ch.period_start and ch.period_end)
      when 'streak_days' then (
        select coalesce(streak_days, 0) from studeasy.gamification
        where profile_id = student)
      when 'topics_improved' then (
        select count(*)::int from studeasy.topic_mastery m
        where m.profile_id = student
          and m.updated_at::date between ch.period_start and ch.period_end)
      when 'battles_played' then (
        select count(distinct b.id)::int from studeasy.battles b
        where (b.challenger_id = student or b.opponent_id = student)
          and b.status = 'complete'
          and b.completed_at::date between ch.period_start and ch.period_end)
      else 0
    end;

    insert into studeasy.challenge_progress (challenge_id, profile_id, value)
    values (ch.id, student, coalesce(v, 0))
    on conflict (challenge_id, profile_id) do update set value = excluded.value;

    select completed_at into already from studeasy.challenge_progress
     where challenge_id = ch.id and profile_id = student;

    if coalesce(v, 0) >= ch.target and already is null then
      update studeasy.challenge_progress set completed_at = now()
       where challenge_id = ch.id and profile_id = student;
      perform studeasy.award_coins(student, 'challenge_completed',
                                   'challenges', ch.id);
      perform studeasy.award_house_points(student, 'challenge_completed',
                                          'challenges', ch.id);
    end if;
  end loop;
end;
$fn$;

grant execute on function studeasy.advance_challenges(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hook the economy into the one function that already runs on every piece of
-- progress
-- ---------------------------------------------------------------------------

/*
 * Same signature as the touch_streak() in learning-twin.sql, so this replaces
 * it rather than creating a second overload. Keeps every existing call —
 * refresh_topic_mastery, refresh_projections, evaluate_badges — and adds the
 * economy hooks before evaluate_badges(), so a badge keyed off coins or
 * challenges sees fresh values on the same call that earned them.
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

  -- Effort pays on the day it happens. Hashing the profile and the date into a
  -- uuid gives the ledger a stable ref_id for "this student, this day", which
  -- is what stops a second page-load paying again.
  perform studeasy.award_coins(caller, 'streak_day', 'gamification_day',
                               md5(caller::text || today::text)::uuid);
  perform studeasy.award_house_points(caller, 'streak_day', 'gamification_day',
                                      md5(caller::text || today::text)::uuid);
  perform studeasy.advance_challenges(caller);

  -- Awarded from the row we just wrote, so a streak or level badge lands on
  -- the same activity that earned it rather than one action later.
  perform studeasy.evaluate_badges();
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual adjustments, admin only
-- ---------------------------------------------------------------------------

/*
 * Minting currency by hand. Admin-only, a note is required, and the row is an
 * 'admin_adjustment' the finance and audit pages can both see — this is
 * exactly the kind of act the audit log exists for.
 */
create or replace function studeasy.adjust_balance(
  student uuid, delta integer, note text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
begin
  if not studeasy.is_admin() then
    raise exception 'Only an administrator may adjust a balance.';
  end if;
  if delta = 0 then raise exception 'An adjustment of zero does nothing.'; end if;
  if btrim(coalesce(note, '')) = '' then
    raise exception 'Say why you are adjusting this balance.';
  end if;

  select organization_id into org from studeasy.profiles where id = student;
  if org is null then raise exception 'No such student.'; end if;

  -- coin_ledger has its own 'delta' and 'note' columns, so the bare parameter
  -- names would be ambiguous inside this INSERT — qualified the same way
  -- award_coins() qualifies 'reason' against coin_rates.reason.
  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason, note)
  values (student, org, adjust_balance.delta, 'admin_adjustment', btrim(adjust_balance.note));
end;
$fn$;

grant execute on function studeasy.adjust_balance(uuid, integer, text) to authenticated;
