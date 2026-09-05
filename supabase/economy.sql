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

create or replace view studeasy.coin_balances as
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
