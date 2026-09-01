-- StudEasy — when the clock runs out, it runs out.
--
-- Run AFTER supabase/assessment-modes.sql. Safe to re-run.
--
-- The previous version left two ways for a finished attempt to stay alive:
--
--   1. A two-minute grace on submission. It was there for slow networks, but
--      two minutes is long enough to keep answering in, which is exactly what
--      "time is up" is supposed to prevent.
--   2. The sweep only ran on the nightly cron. A student whose tab was in the
--      background — where browsers stop running timers — could come back to an
--      attempt hours past its deadline and still open.
--
-- Neither was a way to gain marks: submit_attempt() has always refused past the
-- deadline. But an attempt that stays open holds up the student's next go and
-- reads as unfinished to the teacher, so it should close when it ends.

/*
 * Recreated rather than replaced: a defaulted parameter added to a zero-argument
 * function leaves the existing no-argument call ambiguous between the two.
 */
drop function if exists studeasy.close_expired_attempts();

/*
 * Closes attempts whose time is up, optionally just for one assessment.
 *
 * The nightly cron passes nothing and sweeps everything. start_attempt() passes
 * its own assessment, so the common case — a student coming back to a test they
 * left running — is settled the moment somebody looks, rather than waiting for
 * the small hours.
 */
create or replace function studeasy.close_expired_attempts(
  only_assessment uuid default null
)
returns integer
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  closed integer := 0;
  t record;
begin
  for t in
    select at.id, studeasy.attempt_deadline(at.id) as due
    from studeasy.attempts at
    where at.submitted_at is null
      and (only_assessment is null or at.assessment_id = only_assessment)
  loop
    if t.due is not null and t.due < now() then
      update studeasy.attempts
      set submitted_at = t.due,
          auto_closed = true,
          auto_marks = coalesce(auto_marks, 0),
          total_marks = null,
          released = false
      where id = t.id;
      closed := closed + 1;
    end if;
  end loop;

  return closed;
end;
$$;

/*
 * Same as before, with the stale-attempt sweep in front of it.
 *
 * Without this the resume branch below hands back an attempt that finished
 * yesterday: a student reopens a test they cannot submit, and cannot start a
 * fresh one either. Closing it first means they get a new attempt if they have
 * one left, and a clear "you have used all your attempts" if they do not.
 */
create or replace function studeasy.start_attempt(assessment uuid)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  a studeasy.assessments%rowtype;
  used integer;
  existing uuid;
begin
  if caller is null then
    raise exception 'Sign in to take this assessment.';
  end if;

  select * into a from studeasy.assessments where id = assessment;
  if not found or a.status <> 'published' then
    raise exception 'That assessment is not available.';
  end if;

  if not studeasy.can_take_assessment(assessment) then
    if a.class_id is not null then
      raise exception 'This assessment is for students registered in its class.';
    elsif a.course_id is not null then
      raise exception 'You need to be enrolled in the course to take this.';
    else
      raise exception 'This assessment has to be bought before you can sit it.';
    end if;
  end if;

  if a.opens_at is not null and a.opens_at > now() then
    raise exception 'This opens at %.', to_char(a.opens_at, 'DD Mon YYYY HH24:MI');
  end if;
  if a.closes_at is not null and a.closes_at <= now() then
    raise exception 'This closed at %.', to_char(a.closes_at, 'DD Mon YYYY HH24:MI');
  end if;

  -- Settle anything whose deadline passed while nobody was looking.
  perform studeasy.close_expired_attempts(assessment);

  /*
   * Resume rather than start again. This is the rest of the no-pause rule: the
   * original started_at comes back with it, so time spent away still counted.
   */
  select id into existing from studeasy.attempts
  where assessment_id = assessment and student_id = caller and submitted_at is null
  limit 1;
  if existing is not null then
    return existing;
  end if;

  select count(*) into used from studeasy.attempts
  where assessment_id = assessment and student_id = caller and submitted_at is not null;

  if used >= a.attempts_allowed then
    raise exception 'You have used all % attempts.', a.attempts_allowed;
  end if;

  insert into studeasy.attempts (assessment_id, student_id)
  values (assessment, caller)
  returning id into existing;

  return existing;
end;
$$;

/*
 * Same marking contract, with the grace cut to thirty seconds.
 *
 * The grace exists only so a submission already in flight when the clock hit
 * zero is not thrown away. Two minutes was long enough to keep working in, and
 * a student who can still answer after time is up does not really have a time
 * limit.
 */
create or replace function studeasy.submit_attempt(attempt uuid, responses jsonb)
returns table (auto_marks integer, max_marks integer, needs_marking boolean, passed boolean)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  t studeasy.attempts%rowtype;
  a studeasy.assessments%rowtype;
  q studeasy.questions%rowtype;
  item jsonb;
  resp jsonb;
  is_right boolean;
  earned integer := 0;
  total integer := 0;
  manual boolean := false;
  negative boolean;
  due timestamptz;
begin
  select * into t from studeasy.attempts where id = attempt;
  if not found or t.student_id <> caller then
    raise exception 'That attempt is not yours.';
  end if;
  if t.submitted_at is not null then
    raise exception 'You have already submitted this attempt.';
  end if;

  due := studeasy.attempt_deadline(attempt);
  if due is not null and now() > due + interval '30 seconds' then
    raise exception 'Time ran out at %, and this attempt has been closed.',
      to_char(due, 'HH24:MI');
  end if;

  select * into a from studeasy.assessments where id = t.assessment_id;
  negative := a.negative_marking;

  for q in select * from studeasy.questions where assessment_id = t.assessment_id loop
    total := total + q.marks;

    resp := null;
    for item in select * from jsonb_array_elements(responses) loop
      if (item ->> 'question_id') = q.id::text then
        resp := item -> 'response';
        exit;
      end if;
    end loop;

    is_right := studeasy.mark_answer(q, resp);

    if is_right is null then
      manual := true;
      insert into studeasy.answers (attempt_id, question_id, response)
      values (attempt, q.id, resp)
      on conflict (attempt_id, question_id) do update set response = excluded.response;
    else
      if is_right then
        earned := earned + q.marks;
      elsif negative and resp is not null then
        earned := earned - 1;
      end if;
      insert into studeasy.answers (attempt_id, question_id, response, correct, marks)
      values (attempt, q.id, resp, is_right, case when is_right then q.marks else 0 end)
      on conflict (attempt_id, question_id) do update
        set response = excluded.response,
            correct = excluded.correct,
            marks = excluded.marks;
    end if;
  end loop;

  -- An offline paper's work is in the uploaded file; a classroom sitting
  -- happened away from the app. Both always wait for a person.
  if a.delivery <> 'online' or total = 0 then
    manual := true;
  end if;

  earned := greatest(earned, 0);

  update studeasy.attempts
  set submitted_at = now(),
      auto_marks = earned,
      total_marks = case when manual then null else earned end,
      passed = case
        when manual or total = 0 then null
        else (earned::numeric / total) * 100 >= a.pass_mark_pct
      end,
      released = not manual
  where id = attempt;

  if not manual then
    perform studeasy.touch_streak(20);
  end if;

  return query select earned, total, manual,
    case when manual or total = 0 then null
         else (earned::numeric / total) * 100 >= a.pass_mark_pct end;
end;
$$;

revoke all on function studeasy.close_expired_attempts(uuid) from anon, authenticated;
