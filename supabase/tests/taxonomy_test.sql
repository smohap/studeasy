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
insert into pg_temp._tap select plan(17);

insert into pg_temp._tap select has_table('studeasy', 'curricula', 'curricula exists');
insert into pg_temp._tap select has_table('studeasy', 'curriculum_levels', 'curriculum_levels exists');
insert into pg_temp._tap select has_table('studeasy', 'topics', 'topics exists');

insert into studeasy.curricula (code, name) values ('ncea', 'NCEA')
  on conflict (code) do nothing;

with c as (select id from studeasy.curricula where code = 'ncea')
insert into studeasy.curriculum_levels (curriculum_id, code, name, sort)
select c.id, 'l1', 'Level 1', 10 from c
  on conflict (curriculum_id, code) do nothing;

insert into studeasy.topics (curriculum_id, level_id, subject, code, name, credits)
select c.id, l.id, 'Mathematics', 'AS91027', 'Apply algebraic procedures', 4
from studeasy.curricula c
join studeasy.curriculum_levels l on l.curriculum_id = c.id and l.code = 'l1'
where c.code = 'ncea'
  on conflict do nothing;

insert into pg_temp._tap select is(
  (select organization_id from studeasy.topics where code = 'AS91027'),
  null,
  'a seeded standard has no organization'
);

insert into pg_temp._tap select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id, subject, name)
      select c.id, l.id, studeasy.default_org(), 'Mathematics', 'Invented standard'
      from studeasy.curricula c
      join studeasy.curriculum_levels l on l.curriculum_id = c.id and l.code = 'l1'
      where c.code = 'ncea' $t$,
  '23514',
  null,
  'an org-scoped topic with no parent is rejected'
);

insert into pg_temp._tap select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, subject, name)
      select c.id, l.id, 'Mathematics', 'Codeless standard'
      from studeasy.curricula c
      join studeasy.curriculum_levels l on l.curriculum_id = c.id and l.code = 'l1'
      where c.code = 'ncea' $t$,
  '23514',
  null,
  'a seeded standard without a code is rejected'
);

insert into pg_temp._tap select lives_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id,
                                   parent_id, subject, name)
      select p.curriculum_id, p.level_id, studeasy.default_org(), p.id,
             p.subject, 'Factorising quadratics'
      from studeasy.topics p where p.code = 'AS91027' $t$,
  'a sub-topic under a seeded standard is accepted'
);

-- The questions table may be empty in this project. An update matching no
-- rows raises nothing, so the throws_ok below would pass vacuously without
-- a fixture row to actually update. This must run before authenticate_as:
-- as the migration owner it bypasses RLS, whereas the bare INSERT below is
-- unguarded (not throws_ok/lives_ok-wrapped) and assessments_write requires
-- teacher_id = auth.uid() or is_admin() — neither of which the test student
-- satisfies, so run as the student it would raise 42501 and abort the
-- transaction before tests.clear_auth() and finish() ever ran.
insert into studeasy.assessments (organization_id, title)
values (studeasy.default_org(), 'Taxonomy test fixture assessment');

insert into studeasy.questions (assessment_id, kind, prompt)
select a.id, 'short_answer', 'Taxonomy test fixture question'
from studeasy.assessments a
where a.title = 'Taxonomy test fixture assessment';

insert into pg_temp._tap select throws_ok(
  $t$ update studeasy.questions set grade_band = 'distinction'
      where id = (select id from studeasy.questions limit 1) $t$,
  '23514',
  null,
  'a grade band outside the three NCEA bands is rejected'
);

-- A tutor who teaches nothing, for the set_question_topics ownership-boundary
-- proof near the bottom of this file. Created here, as the migration owner,
-- above the first tests.authenticate_as() call below — tests.make_user()
-- writes to auth.users, which must land regardless of any table's write
-- policy.
select tests.make_user('taxonomy-tutor-outsider@test.invalid', 'tutor');

select tests.authenticate_as(tests.make_user('rls-student@test.invalid', 'student'));

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.topics where code = 'AS91027') = 1,
  'a signed-in student can read topics'
);

insert into pg_temp._tap select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id,
                                   parent_id, subject, name)
      select p.curriculum_id, p.level_id, studeasy.current_org(), p.id,
             p.subject, 'Student-invented topic'
      from studeasy.topics p where p.code = 'AS91027' $t$,
  '42501',
  null,
  'a student cannot create a topic'
);

insert into pg_temp._tap select ok(
  (select count(*) from studeasy.topics
    where organization_id is null and subject = 'Mathematics') >= 3,
  'the NCEA Mathematics spine is seeded'
);

insert into pg_temp._tap select ok(
  (select bool_and(credits > 0) from studeasy.topics
    where organization_id is null and code like 'AS9%'),
  'every seeded NCEA standard carries its credit value'
);

insert into pg_temp._tap select has_table('studeasy', 'question_topics', 'question_topics exists');
insert into pg_temp._tap select col_is_pk('studeasy', 'question_topics',
                 array['question_id', 'topic_id'],
                 'a question is tagged to a topic at most once');

insert into pg_temp._tap select has_column('studeasy', 'questions', 'grade_band', 'questions.grade_band exists');
insert into pg_temp._tap select has_column('studeasy', 'questions', 'difficulty', 'questions.difficulty exists');

-- clear_auth first, so the profile lookup below (needed to authenticate as
-- the outsider tutor) runs as the migration owner rather than under
-- rls-student's own profiles_select policy, which would hide it and hand
-- authenticate_as a null id.
-- reset role, not tests.clear_auth(): once authenticate_as has done SET ROLE
-- authenticated, that role has no USAGE on schema tests and the call is denied
-- with 42501. reset role needs no schema access at all.
reset role;
select set_config('request.jwt.claims', null, true);

/*
 * set_question_topics() was moved to admin-or-owning-teacher only —
 * has_role('tutor') alone is no longer even part of the check. A tutor who
 * genuinely holds the tutor role but teaches nothing must still be refused,
 * which is what proves the call is stopped by the new ownership predicate
 * rather than by this user simply not being a tutor.
 */
select tests.authenticate_as(
  (select id from studeasy.profiles
    where email = 'taxonomy-tutor-outsider@test.invalid'));

insert into pg_temp._tap select throws_ok(
  $t$ select studeasy.set_question_topics(
        (select id from studeasy.questions
          where prompt = 'Taxonomy test fixture question'),
        array[]::uuid[], null, null) $t$,
  null, null,
  'a tutor who does not own the assessment cannot retag its question'
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
