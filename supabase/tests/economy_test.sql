begin;
select plan(9);

select has_table('studeasy', 'coin_ledger', 'coin_ledger exists');
select has_view('studeasy', 'coin_balances', 'coin_balances exists');
select has_table('studeasy', 'shop_items', 'shop_items exists');

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

select tests.clear_auth();
select * from finish();
rollback;
