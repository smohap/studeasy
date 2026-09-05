begin;
select plan(20);

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

select tests.clear_auth();
select * from finish();
rollback;
