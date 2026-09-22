--
-- taxonomy.sql — the curriculum spine every other slice measures against.
--
-- Run AFTER every existing migration. Safe to re-run.
--
-- questions carries a kind, marks and an explanation, and courses carry a
-- subject. Between them there is nothing: no way to say that two questions
-- are about the same thing. "Weak areas", "difficulty-matched question sets",
-- "a timetable over weak topics" and "subject mastery" are all statements
-- about topics, and none of them could be written.
--
-- Two decisions worth stating:
--
--   1. A seeded achievement standard has no organization_id. AS91027 is a
--      national standard, not an academy's property, and two orgs holding
--      divergent copies of it would make mastery incomparable between them.
--      Tutor sub-topics are org-scoped, and a check constraint stops an org
--      creating a root — which would be inventing a standard.
--
--   2. questions gains a grade_band, not a difficulty percentage. NCEA does
--      not grade a percentage; it grades the level of question you can do. A
--      student who answers every Achieved-band question and no Merit ones is
--      Achieved, not 83%. Recording the band is what lets a projection state
--      a grade a family recognises.
--

-- ---------------------------------------------------------------------------
-- The spine
-- ---------------------------------------------------------------------------

create table if not exists studeasy.curricula (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'ncea', 'cambridge'
  name text not null,
  sort integer not null default 0
);

create table if not exists studeasy.curriculum_levels (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references studeasy.curricula (id) on delete cascade,
  code text not null,                 -- 'l1'..'l3'; 'igcse', 'as', 'a2'
  name text not null,
  sort integer not null default 0,
  unique (curriculum_id, code)
);

create table if not exists studeasy.topics (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references studeasy.curricula (id) on delete cascade,
  level_id uuid not null references studeasy.curriculum_levels (id) on delete cascade,

  /* Null on a seeded standard. Set on a tutor sub-topic. */
  organization_id uuid references studeasy.organizations (id) on delete cascade,
  parent_id uuid references studeasy.topics (id) on delete cascade,

  subject text not null,              -- matches courses.subject
  code text,                          -- 'AS91027'; null on a sub-topic
  name text not null,
  credits integer,                    -- NCEA credits; null elsewhere
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  /*
   * Either a seeded national standard (no org, no parent, has a code) or a
   * tutor sub-topic (has an org, has a parent). Nothing in between: an
   * org-scoped root would read as a national standard nobody published, and
   * a parentless sub-topic would sit beside real standards as though it were
   * one.
   */
  constraint topics_seeded_or_suborg check (
    (organization_id is null and parent_id is null and code is not null)
    or
    (organization_id is not null and parent_id is not null)
  )
);

create unique index if not exists topics_seeded_code
  on studeasy.topics (curriculum_id, level_id, subject, code)
  where organization_id is null;

create index if not exists topics_parent_idx on studeasy.topics (parent_id);
create index if not exists topics_subject_idx on studeasy.topics (subject, level_id);

/*
 * A sub-topic belongs to the same curriculum, level and subject as its
 * parent. Enforced rather than trusted, because the tagging UI sends these
 * three and a mismatched sub-topic would silently never match a query.
 */
create or replace function studeasy.topics_inherit_parent()
returns trigger
language plpgsql
as $fn$
declare
  p studeasy.topics%rowtype;
begin
  if new.parent_id is null then return new; end if;
  select * into p from studeasy.topics where id = new.parent_id;
  if p.id is null then
    raise exception 'Parent topic does not exist.';
  end if;
  if p.parent_id is not null then
    raise exception 'Topics nest one level deep. % already has a parent.', p.name;
  end if;
  new.curriculum_id := p.curriculum_id;
  new.level_id := p.level_id;
  new.subject := p.subject;
  return new;
end;
$fn$;

drop trigger if exists topics_inherit_parent on studeasy.topics;
create trigger topics_inherit_parent
  before insert or update on studeasy.topics
  for each row execute function studeasy.topics_inherit_parent();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.curricula enable row level security;
alter table studeasy.curriculum_levels enable row level security;
alter table studeasy.topics enable row level security;

/* The public subject pages read the spine, so anon reads it too. */
drop policy if exists curricula_select on studeasy.curricula;
create policy curricula_select on studeasy.curricula for select using (true);

drop policy if exists curriculum_levels_select on studeasy.curriculum_levels;
create policy curriculum_levels_select on studeasy.curriculum_levels for select using (true);

