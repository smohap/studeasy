begin;
-- pgtap installs into the extensions schema, which is normally already on
-- the search_path but is not guaranteed to be. An assertion that cannot find
-- plan() fails before it can report anything. set local, so it reverts below.
set local search_path = pg_temp, extensions, studeasy, public;

-- Every pgtap assertion returns its TAP line as its own result set, and the
-- Supabase SQL Editor shows only the last one. Collecting them means a failure
-- names itself instead of arriving as a bare count.
create temp table _tap (line text);
-- The assertions after tests.authenticate_as run as the authenticated role,
-- which cannot write a table the owner created. Granting on a temp table is
-- safe in a way granting on auth.users was not: pg_temp is private to this
-- session and the table dies with the rollback below.
grant insert, select on pg_temp._tap to public;
insert into pg_temp._tap select plan(22);

insert into pg_temp._tap select has_table('studeasy', 'coin_ledger', 'coin_ledger exists');
insert into pg_temp._tap select has_view('studeasy', 'coin_balances', 'coin_balances exists');
insert into pg_temp._tap select has_table('studeasy', 'shop_items', 'shop_items exists');
insert into pg_temp._tap select has_table('studeasy', 'houses', 'houses exists');

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.houses
    where organization_id = studeasy.default_org()) = 4,
  'four houses are seeded'
);

insert into pg_temp._tap select has_function('studeasy', 'select_questions', 'select_questions() exists');
insert into pg_temp._tap select has_table('studeasy', 'battles', 'battles exists');

insert into pg_temp._tap select has_table('studeasy', 'challenges', 'challenges exists');

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.challenges
    where metric not in ('questions_attempted','topics_improved',
                         'lessons_completed','streak_days','battles_played')) = 0,
  'every challenge metric is effort-shaped'
);

/*
 * Fixture for the shop assertions further down. Inserted here, above the
 * role switch below, because shop_items_write requires studeasy.is_admin()
 * and the fixture student authenticated below is not an admin — a bare
 * insert issued after tests.authenticate_as() would raise 42501 and abort
 * the whole transaction rather than merely failing an assertion.
 */
insert into studeasy.shop_items (organization_id, code, name, kind, asset_key, cost_coins)
values (studeasy.default_org(), 'test-frame', 'Test frame', 'frame', 'frame/test', 100000)
on conflict (organization_id, code) do nothing;

/*
 * Fixture for the cross-tenant battle test further down: a second
 * organization and a profile that belongs to it. tests.make_user() always
 * lands a fresh profile in the default org (see helpers.sql), so the
 * outsider's organization_id is moved explicitly here, as migration owner,
 * before the first tests.authenticate_as() call below — after that call RLS
 * applies and a bare update would raise 42501 and abort the transaction.
 */
insert into studeasy.organizations (slug, name)
values ('other-academy', 'Other Academy')
on conflict (slug) do nothing;

select tests.make_user('battle-outsider@test.invalid', 'student');

update studeasy.profiles
   set organization_id = (
     select id from studeasy.organizations where slug = 'other-academy')
 where id = (select id from auth.users where email = 'battle-outsider@test.invalid');

/*
 * Fixture for the coin_balances security_invoker proof further below: a
 * second student with a real, non-zero ledger row. coin_ledger has no insert
 * policy at all (only award_coins()/spend_coins(), both SECURITY DEFINER,
 * write it), so this is done here, as the migration owner, above the first
 * tests.authenticate_as() call — a bare insert issued after that role switch
 * would raise 42501 and abort the whole transaction. Without a real row here,
 * the assertion that a different student cannot see it would pass vacuously.
 */
select tests.make_user('coin-b@test.invalid', 'student');

insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason)
select p.id, p.organization_id, 500, 'admin_adjustment'
from studeasy.profiles p
where p.email = 'coin-b@test.invalid';

-- The same event must never pay twice, however often the award path runs.
-- The assertions below run as the authenticated role, which cannot read
-- auth.users and should not be able to: granting it would expose every user's
-- email platform-wide. Capture the ids here, while still the migration owner,
-- and carry them forward as transaction-local settings that any role may read.
select set_config('tests.coin_b',
  (select id::text from auth.users where email = 'coin-b@test.invalid'), true);
select set_config('tests.battle_outsider',
  (select id::text from auth.users where email = 'battle-outsider@test.invalid'), true);
