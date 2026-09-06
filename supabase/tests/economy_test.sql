begin;
-- pgtap lives in the extensions schema, which is not on the SQL Editor's
-- search_path. Without this every assertion fails with "function plan(integer)
-- does not exist". set local, so it reverts with the rollback below.
set local search_path = extensions, studeasy, public;
select plan(22);

select has_table('studeasy', 'coin_ledger', 'coin_ledger exists');
select has_view('studeasy', 'coin_balances', 'coin_balances exists');
select has_table('studeasy', 'shop_items', 'shop_items exists');
select has_table('studeasy', 'houses', 'houses exists');

select ok(
  (select count(*) from studeasy.houses
    where organization_id = studeasy.default_org()) = 4,
  'four houses are seeded'
);

select has_function('studeasy', 'select_questions', 'select_questions() exists');
select has_table('studeasy', 'battles', 'battles exists');

select has_table('studeasy', 'challenges', 'challenges exists');

select ok(
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
select tests.authenticate_as(tests.make_user('coin-a@test.invalid', 'student'));

select lives_ok(
  $t$ select studeasy.award_coins(auth.uid(), 'assessment_passed',
                                  'attempts', '11111111-1111-1111-1111-111111111111') $t$,
  'the first award for an event succeeds'
);

select lives_ok(
  $t$ select studeasy.award_coins(auth.uid(), 'assessment_passed',
                                  'attempts', '11111111-1111-1111-1111-111111111111') $t$,
  'a repeat award for the same event is silently ignored'
);

select ok(
  (select count(*) from studeasy.coin_ledger
    where profile_id = auth.uid()
      and ref_id = '11111111-1111-1111-1111-111111111111') = 1,
  'the same event paid exactly once'
);

select throws_ok(
  $t$ select studeasy.spend_coins(
        (select id from studeasy.shop_items where code = 'test-frame')) $t$,
  null, null,
  'you cannot buy what you cannot afford'
);

select ok(
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
select ok(
  (select count(*) from studeasy.coin_balances
    where profile_id = (select id from auth.users where email = 'coin-b@test.invalid')) = 0,
  'a student reads no row for another student''s balance in coin_balances'
);

select throws_ok(
  $t$ select studeasy.equip_item(
        (select id from studeasy.shop_items where code = 'test-frame')) $t$,
  null, null,
  'you cannot wear what you do not own'
);

-- The rule that matters: one child never sees another child's contribution.
select ok(
  (select count(*) from studeasy.house_points
    where profile_id <> auth.uid()) = 0,
  'a student sees no other student in house_points'
);

select ok(
  (select count(*) from studeasy.house_standings) = 4,
  'a student reads all four houses in the standings, not just their own rows'
);

-- A cross-tenant challenge would be visible to both parties under
-- battles_select's pure identity matching, leaking a user and a topic across
-- the tenant boundary — create_battle must refuse it before the insert.
select throws_ok(
  $t$ select studeasy.create_battle(
        (select id from auth.users where email = 'battle-outsider@test.invalid'),
        (select id from studeasy.topics where code = 'AS91027'),
        5) $t$,
  null, null,
  'create_battle rejects an opponent from another organization'
);

-- Neither player reads the other's answers before both have finished.
select ok(
  (select count(*) from studeasy.battle_answers
    where profile_id <> auth.uid()) = 0,
  'an unfinished battle hides the opponent'
);

select ok(
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
select throws_ok(
  $t$ select studeasy.adjust_balance(auth.uid(), 1000, 'free money') $t$,
  null, null,
  'a student cannot mint coins for themselves'
);

select tests.clear_auth();
select * from finish();
rollback;
