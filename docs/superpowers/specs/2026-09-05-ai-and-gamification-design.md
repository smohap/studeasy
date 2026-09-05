# AI features (§10) and gamification (§11)

Design, 5 September 2026. Covers the eight AI features of PRD §10 and the
unbuilt two-thirds of §11, cut into seven slices that ship independently.

## Why this document exists

The README's gap list names fourteen features across two sections and stops
there. Read together they are not fourteen independent pieces of work: six of
them are statements about *topics*, and the database has no topic below
`subject`. Three of them are statements about the academy's own worksheets,
and those worksheets exist only as PDFs in a storage bucket — no extracted
text, no embeddings.

So most of this design is not about models. Two foundations have to exist
first, and once they do, most of §10 turns out to be arithmetic that can be
explained to a parent line by line — which is what §10's own guardrail asks
for anyway.

## What is already true

Worth stating plainly, because the design leans on all of it:

- **40 tables** across 21 idempotent migrations, every one org-scoped, RLS on
  everything, writes that matter routed through `SECURITY DEFINER` functions
  that check the caller. The client is not trusted anywhere.
- **`gamification`** carries `xp`, `level`, `streak_days`, `longest_streak`,
  `last_active_on`. `touch_streak(award_xp)` maintains them and is already
  called from every place progress is recorded.
- **`badges` / `badge_awards`** with a seeded catalogue and
  `evaluate_badges()` hooked inside `touch_streak()` — deliberately, so there
  are no new call sites to forget. This design copies that decision rather
  than inventing a second pattern.
- **`questions`** supports eleven kinds with a `jsonb` payload, and
  `answers` records `response`, `auto_correct`, `awarded_marks` and
  `teacher_comment` per question.
- **`help_requests` / `help_responses`** — a student asks, a tutor answers,
  one response is accepted. The README already notes this is the Homework
  Scanner's flow without the OCR.
- **Storage buckets** already exist: `content-library`, `help-uploads`,
  `assessment-uploads`, `question-images`.
- **`class_sessions`** holds `meeting_url` — a link the tutor pastes to Zoom
  or Meet. StudEasy never touches the media.

## The two missing foundations

**1. There is no topic taxonomy.** `questions` has `kind`, `marks` and
`explanation`. `courses` and `content_items` have `subject` and `year_level`,
and that is the finest grain anywhere. "Weak areas", "difficulty-matched
non-repeating question sets", "a timetable over weak topics", "subject
mastery" and "weekly challenge" are all statements about topics. Six of the
fourteen features have nothing to compute over until this exists.

**2. There is no grounded corpus.** §10's guardrail — *every AI answer must be
traceable to the academy's own curriculum and worksheets, not an ungrounded
model response* — is called the trust boundary parents are paying for. Today
the academy's material is a `file_path`. A Study Buddy built before extraction,
chunking and embeddings exist is an ungrounded model with a StudEasy logo on
it, which is precisely the failure §14's risk register names.

## Decisions taken

| Question | Decision |
| --- | --- |
| Taxonomy source | Seeded NCEA Achievement Standards and Cambridge syllabus topics as a national spine, with tutor-authored sub-topics beneath |
| Coin value | Cosmetic only. Redemptions typed from day one so real perks remain possible without reshaping the ledger |
| Leaderboards | Houses ranked; individuals never ranked against each other. House points weighted toward effort |
| AI provider | Provider-agnostic through Vercel AI Gateway, models named `provider/model`, zero data retention |
| Quiz battles | Asynchronous |
| Predictions | Student sees their own immediately; a parent sees it only after a tutor reviews |
| Lesson summary | G1 and G2 both — platform-assembled recaps now, transcript ingestion too. Recording (G3) is out of scope |
| Where the logic lives | Postgres. Tables, `SECURITY DEFINER` functions and RLS, exactly like the 21 migrations already here |

### Why the logic lives in Postgres

This is a child's academic record. A mastery figure computed in TypeScript is
one the client could be induced to compute wrongly; one computed inside a
`SECURITY DEFINER` function cannot be. The entitlement rules that decide what
a student may read are already expressed as RLS policies — restating them in
application code would mean two sources of truth for who may see whose marks,
and the second one drifting is a matter of time.

It also means every number §10 shows traces to counted rows. That is not a
proxy for the guardrail; it *is* the guardrail, for the six features that
never call a model at all.

Application code calls RPCs and renders. Model calls live in one server-only
module that Study Buddy, the Scanner and the lesson summariser use, and
nothing else touches.

## Deviations from the PRD, stated rather than smuggled

1. **"Learning style" is dropped.** §10 asks the Learning Twin to output a
   learning style. Visual/auditory/kinaesthetic styles have no supporting
   evidence, and inferring one from click data would attach an invented label
   to a child that then follows them. Replaced with something observable:
   which question formats they measurably score better on.

2. **"Monthly champion" becomes the champion house.** Individuals are never
   ranked, per the leaderboard decision. Students also get a private
   comparison against their own best month.

3. **Misconception tags are scoped to topic plus grade band**, not a catalogue
   of named misconceptions. Naming a child's specific misconception from one
   photograph is a confident claim on thin evidence, and a wrong one is worse
   than none.

