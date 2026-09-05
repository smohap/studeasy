begin;
select plan(13);

select has_table('studeasy', 'curricula', 'curricula exists');
select has_table('studeasy', 'curriculum_levels', 'curriculum_levels exists');
select has_table('studeasy', 'topics', 'topics exists');

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
where c.code = 'ncea';

select is(
  (select organization_id from studeasy.topics where code = 'AS91027'),
  null,
  'a seeded standard has no organization'
);

select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id, subject, name)
      select c.id, l.id, studeasy.default_org(), 'Mathematics', 'Invented standard'
      from studeasy.curricula c
      join studeasy.curriculum_levels l on l.curriculum_id = c.id and l.code = 'l1'
      where c.code = 'ncea' $t$,
  '23514',
  null,
  'an org-scoped topic with no parent is rejected'
);

select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, subject, name)
      select c.id, l.id, 'Mathematics', 'Codeless standard'
      from studeasy.curricula c
      join studeasy.curriculum_levels l on l.curriculum_id = c.id and l.code = 'l1'
      where c.code = 'ncea' $t$,
  '23514',
  null,
  'a seeded standard without a code is rejected'
);

select lives_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id,
                                   parent_id, subject, name)
      select p.curriculum_id, p.level_id, studeasy.default_org(), p.id,
             p.subject, 'Factorising quadratics'
      from studeasy.topics p where p.code = 'AS91027' $t$,
  'a sub-topic under a seeded standard is accepted'
);

select tests.authenticate_as(tests.make_user('rls-student@test.invalid', 'student'));

select ok(
  (select count(*) from studeasy.topics where code = 'AS91027') = 1,
  'a signed-in student can read topics'
);

select throws_ok(
  $t$ insert into studeasy.topics (curriculum_id, level_id, organization_id,
                                   parent_id, subject, name)
      select p.curriculum_id, p.level_id, studeasy.current_org(), p.id,
             p.subject, 'Student-invented topic'
      from studeasy.topics p where p.code = 'AS91027' $t$,
  '42501',
  null,
  'a student cannot create a topic'
);

select ok(
  (select count(*) from studeasy.topics
    where organization_id is null and subject = 'Mathematics') >= 3,
  'the NCEA Mathematics spine is seeded'
);

select ok(
  (select bool_and(credits > 0) from studeasy.topics
    where organization_id is null and code like 'AS9%'),
  'every seeded NCEA standard carries its credit value'
);

select has_table('studeasy', 'question_topics', 'question_topics exists');
select col_is_pk('studeasy', 'question_topics',
                 array['question_id', 'topic_id'],
                 'a question is tagged to a topic at most once');

select tests.clear_auth();
select * from finish();
rollback;
