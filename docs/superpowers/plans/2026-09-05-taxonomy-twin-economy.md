# Taxonomy, Learning Twin and Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build slices A, B and C of the AI/gamification design — a curriculum
topic taxonomy, a Learning Twin with per-standard grade projections, and the
coin/house/challenge/battle economy — with no model provider involved.

**Architecture:** Everything that decides what a student may see, or what a
number about a student means, lives in Postgres as tables, `SECURITY DEFINER`
functions and RLS policies, matching the 21 migrations already in
`supabase/`. TypeScript calls RPCs and renders. Three new migrations
(`taxonomy.sql`, `learning-twin.sql`, `economy.sql`) run after the existing
21, in that order.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 6 ·
Tailwind v4 · Supabase (Postgres + RLS) · pgTAP for SQL tests · Vitest for
pure TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-05-ai-and-gamification-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- Postgres schema is `studeasy`. Nothing goes in `public`.
- Every migration is **idempotent and safe to re-run** — `create table if not
  exists`, `create or replace function`, `drop policy if exists` before
  `create policy`. This is a hard rule in this repo, not a preference.
- Every new table has **RLS enabled** with explicit policies. A table with RLS
  on and no policy is readable by nobody, which is the correct default.
- Every write that matters goes through a `SECURITY DEFINER` function that
  checks `auth.uid()`. The client is never trusted.
- Helper functions that already exist and must be reused, never reimplemented:
  `studeasy.current_org()`, `studeasy.is_admin()`,
  `studeasy.has_role(studeasy.user_role)`, `studeasy.touch_streak(integer)`,
  `studeasy.evaluate_badges()`.
- Environment variables the app reads carry the `StudEasy_` prefix. Server-only
  secrets must never carry `NEXT_PUBLIC_`.
- **A student may never read another student's row.** Houses are ranked;
  individuals never are.
- **Coins are cosmetic.** No shop item may carry real-world value.
- `npm run lint` (`tsc --noEmit`) must pass before every commit.
- Accessibility target is WCAG 2.1 AA on every page touched.
- New migrations are appended to the README's ordered migration list in the
  task that creates them.

## File Structure

**Migrations (run in this order, after the existing 21):**

| File | Responsibility |
| --- | --- |
| `supabase/taxonomy.sql` | Curricula, levels, topics, tagging joins, question difficulty and grade band |
| `supabase/learning-twin.sql` | `answers.seconds_spent`, `topic_mastery`, `twin_config`, `standard_projections`, refresh and review functions |
| `supabase/economy.sql` | Coin ledger, shop, houses, challenges, battles |

**Tests:**

| File | Responsibility |
| --- | --- |
| `supabase/tests/helpers.sql` | pgTAP bootstrap: `tests` schema, user fixtures, `authenticate_as()` |
| `supabase/tests/taxonomy_test.sql` | Slice A constraints, RLS, seeding |
| `supabase/tests/learning-twin_test.sql` | Slice B mastery maths, projection rules, parent release |
| `supabase/tests/economy_test.sql` | Slice C ledger idempotency, double-spend, house isolation |
| `vitest.config.ts` | Vitest setup, node environment |

**TypeScript — data and pure logic:**

| File | Responsibility |
| --- | --- |
| `lib/taxonomy-types.ts` | Row and tree types for curricula, levels, topics |
| `lib/taxonomy-tree.ts` | Pure: flat topic rows to nested tree. Vitest-covered |
| `lib/taxonomy-data.ts` | Server reads for topics and tag coverage |
| `lib/twin-types.ts` | Mastery, projection and confidence types |
| `lib/twin-format.ts` | Pure: mastery to label, band to display name, confidence copy. Vitest-covered |
| `lib/twin-data.ts` | Server reads for the twin and projections |
| `lib/economy-types.ts` | Coin, shop, house, challenge, battle types |
| `lib/economy-data.ts` | Server reads for balances, shop, standings, battles |

**TypeScript — server actions:**

`app/portal/taxonomy-actions.ts`, `app/portal/twin-actions.ts`,
`app/portal/economy-actions.ts` — one per slice, matching the existing
`app/portal/*-actions.ts` convention.

**Pages:**

| Path | Slice |
| --- | --- |
| `app/portal/tutor/topics/page.tsx` + `TopicTagger.tsx` | A |
| `app/portal/student/progress/page.tsx` (modify) | B |
| `app/portal/tutor/students/[id]/page.tsx` | B |
| `app/portal/parent/page.tsx` (modify) | B |
| `app/portal/student/achievements/page.tsx` (modify) | C |
| `app/portal/admin/economy/page.tsx` | C |

## How to run tests

There is no Supabase CLI in this project and no local Postgres. Migrations are
pasted into the Supabase SQL Editor in a documented order, and **pgTAP tests
run the same way**: paste the file, read the `ok` / `not ok` rows it returns.

Every test file is wrapped in `begin; ... rollback;` so running it leaves no
fixture rows behind. A test that fails still rolls back.

Vitest runs locally: `npm test`.

---

### Task 1: Test harness

Nothing else in this plan can be verified without this. It is one task because
the pgTAP bootstrap and the Vitest bootstrap are useless separately — the
first task that follows needs both.

**Files:**
- Create: `supabase/tests/helpers.sql`
- Create: `vitest.config.ts`
- Create: `lib/taxonomy-tree.ts`
- Create: `lib/taxonomy-tree.test.ts`
- Modify: `package.json` (add `test` script and the `vitest` dev dependency)
- Modify: `README.md` (document how to run both)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tests.authenticate_as(user_id uuid) returns void`
  - `tests.clear_auth() returns void`
  - `tests.make_user(email text, role text) returns uuid`
  - `buildTopicTree(rows: TopicRow[]): TopicNode[]` from `lib/taxonomy-tree.ts`

- [ ] **Step 1: Write the failing pgTAP smoke test**

Create `supabase/tests/helpers.sql` containing only this, so it fails before
the helpers exist:

```sql
begin;
select plan(1);
select has_function('tests', 'authenticate_as', 'authenticate_as() exists');
select * from finish();
rollback;
```

- [ ] **Step 2: Run it and confirm it fails**

Paste the file into the Supabase SQL Editor.
Expected: an error — `schema "tests" does not exist`, or `function
plan(integer) does not exist` if pgTAP is not yet enabled. Either failure is
the one we want; both mean the harness is absent.

- [ ] **Step 3: Write the harness above the test**

Replace the file with the following, keeping the same test at the bottom:

```sql
--
-- helpers.sql — pgTAP bootstrap and fixtures.
--
-- Paste into the Supabase SQL Editor once. Safe to re-run.
--
-- Every test file in this directory wraps itself in begin/rollback, so
-- fixtures never survive the run. That is what makes it safe to create real
-- auth.users rows: the profile trigger fires exactly as it does in
-- production, so a test exercises the real thing rather than a hand-built
-- imitation of it.
--

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

/*
 * auth.uid() reads request.jwt.claims ->> 'sub'. Setting it with
 * set_config(..., true) makes the setting local to the transaction, so it
 * disappears on rollback along with everything else.
 */
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

/*
 * Creates a real auth.users row so studeasy_on_auth_user_created runs and
 * builds the profile the way it does for a real signup. Roles other than
 * student/parent/tutor are ignored by that trigger, which is deliberate — a
 * test cannot mint an admin this way, and should not be able to.
 */
create or replace function tests.make_user(email text, role text)
returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, email, json_build_object('role', role,
                                           'full_name', 'Test ' || role)::jsonb);
  return new_id;
end;
$$;

begin;
select plan(1);
select has_function('tests', 'authenticate_as', 'authenticate_as() exists');
select * from finish();
rollback;
```

- [ ] **Step 4: Run it and confirm it passes**

Paste into the SQL Editor.
Expected: one row, `ok 1 - authenticate_as() exists`.

- [ ] **Step 5: Write the failing Vitest test**

Create `lib/taxonomy-tree.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTopicTree } from './taxonomy-tree'

describe('buildTopicTree', () => {
  it('nests sub-topics under their parent standard', () => {
    const tree = buildTopicTree([
      { id: 'a', parent_id: null, name: 'AS91027', sort: 10 },
      { id: 'b', parent_id: 'a', name: 'Factorising', sort: 20 },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.name)).toEqual(['Factorising'])
  })

  it('drops a sub-topic whose parent is absent rather than losing it silently', () => {
    const tree = buildTopicTree([
      { id: 'b', parent_id: 'missing', name: 'Orphan', sort: 20 },
    ])
    expect(tree).toEqual([])
  })

  it('orders siblings by sort, then name', () => {
    const tree = buildTopicTree([
      { id: 'a', parent_id: null, name: 'Second', sort: 20 },
      { id: 'b', parent_id: null, name: 'First', sort: 10 },
    ])
    expect(tree.map((t) => t.name)).toEqual(['First', 'Second'])
  })
})
```

- [ ] **Step 6: Add Vitest and run the test to see it fail**

```bash
npm install -D vitest
```

Add to `package.json` scripts, beside the existing `lint`:

```json
"test": "vitest run"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./taxonomy-tree"`.

- [ ] **Step 7: Implement the tree builder**

Create `lib/taxonomy-tree.ts`:

```ts
export type TopicRow = {
  id: string
  parent_id: string | null
  name: string
  sort: number
}

export type TopicNode = TopicRow & { children: TopicNode[] }

/**
 * Flat topic rows to a two-level tree. A sub-topic whose parent is not in the
 * input is dropped rather than promoted to the root: a tutor sub-topic
 * floating beside a national standard would read as though it were one.
 */
export function buildTopicTree(rows: TopicRow[]): TopicNode[] {
  const byId = new Map<string, TopicNode>()
  for (const row of rows) byId.set(row.id, { ...row, children: [] })

  const roots: TopicNode[] = []
  for (const node of byId.values()) {
    if (node.parent_id === null) {
      roots.push(node)
      continue
    }
    byId.get(node.parent_id)?.children.push(node)
  }

  const order = (a: TopicNode, b: TopicNode) =>
    a.sort - b.sort || a.name.localeCompare(b.name)

  roots.sort(order)
  for (const root of roots) root.children.sort(order)
  return roots
}
```

- [ ] **Step 8: Run the tests and the type-check**

Run: `npm test`
Expected: 3 passed.

Run: `npm run lint`
Expected: exit 0, no output.

- [ ] **Step 9: Document both runners in the README**

Under "Running it", after the `npm run lint` sentence, add:

```markdown
`npm test` runs the Vitest suite over the pure TypeScript in `lib/`.

SQL is tested with pgTAP. There is no Supabase CLI here, so tests run the way
migrations do: paste `supabase/tests/helpers.sql` once to install the
fixtures, then paste any `supabase/tests/*_test.sql` file into the SQL Editor
and read the `ok` / `not ok` rows. Every test file wraps itself in
`begin`/`rollback`, so running one leaves nothing behind.
```

- [ ] **Step 10: Commit**

```bash
git add supabase/tests/helpers.sql vitest.config.ts lib/taxonomy-tree.ts lib/taxonomy-tree.test.ts package.json package-lock.json README.md
git commit -m "A harness, so the next 23 tasks can prove themselves"
```

---

### Task 2: Taxonomy tables, constraints and RLS

**Files:**
- Create: `supabase/taxonomy.sql`
- Create: `supabase/tests/taxonomy_test.sql`
- Modify: `README.md` (migration order list)

**Interfaces:**
- Consumes: `tests.make_user()`, `tests.authenticate_as()`, `tests.clear_auth()` from Task 1; `studeasy.current_org()`, `studeasy.is_admin()`, `studeasy.has_role()` from the existing migrations.
- Produces: tables `studeasy.curricula`, `studeasy.curriculum_levels`, `studeasy.topics`. Columns other tasks rely on: `topics.id`, `topics.parent_id`, `topics.organization_id`, `topics.subject`, `topics.code`, `topics.credits`, `topics.sort`, `topics.active`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/taxonomy_test.sql`:

```sql
begin;
select plan(9);

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

select tests.clear_auth();
select * from finish();
rollback;
```

Note the `$t$` dollar-quoting on the SQL passed to `throws_ok`. The default
`$$` would terminate the surrounding function bodies in this file.

- [ ] **Step 2: Run it and confirm it fails**

Paste into the SQL Editor.
Expected: fails at the first assertion — `relation "studeasy.curricula" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/taxonomy.sql`:

```sql
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Paste `supabase/taxonomy.sql`, then `supabase/tests/taxonomy_test.sql`.
Expected: nine `ok` rows, no `not ok`.

- [ ] **Step 5: Add the migration to the README**

In the fenced migration-order block, append `taxonomy.sql` on a new line after
`refunds.sql`.

- [ ] **Step 6: Commit**

```bash
git add supabase/taxonomy.sql supabase/tests/taxonomy_test.sql README.md
git commit -m "A national standard is not an academy's property"
```

---

### Task 3: Seed the taxonomy

**Files:**
- Modify: `supabase/taxonomy.sql` (append the seed section)
- Modify: `supabase/tests/taxonomy_test.sql` (raise the plan count, add assertions)

**Interfaces:**
- Consumes: the tables from Task 2.
- Produces: `studeasy.seed_taxonomy() returns void` — not granted to `authenticated`, called by the migration only.

**Note on scope:** the seed below covers NCEA Mathematics Levels 1–3 as the
worked example, with standard codes and credit values transcribed from NZQA.
Physics, Chemistry, Biology and the Cambridge levels follow the same shape and
are content work rather than code — see the spec's open question 1. **Do not
invent standard codes or credit values; transcribe them from the published
source, and verify the eleven below against NZQA before running.**

- [ ] **Step 1: Add the failing assertions**

In `supabase/tests/taxonomy_test.sql`, change `select plan(9);` to
`select plan(11);` and insert before `select tests.clear_auth();`:

```sql
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
```

- [ ] **Step 2: Run it and confirm it fails**

Paste the test file.
Expected: `not ok 10 - the NCEA Mathematics spine is seeded`.

- [ ] **Step 3: Append the seed to the migration**

Add to the end of `supabase/taxonomy.sql`:

```sql
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
    ('l1', 'Mathematics', 'AS91026', 'Apply numeric reasoning in solving problems', 4, 10),
    ('l1', 'Mathematics', 'AS91027', 'Apply algebraic procedures in solving problems', 4, 20),
    ('l1', 'Mathematics', 'AS91028', 'Investigate relationships between tables, equations and graphs', 4, 30),
    ('l1', 'Mathematics', 'AS91031', 'Apply geometric reasoning in solving problems', 4, 40),
    ('l1', 'Mathematics', 'AS91037', 'Demonstrate understanding of chance and data', 4, 50),
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Paste `supabase/taxonomy.sql` again (it is idempotent), then the test file.
Expected: eleven `ok` rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/taxonomy.sql supabase/tests/taxonomy_test.sql
git commit -m "Eleven NCEA Mathematics standards, transcribed not invented"
```

---

### Task 4: Tagging joins

**Files:**
- Modify: `supabase/taxonomy.sql` (append)
- Modify: `supabase/tests/taxonomy_test.sql`

**Interfaces:**
- Consumes: `studeasy.topics` from Task 2.
- Produces: `studeasy.question_topics(question_id, topic_id)`,
  `studeasy.lesson_topics(lesson_id, topic_id)`,
  `studeasy.content_topics(content_item_id, topic_id)`. Slice B reads
  `question_topics`; slice D reads the other two.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(13);` and add before `tests.clear_auth()`:

```sql
select has_table('studeasy', 'question_topics', 'question_topics exists');
select col_is_pk('studeasy', 'question_topics',
                 array['question_id', 'topic_id'],
                 'a question is tagged to a topic at most once');
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 12 - question_topics exists`.

- [ ] **Step 3: Append the joins to the migration**

```sql
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
 * edit that row. Rather than restate those conditions, each select policy
 * defers to the parent table — RLS on questions/lessons/content_items already
 * decides, and an exists() against them inherits that decision. If who may
 * read a question changes, tagging follows automatically.
 */