4. **The Tutor AI Assistant becomes a pre-lesson briefing** rather than
   in-session suggestions, because there is no live audio to derive session
   context from — and because the twin already knows which registered students
   are weak at the session's topics, which is better input than a transcript.

5. **Two pieces of marketing copy are ahead of the software** and must move
   before launch: `components/Hero.tsx` sells an "AI Learning Twin", and
   `components/Features.tsx:31` promises "recorded and searchable lessons".
   Slice B makes the first true. Nothing here makes the second true; that
   sentence needs rewriting.

---

# Slice A — Topic taxonomy

New migration: `supabase/taxonomy.sql`. Nothing else in this design works
without it.

## Shape

A three-level tree. Curricula hold levels; levels hold standards; standards
hold tutor-authored sub-topics.

```
studeasy.curricula
  id uuid pk, code text unique ('ncea' | 'cambridge'), name text, sort int

studeasy.curriculum_levels
  id uuid pk, curriculum_id fk, code text, name text, sort int
  unique (curriculum_id, code)
  -- NCEA Level 1/2/3; Cambridge IGCSE / AS / A2

studeasy.topics
  id uuid pk
  curriculum_id fk not null
  level_id fk not null
  parent_id uuid null references studeasy.topics (id) on delete cascade
  organization_id uuid null references studeasy.organizations (id) on delete cascade
  subject text not null          -- matches courses.subject
  code text                      -- 'AS91027', '0580.2.4'; null for sub-topics
  name text not null
  credits integer                -- NCEA credits; null for Cambridge and sub-topics
  sort integer not null default 0
  active boolean not null default true
  created_at timestamptz not null default now()
```

## The two rules that matter

**A seeded standard is not an organization's property.** `organization_id` is
null on every seeded row. AS91027 is a national standard; two academies must
not hold divergent copies of it, and a white-labelled second org gets the same
spine rather than a fork of it. Sub-topics *are* org-scoped.

Enforced by check constraint:

```sql
check (
  (organization_id is null and parent_id is null and code is not null)
  or
  (organization_id is not null and parent_id is not null)
)
```

An org therefore cannot create a root-level topic — which would be inventing a
national standard — and cannot orphan a sub-topic.

**Seeded rows are immutable outside migrations.** RLS grants
`select` on `topics` to `authenticated` and to `anon` (public subject pages
read it). Insert, update and delete are permitted only where
`organization_id = current_org()` and the caller is a tutor or admin. The
seeded rows match no write policy, so nothing at runtime can edit them.

## Seeding

`studeasy.seed_taxonomy()` follows the `seed_badges()` pattern: a `SECURITY
DEFINER` function, not granted to `authenticated`, called by the migration and
idempotent on `(curriculum_id, level_id, code)`.

The seed covers the subjects StudEasy actually teaches — NCEA Levels 1–3 for
Mathematics, Physics, Chemistry and Biology, and the Cambridge IGCSE/AS/A2
equivalents. This is real content work, not a code task: the standards and
their credit values must be transcribed from NZQA and CAIE published
material. Budget it as such.

## Tagging

Many-to-many throughout, because one question genuinely exercises two topics:

```
studeasy.question_topics (question_id fk, topic_id fk, primary key (question_id, topic_id))
studeasy.lesson_topics   (lesson_id fk, topic_id fk, primary key (lesson_id, topic_id))
studeasy.content_topics  (content_item_id fk, topic_id fk, primary key (content_item_id, topic_id))
```

RLS on each mirrors the parent row's policy — if you may edit the question,
you may tag it.

## Two new columns on `questions`

```sql
alter table studeasy.questions
  add column if not exists difficulty smallint
    check (difficulty is null or difficulty between 1 and 5),
  add column if not exists grade_band text
    check (grade_band is null or grade_band in ('achieved', 'merit', 'excellence'));
```

`grade_band` is load-bearing and deserves the explanation. **NCEA does not
grade a percentage; it grades the level of question you can do.** A student
who answers every Achieved-band question correctly and no Merit ones is
Achieved — not "83%". Recording the band per question is the whole reason
Predictive Marks can state a grade a family recognises instead of a number we
invented. Cambridge maps its own grades onto the same three bands for this
purpose.

## Untagged is not broken

A question with no topic contributes nothing to mastery and is silently
excluded from the twin — it is not an error, and it does not block anything.
The tutor tagging page shows coverage per assessment so the gap is visible.
This is the posture the README already takes about unrun migrations: say what
is missing rather than fail.

## UI

`/portal/tutor/topics` — browse the spine, add sub-topics, and tag questions
across a whole assessment in one pass with band and difficulty set inline.
Bulk tagging matters: tagging eleven question types one at a time is how a
taxonomy ends up half-populated and useless.

---

# Slice B — Learning Twin and Predictive Marks

New migration: `supabase/learning-twin.sql`. Depends on A.

## `topic_mastery`

One row per student per topic, maintained rather than derived on read.

