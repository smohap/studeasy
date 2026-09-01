-- StudEasy — marking what a machine cannot, and a column-name repair.
--
-- Run AFTER supabase/assessment-timing.sql. Safe to re-run.
--
-- TWO FIXES AND ONE ADDITION.
--
-- Fix 1 — a regression. When submit_attempt() was rewritten for delivery modes
-- it began inserting into answers.correct and answers.marks. Those columns do
-- not exist; the table has auto_correct and awarded_marks, and always did. Any
-- assessment holding an auto-marked question has failed on submit ever since,
-- with `column "correct" of relation "answers" does not exist`. Running this
-- file repairs it.
--
-- Fix 2 — answers_select let the student, their parent and an admin read an
-- answer, but not the teacher who set the question. A teacher could see that an
-- attempt was waiting to be marked and not what it said.
--
-- Addition — release_attempt() existed but nothing ever called it, so every
-- essay, uploaded paper and classroom sitting sat unmarked forever. The queue
-- that calls it needs to read written answers, which is what Fix 2 unblocks.

-- ---------------------------------------------------------------------------
-- Fix 1: the real column names
-- ---------------------------------------------------------------------------

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

      -- auto_correct and awarded_marks. Not `correct` and `marks`.
      insert into studeasy.answers
        (attempt_id, question_id, response, auto_correct, awarded_marks)
      values (
        attempt, q.id, resp, is_right,
        case when is_right then q.marks
             when negative and resp is not null then -1
             else 0 end
      )
      on conflict (attempt_id, question_id) do update
        set response = excluded.response,
            auto_correct = excluded.auto_correct,
            awarded_marks = excluded.awarded_marks;
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

-- ---------------------------------------------------------------------------
-- Fix 2: the teacher can read what they have to mark
-- ---------------------------------------------------------------------------

drop policy if exists answers_select on studeasy.answers;
create policy answers_select on studeasy.answers
  for select using (
    exists (
      select 1 from studeasy.attempts t
      where t.id = answers.attempt_id
        and (t.student_id = auth.uid() or studeasy.is_my_child(t.student_id))
    )
    -- The teacher who set the assessment. Without this arm they could see that
    -- an attempt was waiting and not what it actually said.
    or exists (
      select 1
      from studeasy.attempts t
      join studeasy.assessments a on a.id = t.assessment_id
      where t.id = answers.attempt_id and a.teacher_id = auth.uid()
    )
    or studeasy.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Addition: marking a single written answer
-- ---------------------------------------------------------------------------

/*
 * Per-question marks and a comment for the written work.
 *
 * release_attempt() sets the total; this is how a teacher says where those
 * marks came from, which is the part a student actually learns from.
 */
create or replace function studeasy.mark_answer_by_hand(
  answer uuid,
  awarded integer,
  comment text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  q studeasy.questions%rowtype;
begin
  select qq.* into q
  from studeasy.answers an
  join studeasy.questions qq on qq.id = an.question_id
  where an.id = answer;

  if not found then
    raise exception 'No such answer.';
  end if;

  if not exists (
    select 1
    from studeasy.answers an
    join studeasy.attempts t on t.id = an.attempt_id
    join studeasy.assessments a on a.id = t.assessment_id
    where an.id = answer and (a.teacher_id = auth.uid() or studeasy.is_admin())
  ) then
    raise exception 'Only the teacher who set this can mark it.';
  end if;

  if awarded < 0 or awarded > q.marks then
    raise exception 'Mark must be between 0 and %.', q.marks;
  end if;

  update studeasy.answers
  set awarded_marks = awarded, teacher_comment = nullif(trim(comment), '')
  where id = answer;
end;
$$;

grant execute on function studeasy.mark_answer_by_hand(uuid, integer, text) to authenticated;
