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
