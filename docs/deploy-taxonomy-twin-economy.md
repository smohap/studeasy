# Deploying the taxonomy, the twin and the economy

Everything in slices A, B and C is written, reviewed, committed and — as of
7 September 2026 — **executed against a real database, with all 57 pgTAP
assertions passing**: taxonomy 17, learning twin 18, economy 22.

Getting there took eight rounds. This project has no Supabase CLI and no local
Postgres, so 2,700 lines of SQL were written and reviewed by reading alone, and
every defect reading had missed surfaced on first execution. Seven were in the
test harness. The eighth was real, and is why step 1 now carries a warning
about re-running migrations.

Work through this in order. Nothing here is destructive: every migration is
idempotent, and every test file wraps itself in `begin`/`rollback`.

## 1. Run the migrations

Supabase dashboard, SQL Editor. Paste each file whole, in this order, after the
21 that already exist:

| # | File | What it creates |
| --- | --- | --- |
| 22 | `supabase/taxonomy.sql` | `curricula`, `curriculum_levels`, `topics`, the three tagging joins, `questions.difficulty` / `grade_band`, `set_question_topics()`, and eleven seeded NCEA Mathematics standards |
| 23 | `supabase/learning-twin.sql` | `topic_mastery`, `twin_config`, `standard_projections`, `refresh_topic_mastery()`, `refresh_projections()`, `review_projection()`, `grade_rank()` |
| 24 | `supabase/economy.sql` | `coin_ledger`, `coin_rates`, `coin_balances`, the shop, houses, challenges, battles, `select_questions()`, `adjust_balance()` |

**Order is not optional.** `learning-twin.sql` reads tables `taxonomy.sql`
creates, and `economy.sql` reads both. Running `economy.sql` without
`learning-twin.sql` leaves `touch_streak()` broken at runtime on every write of
student progress.

**Re-running an earlier migration used to break a later one.** All three do
`create or replace` on `studeasy.touch_streak`, so the last file pasted won,
and re-pasting `learning-twin.sql` after `economy.sql` silently switched the
economy off — no streak coins, no house points, no challenge progress, and no
error. That is fixed: the twin now calls the economy functions behind existence
guards, so either order is safe. It is still the reason to paste them in order.

Each file is safe to re-run. If one fails partway, fix the cause and paste the
whole file again.

## 2. Install the test fixtures — once

Paste `supabase/tests/helpers.sql`. It enables the `pgtap` extension, creates a
`tests` schema, and adds the three helpers every test file uses:
`tests.authenticate_as()`, `tests.clear_auth()` and `tests.make_user()`.

Expected output: `ok 1 - authenticate_as() exists`.

## 3. Run the tests

Paste each file and read the `ok` / `not ok` rows. A `not ok` names what failed.

| File | Assertions | Proves |
| --- | --- | --- |
| `supabase/tests/taxonomy_test.sql` | 17 | An org cannot invent a national standard; a student cannot create a topic; a tutor who does not own an assessment cannot retag its questions; the grade-band constraint rejects an invalid band |
| `supabase/tests/learning-twin_test.sql` | 18 | A student sees no other student's mastery; a tutor who does not teach a student cannot release their projection; a student cannot recompute another student's twin |
| `supabase/tests/economy_test.sql` | 22 | The same event never pays twice; a balance cannot go negative; you cannot wear what you do not own; a student reads only their own balance; a battle invite cannot cross a tenant boundary |

**These are the real acceptance gate** — the first execution this SQL has ever
had.

## 4. Exposed schemas

Nothing to do. Every new object is in the `studeasy` schema, already listed
under Settings, API, Exposed schemas.

## 5. Seed what the code cannot invent

**The rest of the curriculum.** `taxonomy.sql` seeds ten NCEA Mathematics
standards for Levels 1 to 3. Physics, Chemistry, Biology and all of Cambridge
follow the same shape and are transcription work: extend
`studeasy.seed_taxonomy()` and re-run the file. Until then the twin only
understands Mathematics.

**The seed was verified against NZQA's register on 22 September 2026, and the
first version was wrong.** NCEA Level 1 was rewritten for 2024; the five Level
1 standards originally seeded (AS91026, AS91027, AS91028, AS91031, AS91037)
are expired and no longer assessed. They are replaced by AS91944–AS91947 at
five credits each, and the old codes are deactivated on re-run so any existing
tags survive. Levels 2 and 3 were correct as seeded. **Re-paste `taxonomy.sql`
after pulling this change**, and expect the four new standards in the tagging
dropdown and the five old ones gone from it.

**The shop.** `shop_items` ships with no rows, so the shop stays empty until an
admin adds items at `/portal/admin/economy`.

## 6. Tag some questions

The Learning Twin computes over tagged questions only. An untagged question is
invisible to it — not an error, just absent. Go to `/portal/tutor/topics`, pick
an assessment, and tag its questions to a standard with a grade band. Mastery
and projections appear once a student answers tagged questions.

## 7. What to check in the app

| Page | Expect |
| --- | --- |
| `/portal/tutor/topics` | Seeded standards in the dropdown; bulk-tagging updates the coverage line |
| `/portal/student/progress` | Mastery by topic, and a projected grade always beside its confidence sentence |
| `/portal/tutor/students/[id]` | The twin for a student you teach, with review-and-release |
| `/portal/parent` | Only projections a tutor has released |
| `/portal/student/achievements` | Coins, shop, house standing, challenges |
| `/portal/admin/economy` | Rates, challenges, balance adjustments; refused to non-admins |

## Known gaps

Built but unreachable, or not built at all. None of these blocks the migrations.

**Quiz battles are unreachable.** The database side is complete and tested, but
`/portal/student/battles/[id]` does not exist, so no battle can be played.
`challengeStudent()` and `answerBattleQuestion()` are exported and called from
nowhere. Needs a page.

**Time on task is not delivered.** `answers.seconds_spent` exists and
`topic_mastery.median_seconds` computes, but nothing populates the column:
`TakePaper.tsx` renders the whole paper at once, so there is no per-question
interval, and `submit_attempt()` drops the value. Left empty deliberately
rather than filled with whole-paper duration, which would display as a
per-question median and be wrong.

**Three of six coin paths are inert.** `coin_rates` seeds `assessment_passed`,
`lesson_completed` and `badge_awarded`, but nothing calls `award_coins` with
those reasons yet. In practice a student earns from streak days and challenges.

**`adjust_balance()` and `review_projection()` write no audit row.** The spec
asks for both to be audited; `audit.sql` uses a hardcoded entity list that was
not extended.

**Marking does not refresh the twin.** The spec asks for `refresh_topic_mastery`
to be called from the marking-release path as well as from `touch_streak`. Only
`touch_streak` was wired, so a tutor hand-marking an essay does not move mastery
until the student next signs in.

**`equipItem()` is never called**, so a purchased cosmetic cannot be worn.
