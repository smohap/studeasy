begin;
select plan(6);

select has_column('studeasy', 'answers', 'seconds_spent',
                  'answers.seconds_spent exists');

-- The answers table may be empty in this project. An update matching no rows
-- raises nothing, so throws_ok below would pass vacuously without a fixture
-- row to actually update. This must run as the migration owner, before any
-- authenticate_as call in this file switches the role and RLS starts to bite.
insert into studeasy.assessments (organization_id, title)
values (studeasy.default_org(), 'Learning twin test fixture assessment');

insert into studeasy.questions (assessment_id, kind, prompt)
select a.id, 'short_answer', 'Learning twin test fixture question'
from studeasy.assessments a
where a.title = 'Learning twin test fixture assessment';

insert into studeasy.attempts (assessment_id, student_id)
select a.id, tests.make_user('twin-fixture-8@test.invalid', 'student')
from studeasy.assessments a
where a.title = 'Learning twin test fixture assessment';

insert into studeasy.answers (attempt_id, question_id)
select at.id, q.id
from studeasy.attempts at
join studeasy.questions q on q.assessment_id = at.assessment_id
where at.student_id = (select id from studeasy.profiles
                        where email = 'twin-fixture-8@test.invalid');

select throws_ok(
  $t$ update studeasy.answers set seconds_spent = -1
      where id = (select id from studeasy.answers limit 1) $t$,
  '23514',
  null,
  'negative time on a question is rejected'
);

select has_table('studeasy', 'topic_mastery', 'topic_mastery exists');
select has_table('studeasy', 'twin_config', 'twin_config exists');

select ok(
  (select count(*) from studeasy.twin_config) = 1,
  'exactly one tuning row exists'
);

-- A student must not be able to read another student's mastery.
select tests.authenticate_as(tests.make_user('twin-a@test.invalid', 'student'));
select ok(
  (select count(*) from studeasy.topic_mastery
    where profile_id <> auth.uid()) = 0,
  'a student sees no other student in topic_mastery'
);
select tests.clear_auth();

select * from finish();
rollback;
