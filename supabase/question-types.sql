--
-- question-types.sql — storage for image-based questions.
--
-- Run AFTER supabase/platform.sql and supabase/assessment-modes.sql.
-- Safe to re-run.
--
-- The four question types PRD section 11 lists but the builder could not
-- author — matching, ordering, formula and image — needed no schema change:
-- `questions.kind` already accepts all eleven, `payload` is jsonb, and
-- mark_answer() already marks matching, ordering and formula. Three of the
-- four were purely a missing editor and a missing renderer.
--
-- The fourth needs somewhere to put the picture, and that is not a public
-- bucket. A diagram is part of an exam paper: a public URL would let anyone
-- holding the link read a question before sitting it, and object keys are
-- guessable enough that "unlisted" is not a control. So the bucket is private,
-- and reading an object is allowed exactly where reading the question is —
-- which is the condition get_paper() already applies, extracted into a
-- function so the two cannot drift apart.
--

-- ---------------------------------------------------------------------------
-- Who may read a paper
-- ---------------------------------------------------------------------------

/*
 * The same test get_paper() makes, as a function, so the storage policy below
 * and the query that serves the questions cannot disagree. If they did, the
 * failure would be silent and one-sided: a student who can read the question
 * but not its diagram sees a paper with a hole in it.
 */
create or replace function studeasy.may_read_paper(assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.assessments a
    where a.id = assessment
      and (
        a.teacher_id = auth.uid()
        or studeasy.is_admin()
        or (
          a.status = 'published'
          and (a.course_id is null or studeasy.enrolled_in(a.course_id))
        )
      )
  );
$$;

grant execute on function studeasy.may_read_paper(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', false)
on conflict (id) do nothing;

/*
 * Objects live at <teacher_id>/<assessment_id>/<filename>. The first segment
 * being the owner is the shape every bucket in this app uses, so the write
 * policies stay a string comparison.
 */
drop policy if exists question_images_insert on storage.objects;
create policy question_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists question_images_update on storage.objects;
create policy question_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists question_images_delete on storage.objects;
create policy question_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/*
 * Reading is the interesting one. The uploader always may. Everyone else may
 * only if a question in a paper they are entitled to read points at this
 * exact object — so an image that is not attached to anything is readable by
 * nobody but its author, and detaching it from a question revokes access
 * without a cleanup job.
 */
drop policy if exists question_images_select on storage.objects;
create policy question_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'question-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from studeasy.questions q
        where q.image_path = storage.objects.name
          and studeasy.may_read_paper(q.assessment_id)
      )
    )
  );