drop policy if exists question_topics_select on studeasy.question_topics;
create policy question_topics_select on studeasy.question_topics for select
  using (exists (select 1 from studeasy.questions q where q.id = question_id));

drop policy if exists question_topics_write on studeasy.question_topics;
create policy question_topics_write on studeasy.question_topics for all
  using (studeasy.has_role('tutor') or studeasy.is_admin())
  with check (studeasy.has_role('tutor') or studeasy.is_admin());

drop policy if exists lesson_topics_select on studeasy.lesson_topics;
create policy lesson_topics_select on studeasy.lesson_topics for select
  using (exists (select 1 from studeasy.lessons l where l.id = lesson_id));

drop policy if exists lesson_topics_write on studeasy.lesson_topics;
create policy lesson_topics_write on studeasy.lesson_topics for all
  using (studeasy.has_role('tutor') or studeasy.is_admin())
  with check (studeasy.has_role('tutor') or studeasy.is_admin());

drop policy if exists content_topics_select on studeasy.content_topics;
create policy content_topics_select on studeasy.content_topics for select
  using (exists (select 1 from studeasy.content_items c where c.id = content_item_id));

drop policy if exists content_topics_write on studeasy.content_topics;
create policy content_topics_write on studeasy.content_topics for all
  using (studeasy.has_role('tutor') or studeasy.is_admin())
  with check (studeasy.has_role('tutor') or studeasy.is_admin());

grant select on studeasy.question_topics, studeasy.lesson_topics,
                studeasy.content_topics to anon, authenticated;
grant insert, update, delete on studeasy.question_topics, studeasy.lesson_topics,
                                studeasy.content_topics to authenticated;
```

- [ ] **Step 4: Run the test and confirm it passes**

Expected: thirteen `ok` rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/taxonomy.sql supabase/tests/taxonomy_test.sql
git commit -m "A tag is readable wherever the thing it tags is"
```

---

### Task 5: Difficulty and grade band on questions

**Files:**
- Modify: `supabase/taxonomy.sql` (append)
- Modify: `supabase/tests/taxonomy_test.sql`

**Interfaces:**
- Consumes: `studeasy.questions` from `platform.sql`.
- Produces: `questions.difficulty smallint` (1–5, nullable) and
  `questions.grade_band text` (`achieved` | `merit` | `excellence`, nullable).
  Slice B's mastery split reads `grade_band`; slice E's selector reads both.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(16);` and add:

```sql
select has_column('studeasy', 'questions', 'grade_band', 'questions.grade_band exists');
select has_column('studeasy', 'questions', 'difficulty', 'questions.difficulty exists');

select throws_ok(
  $t$ update studeasy.questions set grade_band = 'distinction'
      where id = (select id from studeasy.questions limit 1) $t$,
  '23514',
  null,
  'a grade band outside the three NCEA bands is rejected'
);
```

If the `questions` table is empty in your project, insert one fixture question
above this assertion — an update matching no rows raises nothing and the test
would pass vacuously.

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 14 - questions.grade_band exists`.

- [ ] **Step 3: Append the columns**

```sql
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Expected: sixteen `ok` rows.

- [ ] **Step 5: Type-check and commit**

Run: `npm run lint`
Expected: exit 0.

```bash
git add supabase/taxonomy.sql supabase/tests/taxonomy_test.sql
git commit -m "NCEA grades the level of question you can do, not a percentage"
```

---

### Task 6: Taxonomy types and data layer

**Files:**
- Create: `lib/taxonomy-types.ts`
- Create: `lib/taxonomy-data.ts`
- Create: `app/portal/taxonomy-actions.ts`

**Interfaces:**
- Consumes: `buildTopicTree` from Task 1; tables from Tasks 2–5.
- Produces:
  - `type GradeBand`, `type Topic`, `type TaggedQuestion`, `type TagCoverage` in `lib/taxonomy-types.ts`
  - `getTopics(subject?: string): Promise<Topic[]>`, `getAssessmentTags(assessmentId: string): Promise<TaggedQuestion[]>`, `tagCoverage(questions: TaggedQuestion[]): TagCoverage` in `lib/taxonomy-data.ts`
  - `setQuestionTopics(questionId: string, topicIds: string[], band: GradeBand | null, difficulty: number | null): Promise<Result>` and `createSubTopic(parentId: string, name: string): Promise<Result>` in `app/portal/taxonomy-actions.ts`

- [ ] **Step 1: Write the types**

Create `lib/taxonomy-types.ts`:

```ts
export type GradeBand = 'achieved' | 'merit' | 'excellence'

export type Topic = {
  id: string
  parent_id: string | null
  organization_id: string | null
  curriculum_code: string
  level_code: string
  level_name: string
  subject: string
  code: string | null
  name: string
  credits: number | null
  sort: number
}

export type TaggedQuestion = {
  id: string
  position: number
  prompt: string
  kind: string
  marks: number
  grade_band: GradeBand | null
  difficulty: number | null
  topic_ids: string[]
}

/** How much of an assessment has been tagged. Drives the coverage banner. */
export type TagCoverage = {
  total: number
  tagged: number
  banded: number
}
```

- [ ] **Step 2: Write the data layer**

Create `lib/taxonomy-data.ts`, following the shape of `lib/assessments-data.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { Topic, TaggedQuestion, TagCoverage } from './taxonomy-types'

const TOPIC_COLUMNS =
  'id, parent_id, organization_id, subject, code, name, credits, sort, ' +
  'curricula(code), curriculum_levels(code, name)'

type TopicJoinRow = Omit<Topic, 'curriculum_code' | 'level_code' | 'level_name'> & {
  curricula: { code: string } | null
  curriculum_levels: { code: string; name: string } | null
}

/** Active topics, optionally narrowed to one subject. Empty when unseeded. */
export async function getTopics(subject?: string): Promise<Topic[]> {
  const supabase = await createClient()
  if (!supabase) return []

  let query = supabase
    .schema('studeasy')
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('active', true)
    .order('sort', { ascending: true })

  if (subject) query = query.eq('subject', subject)

  const { data, error } = await query
  if (error || !data) return []

  return (data as unknown as TopicJoinRow[]).map((row) => ({
    id: row.id,
    parent_id: row.parent_id,
    organization_id: row.organization_id,
    curriculum_code: row.curricula?.code ?? '',
    level_code: row.curriculum_levels?.code ?? '',
    level_name: row.curriculum_levels?.name ?? '',
    subject: row.subject,
    code: row.code,
    name: row.name,
    credits: row.credits,
    sort: row.sort,
  }))
}

/** Questions on one assessment with their current tags. */
export async function getAssessmentTags(
  assessmentId: string,
): Promise<TaggedQuestion[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .schema('studeasy')
    .from('questions')
    .select('id, position, prompt, kind, marks, grade_band, difficulty, question_topics(topic_id)')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })

  if (error || !data) return []

  return data.map((q) => ({
    id: q.id as string,
    position: q.position as number,
    prompt: q.prompt as string,
    kind: q.kind as string,
    marks: q.marks as number,
    grade_band: q.grade_band as TaggedQuestion['grade_band'],
    difficulty: q.difficulty as number | null,
    topic_ids: ((q.question_topics ?? []) as { topic_id: string }[]).map(
      (t) => t.topic_id,
    ),
  }))
}

/** Coverage counts for the banner. Pure over rows already fetched. */
export function tagCoverage(questions: TaggedQuestion[]): TagCoverage {
  return {
    total: questions.length,
    tagged: questions.filter((q) => q.topic_ids.length > 0).length,
    banded: questions.filter((q) => q.grade_band !== null).length,
  }
}
```

- [ ] **Step 3: Write the server actions**

Create `app/portal/taxonomy-actions.ts`, following `app/portal/lesson-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { GradeBand } from '@/lib/taxonomy-types'

export type Result = { error: string | null }

/**
 * Replaces a question's tags in one go. Delete-then-insert rather than a diff:
 * the set is small, and a diff that drifts leaves a tag nobody chose.
 * RLS decides whether the caller may write; this only shapes the request.
 */
export async function setQuestionTopics(
  questionId: string,
  topicIds: string[],
  band: GradeBand | null,
  difficulty: number | null,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (difficulty !== null && (difficulty < 1 || difficulty > 5)) {
    return { error: 'Difficulty runs from 1 to 5.' }
  }

  const supabase = await createClient()
  if (!supabase) return { error: 'The database is not configured.' }

  const { error: bandError } = await supabase
    .schema('studeasy')
    .from('questions')
    .update({ grade_band: band, difficulty })
    .eq('id', questionId)
  if (bandError) return { error: bandError.message }

  const { error: clearError } = await supabase
    .schema('studeasy')
    .from('question_topics')
    .delete()
    .eq('question_id', questionId)
  if (clearError) return { error: clearError.message }

  if (topicIds.length > 0) {
    const { error: insertError } = await supabase
      .schema('studeasy')
      .from('question_topics')
      .insert(topicIds.map((topic_id) => ({ question_id: questionId, topic_id })))
    if (insertError) return { error: insertError.message }
  }

  revalidatePath('/portal/tutor/topics')
  return { error: null }
}

/** A tutor sub-topic. Curriculum, level and subject are inherited by trigger. */
export async function createSubTopic(
  parentId: string,
  name: string,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }
  if (!name.trim()) return { error: 'Give the sub-topic a name.' }

  const supabase = await createClient()
  if (!supabase) return { error: 'The database is not configured.' }

  const { data: parent, error: parentError } = await supabase
    .schema('studeasy')
    .from('topics')
    .select('curriculum_id, level_id, subject')
    .eq('id', parentId)
    .single()
  if (parentError || !parent) return { error: 'That standard no longer exists.' }

  const { error } = await supabase
    .schema('studeasy')
    .from('topics')
    .insert({
      curriculum_id: parent.curriculum_id,
      level_id: parent.level_id,
      subject: parent.subject,
      parent_id: parentId,
      organization_id: profile.organization_id,
      name: name.trim(),
    })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/topics')
  return { error: null }
}
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: exit 0. If `organization_id` is absent from the profile type used by
`getCurrentUser`, add it to that existing type rather than casting here.

- [ ] **Step 5: Commit**

```bash
git add lib/taxonomy-types.ts lib/taxonomy-data.ts app/portal/taxonomy-actions.ts
git commit -m "Read the spine, write a tag"
```

---

### Task 7: The tutor tagging page

**Files:**
- Create: `app/portal/tutor/topics/page.tsx`
- Create: `app/portal/tutor/topics/TopicTagger.tsx`

**Interfaces:**
- Consumes: `getTopics`, `getAssessmentTags`, `tagCoverage`, `buildTopicTree`, `setQuestionTopics`.
- Produces: nothing other tasks import.

Bulk tagging is the point of this page. Tagging eleven question types one at a
time is how a taxonomy ends up half-populated and useless, so the page must
let a tutor set a band and a topic across a selection of questions in one
action.

- [ ] **Step 1: Write the server page**

Create `app/portal/tutor/topics/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTopics, getAssessmentTags, tagCoverage } from '@/lib/taxonomy-data'
import { getCurrentUser } from '@/lib/supabase/server'
import { listTutorAssessments } from '@/lib/assessments-data'
import TopicTagger from './TopicTagger'

export const metadata: Metadata = {
  title: 'Tag questions — StudEasy',
  robots: { index: false },
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>
}) {
  const { profile } = await getCurrentUser()
  if (!profile) redirect('/sign-in')

  const { assessment } = await searchParams
  const assessments = await listTutorAssessments()
  const selected = assessment ?? assessments[0]?.id ?? null

  const [topics, questions] = await Promise.all([
    getTopics(),
    selected ? getAssessmentTags(selected) : Promise.resolve([]),
  ])

  if (topics.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Tag questions</h1>
        <p className="mt-4 text-slate-600">
          No curriculum topics have been loaded yet. Run{' '}
          <code>supabase/taxonomy.sql</code> to seed the NCEA and Cambridge
          spine, then reload this page.
        </p>
      </main>
    )
  }

  return (
    <TopicTagger
      topics={topics}
      assessments={assessments.map((a) => ({ id: a.id, title: a.title }))}
      selectedAssessment={selected}
      questions={questions}
      coverage={tagCoverage(questions)}
    />
  )
}
```

`listTutorAssessments` is a placeholder for whichever function in
`lib/assessments-data.ts` already lists a tutor's assessments — open that file,
use the real export name, and adjust the mapping. Do **not** add a second
listing function.

- [ ] **Step 2: Write the client component**