```
studeasy.topic_mastery
  profile_id fk, topic_id fk, primary key (profile_id, topic_id)
  organization_id fk not null
  seen_count int not null default 0
  correct_count int not null default 0
  marks_awarded int not null default 0
  marks_available int not null default 0
  achieved_seen int, achieved_correct int
  merit_seen int, merit_correct int
  excellence_seen int, excellence_correct int
  median_seconds int
  blank_rate numeric              -- unattempted / seen, by band
  mastery numeric not null default 0     -- 0..1, shrunk and decayed
  last_seen_at timestamptz
  updated_at timestamptz not null default now()
```

## Mastery is shrunk, not raw

```
mastery = (weighted_correct + a * prior) / (weighted_seen + a)
  where a = 3, prior = 0.5
```

A student who answered their only question correctly is not "100% mastered",
and a twin that believes otherwise sends the Revision Planner to the wrong
topics and tells a parent a projected grade built on one data point. The
shrinkage constant is deliberately small — three phantom half-marks — so it
stops mattering once real evidence accumulates.

Evidence decays on a 60-day half-life, applied at recompute:
`weight = 0.5 ^ (age_days / 60)`. A mistake from last term should not hold a
student down after they have learned the thing.

Both constants live in one `studeasy.twin_config` row rather than scattered
through function bodies, so they can be tuned without a migration rewrite.

## Speed needs a column that does not exist

`attempts` gives whole-paper duration. There is no per-question timing
anywhere, and §10 asks for time-on-task. This is a prerequisite, not a
follow-up:

```sql
alter table studeasy.answers
  add column if not exists seconds_spent integer
    check (seconds_spent is null or seconds_spent >= 0);
```

Written by `app/assess/[id]/TakePaper.tsx` as the student moves between
questions. It is advisory client data — a student can leave the tab open — so
`median_seconds` uses the median rather than the mean, and values above a
sane ceiling are clamped before they reach the aggregate.

## Confidence, without a model

Two observable signals, both already recorded:

- **Variance** of correctness within a topic. Consistent success reads as
  confidence; alternating success and failure does not.
- **Blank rate at the higher bands.** `answers.response` is null when a
  question was not attempted. A student who leaves Merit questions blank
  rather than getting them wrong is telling you something a mark cannot.

Reported as a three-value band (low / building / solid), never a number, since
neither signal supports more precision than that.

## In place of "learning style"

Format strength: comparing mastery across `questions.kind` groups for the same
student — do they do better on numerical work than on essays, on diagrams than
on prose? Reported only where the sample supports it, and phrased as an
observation about performance rather than a claim about how the child learns.

## `standard_projections`

Root standards only — a sub-topic has no grade.

```
studeasy.standard_projections
  profile_id fk, topic_id fk, primary key (profile_id, topic_id)
  organization_id fk not null
  current_grade text check in ('not_achieved','achieved','merit','excellence')
  projected_grade text check in (same)
  confidence text check in ('low','moderate','high')
  evidence jsonb not null          -- per-band counts, so the grade can be explained
  levers jsonb not null            -- lowest-mastery sub-topics at the next band up
  computed_at timestamptz not null default now()
  tutor_reviewed_by uuid references studeasy.profiles (id)
  tutor_reviewed_at timestamptz
  tutor_note text
  released_to_parent boolean not null default false
```

**Method, stated so it can be argued with:** for each standard, the projection
is the highest band where shrunk mastery clears 0.6 across at least five seen
questions at that band. `current_grade` uses only evidence from the last 30
days; `projected_grade` uses the full decayed history plus the trend. There is
no model in this, and `evidence` holds the counts, so any figure shown can be
opened up rather than asserted.

Confidence is `low` below five seen at the projected band, `moderate` below
twelve or where the newest evidence is over 30 days old, `high` otherwise. A
`low` projection is shown with its band, never as a bare grade.

## Who sees what

- **Student**: their own row, always, with confidence and levers.
- **Parent**: their linked child's row only where `released_to_parent`.
- **Tutor**: students they teach, via the existing relationship.
- **Admin**: all, within the org.

`released_to_parent` is flipped by exactly one thing:

```sql
studeasy.review_projection(student uuid, topic uuid, note text, release boolean)
```

`SECURITY DEFINER`, rejects a caller who is not an approved tutor teaching
that student, stamps `tutor_reviewed_by` / `_at`, and attaches the note. This
is the PRD's own "AI-drafted, tutor-reviewed" rule applied to the one number
most likely to upset a family if it arrives unexplained.

Recomputation clears `released_to_parent` when the projected grade *falls*, so
a worse grade never reaches a parent without a tutor seeing it first. A rise
keeps the release.

## Refresh

```sql
studeasy.refresh_topic_mastery(student uuid default auth.uid())
studeasy.refresh_projections(student uuid default auth.uid())
```

Both `SECURITY DEFINER`. Called from the marking-release path
(`release_attempt`) and from `touch_streak()`, following the reasoning
`badges.sql` already wrote down: hook into the function that already runs on
every piece of progress, so there are no new call sites to forget.

Recompute is per student and bounded by their own answer history, so it stays
cheap. A nightly sweep re-decays rows untouched for a week, since decay is a
function of time rather than of activity.

