--
-- public-site.sql — the data behind the public marketing pages.
--
-- Run AFTER supabase/multi-role.sql, supabase/platform.sql,
-- supabase/content-and-help.sql and supabase/analytics.sql. Safe to re-run.
--
-- Everything a signed-out visitor sees comes from here. Nine pages needed data
-- that row-level security correctly refuses to a stranger: `profiles` is
-- readable only by its owner, their parent, or an admin, so a tutor directory
-- and an anonymised success story both have to come out through a function
-- that decides exactly which columns leave the table.
--
-- The rule this file follows: a SECURITY DEFINER function that serves `anon`
-- returns a named column list, never `select *` and never a whole row type. A
-- later `alter table ... add column` then cannot quietly widen what the public
-- can see.
--
-- Three deliberate refusals:
--
--   * No tutor is listed until an admin has approved them. `profile_roles`
--     status must be 'active'; 'pending' means an adult who can see children's
--     work has not been checked yet, and such a person does not belong on a
--     page that reads as a recommendation.
--   * Success stories carry no names, no student codes and no course the
--     student could be identified by — a year level and a subject only, and
--     only for accounts that have explicitly opted in.
--   * Nothing here invents a number. Where there is no data the function
--     returns no rows or a null, and the page says so.
--

-- ---------------------------------------------------------------------------
-- Tutor profile fields
--
-- A directory needs something to read. These are additive and nullable, so
-- every existing account keeps working with them empty; the page falls back to
-- the subjects they teach, which registration already collects.
-- ---------------------------------------------------------------------------

alter table studeasy.profiles
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists qualifications text,
  add column if not exists years_experience integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_years_experience_check'
      and conrelid = 'studeasy.profiles'::regclass
  ) then
    alter table studeasy.profiles
      add constraint profiles_years_experience_check
      check (years_experience is null or years_experience between 0 and 70);
  end if;
end
$$;

/*
 * Opt-out of the public directory. Default true because a tutor who has been
 * approved is offering to teach; someone who would rather not be listed
 * un-ticks it on their profile. Not a privacy control for students — they are
 * never listed at all.
 */
alter table studeasy.profiles
  add column if not exists listed boolean not null default true;

/*
 * Consent to appear — anonymously — in aggregate progress reporting.
 *
 * PRD §12 requires parental consent for under-16s, and the Success Stories
 * page is exactly the case it was written for. Default FALSE: an empty page is
 * the correct state until somebody has actually agreed, and a default of true
 * would be consent nobody gave.
 */
alter table studeasy.profiles
  add column if not exists share_progress_consent boolean not null default false;

-- ---------------------------------------------------------------------------
-- The tutor directory
-- ---------------------------------------------------------------------------

/*
 * Approved, listed tutors with the figures a parent choosing one would ask
 * about. `rating` is a weighted mean over that tutor's rated courses, and is
 * null rather than 0 when nothing has been rated — "not rated yet" and "rated
 * badly" must not render the same.
 */
create or replace function studeasy.public_tutors()
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  teaching_subjects text[],
  years_experience integer,
  course_count bigint,
  rating numeric,
  rating_count bigint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.headline,
    p.teaching_subjects,
    p.years_experience,
    coalesce(c.n, 0) as course_count,
    c.rating,
    coalesce(c.rating_count, 0) as rating_count,
    p.created_at
  from studeasy.profiles p
  join studeasy.profile_roles r
    on r.profile_id = p.id and r.role = 'tutor' and r.status = 'active'
  left join lateral (
    select
      count(*) as n,
      round(sum(x.rating_avg * x.rating_count) / nullif(sum(x.rating_count), 0), 2)
        as rating,
      sum(x.rating_count) as rating_count
    from studeasy.courses x
    where x.teacher_id = p.id
      and x.status = 'published'
      and x.deleted_at is null
  ) c on true
  where p.listed
  order by coalesce(c.rating, 0) desc, coalesce(c.n, 0) desc, p.full_name;
$$;

/*
 * One tutor. Returns no rows for an id that is not an approved, listed tutor,
 * so an unapproved account cannot be reached by guessing its uuid.
 */