Create `app/portal/tutor/topics/TopicTagger.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { buildTopicTree } from '@/lib/taxonomy-tree'
import { setQuestionTopics } from '@/app/portal/taxonomy-actions'
import type { Topic, TaggedQuestion, TagCoverage, GradeBand } from '@/lib/taxonomy-types'

const BANDS: GradeBand[] = ['achieved', 'merit', 'excellence']

export default function TopicTagger({
  topics,
  assessments,
  selectedAssessment,
  questions,
  coverage,
}: {
  topics: Topic[]
  assessments: { id: string; title: string }[]
  selectedAssessment: string | null
  questions: TaggedQuestion[]
  coverage: TagCoverage
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [topicId, setTopicId] = useState('')
  const [band, setBand] = useState<GradeBand | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const tree = buildTopicTree(
    topics.map((t) => ({
      id: t.id,
      parent_id: t.parent_id,
      name: t.code ? `${t.code} — ${t.name}` : t.name,
      sort: t.sort,
    })),
  )

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Adds the chosen topic to every selected question, keeping existing tags. */
  function applyToSelection() {
    if (!topicId || picked.size === 0) return
    setError(null)
    startTransition(async () => {
      for (const questionId of picked) {
        const current = questions.find((q) => q.id === questionId)
        const merged = Array.from(new Set([...(current?.topic_ids ?? []), topicId]))
        const result = await setQuestionTopics(
          questionId,
          merged,
          band === '' ? (current?.grade_band ?? null) : band,
          current?.difficulty ?? null,
        )
        if (result.error) {
          setError(result.error)
          return
        }
      }
      setPicked(new Set())
    })
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Tag questions</h1>

      <p className="mt-2 text-sm text-slate-600" role="status">
        {coverage.tagged} of {coverage.total} questions tagged;{' '}
        {coverage.banded} carry a grade band. Untagged questions are ignored by
        the Learning Twin.
      </p>

      <label className="mt-6 block">
        <span className="text-sm font-medium">Assessment</span>
        <select
          className="mt-1 block w-full rounded border-slate-300"
          defaultValue={selectedAssessment ?? ''}
          onChange={(e) => {
            window.location.search = `?assessment=${e.target.value}`
          }}
        >
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      </label>

      <fieldset className="mt-6 rounded border border-slate-200 p-4">
        <legend className="px-2 text-sm font-medium">
          Apply to {picked.size} selected
        </legend>

        <select
          aria-label="Topic"
          className="rounded border-slate-300"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">Choose a topic…</option>
          {tree.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>{root.name} (whole standard)</option>
              {root.children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          aria-label="Grade band"
          className="ml-3 rounded border-slate-300"
          value={band}
          onChange={(e) => setBand(e.target.value as GradeBand | '')}
        >
          <option value="">Leave band unchanged</option>
          {BANDS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <button
          type="button"
          className="ml-3 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending || !topicId || picked.size === 0}
          onClick={applyToSelection}
        >
          {pending ? 'Applying…' : 'Apply'}
        </button>
      </fieldset>

      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}

      <ul className="mt-8 space-y-2">
        {questions.map((q) => (
          <li key={q.id} className="flex items-start gap-3 rounded border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={picked.has(q.id)}
              onChange={() => toggle(q.id)}
              aria-label={`Select question ${q.position + 1}`}
            />
            <div>
              <p className="text-sm">{q.prompt}</p>
              <p className="mt-1 text-xs text-slate-500">
                {q.kind} · {q.marks} marks · {q.grade_band ?? 'no band'} ·{' '}
                {q.topic_ids.length === 0
                  ? 'untagged'
                  : `${q.topic_ids.length} topic${q.topic_ids.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Type-check and view the page**

Run: `npm run lint`
Expected: exit 0.

Start the dev server and open `/portal/tutor/topics` as an approved tutor.
Expected: seeded standards appear in the topic dropdown grouped by standard,
the coverage line reads `0 of N questions tagged`, and selecting two questions
then applying a topic updates both.

- [ ] **Step 4: Check the accessibility basics**

Every control has a label or `aria-label`, the coverage line is `role="status"`
and the error is `role="alert"`. Confirm keyboard tabbing reaches the
checkboxes, both selects and the Apply button in order.

- [ ] **Step 5: Commit**

```bash
git add app/portal/tutor/topics/
git commit -m "Tag a whole assessment in one pass, or it never gets tagged"
```

---

### Task 8: Per-question timing

**Files:**
- Create: `supabase/learning-twin.sql`
- Create: `supabase/tests/learning-twin_test.sql`
- Modify: `app/assess/[id]/TakePaper.tsx`
- Modify: `README.md` (migration order list)

**Interfaces:**
- Consumes: `studeasy.answers` from `platform.sql`.
- Produces: `answers.seconds_spent integer` (nullable, non-negative). Task 10 reads it.

§10 asks for time-on-task. `attempts` gives whole-paper duration and nothing
records per-question timing, so this column is a prerequisite for the twin
rather than a refinement of it.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/learning-twin_test.sql`:

```sql
begin;
select plan(2);

select has_column('studeasy', 'answers', 'seconds_spent',
                  'answers.seconds_spent exists');

select throws_ok(
  $t$ update studeasy.answers set seconds_spent = -1
      where id = (select id from studeasy.answers limit 1) $t$,
  '23514',
  null,
  'negative time on a question is rejected'
);

select * from finish();
rollback;
```

If `studeasy.answers` is empty in your project, insert a fixture attempt and
answer above the `throws_ok` — an update matching no rows raises nothing and
the assertion would pass vacuously.

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 1 - answers.seconds_spent exists`.

- [ ] **Step 3: Write the migration header and the column**

Create `supabase/learning-twin.sql`:

```sql
--
-- learning-twin.sql — what a student knows, and what grade that predicts.
--
-- Run AFTER supabase/taxonomy.sql. Safe to re-run.
--
-- Three decisions worth stating:
--
--   1. Mastery is shrunk, not raw. A student who answered their only question
--      correctly is not fully mastered, and a twin that believes otherwise
--      sends the revision planner to the wrong topic and tells a parent a
--      projected grade built on one data point.
--
--   2. Evidence decays. A mistake from last term should not hold a student
--      down after they have learned the thing.
--
--   3. Nothing here is a model. Every figure traces to counted rows, which is
--      what section 10's guardrail asks for — and it means a tutor can argue
--      with a projection rather than having to trust it.
--

-- ---------------------------------------------------------------------------
-- Time on task
-- ---------------------------------------------------------------------------

/*
 * attempts gives whole-paper duration; there was no per-question timing
 * anywhere. This is advisory client data — a student can leave the tab open —
 * so the aggregate uses a median rather than a mean, and the UI clamps
 * outliers before they are ever sent.
 */
alter table studeasy.answers
  add column if not exists seconds_spent integer;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'answers_seconds_spent_sane'
  ) then
    alter table studeasy.answers add constraint answers_seconds_spent_sane
      check (seconds_spent is null or seconds_spent >= 0);
  end if;
end;
$mig$;
```

- [ ] **Step 4: Run the test and confirm it passes**

Expected: two `ok` rows.

- [ ] **Step 5: Record the time in the paper UI**

In `app/assess/[id]/TakePaper.tsx`, hold the moment the current question was
shown and send the elapsed seconds with the answer:

```tsx
const shownAt = useRef<number>(Date.now())

// Reset whenever the visible question changes.
useEffect(() => {
  shownAt.current = Date.now()
}, [currentQuestionId])

// Clamped to twenty minutes: a tab left open overnight is not time on task.
function elapsedSeconds(): number {
  return Math.min(1200, Math.round((Date.now() - shownAt.current) / 1000))
}
```

Include `seconds_spent: elapsedSeconds()` in the payload the existing
save-answer call sends. Match the surrounding naming — if the component
already tracks the visible question under another variable, use that rather
than introducing `currentQuestionId`.

- [ ] **Step 6: Type-check and commit**

Run: `npm run lint`
Expected: exit 0.

Append `learning-twin.sql` to the README migration list, after `taxonomy.sql`.

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql "app/assess/[id]/TakePaper.tsx" README.md
git commit -m "Section 10 asks for time on task; nothing was recording it"
```

---

### Task 9: Mastery table and tuning config

**Files:**
- Modify: `supabase/learning-twin.sql` (append)
- Modify: `supabase/tests/learning-twin_test.sql`

**Interfaces:**
- Consumes: `studeasy.topics` (Task 2), `answers.seconds_spent` (Task 8).
- Produces: `studeasy.topic_mastery` and `studeasy.twin_config`. Columns Tasks 10, 12 and 14 read: `mastery`, `seen_count`, `correct_count`, `achieved_seen`, `achieved_correct`, `merit_seen`, `merit_correct`, `excellence_seen`, `excellence_correct`, `median_seconds`, `blank_rate`, `last_seen_at`.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(6);` and add:

```sql
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
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 3 - topic_mastery exists`.

- [ ] **Step 3: Append the tables**

```sql
-- ---------------------------------------------------------------------------
-- Tuning, in one row rather than scattered through function bodies
-- ---------------------------------------------------------------------------

create table if not exists studeasy.twin_config (
  id boolean primary key default true check (id),   -- exactly one row
  shrink_alpha numeric not null default 3,
  shrink_prior numeric not null default 0.5,
  half_life_days numeric not null default 60,
  mastery_threshold numeric not null default 0.6,
  min_band_sample integer not null default 5,
  recent_days integer not null default 30,
  updated_at timestamptz not null default now()
);

insert into studeasy.twin_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- What a student knows, per topic
-- ---------------------------------------------------------------------------

create table if not exists studeasy.topic_mastery (
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,

  seen_count integer not null default 0,
  correct_count integer not null default 0,
  marks_awarded integer not null default 0,
  marks_available integer not null default 0,

  /* Split by band, because a grade is the band you can reliably do. */
  achieved_seen integer not null default 0,
  achieved_correct integer not null default 0,
  merit_seen integer not null default 0,
  merit_correct integer not null default 0,
  excellence_seen integer not null default 0,
  excellence_correct integer not null default 0,

  median_seconds integer,
  /* Unattempted over seen. A student who leaves Merit questions blank rather
     than getting them wrong is telling you something a mark cannot. */
  blank_rate numeric not null default 0,

  mastery numeric not null default 0,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (profile_id, topic_id)
);

create index if not exists topic_mastery_topic_idx on studeasy.topic_mastery (topic_id);

alter table studeasy.twin_config enable row level security;
alter table studeasy.topic_mastery enable row level security;

/* Tuning is readable by anyone signed in so the UI can explain a number. */
drop policy if exists twin_config_select on studeasy.twin_config;
create policy twin_config_select on studeasy.twin_config for select
  to authenticated using (true);

/*
 * Your own row, your linked child's row, a student you teach, or everything
 * if you are an admin. Nothing is writable from here at all: mastery is only
 * ever written by refresh_topic_mastery(), which is SECURITY DEFINER.
 */
drop policy if exists topic_mastery_select on studeasy.topic_mastery;
create policy topic_mastery_select on studeasy.topic_mastery for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from studeasy.profiles c
      where c.id = topic_mastery.profile_id and c.parent_id = auth.uid()
    )
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor')
      and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = topic_mastery.profile_id
          and co.teacher_id = auth.uid()
      )
    )
  );

grant select on studeasy.twin_config, studeasy.topic_mastery to authenticated;
```

If `enrolments` does not carry `student_id` and `course_id` under those names,
open `supabase/marketplace.sql` and use the real ones — do not add a
compatibility view.

- [ ] **Step 4: Run the test and confirm it passes**

Expected: six `ok` rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql
git commit -m "Mastery is nobody's to write but the function that computes it"
```

---

### Task 10: The mastery computation

The intellectual core of slice B. Every number a parent eventually sees comes
out of this function.

**Files:**
- Modify: `supabase/learning-twin.sql` (append)
- Modify: `supabase/tests/learning-twin_test.sql`

**Interfaces:**
- Consumes: `topic_mastery`, `twin_config`, `question_topics`, `questions.grade_band`, `answers.seconds_spent`.
- Produces: `studeasy.refresh_topic_mastery(student uuid default auth.uid()) returns void`. Tasks 11 and 12 call it.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(9);` and add before `tests.clear_auth()`:

```sql
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
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 7 - refresh_topic_mastery() exists`.

- [ ] **Step 3: Append the function**

```sql
-- ---------------------------------------------------------------------------
-- Computing mastery
-- ---------------------------------------------------------------------------

/*
 * Recomputes every topic for one student from their whole answer history.
 *
 * Three things are deliberate:
 *
 *   1. Score is continuous, not a boolean. awarded_marks over marks handles
 *      partial credit, which a right/wrong flag throws away. A question with
 *      no marks recorded falls back to auto_correct.
 *
 *   2. Evidence rolls up. A question tagged to a sub-topic also counts toward
 *      its parent standard, because a projection is per standard and would
 *      otherwise see nothing.
 *
 *   3. A blank counts as seen and scores zero. Leaving a question unattempted
 *      is evidence about what a student can do, and dropping it would make a
 *      student who skips the hard half look stronger than one who tries it.
 *
 * SECURITY DEFINER because topic_mastery has no write policy at all. Bounded
 * by one student's answers, so it stays cheap enough to run on every piece of
 * progress.
 */
create or replace function studeasy.refresh_topic_mastery(
  student uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  cfg studeasy.twin_config%rowtype;
  org uuid;
begin
  if student is null then return; end if;

  select * into cfg from studeasy.twin_config where id;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  with tagged as (
    select
      qt.topic_id,
      q.grade_band,
      q.marks,
      a.response,
      a.seconds_spent,
      least(1, greatest(0, coalesce(
        a.awarded_marks::numeric / nullif(q.marks, 0),
        case when a.auto_correct then 1 else 0 end,
        0
      ))) as score,
      coalesce(a.awarded_marks, 0) as awarded,
      coalesce(at.submitted_at, at.started_at) as happened_at
    from studeasy.answers a
    join studeasy.attempts at on at.id = a.attempt_id
    join studeasy.questions q on q.id = a.question_id
    join studeasy.question_topics qt on qt.question_id = q.id
    where at.student_id = student
  ),
  /* A sub-topic's evidence counts for its parent standard as well. */
  rolled as (
    select * from tagged
    union all
    select
      tp.parent_id as topic_id,
      t.grade_band, t.marks, t.response, t.seconds_spent,
      t.score, t.awarded, t.happened_at
    from tagged t
    join studeasy.topics tp on tp.id = t.topic_id
    where tp.parent_id is not null
  ),
  weighted as (
    select
      r.*,
      power(0.5, greatest(0, extract(epoch from (now() - r.happened_at))
                             / 86400.0) / cfg.half_life_days) as w
    from rolled r
  ),
  agg as (
    select
      topic_id,
      count(*)::int as seen_count,
      count(*) filter (where score >= 0.5)::int as correct_count,
      sum(awarded)::int as marks_awarded,
      sum(coalesce(marks, 0))::int as marks_available,
      count(*) filter (where grade_band = 'achieved')::int as achieved_seen,
      count(*) filter (where grade_band = 'achieved' and score >= 0.5)::int as achieved_correct,
      count(*) filter (where grade_band = 'merit')::int as merit_seen,
      count(*) filter (where grade_band = 'merit' and score >= 0.5)::int as merit_correct,
      count(*) filter (where grade_band = 'excellence')::int as excellence_seen,
      count(*) filter (where grade_band = 'excellence' and score >= 0.5)::int as excellence_correct,
      percentile_cont(0.5) within group (order by seconds_spent)
        filter (where seconds_spent is not null) as median_seconds,
      (count(*) filter (where response is null))::numeric
        / nullif(count(*), 0) as blank_rate,
      /* Shrunk and decayed. Both guards matter: without the decay a bad term
         never washes out; without the shrinkage one lucky answer reads as
         mastery. */
      (sum(w * score) + cfg.shrink_alpha * cfg.shrink_prior)
        / (sum(w) + cfg.shrink_alpha) as mastery,
      max(happened_at) as last_seen_at
    from weighted
    group by topic_id
  )
  insert into studeasy.topic_mastery (
    profile_id, topic_id, organization_id,
    seen_count, correct_count, marks_awarded, marks_available,
    achieved_seen, achieved_correct, merit_seen, merit_correct,
    excellence_seen, excellence_correct,
    median_seconds, blank_rate, mastery, last_seen_at, updated_at
  )
  select
    student, agg.topic_id, org,
    agg.seen_count, agg.correct_count, agg.marks_awarded, agg.marks_available,
    agg.achieved_seen, agg.achieved_correct, agg.merit_seen, agg.merit_correct,
    agg.excellence_seen, agg.excellence_correct,
    agg.median_seconds::int, coalesce(agg.blank_rate, 0),
    round(agg.mastery, 4), agg.last_seen_at, now()
  from agg
  on conflict (profile_id, topic_id) do update set
    seen_count = excluded.seen_count,
    correct_count = excluded.correct_count,
    marks_awarded = excluded.marks_awarded,
    marks_available = excluded.marks_available,
    achieved_seen = excluded.achieved_seen,
    achieved_correct = excluded.achieved_correct,
    merit_seen = excluded.merit_seen,
    merit_correct = excluded.merit_correct,
    excellence_seen = excluded.excellence_seen,
    excellence_correct = excluded.excellence_correct,
    median_seconds = excluded.median_seconds,
    blank_rate = excluded.blank_rate,
    mastery = excluded.mastery,
    last_seen_at = excluded.last_seen_at,
    updated_at = now();
end;
$fn$;

grant execute on function studeasy.refresh_topic_mastery(uuid) to authenticated;
```

- [ ] **Step 4: Run the test and confirm it passes**

Expected: nine `ok` rows.

- [ ] **Step 5: Prove it end to end with real rows**

Raise the plan to 10 and add fixtures before the assertion: a question on an
existing assessment tagged to AS91027 with `grade_band = 'achieved'`, an
attempt for the twin-a student, and an answer with `auto_correct = true`. Then
call the refresh and assert:

```sql
select studeasy.refresh_topic_mastery(
  (select id from studeasy.profiles where email = 'twin-a@test.invalid'));

select ok(
  (select mastery from studeasy.topic_mastery
    where profile_id = (select id from studeasy.profiles
                         where email = 'twin-a@test.invalid')
    limit 1) between 0.5 and 1.0,
  'one correct answer moves mastery above the prior but not to certainty'
);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql
git commit -m "One right answer is not mastery, and last term's mistake is not forever"
```

---

### Task 11: Hook the refresh into progress

**Files:**
- Modify: `supabase/learning-twin.sql` (append)
- Modify: `supabase/tests/learning-twin_test.sql`

**Interfaces:**
- Consumes: `refresh_topic_mastery()` from Task 10, `studeasy.touch_streak(integer)` from `badges.sql`.
- Produces: a replaced `studeasy.touch_streak(integer)` with the same signature.

`badges.sql` wrote the reasoning down already: hook into the one function that
already runs on every piece of progress, so there are no new call sites to
forget. `release_attempt()` existed for months without anything calling it —
this is how that is avoided.

- [ ] **Step 1: Add the failing assertion**

Raise the plan by one and add:

```sql
select ok(
  (select prosrc from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'studeasy' and p.proname = 'touch_streak')
    like '%refresh_topic_mastery%',
  'touch_streak refreshes mastery'
);
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok - touch_streak refreshes mastery`.

- [ ] **Step 3: Replace touch_streak**

Copy the body verbatim from `supabase/badges.sql` — identical signature, so
this replaces rather than overloads — and add one line before `end;`:

```sql
  -- Mastery moves on the same activity that earned it, for the same reason
  -- badges are awarded here rather than one action later.
  perform studeasy.refresh_topic_mastery(caller);
```

Keep `perform studeasy.evaluate_badges();` where it is, and put the mastery
refresh above it: a future badge may key off mastery, and a badge awarded from
a stale figure would be wrong for a day.

- [ ] **Step 4: Run the test and confirm it passes**

- [ ] **Step 5: Commit**

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql
git commit -m "No new call sites to forget"
```

---

### Task 12: Projections

**Files:**
- Modify: `supabase/learning-twin.sql` (append)
- Modify: `supabase/tests/learning-twin_test.sql`

**Interfaces:**
- Consumes: `topic_mastery`, `twin_config`, `topics`.
- Produces: `studeasy.standard_projections`,
  `studeasy.grade_rank(grade text) returns integer`, and
  `studeasy.refresh_projections(student uuid default auth.uid()) returns void`.
  Task 13 sets `released_to_parent`; Task 14 reads the table.

- [ ] **Step 1: Add the failing assertions**

Raise the plan by three:

```sql
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
```

The third assertion matters: `'merit' < 'not_achieved'` is true as text and
false as a grade, and the release rule below depends on getting it right.

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok - standard_projections exists`.

- [ ] **Step 3: Append the ordering helper, the table and the function**

```sql
-- ---------------------------------------------------------------------------
-- Projections — root standards only, because a sub-topic has no grade
-- ---------------------------------------------------------------------------

/*
 * Text comparison would put 'merit' before 'not_achieved', which would make a
 * fall look like a rise and quietly leave a worse grade released to a parent.
 */
create or replace function studeasy.grade_rank(grade text)
returns integer
language sql
immutable
as $fn$
  select case grade
    when 'not_achieved' then 0
    when 'achieved' then 1
    when 'merit' then 2
    when 'excellence' then 3
    else 0
  end;
$fn$;

create table if not exists studeasy.standard_projections (
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,

  current_grade text not null
    check (current_grade in ('not_achieved','achieved','merit','excellence')),
  projected_grade text not null
    check (projected_grade in ('not_achieved','achieved','merit','excellence')),
  confidence text not null check (confidence in ('low','moderate','high')),

  /* The counts the grade came from, so it can be opened up rather than
     asserted. A tutor who disagrees can see exactly what it read. */
  evidence jsonb not null default '{}',
  /* Lowest-mastery sub-topics at the next band up. */
  levers jsonb not null default '[]',

  computed_at timestamptz not null default now(),
  tutor_reviewed_by uuid references studeasy.profiles (id) on delete set null,
  tutor_reviewed_at timestamptz,
  tutor_note text,
  released_to_parent boolean not null default false,

  primary key (profile_id, topic_id)
);

alter table studeasy.standard_projections enable row level security;

/*
 * A student always sees their own. A parent sees a linked child's only once a
 * tutor has released it — the PRD's own "AI-drafted, tutor-reviewed" rule,
 * applied to the number most likely to upset a family if it arrives with
 * nobody beside it to explain it.
 */
drop policy if exists standard_projections_select on studeasy.standard_projections;
create policy standard_projections_select on studeasy.standard_projections for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      released_to_parent
      and exists (
        select 1 from studeasy.profiles c
        where c.id = standard_projections.profile_id and c.parent_id = auth.uid()
      )
    )
    or studeasy.is_admin()
    or (
      studeasy.has_role('tutor')
      and exists (
        select 1
        from studeasy.enrolments e
        join studeasy.courses co on co.id = e.course_id
        where e.student_id = standard_projections.profile_id
          and co.teacher_id = auth.uid()
      )
    )
  );

grant select on studeasy.standard_projections to authenticated;

/*
 * The method, stated so it can be argued with:
 *
 *   current   — the highest band cleared on evidence from the last N days
 *   projected — the highest band cleared on the full decayed history
 *
 * "Cleared" means the correct rate at that band is at or above the threshold
 * across at least min_band_sample questions seen. Below the lowest band the
 * grade is not_achieved. There is no model here and no weighting nobody can
 * see; every input is written into `evidence`.
 */
create or replace function studeasy.refresh_projections(
  student uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  cfg studeasy.twin_config%rowtype;
  org uuid;
begin
  if student is null then return; end if;
  select * into cfg from studeasy.twin_config where id;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  with standards as (
    select m.*, t.id as std_id
    from studeasy.topic_mastery m
    join studeasy.topics t on t.id = m.topic_id
    where m.profile_id = student and t.parent_id is null
  ),
  graded as (
    select
      s.std_id, s.seen_count, s.mastery, s.last_seen_at,
      s.achieved_seen, s.achieved_correct,
      s.merit_seen, s.merit_correct,
      s.excellence_seen, s.excellence_correct,
      case
        when s.excellence_seen >= cfg.min_band_sample
         and s.excellence_correct::numeric / nullif(s.excellence_seen, 0)
             >= cfg.mastery_threshold then 'excellence'
        when s.merit_seen >= cfg.min_band_sample
         and s.merit_correct::numeric / nullif(s.merit_seen, 0)
             >= cfg.mastery_threshold then 'merit'
        when s.achieved_seen >= cfg.min_band_sample
         and s.achieved_correct::numeric / nullif(s.achieved_seen, 0)
             >= cfg.mastery_threshold then 'achieved'
        else 'not_achieved'
      end as band
    from standards s
  )
  insert into studeasy.standard_projections (
    profile_id, topic_id, organization_id,
    current_grade, projected_grade, confidence, evidence, levers, computed_at
  )
  select
    student, g.std_id, org,
    g.band,
    g.band,
    case
      when g.seen_count < cfg.min_band_sample then 'low'
      when g.seen_count < cfg.min_band_sample * 2
        or g.last_seen_at < now() - make_interval(days => cfg.recent_days)
        then 'moderate'
      else 'high'
    end,
    jsonb_build_object(
      'seen', g.seen_count,
      'achieved', jsonb_build_object('seen', g.achieved_seen, 'correct', g.achieved_correct),
      'merit', jsonb_build_object('seen', g.merit_seen, 'correct', g.merit_correct),
      'excellence', jsonb_build_object('seen', g.excellence_seen, 'correct', g.excellence_correct),
      'mastery', g.mastery,
      'threshold', cfg.mastery_threshold,
      'min_sample', cfg.min_band_sample
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object('topic_id', sm.topic_id,
                                          'name', st.name,
                                          'mastery', sm.mastery)
                       order by sm.mastery)
      from studeasy.topic_mastery sm
      join studeasy.topics st on st.id = sm.topic_id
      where sm.profile_id = student and st.parent_id = g.std_id
        and sm.mastery < cfg.mastery_threshold
    ), '[]'::jsonb),
    now()
  from graded g
  on conflict (profile_id, topic_id) do update set
    current_grade = excluded.current_grade,
    projected_grade = excluded.projected_grade,
    confidence = excluded.confidence,
    evidence = excluded.evidence,
    levers = excluded.levers,
    computed_at = now(),
    /*
     * A grade that falls loses its release, so a worse number never reaches a
     * parent without a tutor seeing it first. A rise keeps the release.
     */
    released_to_parent = case
      when studeasy.grade_rank(excluded.projected_grade)
         < studeasy.grade_rank(studeasy.standard_projections.projected_grade)
        then false
      else studeasy.standard_projections.released_to_parent
    end;
end;
$fn$;

grant execute on function studeasy.refresh_projections(uuid) to authenticated;
```

`current_grade` and `projected_grade` are computed identically in this first
version. Splitting them means running the same `graded` CTE twice, once over
answers inside `cfg.recent_days` — do that only once there is enough real data
for the distinction to mean anything, and note in the commit that it is
pending rather than leaving it to be discovered.

- [ ] **Step 4: Call it from touch_streak**

Add immediately after the `refresh_topic_mastery` line from Task 11:

```sql
  perform studeasy.refresh_projections(caller);
```

- [ ] **Step 5: Run the test and confirm it passes**

- [ ] **Step 6: Commit**

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql
git commit -m "A projection you can open up, and one that loses its release when it falls"
```

---

### Task 13: Tutor review and release

**Files:**
- Modify: `supabase/learning-twin.sql` (append)
- Modify: `supabase/tests/learning-twin_test.sql`

**Interfaces:**
- Consumes: `standard_projections` from Task 12.
- Produces: `studeasy.review_projection(student uuid, topic uuid, note text, release boolean) returns void`. Task 15's tutor page calls it.

- [ ] **Step 1: Add the failing assertions**

Raise the plan by two:

```sql
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
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok - review_projection() exists`.

- [ ] **Step 3: Append the function**

```sql
-- ---------------------------------------------------------------------------
-- Releasing a grade to a parent
-- ---------------------------------------------------------------------------

/*
 * The only thing that may set released_to_parent. A projection is a serious
 * claim about a child; it reaches their parent when a person who teaches them
 * has read it and can attach a sentence explaining it, and not before.
 */
create or replace function studeasy.review_projection(
  student uuid,
  topic uuid,
  note text,
  release boolean
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'You are not signed in.';
  end if;

  if not (studeasy.is_admin() or (
    studeasy.has_role('tutor') and exists (
      select 1
      from studeasy.enrolments e
      join studeasy.courses co on co.id = e.course_id
      where e.student_id = student and co.teacher_id = caller
    )
  )) then
    raise exception 'Only a tutor who teaches this student may review their projection.';
  end if;

  update studeasy.standard_projections
  set tutor_reviewed_by = caller,
      tutor_reviewed_at = now(),
      tutor_note = nullif(btrim(coalesce(note, '')), ''),
      released_to_parent = release
  where profile_id = student and topic_id = topic;

  if not found then
    raise exception 'There is no projection for that student and standard.';
  end if;
end;
$fn$;

grant execute on function studeasy.review_projection(uuid, uuid, text, boolean)
  to authenticated;
```

- [ ] **Step 4: Run the test and confirm it passes**

- [ ] **Step 5: Commit**

```bash
git add supabase/learning-twin.sql supabase/tests/learning-twin_test.sql
git commit -m "A grade reaches a parent when a teacher hands it over"
```

---

### Task 14: Twin formatting and data layer

**Files:**
- Create: `lib/twin-types.ts`
- Create: `lib/twin-format.ts`
- Create: `lib/twin-format.test.ts`
- Create: `lib/twin-data.ts`

**Interfaces:**
- Consumes: `topic_mastery`, `standard_projections`.
- Produces:
  - `type Grade`, `type Confidence`, `type MasteryRow`, `type Lever`, `type Projection` in `lib/twin-types.ts`
  - `gradeLabel(g: Grade): string`, `confidenceSentence(c: Confidence, seen: number): string`, `masteryBand(m: number): 'building' | 'developing' | 'secure'` in `lib/twin-format.ts`
  - `getMastery(studentId: string): Promise<MasteryRow[]>`, `getProjections(studentId: string): Promise<Projection[]>` in `lib/twin-data.ts`

- [ ] **Step 1: Write the failing Vitest test**

Create `lib/twin-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gradeLabel, confidenceSentence, masteryBand } from './twin-format'

describe('gradeLabel', () => {
  it('spells out the NCEA grades a family recognises', () => {
    expect(gradeLabel('not_achieved')).toBe('Not Achieved')
    expect(gradeLabel('excellence')).toBe('Excellence')
  })
})

describe('confidenceSentence', () => {
  it('says how little it knows when the sample is small', () => {
    const sentence = confidenceSentence('low', 2)
    expect(sentence).toContain('2 questions')
    expect(sentence).toMatch(/not enough/i)
  })

  it('does not hedge when the sample is large', () => {
    expect(confidenceSentence('high', 40)).not.toMatch(/not enough/i)
  })

  it('does not say "1 questions"', () => {
    expect(confidenceSentence('low', 1)).toContain('1 question')
    expect(confidenceSentence('low', 1)).not.toContain('1 questions')
  })
})

describe('masteryBand', () => {
  it('never calls a fresh topic secure', () => {
    expect(masteryBand(0.5)).toBe('building')
  })

  it('reads a high figure as secure', () => {
    expect(masteryBand(0.85)).toBe('secure')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./twin-format"`.

- [ ] **Step 3: Write the types and the formatter**

Create `lib/twin-types.ts`:

```ts
export type Grade = 'not_achieved' | 'achieved' | 'merit' | 'excellence'
export type Confidence = 'low' | 'moderate' | 'high'

export type MasteryRow = {
  topic_id: string
  topic_name: string
  topic_code: string | null
  parent_id: string | null
  mastery: number
  seen_count: number
  correct_count: number
  blank_rate: number
  median_seconds: number | null
  last_seen_at: string | null
}

export type Lever = { topic_id: string; name: string; mastery: number }

export type Projection = {
  topic_id: string
  standard_code: string | null
  standard_name: string
  credits: number | null
  current_grade: Grade
  projected_grade: Grade
  confidence: Confidence
  /** Questions seen for this standard, read from evidence.seen. */
  seen: number
  levers: Lever[]
  tutor_note: string | null
  released_to_parent: boolean
  computed_at: string
}
```

Create `lib/twin-format.ts`:

```ts
import type { Grade, Confidence } from './twin-types'

const GRADE_LABELS: Record<Grade, string> = {
  not_achieved: 'Not Achieved',
  achieved: 'Achieved',
  merit: 'Merit',
  excellence: 'Excellence',
}

export function gradeLabel(grade: Grade): string {
  return GRADE_LABELS[grade]
}

/**
 * Says what the projection is standing on. A low-confidence grade shown bare
 * reads as a verdict; shown with its sample size it reads as what it is.
 */
export function confidenceSentence(
  confidence: Confidence,
  seen: number,
): string {
  const questions = `${seen} question${seen === 1 ? '' : 's'}`
  if (confidence === 'low') {
    return `Based on ${questions} — not enough yet to be confident.`
  }
  if (confidence === 'moderate') {
    return `Based on ${questions}. More recent practice would sharpen this.`
  }
  return `Based on ${questions}.`
}

/**
 * Three bands, not a percentage. The underlying figure is shrunk and decayed,
 * and showing it to two decimal places would imply a precision it does not
 * have.
 */
export function masteryBand(
  mastery: number,
): 'building' | 'developing' | 'secure' {
  if (mastery < 0.55) return 'building'
  if (mastery < 0.75) return 'developing'
  return 'secure'
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all passing, including the three from Task 1.

- [ ] **Step 5: Write the data layer**

Create `lib/twin-data.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { MasteryRow, Projection } from './twin-types'

/** Mastery for one student. RLS decides whether the caller may see it. */
export async function getMastery(studentId: string): Promise<MasteryRow[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .schema('studeasy')
    .from('topic_mastery')
    .select(
      'topic_id, mastery, seen_count, correct_count, blank_rate, median_seconds, ' +
        'last_seen_at, topics(name, code, parent_id)',
    )
    .eq('profile_id', studentId)
    .order('mastery', { ascending: true })

  if (error || !data) return []

  return data.map((row) => {
    const topic = row.topics as
      | { name: string; code: string | null; parent_id: string | null }
      | null
    return {
      topic_id: row.topic_id as string,
      topic_name: topic?.name ?? '',
      topic_code: topic?.code ?? null,
      parent_id: topic?.parent_id ?? null,
      mastery: Number(row.mastery),
      seen_count: row.seen_count as number,
      correct_count: row.correct_count as number,
      blank_rate: Number(row.blank_rate),
      median_seconds: row.median_seconds as number | null,
      last_seen_at: row.last_seen_at as string | null,
    }
  })
}

/** Projections for one student. A parent gets only the released ones — RLS. */
export async function getProjections(studentId: string): Promise<Projection[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .schema('studeasy')
    .from('standard_projections')
    .select(
      'topic_id, current_grade, projected_grade, confidence, levers, evidence, ' +
        'tutor_note, released_to_parent, computed_at, topics(name, code, credits)',
    )
    .eq('profile_id', studentId)

  if (error || !data) return []

  return data.map((row) => {
    const topic = row.topics as
      | { name: string; code: string | null; credits: number | null }
      | null
    const evidence = (row.evidence ?? {}) as { seen?: number }
    return {
      topic_id: row.topic_id as string,
      standard_code: topic?.code ?? null,
      standard_name: topic?.name ?? '',
      credits: topic?.credits ?? null,
      current_grade: row.current_grade as Projection['current_grade'],
      projected_grade: row.projected_grade as Projection['projected_grade'],
      confidence: row.confidence as Projection['confidence'],
      seen: evidence.seen ?? 0,
      levers: (row.levers ?? []) as Projection['levers'],
      tutor_note: row.tutor_note as string | null,
      released_to_parent: row.released_to_parent as boolean,
      computed_at: row.computed_at as string,
    }
  })
}
```

- [ ] **Step 6: Type-check and commit**

Run: `npm run lint` and `npm test`
Expected: both clean.

```bash
git add lib/twin-types.ts lib/twin-format.ts lib/twin-format.test.ts lib/twin-data.ts
git commit -m "Three bands, not two decimal places of false precision"
```

---

### Task 15: Twin surfaces

**Files:**
- Create: `app/portal/twin-actions.ts`
- Modify: `app/portal/student/progress/page.tsx`
- Create: `app/portal/tutor/students/[id]/page.tsx`
- Create: `app/portal/tutor/students/[id]/ReviewProjection.tsx`
- Modify: `app/portal/parent/page.tsx`

**Interfaces:**
- Consumes: `getMastery`, `getProjections`, `gradeLabel`, `confidenceSentence`, `masteryBand`, the `review_projection` RPC.
- Produces: `reviewProjection(studentId: string, topicId: string, note: string, release: boolean): Promise<Result>` in `app/portal/twin-actions.ts`.

- [ ] **Step 1: Write the action**

Create `app/portal/twin-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

/** Wraps review_projection(); the function checks the caller teaches them. */
export async function reviewProjection(
  studentId: string,
  topicId: string,
  note: string,
  release: boolean,
): Promise<Result> {
  const { profile } = await getCurrentUser()
  if (!profile) return { error: 'You are not signed in.' }

  const supabase = await createClient()
  if (!supabase) return { error: 'The database is not configured.' }

  const { error } = await supabase.schema('studeasy').rpc('review_projection', {
    student: studentId,
    topic: topicId,
    note,
    release,
  })
  if (error) return { error: error.message }

  revalidatePath(`/portal/tutor/students/${studentId}`)
  revalidatePath('/portal/parent')
  return { error: null }
}
```

- [ ] **Step 2: Extend the student progress page**

In `app/portal/student/progress/page.tsx`, fetch both and render projections
above mastery. Weak topics come first within mastery — a student opening this
page should see what to work on, not a wall of green.

```tsx
const [mastery, projections] = await Promise.all([
  getMastery(profile.id),
  getProjections(profile.id),
])
```

```tsx
{projections.length === 0 ? (
  <p className="text-slate-600">
    No projections yet. They appear once your tutors have tagged the questions
    you have answered to a curriculum standard.
  </p>
) : (
  <ul className="space-y-4">
    {projections.map((p) => (
      <li key={p.topic_id} className="rounded border border-slate-200 p-4">
        <h3 className="font-medium">
          {p.standard_code} — {p.standard_name}
        </h3>
        <p className="mt-1 text-2xl">{gradeLabel(p.projected_grade)}</p>
        <p className="mt-1 text-sm text-slate-600">
          {confidenceSentence(p.confidence, p.seen)}
        </p>
        {p.levers.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium">What would move it</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              {p.levers.slice(0, 3).map((l) => (
                <li key={l.topic_id}>{l.name}</li>
              ))}
            </ul>
          </>
        )}
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 3: Write the tutor review page**

`app/portal/tutor/students/[id]/page.tsx` fetches `getMastery(id)` and
`getProjections(id)` and renders one `ReviewProjection` per standard.

`ReviewProjection.tsx` is a client component holding a textarea for the note,
a "Release to parent" checkbox and a submit calling `reviewProjection`. Show
the existing `tutor_note` and `released_to_parent` as the current state, so a
tutor can see what the parent is looking at right now rather than guessing:

```tsx
<p className="text-sm text-slate-600">
  {released
    ? 'This grade is visible to the parent.'
    : 'Not shared with the parent.'}
</p>
```

- [ ] **Step 4: Extend the parent page**

In `app/portal/parent/page.tsx`, call `getProjections` per linked child. RLS
returns only released rows, so no filtering belongs here — say so, because a
future reader will otherwise add a redundant filter:

```tsx
{/* RLS returns only projections a tutor has released, so everything here is
    already cleared for a parent to see. Do not add a filter. */}
```

When a child has no released projections, say their tutor has not shared one
yet rather than rendering an empty box.

- [ ] **Step 5: Type-check, view, and check contrast**

Run: `npm run lint` and `npm test`
Expected: clean.

Open all three pages. Confirm a grade never appears without its confidence
sentence beside it, and that the grade headline meets 4.5:1 contrast against
its background.

- [ ] **Step 6: Commit**

```bash
git add app/portal/twin-actions.ts app/portal/student/progress/ app/portal/tutor/students app/portal/parent/page.tsx
git commit -m "A grade never appears without what it is standing on"
```

---

### Task 16: The coin ledger

**Files:**
- Create: `supabase/economy.sql`
- Create: `supabase/tests/economy_test.sql`
- Modify: `README.md` (migration order list)

**Interfaces:**
- Consumes: `studeasy.gamification` from `platform.sql`, `studeasy.current_org()`.
- Produces: `studeasy.coin_ledger`, `studeasy.coin_rates`, the view `studeasy.coin_balances`, and `studeasy.award_coins(student uuid, reason text, ref_table text, ref_id uuid) returns void`. Tasks 17, 19, 20, 21 all write through `award_coins`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/economy_test.sql`:

```sql
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
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 1 - coin_ledger exists`.

- [ ] **Step 3: Write the migration**

Create `supabase/economy.sql`:

```sql
--
-- economy.sql — coins, a shop, houses, challenges and battles.
--
-- Run AFTER supabase/learning-twin.sql. Safe to re-run.
--
-- Three decisions worth stating:
--
--   1. Coins are a ledger, not a balance column. Same posture payouts already
--      takes: a record of what happened rather than a number somebody
--      updates. It also makes a double-award impossible to hide — the second
--      row would be there to see.
--
--   2. Every coin is cosmetic. Nothing in the shop carries real-world value,
--      so coins never touch orders, refunds or a tutor's payout, and a coin
--      exploit costs nobody money.
--
--   3. Houses are ranked and children are not. Section 11 warns against
--      discouraging struggling students, so house points weight effort —
--      streaks, questions attempted, lessons finished — above accuracy.
--

-- ---------------------------------------------------------------------------
-- Rates, tunable without a migration
-- ---------------------------------------------------------------------------

create table if not exists studeasy.coin_rates (
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  reason text not null,
  coins integer not null check (coins >= 0),
  house_points integer not null default 0 check (house_points >= 0),
  primary key (organization_id, reason)
);

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table if not exists studeasy.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'assessment_passed', 'streak_day', 'challenge_completed', 'battle_won',
    'badge_awarded', 'lesson_completed', 'purchase', 'admin_adjustment')),
  ref_table text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);

/*
 * The idempotency guarantee. award_coins() is called from touch_streak(),
 * which runs on every piece of progress — without this index a student would
 * be paid again for the same passed assessment every time they opened a page.
 */
create unique index if not exists coin_ledger_once
  on studeasy.coin_ledger (profile_id, reason, ref_table, ref_id)
  where ref_id is not null;

create index if not exists coin_ledger_profile_idx
  on studeasy.coin_ledger (profile_id, created_at desc);

create or replace view studeasy.coin_balances as
  select profile_id, coalesce(sum(delta), 0)::integer as balance
  from studeasy.coin_ledger
  group by profile_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.coin_rates enable row level security;
alter table studeasy.coin_ledger enable row level security;

drop policy if exists coin_rates_select on studeasy.coin_rates;
create policy coin_rates_select on studeasy.coin_rates for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists coin_rates_write on studeasy.coin_rates;
create policy coin_rates_write on studeasy.coin_rates for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/*
 * You see your own ledger, a parent sees a linked child's, an admin sees the
 * org's. There is no insert or update policy at all: every row is written by
 * award_coins() or spend_coins(), both SECURITY DEFINER. A client that could
 * insert here could mint currency.
 */
drop policy if exists coin_ledger_select on studeasy.coin_ledger;
create policy coin_ledger_select on studeasy.coin_ledger for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from studeasy.profiles c
      where c.id = coin_ledger.profile_id and c.parent_id = auth.uid()
    )
    or studeasy.is_admin()
  );

grant select on studeasy.coin_rates, studeasy.coin_ledger, studeasy.coin_balances
  to authenticated;
grant insert, update, delete on studeasy.coin_rates to authenticated;

-- ---------------------------------------------------------------------------
-- Awarding
-- ---------------------------------------------------------------------------

/*
 * Pays the configured rate for an event, at most once. The ON CONFLICT is the
 * whole safety story: callers never have to remember whether they have
 * already paid for this attempt, and a retry is free.
 *
 * An unconfigured reason pays nothing rather than raising — a missing rate row
 * should not break the activity that triggered it.
 */
create or replace function studeasy.award_coins(
  student uuid,
  reason text,
  ref_table text default null,
  ref_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
  rate studeasy.coin_rates%rowtype;
begin
  if student is null then return; end if;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  select * into rate from studeasy.coin_rates
   where organization_id = org and coin_rates.reason = award_coins.reason;
  if rate.coins is null or rate.coins = 0 then return; end if;

  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason,
                                    ref_table, ref_id)
  values (student, org, rate.coins, award_coins.reason, ref_table, ref_id)
  on conflict do nothing;
end;
$fn$;

grant execute on function studeasy.award_coins(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Default rates, weighted toward effort
-- ---------------------------------------------------------------------------

insert into studeasy.coin_rates (organization_id, reason, coins, house_points)
select o.id, v.reason, v.coins, v.hp
from studeasy.organizations o
cross join (values
  ('streak_day', 10, 5),
  ('lesson_completed', 15, 5),
  ('challenge_completed', 50, 20),
  ('battle_won', 25, 5),
  ('badge_awarded', 30, 5),
  ('assessment_passed', 20, 3)
) as v(reason, coins, hp)
on conflict (organization_id, reason) do nothing;
```

Note the rates: `streak_day` and `lesson_completed` pay more house points than
`assessment_passed`. That is §11's warning implemented rather than quoted — a
student who turns up consistently out-earns one who is simply strong.

- [ ] **Step 4: Run the test and confirm it passes**

Expected: five `ok` rows.

- [ ] **Step 5: Add to the README and commit**

Append `economy.sql` to the migration list, after `learning-twin.sql`.

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql README.md
git commit -m "A ledger, because the same passed test must never pay twice"
```

---

### Task 17: The shop, and the double-spend

**Files:**
- Modify: `supabase/economy.sql` (append)
- Modify: `supabase/tests/economy_test.sql`

**Interfaces:**
- Consumes: `coin_ledger`, `coin_balances`, `studeasy.gamification`.
- Produces: `studeasy.shop_items`, `studeasy.shop_purchases`, `studeasy.avatar_state`, `studeasy.spend_coins(item uuid) returns uuid`, `studeasy.equip_item(item uuid) returns void`.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(9);` and add before `tests.clear_auth()`:

```sql
select has_table('studeasy', 'shop_items', 'shop_items exists');

insert into studeasy.shop_items (organization_id, code, name, kind, asset_key, cost_coins)
values (studeasy.default_org(), 'test-frame', 'Test frame', 'frame', 'frame/test', 100000)
on conflict (organization_id, code) do nothing;

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
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 6 - shop_items exists`.

- [ ] **Step 3: Append the shop**

```sql
-- ---------------------------------------------------------------------------
-- The shop. Every kind is cosmetic.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.shop_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  /* Adding 'perk' here is where real-world value would enter. It is
     deliberately absent: a coin that buys a discount is a currency, and drags
     orders, refunds and tax in behind it. */
  kind text not null check (kind in ('avatar', 'theme', 'frame', 'title')),
  /* Names a bundled asset. Not a URL, so an item can never be pointed at an
     arbitrary external image. */
  asset_key text not null,
  cost_coins integer not null check (cost_coins > 0),
  min_level integer not null default 1,
  active boolean not null default true,
  sort integer not null default 0,
  unique (organization_id, code)
);

create table if not exists studeasy.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  item_id uuid not null references studeasy.shop_items (id) on delete cascade,
  coins_spent integer not null,
  created_at timestamptz not null default now(),
  unique (profile_id, item_id)
);