## Surfaces

- `/portal/student/progress` — mastery by topic, strengths and weak areas,
  format strength, projections with levers.
- `/portal/parent` — released projections only, with the tutor's note.
- `/portal/tutor/students/[id]` — the twin, plus the review-and-release action.

---

# Slice C — The gamification economy

New migration: `supabase/economy.sql`. Depends on A for mastery-based
challenges; the coin and house machinery depends on nothing.

## Coins are a ledger, never a balance

```
studeasy.coin_ledger
  id uuid pk
  profile_id fk not null, organization_id fk not null
  delta integer not null check (delta <> 0)
  reason text not null check (reason in (
    'assessment_passed', 'streak_day', 'challenge_completed', 'battle_won',
    'badge_awarded', 'lesson_completed', 'purchase', 'admin_adjustment'))
  ref_table text, ref_id uuid
  note text
  created_at timestamptz not null default now()

create unique index coin_ledger_once
  on studeasy.coin_ledger (profile_id, reason, ref_table, ref_id)
  where ref_id is not null;
```

Balance is `sum(delta)`, exposed as the view `coin_balances`. This is the same
posture `payouts` already takes: a truthful record of what happened rather
than a number someone updates.

The partial unique index is the idempotency guarantee — the same passed
assessment cannot pay twice however many times the awarding path runs, which
matters because that path is hooked into `touch_streak()` and will run often.

### Spending, and the double-spend

```sql
studeasy.spend_coins(item uuid) returns uuid   -- SECURITY DEFINER
```

The failure mode is two shop clicks half a second apart both reading the old
balance and both succeeding. Guarded by taking a row lock on the spender
before reading:

```sql
perform 1 from studeasy.gamification
  where profile_id = caller for update;
```

`gamification` already has exactly one row per profile, so it serves as the
lock row without inventing one. Balance is read, the cost checked, and the
negative row inserted inside that same transaction. A trailing constraint
trigger re-checks that the balance is not negative after insert, so even a
future code path that forgets the lock cannot leave a debt behind.

Earning rates live in `studeasy.coin_rates` (org-scoped, one row per reason)
rather than as literals in function bodies, so the economy can be tuned
without a migration.

## Shop

```
studeasy.shop_items
  id, organization_id, code, name, description
  kind text check in ('avatar', 'theme', 'frame', 'title')
  asset_key text not null          -- resolves to a bundled asset, not a URL
  cost_coins int not null check (cost_coins > 0)
  min_level int not null default 1
  active bool, sort int
  unique (organization_id, code)

studeasy.shop_purchases
  id, profile_id fk, item_id fk, coins_spent int, created_at
  unique (profile_id, item_id)

studeasy.avatar_state
  profile_id pk, equipped jsonb not null default '{}'
```

Every kind is cosmetic, per the decision that coins carry no real-world value.
The `kind` check is where a future `perk` value would be added — redemptions
are already typed, so adding one is a check-constraint change and a redemption
handler, not a reshaping of the ledger.

`asset_key` names a bundled asset rather than storing a URL, so a shop item
can never be pointed at an arbitrary external image.

A trigger on `avatar_state` rejects equipping an item the profile has not
purchased. Without it the shop is decorative and the client decides what a
student wears.

## Houses

```
studeasy.houses
  id, organization_id, code, name, colour, sort
  unique (organization_id, code)

alter table studeasy.profiles
  add column if not exists house_id uuid references studeasy.houses (id);

studeasy.house_points
  id, house_id fk, profile_id fk, organization_id fk
  delta int not null check (delta > 0)
  reason text check in ('streak_day','questions_attempted','lesson_completed',
                        'challenge_completed','battle_won','assessment_passed')
  ref_table text, ref_id uuid, created_at
  unique index (profile_id, reason, ref_table, ref_id) where ref_id is not null
```

Assignment is balanced round-robin on a trigger over profile creation: the
house with the fewest active students wins, ties broken at random. Houses stay
even without anybody administering them, and a student cannot choose — self-
selection produces one strong house and three weak ones.

**Points accrue mainly from effort.** Per §11's own warning about discouraging
struggling students, and per the leaderboard decision: streak days, questions
attempted, lessons completed and challenges completed carry the larger
weights; `assessment_passed` carries a smaller one. A student who works
consistently can be their house's top contributor without being the best
student in it.

`house_standings` aggregates totals per house. **A student sees house totals
and their own contribution. Another child's contribution is not readable** —
RLS on `house_points` grants select on `profile_id = auth.uid()` only, and the
standings view exposes aggregates alone.

## Challenges

```
studeasy.challenges
  id, organization_id
  kind text check in ('weekly', 'monthly')
  period_start date, period_end date
  title text, description text
  metric text check in ('questions_attempted','topics_improved',
                        'lessons_completed','streak_days','battles_played')
  target int not null check (target > 0)
  coin_reward int, house_points_reward int
  subject text, topic_id uuid            -- optional narrowing
  unique (organization_id, kind, period_start)

studeasy.challenge_progress
  challenge_id fk, profile_id fk, primary key (challenge_id, profile_id)
  value int not null default 0
  completed_at timestamptz
```