drop policy if exists topics_select on studeasy.topics;
create policy topics_select on studeasy.topics for select using (true);

/*
 * Writes are for tutors and admins, and only for their own org's sub-topics.
 * The seeded rows have organization_id null, so they match no write policy at
 * all — nothing at runtime can edit a national standard.
 */
drop policy if exists topics_insert on studeasy.topics;
create policy topics_insert on studeasy.topics for insert
  with check (
    organization_id = studeasy.current_org()
    and (studeasy.has_role('tutor') or studeasy.is_admin())
  );

drop policy if exists topics_update on studeasy.topics;
create policy topics_update on studeasy.topics for update
  using (
    organization_id = studeasy.current_org()
    and (studeasy.has_role('tutor') or studeasy.is_admin())
  );

drop policy if exists topics_delete on studeasy.topics;
create policy topics_delete on studeasy.topics for delete
  using (
    organization_id = studeasy.current_org()
    and (studeasy.has_role('tutor') or studeasy.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on studeasy.curricula, studeasy.curriculum_levels to anon, authenticated;
grant select on studeasy.topics to anon, authenticated;
grant insert, update, delete on studeasy.topics to authenticated;

-- ---------------------------------------------------------------------------
-- Seeding
-- ---------------------------------------------------------------------------

/*
 * Not granted to authenticated: this is a migration helper, like
 * seed_badges(). Nothing a signed-in user does should add a national
 * standard.
 *
 * Idempotent on the partial unique index, so re-running the migration adds
 * nothing and changes nothing.
 */
create or replace function studeasy.seed_taxonomy()
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  ncea uuid;
begin
  insert into studeasy.curricula (code, name, sort)
  values ('ncea', 'NCEA', 10), ('cambridge', 'Cambridge', 20)
  on conflict (code) do nothing;

  select id into ncea from studeasy.curricula where code = 'ncea';

  insert into studeasy.curriculum_levels (curriculum_id, code, name, sort)
  values (ncea, 'l1', 'Level 1', 10),
         (ncea, 'l2', 'Level 2', 20),
         (ncea, 'l3', 'Level 3', 30)
  on conflict (curriculum_id, code) do nothing;

  insert into studeasy.topics (curriculum_id, level_id, subject, code, name, credits, sort)
  select ncea, l.id, v.subject, v.code, v.name, v.credits, v.sort
  from (values
    /* Level 1 was rewritten for 2024: four standards at five credits each,
       replacing the old AS9102x/AS9103x set. Verified against NZQA's register
       on 22 September 2026. */
    ('l1', 'Mathematics', 'AS91944', 'Explore data using a statistical enquiry process', 5, 10),
    ('l1', 'Mathematics', 'AS91945', 'Use mathematical methods to explore problems that relate to life in Aotearoa New Zealand or the Pacific', 5, 20),
    ('l1', 'Mathematics', 'AS91946', 'Interpret and apply mathematical and statistical information in context', 5, 30),
    ('l1', 'Mathematics', 'AS91947', 'Demonstrate mathematical reasoning', 5, 40),
    ('l2', 'Mathematics', 'AS91261', 'Apply algebraic methods in solving problems', 4, 10),
    ('l2', 'Mathematics', 'AS91262', 'Apply calculus methods in solving problems', 5, 20),
    ('l2', 'Mathematics', 'AS91267', 'Apply probability methods in solving problems', 4, 30),
    ('l3', 'Mathematics', 'AS91578', 'Apply differentiation methods in solving problems', 6, 10),
    ('l3', 'Mathematics', 'AS91579', 'Apply integration methods in solving problems', 6, 20),
    ('l3', 'Mathematics', 'AS91585', 'Apply probability concepts in solving problems', 4, 30)
  ) as v(level_code, subject, code, name, credits, sort)
  join studeasy.curriculum_levels l
    on l.curriculum_id = ncea and l.code = v.level_code
  on conflict do nothing;
end;
$fn$;

select studeasy.seed_taxonomy();

/*
 * The five Level 1 standards this file originally seeded — AS91026, AS91027,
 * AS91028, AS91031 and AS91037 — are expired on NZQA's register and no longer
 * assessed. A Year 11 student would have been projected against standards that
 * ceased to exist in 2024. Deactivated rather than deleted: a question already
 * tagged to one keeps its tag and its history, and the standard simply stops
 * being offered to tutors. Idempotent.
 */
update studeasy.topics
   set active = false
 where organization_id is null
   and code in ('AS91026', 'AS91027', 'AS91028', 'AS91031', 'AS91037');

-- ---------------------------------------------------------------------------
-- Tagging — many-to-many, because one question genuinely exercises two topics
-- ---------------------------------------------------------------------------

create table if not exists studeasy.question_topics (
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  primary key (question_id, topic_id)
);

create table if not exists studeasy.lesson_topics (
  lesson_id uuid not null references studeasy.lessons (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  primary key (lesson_id, topic_id)
);

create table if not exists studeasy.content_topics (
  content_item_id uuid not null references studeasy.content_items (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  primary key (content_item_id, topic_id)
);

create index if not exists question_topics_topic_idx on studeasy.question_topics (topic_id);
create index if not exists lesson_topics_topic_idx on studeasy.lesson_topics (topic_id);
create index if not exists content_topics_topic_idx on studeasy.content_topics (topic_id);

alter table studeasy.question_topics enable row level security;
alter table studeasy.lesson_topics enable row level security;
alter table studeasy.content_topics enable row level security;

/*
 * A tag is readable wherever its parent row is, and writable by whoever may
 * edit that row. Each select policy below defers entirely to the parent
 * table's own read visibility via a bare exists() — RLS on
 * questions/lessons/content_items already decides, so if who may read one
 * changes, tagging follows automatically. The write policies further down
 * cannot defer as loosely: lessons and content_items expose a broader read
 * policy than their write policy, so a write check has to repeat the
 * parent's own write condition, not just check the row exists.
 */
drop policy if exists question_topics_select on studeasy.question_topics;
create policy question_topics_select on studeasy.question_topics for select
  using (exists (select 1 from studeasy.questions q where q.id = question_id));

/*
 * has_role('tutor') or is_admin() alone would let any tutor tag any org's
 * question, discarding the ownership check questions_teacher already
 * enforces in platform.sql. questions has no separate, broader read policy —
 * questions_teacher is the one "for all" policy governing both — so
 * repeating its own condition here (rather than trusting a bare exists() to
 * inherit it) means a tutor may only tag a question they could actually
 * write, and stays correct even if a broader read policy is ever added.
 */
drop policy if exists question_topics_write on studeasy.question_topics;
create policy question_topics_write on studeasy.question_topics for all
  using (exists (
    select 1 from studeasy.questions q
    join studeasy.assessments a on a.id = q.assessment_id
    where q.id = question_id and (a.teacher_id = auth.uid() or studeasy.is_admin())
  ))
  with check (exists (
    select 1 from studeasy.questions q
    join studeasy.assessments a on a.id = q.assessment_id
    where q.id = question_id and (a.teacher_id = auth.uid() or studeasy.is_admin())
  ));

drop policy if exists lesson_topics_select on studeasy.lesson_topics;
create policy lesson_topics_select on studeasy.lesson_topics for select
  using (exists (select 1 from studeasy.lessons l where l.id = lesson_id));

/*
 * Unlike questions, lessons_select in platform.sql is deliberately broader
 * than lessons_write — any enrolled student can read a lesson, only its
 * owning teacher can edit it. A bare exists() against lessons would inherit
 * that OR'd, broader visibility (Postgres combines every SELECT-applicable
 * policy on a table, and lessons_write is itself declared FOR ALL, so it
 * counts too) and let any enrolled student rewrite lesson_topics. Repeating
 * lessons_write's own condition here is what actually restricts this to
 * whoever could edit the lesson, not merely read it.
 */
drop policy if exists lesson_topics_write on studeasy.lesson_topics;
create policy lesson_topics_write on studeasy.lesson_topics for all
  using (exists (
    select 1 from studeasy.lessons l
    where l.id = lesson_id and (studeasy.owns_course(l.course_id) or studeasy.is_admin())
  ))
  with check (exists (
    select 1 from studeasy.lessons l
    where l.id = lesson_id and (studeasy.owns_course(l.course_id) or studeasy.is_admin())
  ));

drop policy if exists content_topics_select on studeasy.content_topics;
create policy content_topics_select on studeasy.content_topics for select
  using (exists (select 1 from studeasy.content_items c where c.id = content_item_id));

/*
 * Same reasoning as lesson_topics_write above: content_items_select in
 * content-and-help.sql exposes every published item to anyone, while
 * content_items_write restricts edits to the item's own author or an admin.
 * Repeating content_items_write's condition, rather than a bare exists(),
 * is what keeps a plain reader of published content from rewriting its tags.
 */
drop policy if exists content_topics_write on studeasy.content_topics;
create policy content_topics_write on studeasy.content_topics for all
  using (exists (
    select 1 from studeasy.content_items c
    where c.id = content_item_id and (c.author_id = auth.uid() or studeasy.is_admin())
  ))
  with check (exists (
    select 1 from studeasy.content_items c
    where c.id = content_item_id and (c.author_id = auth.uid() or studeasy.is_admin())
  ));

grant select on studeasy.question_topics, studeasy.lesson_topics,
                studeasy.content_topics to anon, authenticated;
grant insert, update, delete on studeasy.question_topics, studeasy.lesson_topics,
                                studeasy.content_topics to authenticated;

-- ---------------------------------------------------------------------------
-- What a question is worth, and at what level
-- ---------------------------------------------------------------------------

/*
 * Both nullable, and both stay null on every question written before today.
 * An untagged question is not a broken question: the twin ignores it, the
 * tagging page shows the gap, and nothing errors. Backfilling these by guess
 * would be worse than leaving them empty — a wrong band moves a projected
 * grade, and a projected grade goes to a parent.
 */
alter table studeasy.questions
  add column if not exists difficulty smallint,
  add column if not exists grade_band text;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_difficulty_range'
  ) then
    alter table studeasy.questions add constraint questions_difficulty_range
      check (difficulty is null or difficulty between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'questions_grade_band_valid'
  ) then
    alter table studeasy.questions add constraint questions_grade_band_valid
      check (grade_band is null or grade_band in ('achieved', 'merit', 'excellence'));
  end if;
end;
$mig$;

create index if not exists questions_band_idx
  on studeasy.questions (grade_band) where grade_band is not null;

-- ---------------------------------------------------------------------------
-- Replacing a question's tags atomically
-- ---------------------------------------------------------------------------

/*
 * The tagging page used to run this as three separate statements from the
 * client: update questions, delete question_topics, insert question_topics.
 * A delete that lands followed by an insert that fails — a stale topic_id,
 * an RLS rejection, a dropped connection — left the question with zero
 * tags, worse than its state before the call. Tasks 9-10 compute per-topic
 * mastery only over tagged questions, so a silently untagged question
 * disappears from the Learning Twin with nothing to signal it. Folding all
 * three statements into one function body makes them one transaction:
 * either the whole replacement lands, or none of it does.
 *
 * The table constraints already enforce the band and difficulty ranges;
 * checking them again here means a mistake surfaces as a sentence a tutor
 * can act on, not a bare constraint violation.
 */
create or replace function studeasy.set_question_topics(
  question uuid,
  topic_ids uuid[],
  band text,
  difficulty smallint
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  v_band text := band;
  v_difficulty smallint := difficulty;
begin
  /*
   * has_role('tutor') alone would authorize ANY tutor to rewrite ANY
   * question in ANY organization — this function is SECURITY DEFINER and
   * writes with RLS bypassed, so it must reimpose the same boundary
   * questions_teacher already enforces on direct table access in
   * platform.sql: only the assessment's own teacher, or an admin. grade_band
   * feeds per-topic mastery, which feeds the NCEA projection a parent sees,
   * so a wrong-teacher write here is not cosmetic.
   */
  if not (
    studeasy.is_admin()
    or exists (
      select 1
      from studeasy.questions q
      join studeasy.assessments a on a.id = q.assessment_id
      where q.id = question and a.teacher_id = auth.uid()
    )
  ) then
    raise exception 'Only the assessment''s own teacher or an admin can tag this question.';
  end if;

  if v_band is not null and v_band not in ('achieved', 'merit', 'excellence') then
    raise exception 'Grade band must be achieved, merit or excellence.';
  end if;

  if v_difficulty is not null and (v_difficulty < 1 or v_difficulty > 5) then
    raise exception 'Difficulty runs from 1 to 5.';
  end if;

  update studeasy.questions
  set grade_band = v_band, difficulty = v_difficulty
  where id = question;

  delete from studeasy.question_topics where question_id = question;

  /* Null or empty means "remove all tags" — a valid choice, not an error. */
  if topic_ids is not null and array_length(topic_ids, 1) > 0 then
    insert into studeasy.question_topics (question_id, topic_id)
    select question, unnest(topic_ids);
  end if;
end;
$fn$;

grant execute on function studeasy.set_question_topics(uuid, uuid[], text, smallint) to authenticated;