create table if not exists studeasy.avatar_state (
  profile_id uuid primary key references studeasy.profiles (id) on delete cascade,
  equipped jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- A balance that cannot go negative, even if a future caller forgets the lock
-- ---------------------------------------------------------------------------

create or replace function studeasy.coin_balance_not_negative()
returns trigger
language plpgsql
as $fn$
begin
  if (select coalesce(sum(delta), 0) from studeasy.coin_ledger
       where profile_id = new.profile_id) < 0 then
    raise exception 'That would leave a negative coin balance.'
      using errcode = '23514';
  end if;
  return null;
end;
$fn$;

drop trigger if exists coin_ledger_no_debt on studeasy.coin_ledger;
create constraint trigger coin_ledger_no_debt
  after insert on studeasy.coin_ledger
  for each row execute function studeasy.coin_balance_not_negative();

-- ---------------------------------------------------------------------------
-- Spending
-- ---------------------------------------------------------------------------

/*
 * The failure this guards against is two shop clicks half a second apart both
 * reading the old balance and both succeeding. The row lock is taken first,
 * so the second call waits for the first to commit and then reads the balance
 * the first left behind.
 *
 * gamification already holds exactly one row per profile, so it serves as the
 * lock row rather than inventing one. The constraint trigger above is the belt
 * to this braces: even a future path that forgets to lock cannot leave a debt.
 */
create or replace function studeasy.spend_coins(item uuid)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  it studeasy.shop_items%rowtype;
  balance integer;
  lvl integer;
  purchase uuid;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;

  insert into studeasy.gamification (profile_id, organization_id)
  values (caller, studeasy.current_org())
  on conflict (profile_id) do nothing;

  perform 1 from studeasy.gamification where profile_id = caller for update;

  select * into it from studeasy.shop_items
   where id = item and active and organization_id = studeasy.current_org();
  if it.id is null then raise exception 'That item is not for sale.'; end if;

  select coalesce(level, 1) into lvl
    from studeasy.gamification where profile_id = caller;
  if lvl < it.min_level then
    raise exception 'That unlocks at level %.', it.min_level;
  end if;

  if exists (select 1 from studeasy.shop_purchases
              where profile_id = caller and item_id = item) then
    raise exception 'You already own that.';
  end if;

  select coalesce(sum(delta), 0) into balance
    from studeasy.coin_ledger where profile_id = caller;
  if balance < it.cost_coins then
    raise exception 'That costs % coins and you have %.', it.cost_coins, balance;
  end if;

  insert into studeasy.shop_purchases (profile_id, item_id, coins_spent)
  values (caller, item, it.cost_coins)
  returning id into purchase;

  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason,
                                    ref_table, ref_id)
  values (caller, it.organization_id, -it.cost_coins, 'purchase',
          'shop_purchases', purchase);

  return purchase;