Every metric is effort-shaped. `topics_improved` counts topics whose mastery
rose over the period, which rewards a struggling student for moving rather
than for arriving.

Progress advances inside `touch_streak()` along with everything else.
Completion pays coins and house points through the two ledgers, whose
idempotency indexes make a double-award impossible.

**Monthly champion is the champion house**, since individuals are never
ranked. The student separately gets a private "your best month" against their
own history — a comparison with nobody else in it.

## Quiz battles, asynchronous

```
studeasy.battles
  id, organization_id
  challenger_id fk, opponent_id fk
  topic_id fk, question_count int not null default 10
  status text check in ('pending','accepted','declined','active','complete','expired')
  expires_at timestamptz not null
  winner_id uuid, created_at, completed_at
  check (challenger_id <> opponent_id)

studeasy.battle_questions (battle_id fk, question_id fk, position int,
                           primary key (battle_id, question_id))
studeasy.battle_answers   (battle_id fk, profile_id fk, question_id fk,
                           response jsonb, correct bool, seconds int, answered_at,
                           primary key (battle_id, profile_id, question_id))
```

The question set is drawn **once, on accept**, by slice E's
`select_questions()` — so both players face identical questions and battles
reuse the practice selector rather than growing a second one.

Winner is the higher correct count, ties broken by lower total seconds, and
`expire_battles()` forfeits anything past `expires_at` on the same scheduled
sweep that already reclaims expired seat offers.

Neither player sees the other's answers until both have finished — enforced in
the RLS policy on `battle_answers`, not in the UI.

A battle does reveal one classmate's score to another. That is 1:1, both
parties opted in, and it is a different thing from a public ranking; it is
consistent with the leaderboard decision rather than an exception to it.

## Surfaces

`/portal/student/achievements` grows coins, the shop, the student's house
contribution and their battles. `/portal/admin/economy` lets an admin tune
rates, author challenges and adjust a balance with a required note — which
lands as an `admin_adjustment` ledger row and an `audit_log` entry, since
minting currency is exactly the kind of act the audit log exists for.

---

# Slice D — Grounded corpus and Study Buddy

New migration: `supabase/corpus.sql`. New module: `lib/ai/`. The first slice
that calls a model.

## The corpus

```sql
create extension if not exists vector;
```

```
studeasy.doc_chunks
  id uuid pk
  organization_id fk not null
  source_table text not null check in ('content_items', 'lessons', 'corrections')
  source_id uuid not null
  chunk_index int not null
  text text not null
  token_count int not null
  embedding vector(1536) not null
  subject text, year_level text          -- denormalised for filtering
  topic_ids uuid[] not null default '{}'
  created_at timestamptz not null default now()
  unique (source_table, source_id, chunk_index)

create index doc_chunks_embedding
  on studeasy.doc_chunks using hnsw (embedding vector_cosine_ops);

studeasy.ingest_jobs
  id uuid pk, source_table text, source_id uuid
  status text check in ('queued','running','done','failed')
  error text, attempts int not null default 0
  created_at, updated_at
  unique (source_table, source_id)
```

## Ingestion

Queued when a `content_item` is published or a `lesson` is saved, drained by a
Vercel function. Text extraction by kind: PDF and DOCX parsed server-side,
`content_type = 'text'` lessons taken directly, `external_url` and video items
skipped with a recorded reason rather than a silent absence.

Chunking is ~500 tokens with ~50 tokens of overlap, split on headings and
paragraph boundaries first so a chunk rarely cuts a worked example in half.

A failed extraction leaves a `failed` job with its error, and the tutor's
library page shows the item as **"not yet indexed"**. An un-ingested worksheet
is invisible to Study Buddy rather than half-present — consistent with the
README's rule that a missing piece says what is missing rather than erroring.

## Retrieval must respect entitlement

**This is the most important rule in the slice.** A student may retrieve only
from chunks whose source they can already read: published free items, items
they purchased, lessons in courses they are enrolled in, class materials for
classes they registered for. Get this wrong and Study Buddy quotes a paid
worksheet to somebody who never bought it — a paywall bypass wearing a chat
interface, and one nobody would notice until revenue moved.

```sql
studeasy.retrieve_chunks(query_embedding vector, k int default 8,
                         subject text default null, topics uuid[] default null)
```

`SECURITY DEFINER`, because `doc_chunks` itself is not directly readable. It
joins the **same entitlement predicates the existing RLS policies use** —
`content_purchases`, `enrolments`, `class_registrations` — rather than
restating them, so a change to who may read a worksheet cannot leave retrieval
behind.

## The answer contract

1. Embed the question. Retrieve top-k entitled chunks.
2. **If nothing clears the similarity floor, refuse**: *"I could not find this
   in your StudEasy materials — ask your tutor."* Never fall through to the
   model's own knowledge. This refusal *is* §10's guardrail; everything else
   in the slice is decoration on top of it.
3. Answer from the retrieved text only, and **cite every chunk used**, linked
   to its source item so a parent can click through and check.
4. Retrieved text reaches the model as data, never as instructions. A
   worksheet is a document. A student-uploaded photo (slice F) is genuinely
   untrusted input, and the same rule covers both.

