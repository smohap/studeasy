-- StudEasy — taking an assessment: attempts, auto-marking, certificates.
--
-- Run AFTER supabase/platform.sql. Safe to re-run.
--
-- platform.sql created the tables. This adds the lifecycle: start an attempt,
-- submit answers, mark the objective questions server-side, and issue a
-- certificate when the pass mark is met.
--
-- Marking never happens in the browser. The correct answers live in
-- studeasy.questions, which students cannot read at all — that is why
-- get_paper() exists, and why submit_attempt() is a SECURITY DEFINER function
-- rather than an update the client performs. The client sends responses; it
-- never sends a score.

-- ---------------------------------------------------------------------------
-- Policies the taking flow needs
-- ---------------------------------------------------------------------------

drop policy if exists attempts_insert on studeasy.attempts;
create policy attempts_insert on studeasy.attempts
  for insert with check (student_id = auth.uid());

drop policy if exists attempts_update on studeasy.attempts;
create policy attempts_update on studeasy.attempts
  for update using (
    student_id = auth.uid()
    or exists (
      select 1 from studeasy.assessments a
      where a.id = attempts.assessment_id and a.teacher_id = auth.uid()
    )
    or studeasy.is_admin()
  );

drop policy if exists answers_write on studeasy.answers;
create policy answers_write on studeasy.answers
  for all using (
    exists (
      select 1 from studeasy.attempts t
      where t.id = answers.attempt_id
        and (
          t.student_id = auth.uid()
          or exists (
            select 1 from studeasy.assessments a
            where a.id = t.assessment_id and a.teacher_id = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1 from studeasy.attempts t
      where t.id = answers.attempt_id and t.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Starting an attempt
-- ---------------------------------------------------------------------------

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
  if a.course_id is not null and not studeasy.enrolled_in(a.course_id) then
    raise exception 'You need to be enrolled in the course to take this.';
  end if;

  -- Resume rather than start again if one is still open.
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

-- ---------------------------------------------------------------------------
-- Marking one answer
--
-- Split out so each question type's rule is readable on its own. Returns null
-- for the kinds a human has to read.
-- ---------------------------------------------------------------------------

create or replace function studeasy.mark_answer(q studeasy.questions, response jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  tolerance numeric;
  given numeric;
  expected numeric;
begin
  if q.correct is null or response is null then
    return null;                                   -- teacher marks this one
  end if;

  case q.kind
    when 'mcq', 'true_false' then
      return lower(trim(response #>> '{}')) = lower(trim(q.correct #>> '{}'));

    when 'multi_select', 'matching', 'ordering' then
      -- Order matters for ordering; for the others compare as sets.
      if q.kind = 'ordering' then
        return response = q.correct;
      end if;
      return (
        select coalesce(array_agg(x order by x), '{}')
        from jsonb_array_elements_text(response) x
      ) = (
        select coalesce(array_agg(y order by y), '{}')
        from jsonb_array_elements_text(q.correct) y
      );

    when 'fill_blank', 'formula' then
      -- `correct` is a list of acceptable strings.
      return exists (
        select 1 from jsonb_array_elements_text(q.correct) acc
        where lower(trim(acc)) = lower(trim(response #>> '{}'))
      );

    when 'numerical' then
      begin
        given := (response #>> '{}')::numeric;
        expected := (q.correct #>> '{}')::numeric;
      exception when others then
        return false;                              -- not a number at all
      end;
      tolerance := coalesce((q.payload ->> 'tolerance')::numeric, 0);
      return abs(given - expected) <= tolerance;

    else
      return null;                                 -- short_answer, essay, image
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------

/*
 * Takes the whole paper at once as [{question_id, response}, …].
 *
 * The total is computed from the database's own copy of the questions, so a
 * tampered client can change its answers but never its score. If anything
 * needs a human, the attempt stays unreleased until the teacher finishes it.
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
begin
  select * into t from studeasy.attempts where id = attempt;
  if not found or t.student_id <> caller then
    raise exception 'That attempt is not yours.';
  end if;
  if t.submitted_at is not null then
    raise exception 'You have already submitted this attempt.';
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

  earned := greatest(earned, 0);

  update studeasy.attempts
  set submitted_at = now(),
      auto_marks = earned,
      total_marks = case when manual then null else earned end,
      passed = case
                 when manual then null
                 when total = 0 then null
                 else (earned::numeric / total * 100) >= a.pass_mark_pct
               end,
      released = not manual
  where id = attempt;

  -- A certificate only follows a released, passing result.
  if not manual and total > 0
     and (earned::numeric / total * 100) >= a.pass_mark_pct
     and a.issues_certificate then
    insert into studeasy.certificates
      (organization_id, student_id, course_id, assessment_id, title)
    values (a.organization_id, caller, a.course_id, a.id, a.title);
  end if;

  perform studeasy.touch_streak(50);

  return query select earned, total, manual,
    case when manual or total = 0 then null
         else (earned::numeric / total * 100) >= a.pass_mark_pct end;
end;
$$;

/* The teacher finishes anything the machine could not mark. */
create or replace function studeasy.release_attempt(
  attempt uuid,
  extra_marks integer default 0
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  t studeasy.attempts%rowtype;
  a studeasy.assessments%rowtype;
  total integer;
  final integer;
begin
  select * into t from studeasy.attempts where id = attempt;
  if not found then raise exception 'No such attempt.'; end if;

  select * into a from studeasy.assessments where id = t.assessment_id;
  if a.teacher_id <> auth.uid() and not studeasy.is_admin() then
    raise exception 'Only the teacher who set this can release it.';
  end if;

  select coalesce(sum(marks), 0) into total
  from studeasy.questions where assessment_id = t.assessment_id;

  final := coalesce(t.auto_marks, 0) + greatest(extra_marks, 0);

  update studeasy.attempts
  set manual_marks = greatest(extra_marks, 0),
      total_marks = final,
      passed = case when total = 0 then null
                    else (final::numeric / total * 100) >= a.pass_mark_pct end,
      released = true
  where id = attempt;

  if total > 0 and (final::numeric / total * 100) >= a.pass_mark_pct
     and a.issues_certificate
     and not exists (
       select 1 from studeasy.certificates
       where student_id = t.student_id and assessment_id = a.id
     ) then
    insert into studeasy.certificates
      (organization_id, student_id, course_id, assessment_id, title)
    values (a.organization_id, t.student_id, a.course_id, a.id, a.title);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public certificate check — serial only, no login.
-- ---------------------------------------------------------------------------

create or replace function studeasy.verify_certificate(code text)
returns table (title text, holder text, issued_at timestamptz, organization text)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select c.title, p.full_name, c.issued_at, o.name
  from studeasy.certificates c
  join studeasy.profiles p on p.id = c.student_id
  join studeasy.organizations o on o.id = c.organization_id
  where c.serial = upper(trim(code));
$$;

grant execute on function studeasy.start_attempt(uuid) to authenticated;
grant execute on function studeasy.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function studeasy.release_attempt(uuid, integer) to authenticated;
grant execute on function studeasy.verify_certificate(text) to anon, authenticated;
revoke all on function studeasy.mark_answer(studeasy.questions, jsonb) from anon, authenticated;