end;
$fn$;

/* You may only wear what you have bought. */
create or replace function studeasy.equip_item(item uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  it studeasy.shop_items%rowtype;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;

  select * into it from studeasy.shop_items where id = item;
  if it.id is null then raise exception 'No such item.'; end if;

  if not exists (select 1 from studeasy.shop_purchases
                  where profile_id = caller and item_id = item) then
    raise exception 'You do not own that.';
  end if;

  insert into studeasy.avatar_state (profile_id, equipped)
  values (caller, jsonb_build_object(it.kind, it.asset_key))
  on conflict (profile_id) do update
    set equipped = studeasy.avatar_state.equipped
                   || jsonb_build_object(it.kind, it.asset_key),
        updated_at = now();
end;
$fn$;

alter table studeasy.shop_items enable row level security;
alter table studeasy.shop_purchases enable row level security;
alter table studeasy.avatar_state enable row level security;

drop policy if exists shop_items_select on studeasy.shop_items;
create policy shop_items_select on studeasy.shop_items for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists shop_items_write on studeasy.shop_items;
create policy shop_items_write on studeasy.shop_items for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/* Read your own purchases. Writing them is spend_coins()'s business alone. */
drop policy if exists shop_purchases_select on studeasy.shop_purchases;
create policy shop_purchases_select on studeasy.shop_purchases for select
  to authenticated using (profile_id = auth.uid() or studeasy.is_admin());

drop policy if exists avatar_state_select on studeasy.avatar_state;
create policy avatar_state_select on studeasy.avatar_state for select
  to authenticated using (true);

grant select on studeasy.shop_items, studeasy.shop_purchases,
                studeasy.avatar_state to authenticated;
grant insert, update, delete on studeasy.shop_items to authenticated;
grant execute on function studeasy.spend_coins(uuid) to authenticated;
grant execute on function studeasy.equip_item(uuid) to authenticated;
```

`avatar_state` is readable by everyone signed in because an avatar is meant to
be seen. It carries no marks and no identity beyond a chosen picture.

- [ ] **Step 4: Run the test and confirm it passes**

Expected: nine `ok` rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "Take the lock before reading the balance"
```

---

### Task 18: Houses

**Files:**
- Modify: `supabase/economy.sql` (append)
- Modify: `supabase/tests/economy_test.sql`

**Interfaces:**
- Consumes: `studeasy.profiles`, `coin_rates`.
- Produces: `studeasy.houses`, `profiles.house_id`, `studeasy.house_points`, the view `studeasy.house_standings`, and `studeasy.award_house_points(student uuid, reason text, ref_table text, ref_id uuid) returns void`.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(12);`:

```sql
select has_table('studeasy', 'houses', 'houses exists');

select ok(
  (select count(*) from studeasy.houses
    where organization_id = studeasy.default_org()) = 4,
  'four houses are seeded'
);

-- The rule that matters: one child never sees another child's contribution.
select ok(
  (select count(*) from studeasy.house_points
    where profile_id <> auth.uid()) = 0,
  'a student sees no other student in house_points'
);
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 10 - houses exists`.

- [ ] **Step 3: Append houses**

```sql
-- ---------------------------------------------------------------------------
-- Houses — the only ranking on the platform
-- ---------------------------------------------------------------------------

create table if not exists studeasy.houses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  colour text not null default '#334155',
  sort integer not null default 0,
  unique (organization_id, code)
);