```
studeasy.buddy_conversations
  id, profile_id fk, organization_id fk, title text, created_at

studeasy.buddy_messages
  id, conversation_id fk
  role text check in ('user', 'assistant')
  content text not null
  citations jsonb not null default '[]'      -- chunk ids and source refs
  model text, latency_ms int, refused boolean not null default false
  flagged_by uuid, flag_reason text
  tutor_correction text, corrected_by uuid, corrected_at timestamptz
  created_at
```

RLS: a student reads their own conversations; a tutor reads a conversation
only when it has been flagged, so the queue is reviewable without a tutor
browsing children's private questions at will.

## Flag-and-correct, which resolves a real conflict in the PRD

§14 wants tutor corrections "feeding back into the model". §12 forbids
training on student data. Both hold if the feedback is **retrieval-side, not
training-side**: a tutor flags an answer and writes the correction, the
student sees it, and the correction is embedded as a `corrections` chunk that
outranks the worksheet on the next similar question.

The system gets better every time a tutor corrects it, and nothing ever trains
on a child's data.

## Model access

One server-only module, `lib/ai/gateway.ts`, wrapping the Vercel AI Gateway.
Models are `provider/model` strings in config, never hardcoded at call sites.
`AI_GATEWAY_API_KEY` is server-only and must never carry a `NEXT_PUBLIC_`
prefix — the same rule `.env.example` already states for the Stripe and
service-role keys.

Zero data retention is asserted at the gateway and recorded in the privacy
note. Responses stream, to hold §12's under-eight-second line for a single
question.

Per-student daily message caps and a per-org monthly spend ceiling live in
`ai_usage`, checked before the call rather than discovered on the invoice.

---

# Slice E — Smart Question Bank and Revision Planner

New migration: `supabase/practice.sql`. Depends on A and B. No model anywhere
in it.

## The selector

```sql
studeasy.select_questions(student uuid, topics uuid[], count int,
                          band text default null) returns setof uuid
```

Rules, in order:

- Exclude questions the student answered correctly within the cooldown
  (default 21 days) — "non-repeating" in §10's sense.
- Target the band just above current mastery, where a student succeeds around
  70% of the time. That is where practice actually moves someone; a set they
  ace teaches nothing and a set they fail discourages.
- Spread across weak topics rather than drilling the single weakest, so a
  session does not become twenty questions on one thing.
- Fall back to re-including older correct answers when the pool is exhausted,
  oldest first, rather than returning fewer questions than asked for.

Called by practice sessions, by quiz battles, and by the Scanner's "next
questions". One selector, three consumers.

## Practice sessions

```
studeasy.practice_sessions
  id, profile_id fk, organization_id fk
  topic_ids uuid[], band text
  started_at, completed_at, correct_count int, question_count int

studeasy.practice_answers
  session_id fk, question_id fk, primary key (session_id, question_id)
  response jsonb, correct bool, seconds int, answered_at
```

Deliberately **not** `assessments`. An assessment carries a price, a delivery
mode, an opening and closing time, a marking queue and a certificate path,
none of which a practice set should inherit — and reusing it would mean every
query about real assessments learning to exclude practice ones.

Practice feeds `topic_mastery` like anything else, and pays coins and house
points through the effort metrics.

## Revision Planner

```
studeasy.exam_dates
  id, profile_id fk, subject text, topic_id uuid, title text, sits_on date

studeasy.revision_plans
  id, profile_id fk, from_date date, to_date date
  hours_per_weekday jsonb not null      -- {"mon": 1.5, "tue": 0, ...}
  status text check in ('active', 'superseded')
  created_at

studeasy.revision_sessions
  id, plan_id fk, on_date date, minutes int, topic_id fk
  reason text not null                  -- why this topic, on this day
  status text check in ('planned', 'done', 'skipped')
```

Topics are ranked by `(1 − mastery) × credits × urgency`, where urgency rises
as the exam approaches, then packed into the hours the student actually
declared. Spacing forbids the same topic on consecutive days — spaced
repetition is the entire point, and a planner that blocks out six hours of one
topic on Sunday is a planner nobody follows.

`reason` is stored per session, not computed for display, so the plan can
always explain itself: *"AS91027 at Merit — mastery 0.41, 12 credits, exam in
nine days."*

Replanning is a new `revision_plans` row with the old one marked `superseded`,
triggered when mastery moves materially or sessions are skipped. Plans are
never edited in place, so a student can see what changed and why.

---

# Slice F — Homework Scanner

Extends `supabase/content-and-help.sql`; new migration `supabase/scanner.sql`.
Depends on A, D and E.

## It extends `help_requests` rather than sitting beside it

The README already observes that the help-request queue is the Scanner's flow
without the OCR, and `help-uploads` is already the right bucket. Building a
parallel system would give tutors two inboxes and students two places to ask.

