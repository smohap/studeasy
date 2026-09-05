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