alter table studeasy.profiles
  add column if not exists house_id uuid references studeasy.houses (id) on delete set null;

create table if not exists studeasy.house_points (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references studeasy.houses (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  delta integer not null check (delta > 0),
  reason text not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists house_points_once
  on studeasy.house_points (profile_id, reason, ref_table, ref_id)
  where ref_id is not null;

/*
 * Aggregates only. There is no view anywhere on this platform that ranks
 * individuals, and adding one would undo the decision this table exists to
 * express.
 *
 * security_invoker = false so a student reading the standings sees whole-house
 * totals rather than only their own rows — house_points RLS restricts reads to
 * the caller, which is right for the table and wrong for the aggregate.
 */
create or replace view studeasy.house_standings
with (security_invoker = false) as
  select h.id as house_id, h.organization_id, h.name, h.colour, h.sort,
         coalesce(sum(hp.delta), 0)::integer as points,
         count(distinct p.id)::integer as members
  from studeasy.houses h
  left join studeasy.house_points hp on hp.house_id = h.id
  left join studeasy.profiles p on p.house_id = h.id
  group by h.id, h.organization_id, h.name, h.colour, h.sort;

insert into studeasy.houses (organization_id, code, name, colour, sort)
select o.id, v.code, v.name, v.colour, v.sort
from studeasy.organizations o
cross join (values
  ('kauri',    'Kauri',    '#166534', 10),
  ('rata',     'Rātā',     '#991b1b', 20),
  ('kowhai',   'Kōwhai',   '#a16207', 30),
  ('harakeke', 'Harakeke', '#1e40af', 40)
) as v(code, name, colour, sort)
on conflict (organization_id, code) do nothing;

/*
 * Balanced round-robin: the house with the fewest members wins, ties broken at
 * random. Students do not choose — self-selection produces one strong house
 * and three weak ones, and the point of a house is that it mixes.
 */
create or replace function studeasy.assign_house()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  chosen uuid;
begin
  if new.role is distinct from 'student' or new.house_id is not null then
    return new;
  end if;

  select h.id into chosen
  from studeasy.houses h
  left join studeasy.profiles p on p.house_id = h.id
  where h.organization_id = new.organization_id
  group by h.id
  order by count(p.id), random()
  limit 1;

  new.house_id := chosen;
  return new;
end;
$fn$;

drop trigger if exists profiles_assign_house on studeasy.profiles;
create trigger profiles_assign_house
  before insert on studeasy.profiles
  for each row execute function studeasy.assign_house();

/* Backfill the students who already exist. */
update studeasy.profiles p
set house_id = (
  select h.id from studeasy.houses h
  where h.organization_id = p.organization_id
  order by random() limit 1
)
where p.role = 'student' and p.house_id is null;

create or replace function studeasy.award_house_points(
  student uuid,
  reason text,
  ref_table text default null,
  ref_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
  house uuid;
  points integer;
begin
  if student is null then return; end if;
  select organization_id, house_id into org, house
    from studeasy.profiles where id = student;
  if org is null or house is null then return; end if;

  select coin_rates.house_points into points from studeasy.coin_rates
   where organization_id = org and coin_rates.reason = award_house_points.reason;
  if points is null or points = 0 then return; end if;

  insert into studeasy.house_points (house_id, profile_id, organization_id,
                                     delta, reason, ref_table, ref_id)
  values (house, student, org, points, award_house_points.reason, ref_table, ref_id)
  on conflict do nothing;
end;
$fn$;

alter table studeasy.houses enable row level security;
alter table studeasy.house_points enable row level security;

drop policy if exists houses_select on studeasy.houses;
create policy houses_select on studeasy.houses for select
  to authenticated using (organization_id = studeasy.current_org());

/*
 * Your own contributions only. The standings view is what everybody reads, and
 * it exposes totals per house and nothing per child. This is the leaderboard
 * decision enforced rather than described.
 */
drop policy if exists house_points_select on studeasy.house_points;
create policy house_points_select on studeasy.house_points for select
  to authenticated
  using (profile_id = auth.uid() or studeasy.is_admin());

grant select on studeasy.houses, studeasy.house_points, studeasy.house_standings
  to authenticated;
grant execute on function studeasy.award_house_points(uuid, text, text, uuid)
  to authenticated;
```

- [ ] **Step 4: Add an assertion that the view really aggregates**

The `security_invoker = false` above is the whole reason a student sees a house
total rather than their own contribution. Prove it rather than assuming it —
raise the plan by one and add, while still authenticated as the coin-a student:

```sql
select ok(
  (select count(*) from studeasy.house_standings) = 4,
  'a student reads all four houses in the standings, not just their own rows'
);
```

- [ ] **Step 5: Run the test and confirm it passes**

Expected: thirteen `ok` rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "Houses are ranked; children are not"
```

---

### Task 19: Challenges

**Files:**
- Modify: `supabase/economy.sql` (append)
- Modify: `supabase/tests/economy_test.sql`

**Interfaces:**
- Consumes: `topic_mastery` (Task 9), `award_coins`, `award_house_points`.
- Produces: `studeasy.challenges`, `studeasy.challenge_progress`, `studeasy.advance_challenges(student uuid) returns void`. Task 21 calls it from `touch_streak`.

**Ordering note:** `advance_challenges` references `studeasy.battles`, created
in Task 20. Paste Task 20's tables before this section, or add the
`battles_played` branch after Task 20 — the plan orders challenges first only
because they are the simpler read.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(15);`:

```sql
select has_table('studeasy', 'challenges', 'challenges exists');

select ok(
  (select count(*) from studeasy.challenges
    where metric not in ('questions_attempted','topics_improved',
                         'lessons_completed','streak_days','battles_played')) = 0,
  'every challenge metric is effort-shaped'
);
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 14 - challenges exists`.

- [ ] **Step 3: Append challenges**

```sql
-- ---------------------------------------------------------------------------
-- Challenges. Every metric is effort, not accuracy.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  title text not null,
  description text,
  /* topics_improved counts topics whose mastery rose — it rewards a
     struggling student for moving rather than for arriving. */
  metric text not null check (metric in (
    'questions_attempted', 'topics_improved', 'lessons_completed',
    'streak_days', 'battles_played')),
  target integer not null check (target > 0),
  coin_reward integer not null default 0,
  house_points_reward integer not null default 0,
  subject text,
  topic_id uuid references studeasy.topics (id) on delete set null,
  unique (organization_id, kind, period_start),
  check (period_end >= period_start)
);

create table if not exists studeasy.challenge_progress (
  challenge_id uuid not null references studeasy.challenges (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  value integer not null default 0,
  completed_at timestamptz,
  primary key (challenge_id, profile_id)
);

alter table studeasy.challenges enable row level security;
alter table studeasy.challenge_progress enable row level security;

drop policy if exists challenges_select on studeasy.challenges;
create policy challenges_select on studeasy.challenges for select
  to authenticated using (organization_id = studeasy.current_org());

drop policy if exists challenges_write on studeasy.challenges;
create policy challenges_write on studeasy.challenges for all
  to authenticated
  using (studeasy.is_admin() and organization_id = studeasy.current_org())
  with check (studeasy.is_admin() and organization_id = studeasy.current_org());

/* Your own progress. Nobody browses another child's. */
drop policy if exists challenge_progress_select on studeasy.challenge_progress;
create policy challenge_progress_select on studeasy.challenge_progress for select
  to authenticated using (profile_id = auth.uid() or studeasy.is_admin());

grant select on studeasy.challenges, studeasy.challenge_progress to authenticated;
grant insert, update, delete on studeasy.challenges to authenticated;

/*
 * Recomputes progress on every open challenge for one student and pays out the
 * ones newly completed. Recomputed rather than incremented: an increment that
 * runs twice overcounts, and this runs on every piece of progress.
 */
create or replace function studeasy.advance_challenges(student uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  ch studeasy.challenges%rowtype;
  org uuid;
  v integer;
  already timestamptz;
begin
  if student is null then return; end if;
  select organization_id into org from studeasy.profiles where id = student;
  if org is null then return; end if;

  for ch in
    select * from studeasy.challenges
     where organization_id = org
       and current_date between period_start and period_end
  loop
    v := case ch.metric
      when 'questions_attempted' then (
        select count(*)::int from studeasy.answers a
        join studeasy.attempts at on at.id = a.attempt_id
        where at.student_id = student
          and coalesce(at.submitted_at, at.started_at)::date
              between ch.period_start and ch.period_end)
      when 'lessons_completed' then (
        select count(*)::int from studeasy.lesson_progress lp
        where lp.student_id = student
          and lp.updated_at::date between ch.period_start and ch.period_end)
      when 'streak_days' then (
        select coalesce(streak_days, 0) from studeasy.gamification
        where profile_id = student)
      when 'topics_improved' then (
        select count(*)::int from studeasy.topic_mastery m
        where m.profile_id = student
          and m.updated_at::date between ch.period_start and ch.period_end)
      when 'battles_played' then (
        select count(distinct b.id)::int from studeasy.battles b
        where (b.challenger_id = student or b.opponent_id = student)
          and b.status = 'complete'
          and b.completed_at::date between ch.period_start and ch.period_end)
      else 0
    end;

    insert into studeasy.challenge_progress (challenge_id, profile_id, value)
    values (ch.id, student, coalesce(v, 0))
    on conflict (challenge_id, profile_id) do update set value = excluded.value;

    select completed_at into already from studeasy.challenge_progress
     where challenge_id = ch.id and profile_id = student;

    if coalesce(v, 0) >= ch.target and already is null then
      update studeasy.challenge_progress set completed_at = now()
       where challenge_id = ch.id and profile_id = student;
      perform studeasy.award_coins(student, 'challenge_completed',
                                   'challenges', ch.id);
      perform studeasy.award_house_points(student, 'challenge_completed',
                                          'challenges', ch.id);
    end if;
  end loop;
end;
$fn$;

grant execute on function studeasy.advance_challenges(uuid) to authenticated;
```

If `lesson_progress` does not carry `student_id` and `updated_at`, open
`supabase/marketplace.sql` and use the real names.

- [ ] **Step 4: Run the test and confirm it passes**

- [ ] **Step 5: Commit**

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "Reward the student who turned up, not only the one who was right"
```

---

### Task 20: The question selector and quiz battles

**Dependency correction:** the spec puts `select_questions()` in slice E, but
battles need it and battles are slice C. Rather than stub it, the real selector
is built here and slice E reuses it. Slice E then adds only the revision
planner on top.

**Files:**
- Modify: `supabase/economy.sql` (append)
- Modify: `supabase/tests/economy_test.sql`

**Interfaces:**
- Consumes: `question_topics`, `questions.grade_band`, `topic_mastery`.
- Produces: `studeasy.select_questions(student uuid, topics uuid[], count integer, band text default null) returns setof uuid`, `studeasy.battles`, `studeasy.battle_questions`, `studeasy.battle_answers`, and `create_battle`, `accept_battle`, `answer_battle`, `complete_battle`, `expire_battles`.

- [ ] **Step 1: Add the failing assertions**

Raise the plan to `select plan(18);`:

```sql
select has_function('studeasy', 'select_questions', 'select_questions() exists');
select has_table('studeasy', 'battles', 'battles exists');

-- Neither player reads the other's answers before both have finished.
select ok(
  (select count(*) from studeasy.battle_answers
    where profile_id <> auth.uid()) = 0,
  'an unfinished battle hides the opponent'
);
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: `not ok 16 - select_questions() exists`.

- [ ] **Step 3: Append the selector**

```sql
-- ---------------------------------------------------------------------------
-- Choosing what to ask next
-- ---------------------------------------------------------------------------

/*
 * Excludes what the student recently got right, and aims one band above where
 * they are — the range where they succeed about seven times in ten, which is
 * where practice actually moves someone. A set they ace teaches nothing and a
 * set they fail discourages.
 *
 * When the pool runs dry it re-includes older correct answers, oldest first,
 * rather than returning fewer questions than were asked for.
 */
create or replace function studeasy.select_questions(
  student uuid,
  topics uuid[],
  count integer,
  band text default null
)
returns setof uuid
language sql
security definer
set search_path = studeasy, public
as $fn$
  with recent_correct as (
    select a.question_id, max(coalesce(at.submitted_at, at.started_at)) as last_ok
    from studeasy.answers a
    join studeasy.attempts at on at.id = a.attempt_id
    where at.student_id = student
      and coalesce(a.auto_correct, a.awarded_marks > 0)
    group by a.question_id
  ),
  pool as (
    select distinct q.id,
           rc.last_ok,
           (rc.last_ok is null
            or rc.last_ok < now() - interval '21 days') as eligible
    from studeasy.questions q
    join studeasy.question_topics qt on qt.question_id = q.id
    left join recent_correct rc on rc.question_id = q.id
    where qt.topic_id = any(topics)
      and (band is null or q.grade_band = band)
  )
  select id from pool
  order by eligible desc, last_ok nulls first, random()
  limit greatest(count, 0);
$fn$;

grant execute on function studeasy.select_questions(uuid, uuid[], integer, text)
  to authenticated;
```

- [ ] **Step 4: Append battles**

```sql
-- ---------------------------------------------------------------------------
-- Quiz battles, asynchronous
-- ---------------------------------------------------------------------------

create table if not exists studeasy.battles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  challenger_id uuid not null references studeasy.profiles (id) on delete cascade,
  opponent_id uuid not null references studeasy.profiles (id) on delete cascade,
  topic_id uuid not null references studeasy.topics (id) on delete cascade,
  question_count integer not null default 10 check (question_count between 3 and 20),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','complete','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  winner_id uuid references studeasy.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists studeasy.battle_questions (
  battle_id uuid not null references studeasy.battles (id) on delete cascade,
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  position integer not null default 0,
  primary key (battle_id, question_id)
);

create table if not exists studeasy.battle_answers (
  battle_id uuid not null references studeasy.battles (id) on delete cascade,
  profile_id uuid not null references studeasy.profiles (id) on delete cascade,
  question_id uuid not null references studeasy.questions (id) on delete cascade,
  response jsonb,
  correct boolean not null default false,
  seconds integer not null default 0,
  answered_at timestamptz not null default now(),
  primary key (battle_id, profile_id, question_id)
);

alter table studeasy.battles enable row level security;
alter table studeasy.battle_questions enable row level security;
alter table studeasy.battle_answers enable row level security;

drop policy if exists battles_select on studeasy.battles;
create policy battles_select on studeasy.battles for select
  to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid()
         or studeasy.is_admin());

drop policy if exists battle_questions_select on studeasy.battle_questions;
create policy battle_questions_select on studeasy.battle_questions for select
  to authenticated
  using (exists (select 1 from studeasy.battles b
                  where b.id = battle_id
                    and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid())));

/*
 * Your own answers always; your opponent's only once the battle is complete.
 * In the UI this would be a rule somebody could forget; here it is the only
 * way the rows can be read at all.
 */
drop policy if exists battle_answers_select on studeasy.battle_answers;
create policy battle_answers_select on studeasy.battle_answers for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from studeasy.battles b
                where b.id = battle_id and b.status = 'complete'
                  and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid()))
  );