```sql
alter table studeasy.help_requests
  add column if not exists file_kind text
    check (file_kind is null or file_kind in ('document', 'photo')),
  add column if not exists transcription text,
  add column if not exists transcribed_at timestamptz,
  add column if not exists ai_draft jsonb,
  add column if not exists ai_drafted_at timestamptz,
  add column if not exists question_id uuid references studeasy.questions (id);

alter table studeasy.help_responses
  add column if not exists source text not null default 'tutor'
    check (source in ('tutor', 'ai_draft'));
```

## The flow

1. Student photographs handwritten work and opens a help request against it,
   optionally naming the question it answers.
2. A vision model transcribes it to text and structure. The transcription is
   stored beside the image, never in place of it — a tutor must be able to see
   what the student actually wrote when the transcription is wrong.
3. `ai_draft` holds proposed marking, hints and the topics the work exercises.
   It is **a draft**: it is not a mark, it does not touch `answers`,
   `attempts` or `topic_mastery`, and the student is not shown a grade from it.
4. A tutor reviews, edits and posts — at which point it becomes an ordinary
   `help_responses` row with `source = 'ai_draft'`, and the existing accept
   flow works unchanged.
5. Next questions come from `select_questions()` against the topics the draft
   identified.

Keeping the draft out of the marking tables is the whole safety argument: a
misread digit produces a suggestion a tutor discards, never a mark against a
child that somebody has to notice and reverse.

## Misconception tags

Scoped to **topic plus the grade band the error sits at** — not a catalogue of
named misconceptions. Naming a child's specific misconception from one
photograph is a confident claim on thin evidence, and a wrong one that follows
them into a report is worse than no tag at all.

## Privacy

A photograph of a child's handwriting is a minor's personal data. The image
stays in the private `help-uploads` bucket under the existing policies, is
visible to the student, their linked parent, tutors handling the request and
admins, and to nobody else. It is sent to the vision model under the same
zero-retention terms as everything else in slice D, and never used for
training. The prompt-injection rule from slice D applies with force here: text
extracted from a student-supplied image is data, never instructions.

---

# Slice G — Lesson summary and tutor briefing

New migration: `supabase/lesson-recaps.sql`. Depends on A, B and D.

## What is actually there

`class_sessions.topics` is free text written *before* a class saying what will
be covered. `class_registrations.attendance` records present/late/absent.
`class_materials` holds what was handed out. Lesson notes are `lessons` rows
with `content_type = 'text'`.

**There is no record of what happened in a session after it happened.** That
gap, not the absence of a model, is what blocks §10's lesson summary.
`class_sessions.meeting_url` is a link the tutor pastes to Zoom or Meet;
StudEasy never touches the media.

## G1 — the recap the platform can assemble today

```
studeasy.class_recaps
  id uuid pk
  session_id fk unique not null references studeasy.class_sessions (id)
  organization_id fk not null
  covered_topic_ids uuid[] not null default '{}'   -- tagged, not free text
  homework text
  tutor_note text                                   -- typed or dictated
  source text not null default 'tutor'
    check (source in ('tutor', 'transcript'))
  summary_md text                                   -- the generated prose
  summary_model text, generated_at timestamptz
  approved_by uuid references studeasy.profiles (id)
  approved_at timestamptz
  created_at, updated_at
```

The parent-facing summary is assembled from rows, not invented: covered
topics, attendance for *that* child, materials issued, homework set, the
tutor's note, and the topics that child got wrong in the follow-up assessment.
A model turns it into readable prose. **Every claim in it traces to a row**,
which is the same standard slice B holds itself to.

Nothing reaches a parent before `approved_by` is set — the PRD's own
"AI-drafted, tutor-reviewed" rule, and the same gate `review_projection()`
applies to grades. §10's thirty-second promise is met trivially because
nothing is being transcribed.

`covered_topic_ids` being tagged rather than free text is what lets a recap
say *"your child was absent for the two sessions covering AS91027, which is
their weakest standard"* — a sentence `class_sessions.topics` can never
support.

## G2 — transcript ingestion

Zoom, Meet and Teams already produce transcripts. The tutor uploads one (or
connects the provider later); StudEasy parses it and writes into the *same*
`class_recaps` row with `source = 'transcript'`, so everything downstream is
unchanged. That identical landing shape is the seam that makes G2 an addition
rather than a rewrite.

```
studeasy.class_transcripts
  id uuid pk
  session_id fk unique not null
  organization_id fk not null
  file_path text not null              -- private bucket 'class-transcripts'
  provider text check in ('zoom','meet','teams','manual')
  parsed_at timestamptz, error text
  speaker_map jsonb                    -- provider label -> profile_id, tutor-confirmed
  redacted boolean not null default false
  delete_after date not null           -- retention, enforced by sweep
  created_at
```

Parsing normalises to turns of `(speaker label, start, text)`. Speaker
attribution is **tutor-confirmed, never inferred**: the tutor maps provider
labels to registered students once, and an unmapped label stays unmapped
rather than being guessed onto a child.

### Consent, which has to be settled before this ships

A transcript is a verbatim record of children speaking. That is a materially
bigger privacy step than anything else in this design, and §12 puts it under
the NZ Privacy Act.

- **Consent is captured per student before any transcript may be stored** for
  a class they attended — from a parent for under-16s, from the student
  otherwise. This reuses the `share_progress_consent` pattern already in
  `profiles` rather than inventing a second consent mechanism.
