begin;
select plan(5);

select has_table('studeasy', 'coin_ledger', 'coin_ledger exists');
select has_view('studeasy', 'coin_balances', 'coin_balances exists');

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

select tests.clear_auth();
select * from finish();
rollback;