create or replace function studeasy.public_tutor(p_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  bio text,
  qualifications text,
  teaching_subjects text[],
  years_experience integer,
  course_count bigint,
  rating numeric,
  rating_count bigint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select
    p.id, p.full_name, p.avatar_url, p.headline, p.bio, p.qualifications,
    p.teaching_subjects, p.years_experience,
    coalesce(c.n, 0),
    c.rating,
    coalesce(c.rating_count, 0),
    p.created_at
  from studeasy.profiles p
  join studeasy.profile_roles r
    on r.profile_id = p.id and r.role = 'tutor' and r.status = 'active'
  left join lateral (
    select
      count(*) as n,
      round(sum(x.rating_avg * x.rating_count) / nullif(sum(x.rating_count), 0), 2)
        as rating,
      sum(x.rating_count) as rating_count
    from studeasy.courses x
    where x.teacher_id = p.id and x.status = 'published' and x.deleted_at is null
  ) c on true
  where p.id = p_id and p.listed;
$$;

-- ---------------------------------------------------------------------------
-- Subjects
--
-- The subject list itself is a constant in lib/curriculum.ts, shared with the
-- registration forms. This adds only what has to be counted.
-- ---------------------------------------------------------------------------

create or replace function studeasy.public_subject_stats()
returns table (
  subject text,
  course_count bigint,
  class_count bigint,
  tutor_count bigint,
  rating numeric,
  from_cents integer
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  with published as (
    select * from studeasy.courses
    where status = 'published' and deleted_at is null
  ),
  names as (
    -- Every subject that is either taught or offered, so a subject with a
    -- tutor but no course yet still appears.
    select distinct subject from published where subject is not null
    union
    select distinct unnest(p.teaching_subjects)
      from studeasy.profiles p
      join studeasy.profile_roles r
        on r.profile_id = p.id and r.role = 'tutor' and r.status = 'active'
     where p.listed
  )
  select
    s.subject,
    (select count(*) from published c where c.subject = s.subject),
    (select count(*) from published c
      where c.subject = s.subject and c.kind = 'class'),
    (select count(distinct r.profile_id)
       from studeasy.profile_roles r
       join studeasy.profiles p on p.id = r.profile_id
      where r.role = 'tutor' and r.status = 'active' and p.listed
        and s.subject = any (p.teaching_subjects)),
    (select round(sum(c.rating_avg * c.rating_count)
                    / nullif(sum(c.rating_count), 0), 2)
       from published c where c.subject = s.subject),
    (select min(c.price_cents) from published c where c.subject = s.subject)
  from names s
  where s.subject is not null and s.subject <> ''
  order by s.subject;
$$;

-- ---------------------------------------------------------------------------
-- Success stories
--
-- Two kinds of evidence, kept apart because they are not the same claim.
--
--   * A testimonial is something a person chose to write and publish. Reviews
--     are already world-readable by policy; this only strips the author down
--     to a year level.
--   * A measured improvement is the platform's own claim about a child, and
--     needs consent. First released attempt against most recent released
--     attempt, same student, same subject.
--
-- Neither returns a name, an id, or a course title specific enough to identify
-- the student.
-- ---------------------------------------------------------------------------

create or replace function studeasy.public_testimonials(p_limit integer default 12)
returns table (
  id uuid,
  rating integer,
  body text,
  subject text,
  year_level text,
  written_at timestamptz
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select
    v.id,
    v.rating,
    v.body,
    c.subject,
    p.year_level,
    v.created_at
  from studeasy.reviews v
  join studeasy.courses c on c.id = v.course_id
  join studeasy.profiles p on p.id = v.student_id
  where v.rating >= 4
    and v.body is not null
    and length(btrim(v.body)) >= 40
    and c.status = 'published'
    and c.deleted_at is null
  order by v.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

create or replace function studeasy.public_progress_stories(p_limit integer default 8)
returns table (
  subject text,
  year_level text,
  first_pct numeric,
  latest_pct numeric,
  attempts bigint,
  span_days integer
)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  with marked as (
    select
      t.student_id,
      a.subject,
      t.submitted_at,
      round(100.0 * (coalesce(t.auto_marks, 0) + coalesce(t.manual_marks, 0))
              / nullif(t.total_marks, 0), 1) as pct
    from studeasy.attempts t
    join studeasy.assessments a on a.id = t.assessment_id
    join studeasy.profiles p on p.id = t.student_id
    where t.submitted_at is not null
      and t.total_marks > 0
      and t.released
      and p.share_progress_consent
      and a.subject is not null
  ),
  ranked as (
    select
      student_id, subject, pct, submitted_at,
      row_number() over (partition by student_id, subject
                         order by submitted_at) as first_rank,
      row_number() over (partition by student_id, subject
                         order by submitted_at desc) as last_rank,
      count(*) over (partition by student_id, subject) as n
    from marked
  )
  select
    f.subject,
    p.year_level,
    f.pct,
    l.pct,
    f.n,
    (l.submitted_at::date - f.submitted_at::date)
  from ranked f
  join ranked l
    on l.student_id = f.student_id and l.subject = f.subject and l.last_rank = 1
  join studeasy.profiles p on p.id = f.student_id
  where f.first_rank = 1
    -- Two data points are a line, not a trend. Three is the least that says
    -- anything, and only an improvement is a story worth publishing.
    and f.n >= 3
    and l.pct > f.pct
  order by (l.pct - f.pct) desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

-- ---------------------------------------------------------------------------
-- Site-wide counts, for the About and Pricing pages
--
-- Every figure is a count of rows that exist right now. Nothing is projected,
-- rounded up, or carried over from a previous period.
-- ---------------------------------------------------------------------------

create or replace function studeasy.site_stats()
returns jsonb
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select jsonb_build_object(
    'tutors', (select count(*) from studeasy.profile_roles r
                join studeasy.profiles p on p.id = r.profile_id
               where r.role = 'tutor' and r.status = 'active' and p.listed),
    'students', (select count(*) from studeasy.profile_roles
                  where role = 'student' and status = 'active'),
    'courses', (select count(*) from studeasy.courses
                 where status = 'published' and deleted_at is null),
    'subjects', (select count(distinct subject) from studeasy.courses
                  where status = 'published' and deleted_at is null
                    and subject is not null),
    'classes_upcoming', (select count(*) from studeasy.class_sessions
                          where starts_at > now() and status = 'published'),
    'resources_free', (select count(*) from studeasy.content_items
                        where status = 'published' and price_cents = 0),
    'assessments_marked', (select count(*) from studeasy.attempts
                            where submitted_at is not null and released),
    -- Null, not zero, when nothing has been rated. The pages must be able to
    -- tell "no ratings yet" from "rated zero".
    'rating', (select round(sum(rating_avg * rating_count)
                              / nullif(sum(rating_count), 0), 2)
                 from studeasy.courses
                where status = 'published' and deleted_at is null
                  and rating_count > 0)
  );
$$;

-- ---------------------------------------------------------------------------
-- Articles — the blog, and the written half of Resources
-- ---------------------------------------------------------------------------

create table if not exists studeasy.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  -- Plain text. Rendered as paragraphs, not as HTML: nothing typed by an
  -- author is ever put through dangerouslySetInnerHTML.
  body text not null,
  subject text,
  year_level text,
  kind text not null default 'article'
    check (kind in ('article', 'guide', 'news')),
  author_id uuid references studeasy.profiles (id) on delete set null,
  -- Snapshot, so a post still reads correctly if the author leaves.
  author_name text not null,
  cover_emoji text,
  read_minutes integer check (read_minutes is null or read_minutes between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_published_idx
  on studeasy.articles (status, published_at desc);

alter table studeasy.articles enable row level security;

drop policy if exists articles_select on studeasy.articles;
create policy articles_select on studeasy.articles
  for select using (
    status = 'published' or author_id = auth.uid() or studeasy.is_admin()
  );

/*
 * Writing is not open to everyone. A post on the public site carries the
 * platform's name, so it takes an admin or an approved tutor — the same bar as
 * selling in the library.
 */
drop policy if exists articles_write on studeasy.articles;
create policy articles_write on studeasy.articles
  for all using (
    studeasy.is_admin()
    or (author_id = auth.uid() and exists (
      select 1 from studeasy.profile_roles
      where profile_id = auth.uid() and role = 'tutor' and status = 'active'
    ))
  )
  with check (
    studeasy.is_admin()
    or (author_id = auth.uid() and exists (
      select 1 from studeasy.profile_roles
      where profile_id = auth.uid() and role = 'tutor' and status = 'active'
    ))
  );

/* published_at is set once, when it is first published, and never by the client. */
create or replace function studeasy.stamp_article()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists articles_stamp on studeasy.articles;
create trigger articles_stamp
  before insert or update on studeasy.articles
  for each row execute function studeasy.stamp_article();

-- ---------------------------------------------------------------------------
-- Contact form
--
-- A stranger can write to the platform. That is a public write endpoint, so it
-- goes through a function rather than an insert policy on the table: the
-- function decides every column, and the table stays unreadable and
-- unwritable through PostgREST.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  -- Null when the sender was not signed in, which is the usual case.
  from_profile_id uuid references studeasy.profiles (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'read', 'closed')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references studeasy.profiles (id) on delete set null
);

create index if not exists contact_messages_new_idx
  on studeasy.contact_messages (status, created_at desc);

alter table studeasy.contact_messages enable row level security;
-- Deliberately no policies: reachable only through the functions below.

create or replace function studeasy.submit_contact_message(
  p_name text,
  p_email text,
  p_topic text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  new_id uuid;
  recent integer;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Please tell us your name.';
  end if;
  -- Deliberately loose. A stricter pattern rejects real addresses, and the
  -- cost of a bad one here is one undeliverable reply, not a security hole.
  if coalesce(p_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look right.';
  end if;
  if length(btrim(coalesce(p_message, ''))) < 10 then
    raise exception 'Please write a little more so we can help.';
  end if;
  if length(p_message) > 5000 then
    raise exception 'That message is too long — please keep it under 5000 characters.';
  end if;
  if coalesce(p_topic, '') not in
     ('tutoring', 'billing', 'technical', 'partnership', 'other') then
    raise exception 'Unknown topic.';
  end if;

  /*
   * Crude flood limit, per email address. Not a substitute for a captcha or
   * rate limiting at the edge — it only stops the same address filling the
   * table in one sitting, and it is here because the endpoint is open.
   */
  select count(*) into recent
  from studeasy.contact_messages
  where email = lower(btrim(p_email))
    and created_at > now() - interval '1 hour';

  if recent >= 5 then
    raise exception 'You have sent several messages already — we will reply to those first.';
  end if;

  insert into studeasy.contact_messages
    (name, email, topic, message, from_profile_id)
  values
    (left(btrim(p_name), 120), lower(btrim(p_email)), p_topic,
     btrim(p_message), auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function studeasy.list_contact_messages(p_limit integer default 100)
returns table (
  id uuid,
  name text,
  email text,
  topic text,
  message text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Administrators only.';
  end if;

  return query
  select m.id, m.name, m.email, m.topic, m.message, m.status, m.created_at
  from studeasy.contact_messages m
  order by (m.status = 'new') desc, m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function studeasy.set_contact_message_status(
  p_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Administrators only.';
  end if;
  if p_status not in ('new', 'read', 'closed') then
    raise exception 'Unknown status.';
  end if;

  update studeasy.contact_messages
  set status = p_status,
      handled_at = case when p_status = 'new' then null else now() end,
      handled_by = case when p_status = 'new' then null else auth.uid() end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- `anon` is a signed-out visitor. It gets execute on the read-only directory
-- functions and on the contact form, and nothing else. Its only table
-- privilege is select on `articles`, which that table's RLS policy already
-- limits to published rows.
-- ---------------------------------------------------------------------------

grant select on studeasy.articles to anon, authenticated;
grant insert, update, delete on studeasy.articles to authenticated;

grant execute on function studeasy.public_tutors() to anon, authenticated;
grant execute on function studeasy.public_tutor(uuid) to anon, authenticated;
grant execute on function studeasy.public_subject_stats() to anon, authenticated;
grant execute on function studeasy.public_testimonials(integer) to anon, authenticated;
grant execute on function studeasy.public_progress_stories(integer) to anon, authenticated;
grant execute on function studeasy.site_stats() to anon, authenticated;
grant execute on function studeasy.submit_contact_message(text, text, text, text)
  to anon, authenticated;

-- Admin-only, gated inside by is_admin().
grant execute on function studeasy.list_contact_messages(integer) to authenticated;
grant execute on function studeasy.set_contact_message_status(uuid, text) to authenticated;

-- Internal: called by the trigger, not by clients.
revoke all on function studeasy.stamp_article() from public;