select tests.authenticate_as(tests.make_user('coin-a@test.invalid', 'student'));

insert into pg_temp._tap select lives_ok(
  $t$ select studeasy.award_coins(auth.uid(), 'assessment_passed',
                                  'attempts', '11111111-1111-1111-1111-111111111111') $t$,
  'the first award for an event succeeds'
);

insert into pg_temp._tap select lives_ok(
  $t$ select studeasy.award_coins(auth.uid(), 'assessment_passed',
                                  'attempts', '11111111-1111-1111-1111-111111111111') $t$,
  'a repeat award for the same event is silently ignored'
);

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.coin_ledger
    where profile_id = auth.uid()
      and ref_id = '11111111-1111-1111-1111-111111111111') = 1,
  'the same event paid exactly once'
);

insert into pg_temp._tap select throws_ok(
  $t$ select studeasy.spend_coins(
        (select id from studeasy.shop_items where code = 'test-frame')) $t$,
  null, null,
  'you cannot buy what you cannot afford'
);

insert into pg_temp._tap select ok(
  (select coalesce(balance, 0) from studeasy.coin_balances
    where profile_id = auth.uid()) >= 0,
  'the balance never went negative'
);

/*
 * coin_balances is security_invoker = true so it runs under the caller's own
 * coin_ledger_select policy rather than the migration owner's — this is the
 * proof of that. coin-b's ledger row (inserted above, as the migration
 * owner) is real and non-zero, so this student seeing no row for it is the
 * view honouring RLS rather than there being nothing to hide.
 */
insert into pg_temp._tap select ok(
  (select count(*) from studeasy.coin_balances
    where profile_id = current_setting('tests.coin_b')::uuid) = 0,
  'a student reads no row for another student''s balance in coin_balances'
);

insert into pg_temp._tap select throws_ok(
  $t$ select studeasy.equip_item(
        (select id from studeasy.shop_items where code = 'test-frame')) $t$,
  null, null,
  'you cannot wear what you do not own'
);

-- The rule that matters: one child never sees another child's contribution.
insert into pg_temp._tap select ok(
  (select count(*) from studeasy.house_points
    where profile_id <> auth.uid()) = 0,
  'a student sees no other student in house_points'
);

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.house_standings) = 4,
  'a student reads all four houses in the standings, not just their own rows'
);

-- A cross-tenant challenge would be visible to both parties under
-- battles_select's pure identity matching, leaking a user and a topic across
-- the tenant boundary — create_battle must refuse it before the insert.
insert into pg_temp._tap select throws_ok(
  $t$ select studeasy.create_battle(
        current_setting('tests.battle_outsider')::uuid,
        (select id from studeasy.topics where code = 'AS91027'),
        5) $t$,
  null, null,
  'create_battle rejects an opponent from another organization'
);

-- Neither player reads the other's answers before both have finished.
insert into pg_temp._tap select ok(
  (select count(*) from studeasy.battle_answers
    where profile_id <> auth.uid()) = 0,
  'an unfinished battle hides the opponent'
);

insert into pg_temp._tap select ok(
  (select prosrc from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'studeasy' and p.proname = 'touch_streak')
    like '%advance_challenges%',
  'touch_streak advances challenges'
);

-- Still authenticated as the coin-a student from above. No owner-level
-- fixture is needed for this one: adjust_balance() is refused on the
-- is_admin() check alone, before it touches any row this student does not
-- already have RLS access to.
insert into pg_temp._tap select throws_ok(
  $t$ select studeasy.adjust_balance(auth.uid(), 1000, 'free money') $t$,
  null, null,
  'a student cannot mint coins for themselves'
);

-- reset role, not tests.clear_auth(): once authenticate_as has done SET ROLE
-- authenticated, that role has no USAGE on schema tests and the call is denied
-- with 42501. reset role needs no schema access at all.
reset role;
select set_config('request.jwt.claims', null, true);
-- finish() emits nothing when every assertion passed, which in the Supabase
-- SQL Editor looks identical to a query that never ran. Aggregating it means
-- the result is always a sentence, so a pass is positively reported rather
-- than inferred from an empty grid.
insert into pg_temp._tap select * from finish();

select string_agg(line, chr(10)) as tap_result from pg_temp._tap;
rollback;