- **A non-consenting student's turns are dropped at parse time**, before
  storage, and the recap notes that the transcript is partial. Storing first
  and filtering on read would mean the data was collected anyway.
- **Retention is bounded and enforced**: `delete_after` defaults to 90 days,
  org-configurable, swept by the same scheduled job that expires seat offers
  and battles. The audio itself is never uploaded — only the text the meeting
  provider already produced.
- **A transcript never enters `doc_chunks`.** The corpus is the academy's
  teaching material; a record of children talking is not teaching material,
  and Study Buddy must never be able to quote one child to another. Only the
  approved `summary_md` is shareable, and only with that class's families.

Consent state, retention and the delete sweep are each auditable through the
existing `audit_log`.

## The Tutor AI Assistant, reframed

§10 asks for in-session suggestions from "live lesson context". Without audio
there is no live context — but there is better input than a transcript would
be: the registration list, the session's tagged topics, and the twin's
knowledge of which of *those* students are weak at *those* topics, at which
band.

```sql
studeasy.session_briefing(session uuid) returns jsonb   -- SECURITY DEFINER
```

Returns, for the teacher of that session only: registered count, the
distribution of mastery across the session's topics, which students sit below
which band, and worked examples retrieved from slice D's corpus that target
the gap — under the same citation and refusal rules as Study Buddy.

*"Six registered. Four sit below Merit on AS91027; two have never attempted an
Excellence-band question in it. Three worked examples from your library target
that."*

Refreshable during the class, and more useful than a suggestion arriving
mid-sentence to a tutor with no free attention to read it. Everything shown
concerns students the tutor already teaches — the existing RLS relationship,
not a new one.

---

# Cross-cutting

## Security and privacy

- Every new table gets RLS. Nothing new is readable by `anon` except `topics`,
  which the public subject pages already need.
- Every write that matters routes through a `SECURITY DEFINER` function that
  checks the caller, as the existing 21 migrations do.
- Model calls happen only server-side. No AI key is ever `NEXT_PUBLIC_`.
- No student data trains any model (§12). The tutor-correction loop is
  retrieval-side precisely so this holds while §14's feedback requirement
  still gets met.
- Retrieved documents, transcriptions and uploaded images are data, never
  instructions.
- Minting coins, releasing a projection to a parent, approving a recap and
  deleting a transcript are all audited.

## Failure modes worth designing for

| Failure | Handling |
| --- | --- |
| Nothing retrieves for a question | Refuse and say so. Never answer ungrounded |
| Extraction fails on a worksheet | Item shows "not yet indexed"; invisible rather than half-present |
| Two shop purchases race | Row lock plus a constraint trigger; a balance cannot go negative |
| Projection falls after a bad week | Release to parent is cleared; a tutor sees it before the family does |
| Transcription misreads handwriting | Draft only; a tutor confirms before anything counts |
| A student has no tagged questions | Twin reports no evidence rather than a mastery of zero |
| Model provider outage | A, B, C and E are unaffected. Study Buddy and the Scanner degrade to the existing help queue; a recap waits for its prose and the briefing drops its worked examples |
| Gateway spend runs away | Per-student daily caps and a per-org monthly ceiling, checked before the call |

## Cost

Only slices D, F and G call a model. Embeddings are computed once per chunk
and reused; the corpus is the academy's own library, which is small and
changes slowly. Chat and vision costs scale with student activity and are
bounded by the caps above. A, B, C and E cost nothing but Postgres.

## Build order

```
A  taxonomy            no dependencies          unblocks everything below
├── B  learning twin   A                        + answers.seconds_spent
│   ├── E  practice    A, B, C's selector
│   └── G  recaps      A, B, D
├── C  economy         A                        ships in parallel with B
└── D  corpus          none                     + pgvector, AI Gateway
    └── F  scanner     A, D, E
```

**Correction, found while planning:** `select_questions()` is described under
slice E above, but quiz battles need it and battles are slice C. Rather than
stub it, **the selector is built in C and E reuses it** — E adds only the
revision planner on top. The tree reflects that.

A first, then B and C in parallel, then D, then E, then F, then G. That order
delivers all of §11 and the two non-generative P0 features before any model
contract is signed, and reaches the guardrail-sensitive slices only once there
is a corpus to ground them in.

## Open questions

1. **Seeding the taxonomy is content work, not code.** Somebody must
   transcribe NZQA achievement standards and CAIE syllabus topics with their
   credit values for the subjects StudEasy teaches. This is on the critical
   path for everything.
2. **Back-tagging the existing question bank.** Questions already written have
   no topic or band. They stay invisible to the twin until a tutor tags them,
   and the twin is thin until enough are tagged.
3. **Transcript consent wording** needs review by someone who can speak to the
   NZ Privacy Act before G2 ships.
4. **Two marketing sentences are ahead of the software** and need a decision
   before launch: `components/Hero.tsx` ("AI Learning Twin", which slice B
   makes true) and `components/Features.tsx:31` ("recorded and searchable
   lessons", which nothing here makes true).