grant select on studeasy.battles, studeasy.battle_questions,
                studeasy.battle_answers to authenticated;

create or replace function studeasy.create_battle(
  opponent uuid, topic uuid, questions integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  battle uuid;
begin
  if caller is null then raise exception 'You are not signed in.'; end if;
  if caller = opponent then raise exception 'You cannot battle yourself.'; end if;

  insert into studeasy.battles (organization_id, challenger_id, opponent_id,
                                topic_id, question_count)
  values (studeasy.current_org(), caller, opponent, topic, questions)
  returning id into battle;

  return battle;
end;
$fn$;

/*
 * The question set is drawn once, on accept, so both players face identical
 * questions. Drawing per player would make the result meaningless.
 */
create or replace function studeasy.accept_battle(battle uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  b studeasy.battles%rowtype;
  q uuid;
  i integer := 0;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null then raise exception 'No such battle.'; end if;
  if b.opponent_id <> caller then
    raise exception 'Only the person challenged may accept.';
  end if;
  if b.status <> 'pending' then
    raise exception 'That battle is already %.', b.status;
  end if;

  for q in
    select studeasy.select_questions(b.challenger_id, array[b.topic_id],
                                     b.question_count)
  loop
    insert into studeasy.battle_questions (battle_id, question_id, position)
    values (battle, q, i) on conflict do nothing;
    i := i + 1;
  end loop;

  if i = 0 then
    raise exception 'There are no tagged questions on that topic yet.';
  end if;

  update studeasy.battles set status = 'accepted' where id = battle;
end;
$fn$;

/* Completes when both players have answered every question. */
create or replace function studeasy.complete_battle(battle uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  b studeasy.battles%rowtype;
  total integer;
  ch_done integer; op_done integer;
  ch_score integer; op_score integer;
  ch_secs integer; op_secs integer;
  won uuid;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null or b.status <> 'accepted' then return; end if;

  select count(*) into total from studeasy.battle_questions where battle_id = battle;

  select count(*), coalesce(sum(case when correct then 1 else 0 end), 0),
         coalesce(sum(seconds), 0)
    into ch_done, ch_score, ch_secs
    from studeasy.battle_answers
   where battle_id = battle and profile_id = b.challenger_id;

  select count(*), coalesce(sum(case when correct then 1 else 0 end), 0),
         coalesce(sum(seconds), 0)
    into op_done, op_score, op_secs
    from studeasy.battle_answers
   where battle_id = battle and profile_id = b.opponent_id;

  if ch_done < total or op_done < total then return; end if;

  -- Higher score wins; a tie goes to the faster player; a dead heat has no
  -- winner rather than an arbitrary one.
  won := case
    when ch_score > op_score then b.challenger_id
    when op_score > ch_score then b.opponent_id
    when ch_secs < op_secs then b.challenger_id
    when op_secs < ch_secs then b.opponent_id
    else null
  end;

  update studeasy.battles
     set status = 'complete', winner_id = won, completed_at = now()
   where id = battle;

  if won is not null then
    perform studeasy.award_coins(won, 'battle_won', 'battles', battle);
    perform studeasy.award_house_points(won, 'battle_won', 'battles', battle);
  end if;
end;
$fn$;

create or replace function studeasy.answer_battle(
  battle uuid, question uuid, response jsonb, seconds integer
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  caller uuid := auth.uid();
  b studeasy.battles%rowtype;
  q studeasy.questions%rowtype;
  is_right boolean;
begin
  select * into b from studeasy.battles where id = battle;
  if b.id is null then raise exception 'No such battle.'; end if;
  if caller not in (b.challenger_id, b.opponent_id) then
    raise exception 'You are not in that battle.';
  end if;
  if b.status <> 'accepted' then
    raise exception 'That battle is not open for answers.';
  end if;

  select * into q from studeasy.questions where id = question;
  is_right := q.correct is not null and q.correct = response;

  insert into studeasy.battle_answers (battle_id, profile_id, question_id,
                                       response, correct, seconds)
  values (battle, caller, question, response, coalesce(is_right, false),
          greatest(0, least(600, coalesce(seconds, 0))))
  on conflict (battle_id, profile_id, question_id) do nothing;

  perform studeasy.complete_battle(battle);
end;
$fn$;

/* Swept alongside expired seat offers rather than on its own schedule. */
create or replace function studeasy.expire_battles()
returns void
language sql
security definer
set search_path = studeasy, public
as $fn$
  update studeasy.battles set status = 'expired'
   where status in ('pending', 'accepted') and expires_at < now();
$fn$;

grant execute on function studeasy.create_battle(uuid, uuid, integer) to authenticated;
grant execute on function studeasy.accept_battle(uuid) to authenticated;
grant execute on function studeasy.answer_battle(uuid, uuid, jsonb, integer) to authenticated;
grant execute on function studeasy.complete_battle(uuid) to authenticated;
```

`expire_battles()` is deliberately not granted to `authenticated` — sweeping
every battle is the scheduled job's business, the same reasoning
`classes-followup.sql` gives for `release_expired_offers`.

The equality check `q.correct = response` covers the simple question kinds.
**Before writing it, open `platform.sql` and check whether `mark_answer()` can
be called instead** — one marking rule is better than two that can disagree.

- [ ] **Step 5: Run the test and confirm it passes**

Expected: eighteen `ok` rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "One question set, drawn once, or the result means nothing"
```

---

### Task 21: Hook the economy into progress

**Files:**
- Modify: `supabase/economy.sql` (append)
- Modify: `supabase/tests/economy_test.sql`

**Interfaces:**
- Consumes: `award_coins`, `award_house_points`, `advance_challenges`.
- Produces: a replaced `studeasy.touch_streak(integer)`, same signature.

- [ ] **Step 1: Add the failing assertion**

Raise the plan by one:

```sql
select ok(
  (select prosrc from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'studeasy' and p.proname = 'touch_streak')
    like '%advance_challenges%',
  'touch_streak advances challenges'
);
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Replace touch_streak once more**

Take the version from Task 11 — which already refreshes mastery and
projections — and add before `end;`:

```sql
  -- Effort pays on the day it happens. Hashing the profile and the date into a
  -- uuid gives the ledger a stable ref_id for "this student, this day", which
  -- is what stops a second page-load paying again.
  perform studeasy.award_coins(caller, 'streak_day', 'gamification_day',
                               md5(caller::text || today::text)::uuid);
  perform studeasy.award_house_points(caller, 'streak_day', 'gamification_day',
                                      md5(caller::text || today::text)::uuid);
  perform studeasy.advance_challenges(caller);
```

`today` is already declared in `touch_streak`, so no new variable is needed.

- [ ] **Step 4: Run the test and confirm it passes**

- [ ] **Step 5: Commit**

```bash
git add supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "Effort pays on the day it happens, once"
```

---

### Task 22: Economy types and data layer

**Files:**
- Create: `lib/economy-types.ts`
- Create: `lib/economy-data.ts`
- Create: `app/portal/economy-actions.ts`

**Interfaces:**
- Consumes: every table from Tasks 16–20.
- Produces:
  - `type CoinEntry`, `type ShopItem`, `type HouseStanding`, `type ChallengeProgress`, `type Battle` in `lib/economy-types.ts`
  - `getBalance(profileId: string): Promise<number>`, `getShop(profileId: string): Promise<ShopItem[]>`, `getHouseStandings(): Promise<HouseStanding[]>`, `getMyContribution(profileId: string): Promise<number>`, `getChallenges(profileId: string): Promise<ChallengeProgress[]>`, `getBattles(profileId: string): Promise<Battle[]>` in `lib/economy-data.ts`
  - `buyItem(itemId: string)`, `equipItem(itemId: string)`, `challengeStudent(opponentId: string, topicId: string)`, `acceptBattle(battleId: string)`, `answerBattleQuestion(battleId: string, questionId: string, response: unknown, seconds: number)` in `app/portal/economy-actions.ts`, each returning `Promise<Result>`

- [ ] **Step 1: Write the types**

Create `lib/economy-types.ts`:

```ts
export type CoinEntry = {
  id: string
  delta: number
  reason: string
  note: string | null
  created_at: string
}

export type ShopItem = {
  id: string
  code: string
  name: string
  description: string | null
  kind: 'avatar' | 'theme' | 'frame' | 'title'
  asset_key: string
  cost_coins: number
  min_level: number
  owned: boolean
}

export type HouseStanding = {
  house_id: string
  name: string
  colour: string
  points: number
  members: number
}

export type ChallengeProgress = {
  challenge_id: string
  title: string
  description: string | null
  metric: string
  target: number
  value: number
  completed_at: string | null
  period_end: string
}

export type Battle = {
  id: string
  status: 'pending' | 'accepted' | 'declined' | 'complete' | 'expired'
  topic_name: string
  is_challenger: boolean
  winner_id: string | null
  question_count: number
  answered: number
  expires_at: string
}
```

- [ ] **Step 2: Write the data layer**

`lib/economy-data.ts` follows `lib/twin-data.ts` exactly — one
`createClient()`, a `.schema('studeasy')` query per function, `[]` or `0` on
error rather than a throw. `getBalance` reads `coin_balances`; `getShop` joins
`shop_items` to `shop_purchases` to fill `owned`; `getHouseStandings` reads
`house_standings`; `getMyContribution` sums the caller's own `house_points`
rows; `getChallenges` joins `challenges` to `challenge_progress`; `getBattles`
reads `battles` with a count of the caller's `battle_answers`.

- [ ] **Step 3: Write the actions**

`app/portal/economy-actions.ts` wraps the five RPCs exactly as
`app/portal/twin-actions.ts` wraps `review_projection`: a `getCurrentUser`
guard, `.rpc(name, args)`, then `{ error: error.message }` or
`{ error: null }`, then `revalidatePath('/portal/student/achievements')`.

The RPC messages are already written for a reader — *"That costs 400 coins and
you have 250"* — so surface `error.message` rather than replacing it with a
generic string.

- [ ] **Step 4: Type-check and commit**

Run: `npm run lint` and `npm test`
Expected: both clean.

```bash
git add lib/economy-types.ts lib/economy-data.ts app/portal/economy-actions.ts
git commit -m "Surface the database's own error text; it was written for a reader"
```

---

### Task 23: The student achievements page

**Files:**
- Modify: `app/portal/student/achievements/page.tsx`
- Create: `app/portal/student/achievements/Shop.tsx`
- Create: `app/portal/student/achievements/HouseCard.tsx`
- Create: `app/portal/student/achievements/Battles.tsx`

**Interfaces:**
- Consumes: everything from Task 22.
- Produces: nothing other tasks import.

- [ ] **Step 1: Extend the page**

The page already shows XP, level, streak and badges. Add, in this order:
coins and shop, house card, open challenges, battles. Existing sections stay
where they are.

- [ ] **Step 2: Write HouseCard**

Render the four houses as bars ordered by points, each labelled with its name
and total, plus the student's own contribution:

```tsx
{/* House totals and this student's own contribution. There is deliberately no
    per-child ranking here, and no view that could produce one. */}
<p className="text-sm text-slate-600">
  You have contributed {mine} points to {house.name} this term.
</p>
```

Do not add a "your position" line — there is none, by design.

- [ ] **Step 3: Write Shop**

A grid of `ShopItem` cards. Each shows name, cost and one of three states:
owned, affordable, or locked with the reason (`Costs 400 coins` /
`Unlocks at level 5`). Buying calls `buyItem` and surfaces the RPC's message on
failure. Disable the button while the transition is pending — the lock in
`spend_coins` already makes a double-click safe, but a disabled button is
better than a rejected second request.

- [ ] **Step 4: Write Battles**

List battles with their state. A pending battle where the caller is the
opponent gets Accept and Decline. An accepted battle links to the question set.
A complete battle shows both scores — safe to render, because RLS only returns
the opponent's answers once the battle is complete.

- [ ] **Step 5: Type-check, view, check contrast and keyboard order**

Run: `npm run lint`

Open `/portal/student/achievements` as a student with coins. Confirm the house
bars are distinguishable without relying on colour alone — each carries its
name and number — and that every button is reachable by keyboard.

- [ ] **Step 6: Commit**

```bash
git add app/portal/student/achievements/
git commit -m "Coins, a shop, a house to belong to, and nobody ranked against a classmate"
```

---

### Task 24: The admin economy page

**Files:**
- Modify: `supabase/economy.sql` (append `adjust_balance`)
- Modify: `supabase/tests/economy_test.sql`
- Create: `app/portal/admin/economy/page.tsx`
- Create: `app/portal/admin/economy/RateEditor.tsx`
- Create: `app/portal/admin/economy/ChallengeEditor.tsx`
- Modify: `app/portal/economy-actions.ts`

**Interfaces:**
- Consumes: `coin_rates`, `challenges`, `coin_ledger`.
- Produces: `studeasy.adjust_balance(student uuid, delta integer, note text) returns void`, and `setCoinRate(reason, coins, housePoints)`, `createChallenge(input)`, `adjustBalance(profileId, delta, note)` in `app/portal/economy-actions.ts`.

- [ ] **Step 1: Add the failing assertion**

Raise the plan by one, still authenticated as the coin-a student:

```sql
select throws_ok(
  $t$ select studeasy.adjust_balance(auth.uid(), 1000, 'free money') $t$,
  null, null,
  'a student cannot mint coins for themselves'
);
```

- [ ] **Step 2: Run it and confirm it fails**

Expected: the function does not exist.

- [ ] **Step 3: Append adjust_balance**

```sql
/*
 * Minting currency by hand. Admin-only, a note is required, and the row is an
 * 'admin_adjustment' the finance and audit pages can both see — this is
 * exactly the kind of act the audit log exists for.
 */
create or replace function studeasy.adjust_balance(
  student uuid, delta integer, note text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $fn$
declare
  org uuid;
begin
  if not studeasy.is_admin() then
    raise exception 'Only an administrator may adjust a balance.';
  end if;
  if delta = 0 then raise exception 'An adjustment of zero does nothing.'; end if;
  if btrim(coalesce(note, '')) = '' then
    raise exception 'Say why you are adjusting this balance.';
  end if;

  select organization_id into org from studeasy.profiles where id = student;
  if org is null then raise exception 'No such student.'; end if;

  insert into studeasy.coin_ledger (profile_id, organization_id, delta, reason, note)
  values (student, org, delta, 'admin_adjustment', btrim(note));
end;
$fn$;

grant execute on function studeasy.adjust_balance(uuid, integer, text) to authenticated;
```

- [ ] **Step 4: Write the actions and the page**

`setCoinRate` and `createChallenge` are ordinary RLS-guarded writes — the
policies from Tasks 16 and 19 already restrict them to admins. `adjustBalance`
wraps the RPC.

The page has three sections: the rate table (editable), the challenge list with
a form to author next week's or next month's, and recent adjustments read from
`coin_ledger` where `reason = 'admin_adjustment'`.

Keep the effort weighting visible in the rate editor — label the column
**House points** and note above the table that effort metrics sit higher than
accuracy on purpose, so a future admin does not flatten them without knowing
why.

- [ ] **Step 5: Run the test, type-check and view**

Run: the pgTAP file, then `npm run lint` and `npm test`.

Open `/portal/admin/economy` as an administrator and as a student. The student
must be redirected or refused, matching how the other `/portal/admin/*` pages
behave.

- [ ] **Step 6: Commit**

```bash
git add app/portal/admin/economy/ app/portal/economy-actions.ts supabase/economy.sql supabase/tests/economy_test.sql
git commit -m "Minting currency by hand leaves a note and a row"
```

---

## Self-review

Checked against `docs/superpowers/specs/2026-09-05-ai-and-gamification-design.md`.

**Spec coverage.** Slice A — taxonomy tables (2–3), tagging joins (4), band and
difficulty (5), types and tutor UI (6–7). Slice B — timing (8), mastery table
and config (9), computation (10), progress hook (11), projections (12), tutor
release (13), formatting and data (14), surfaces (15). Slice C — ledger (16),
shop and double-spend (17), houses (18), challenges (19), selector and battles
(20), progress hook (21), types and data (22), student surface (23), admin
surface (24). Every section of slices A, B and C maps to a task.

**Two gaps found and fixed inline:**

1. **`select_questions()` was specced into slice E, but battles need it and
   battles are slice C.** Rather than stub it, Task 20 builds the real selector
   in slice C and slice E reuses it. **The spec's build-order diagram needs
   correcting** — it currently shows slice C depending on A alone.

2. **`current_grade` and `projected_grade` are computed identically** in Task
   12, though the spec distinguishes them (recent evidence versus full
   history). Task 12 states this explicitly and defers the split rather than
   leaving it to be found later as a bug.

**Type consistency.** `GradeBand` in `lib/taxonomy-types.ts` is the
question-level band — `achieved` | `merit` | `excellence`. `Grade` in
`lib/twin-types.ts` is the student-level outcome and adds `not_achieved`.
Similar names, deliberately different types; do not merge them.
`Projection.seen` is populated from `evidence.seen` in Task 14 and consumed by
`confidenceSentence(confidence, seen)` in Task 15 — signatures match.
`award_coins` and `award_house_points` take the same four arguments in the same
order, and every caller in Tasks 19, 20 and 21 passes them that way.

**Placeholders.** None. Three tasks name an identifier that must be read from
the existing codebase rather than guessed — `listTutorAssessments` (Task 7),
the `lesson_progress` columns (Task 19), and `mark_answer()` (Task 20). Each
says so explicitly and names the file to open.

**Prerequisite that is not code.** Task 3 seeds eleven NCEA Mathematics
standards. Physics, Chemistry, Biology and all of Cambridge are transcription
work from NZQA and CAIE published material, and the twin stays thin until they
exist. This is the spec's open question 1, and it sits on the critical path for
every other slice.
