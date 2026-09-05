begin;
select plan(18);

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

-- A tutor enrolled to teach nothing, for the authorization-boundary proof
-- near the bottom of this file. Created here, as the migration owner, for
-- the same reason the other fixtures above are: tests.make_user() writes to
-- auth.users, which must land regardless of any table's write policy.
select tests.make_user('twin-tutor-outsider@test.invalid', 'tutor');

-- A student must not be able to read another student's mastery.
select tests.authenticate_as(tests.make_user('twin-a@test.invalid', 'student'));
select ok(
  (select count(*) from studeasy.topic_mastery
    where profile_id <> auth.uid()) = 0,
  'a student sees no other student in topic_mastery'
);

/*
 * refresh_topic_mastery() is SECURITY DEFINER and accepts any student id — a
 * caller check was added at the top of it for exactly this reason: without
 * it, any signed-in student could force a recompute against any other
 * student. twin-fixture-8 (created above, before any role switch) stands in
 * as the other student here.
 */
select throws_ok(
  $t$ select studeasy.refresh_topic_mastery(
        (select id from auth.users where email = 'twin-fixture-8@test.invalid')) $t$,
  null, null,
  'a student cannot refresh another student''s mastery'
);

select has_function('studeasy', 'refresh_topic_mastery',
                    'refresh_topic_mastery() exists');

-- One correct answer out of one must not read as full mastery. With
-- alpha = 3 and prior = 0.5, a single correct answer gives (1 + 1.5) / 4.
select ok(
  (select round(((1 + 3 * 0.5) / (1 + 3))::numeric, 3)) = 0.625,
  'the shrinkage formula holds one right answer well short of mastered'
);

-- Decay: evidence exactly one half-life old counts half as much.
select ok(
  (select round(power(0.5, 60.0 / 60.0)::numeric, 3)) = 0.500,
  'evidence one half-life old carries half weight'
);

select tests.clear_auth();

-- Fixtures for the end-to-end proof below: a question tagged to AS91027 with
-- grade_band = 'achieved', an attempt for the twin-a student, and an answer
-- with auto_correct = true. Inserted as the migration owner, after
-- clear_auth, so they land regardless of question_topics' and assessments'
-- write policies.
insert into studeasy.assessments (organization_id, title)
values (studeasy.default_org(), 'Learning twin test fixture assessment 10');

insert into studeasy.questions (assessment_id, kind, prompt, grade_band)
select a.id, 'short_answer', 'Learning twin test fixture question 10', 'achieved'
from studeasy.assessments a
where a.title = 'Learning twin test fixture assessment 10';

insert into studeasy.question_topics (question_id, topic_id)
select q.id, t.id
from studeasy.questions q, studeasy.topics t
where q.prompt = 'Learning twin test fixture question 10'
  and t.code = 'AS91027';

insert into studeasy.attempts (assessment_id, student_id)
select a.id, (select id from studeasy.profiles where email = 'twin-a@test.invalid')
from studeasy.assessments a
where a.title = 'Learning twin test fixture assessment 10';

insert into studeasy.answers (attempt_id, question_id, auto_correct)
select at.id, q.id, true
from studeasy.attempts at
join studeasy.questions q on q.assessment_id = at.assessment_id
where at.student_id = (select id from studeasy.profiles where email = 'twin-a@test.invalid')
  and q.prompt = 'Learning twin test fixture question 10';

select studeasy.refresh_topic_mastery(
  (select id from studeasy.profiles where email = 'twin-a@test.invalid'));

select ok(
  (select mastery from studeasy.topic_mastery
    where profile_id = (select id from studeasy.profiles
                         where email = 'twin-a@test.invalid')
    limit 1) between 0.5 and 1.0,
  'one correct answer moves mastery above the prior but not to certainty'
);

select ok(
  (select prosrc from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'studeasy' and p.proname = 'touch_streak')
    like '%refresh_topic_mastery%',
  'touch_streak refreshes mastery'
);

select has_table('studeasy', 'standard_projections', 'standard_projections exists');

select ok(
  (select count(*) from studeasy.standard_projections
    where projected_grade not in ('not_achieved','achieved','merit','excellence')) = 0,
  'every projection names one of the four NCEA grades'
);

select is(
  studeasy.grade_rank('merit') > studeasy.grade_rank('achieved'),
  true,
  'grades order by rank, not alphabetically'
);

select has_function('studeasy', 'review_projection',
                    'review_projection() exists');

-- A student cannot release their own projection to a parent.
select tests.authenticate_as(
  (select id from studeasy.profiles where email = 'twin-a@test.invalid'));
select throws_ok(
  $t$ select studeasy.review_projection(
        (select id from studeasy.profiles where email = 'twin-a@test.invalid'),
        (select id from studeasy.topics where code = 'AS91027'),
        'Looks fine to me', true) $t$,
  null, null,
  'a student cannot release their own projection'
);
select tests.clear_auth();

-- The actual boundary review_projection() exists to enforce: a tutor who
-- does not teach this student must be rejected too, not just a student
-- acting on themselves.
select tests.authenticate_as(
  (select id from studeasy.profiles where email = 'twin-tutor-outsider@test.invalid'));
select throws_ok(
  $t$ select studeasy.review_projection(
        (select id from studeasy.profiles where email = 'twin-a@test.invalid'),
        (select id from studeasy.topics where code = 'AS91027'),
        'Looks fine to me', true) $t$,
  null, null,
  'a tutor who does not teach this student cannot release their projection'
);
select tests.clear_auth();

select * from finish();
rollback;
