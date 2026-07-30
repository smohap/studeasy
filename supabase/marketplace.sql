-- StudEasy — organizations, learning catalog and marketplace commerce.
--
-- Run AFTER supabase/schema.sql. Safe to re-run.
--
-- This is MVP PRD build-sequence steps 1–3: the multi-tenant seam, the catalog,
-- and the commerce that makes it a marketplace rather than a booking form.
--
-- Multi-tenancy is the point of doing this now rather than later. Section 19
-- requires every table scoped by organization_id and no data crossing a tenant
-- boundary; retrofitting that after the catalog exists means rewriting every
-- query and every policy.

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table if not exists studeasy.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  -- Per-org capability switches. MVP ships one org, but the switch exists from
  -- day one so Phase 1 white-labelling is configuration, not a rebuild.
  feature_flags jsonb not null default '{}'::jsonb,
  platform_fee_pct numeric(5,2) not null default 20.00,
  created_at timestamptz not null default now()
);

insert into studeasy.organizations (slug, name, tagline, feature_flags)
values (
  'tutorwise',
  'TutorWise',
  'Maths & Science tutoring, face-to-face and online',
  '{"marketplace": true, "assessments": false, "ai_tutor": true, "messaging": false}'::jsonb
)
on conflict (slug) do nothing;

create or replace function studeasy.default_org()
returns uuid
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select id from studeasy.organizations where slug = 'tutorwise';
$$;

-- Every account belongs to an organization.
alter table studeasy.profiles
  add column if not exists organization_id uuid references studeasy.organizations (id);

update studeasy.profiles
set organization_id = studeasy.default_org()
where organization_id is null;

alter table studeasy.profiles
  alter column organization_id set default studeasy.default_org();

create index if not exists profiles_org_idx on studeasy.profiles (organization_id);

/* The caller's tenant. Every policy below is anchored on this. */
create or replace function studeasy.current_org()
returns uuid
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select coalesce(
    (select organization_id from studeasy.profiles where id = auth.uid()),
    studeasy.default_org()
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalog — courses, classes, bundles and tests share one table because they
-- differ by `kind`, not by structure. Section 8 gives them the same states.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  teacher_id uuid references studeasy.profiles (id) on delete set null,
  -- Snapshot so a listing still reads correctly if a teacher leaves, and so
  -- seeded demo courses can exist before any teacher has registered.
  teacher_name text not null,

  slug text not null,
  title text not null,
  subject text not null,
  level text,
  summary text,
  description text,
  emoji text default '📘',

  kind text not null default 'course'
    check (kind in ('course', 'class', 'bundle', 'test')),
  format text not null default 'online'
    check (format in ('online', 'in_person', 'hybrid', 'self_paced')),

  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'NZD',
  seats integer,                       -- null means unlimited
  requires_approval boolean not null default false,

  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'archived')),
  visibility text not null default 'public'
    check (visibility in ('public', 'private', 'organization')),

  rating_avg numeric(3,2),
  rating_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists courses_org_status_idx
  on studeasy.courses (organization_id, status);
create index if not exists courses_teacher_idx on studeasy.courses (teacher_id);
create index if not exists courses_subject_idx on studeasy.courses (subject);

create table if not exists studeasy.enrolments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, student_id)
);

create index if not exists enrolments_student_idx on studeasy.enrolments (student_id);
create index if not exists enrolments_course_idx on studeasy.enrolments (course_id);

-- ---------------------------------------------------------------------------
-- Commerce — cart, orders, order lines.
--
-- NOTE: no payment is taken. checkout() marks the order paid so the enrolment
-- flow can be exercised end to end. Stripe Connect (PRD section 20) replaces
-- that one step; nothing else about this changes.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  user_id uuid not null references studeasy.profiles (id) on delete cascade,
  course_id uuid not null references studeasy.courses (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists studeasy.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  user_id uuid not null references studeasy.profiles (id) on delete cascade,
  reference text unique not null,
  total_cents integer not null default 0,
  currency text not null default 'NZD',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists studeasy.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references studeasy.orders (id) on delete cascade,
  course_id uuid references studeasy.courses (id) on delete set null,
  title_snapshot text not null,
  price_cents integer not null
);

create index if not exists orders_user_idx on studeasy.orders (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.organizations enable row level security;
alter table studeasy.courses enable row level security;
alter table studeasy.enrolments enable row level security;
alter table studeasy.cart_items enable row level security;
alter table studeasy.orders enable row level security;
alter table studeasy.order_items enable row level security;

drop policy if exists organizations_select on studeasy.organizations;
create policy organizations_select on studeasy.organizations
  for select using (true);   -- public marketing pages read org name and tagline

/*
 * A published public course is readable by anyone, including signed-out
 * visitors browsing the catalog. Everything else is the teacher's own, or an
 * admin's. Tenant scoping applies to the non-public cases.
 */
drop policy if exists courses_select on studeasy.courses;
create policy courses_select on studeasy.courses
  for select using (
    (status = 'published' and visibility = 'public')
    or teacher_id = auth.uid()
    or (visibility = 'organization' and organization_id = studeasy.current_org())
    or studeasy.is_admin()
  );

drop policy if exists courses_insert on studeasy.courses;
create policy courses_insert on studeasy.courses
  for insert with check (
    teacher_id = auth.uid() and organization_id = studeasy.current_org()
  );

drop policy if exists courses_update on studeasy.courses;
create policy courses_update on studeasy.courses
  for update using (teacher_id = auth.uid() or studeasy.is_admin())
  with check (teacher_id = auth.uid() or studeasy.is_admin());

drop policy if exists enrolments_select on studeasy.enrolments;
create policy enrolments_select on studeasy.enrolments
  for select using (
    student_id = auth.uid()
    -- a parent sees their linked child's enrolments
    or exists (
      select 1 from studeasy.profiles p
      where p.id = enrolments.student_id and p.parent_id = auth.uid()
    )
    -- the teacher of the course sees who is enrolled
    or exists (
      select 1 from studeasy.courses c
      where c.id = enrolments.course_id and c.teacher_id = auth.uid()
    )
    or studeasy.is_admin()
  );

drop policy if exists cart_items_all on studeasy.cart_items;
create policy cart_items_all on studeasy.cart_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists orders_select on studeasy.orders;
create policy orders_select on studeasy.orders
  for select using (user_id = auth.uid() or studeasy.is_admin());

drop policy if exists order_items_select on studeasy.order_items;
create policy order_items_select on studeasy.order_items
  for select using (
    exists (
      select 1 from studeasy.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or studeasy.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Course authoring
-- ---------------------------------------------------------------------------

/*
 * Teachers create drafts. Publishing is a request, not an act: section 7 says
 * no teacher publishes paid content pre-approval, so this refuses outright if
 * the teacher's own account is not approved, and otherwise queues the course
 * for admin review.
 */
create or replace function studeasy.submit_course_for_review(course uuid)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  me studeasy.profiles%rowtype;
  c studeasy.courses%rowtype;
begin
  select * into me from studeasy.profiles where id = caller;
  if not found or me.role <> 'tutor' then
    raise exception 'Only a teacher can publish a course.';
  end if;
  if me.status <> 'active' then
    raise exception 'Your teacher account is still awaiting approval.';
  end if;

  select * into c from studeasy.courses where id = course and teacher_id = caller;
  if not found then
    raise exception 'That course does not exist, or is not yours.';
  end if;

  update studeasy.courses
  set status = 'pending_review', updated_at = now()
  where id = course;

  return 'pending_review';
end;
$$;

/* Admin decision on a queued course. */
create or replace function studeasy.set_course_status(course uuid, next text)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only a site administrator can do that.';
  end if;
  if next not in ('draft', 'pending_review', 'published', 'archived') then
    raise exception 'Unsupported status.';
  end if;

  update studeasy.courses set status = next, updated_at = now() where id = course;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cart and checkout
-- ---------------------------------------------------------------------------

create or replace function studeasy.add_to_cart(course uuid)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.courses%rowtype;
begin
  if caller is null then
    raise exception 'Sign in to add something to your cart.';
  end if;

  select * into c from studeasy.courses
  where id = course and status = 'published';
  if not found then
    raise exception 'That course is not available.';
  end if;

  if exists (select 1 from studeasy.enrolments
             where course_id = course and student_id = caller and status <> 'cancelled') then
    return 'already_enrolled';
  end if;

  insert into studeasy.cart_items (organization_id, user_id, course_id)
  values (c.organization_id, caller, course)
  on conflict (user_id, course_id) do nothing;

  return 'added';
end;
$$;

create or replace function studeasy.remove_from_cart(course uuid)
returns void
language sql
security definer
set search_path = studeasy, public
as $$
  delete from studeasy.cart_items where user_id = auth.uid() and course_id = course;
$$;

/*
 * Turns the cart into an order and the order into enrolments.
 *
 * The order is marked paid without taking any money — this is the one step
 * Stripe replaces. Everything either side of it (cart, order lines, enrolment,
 * receipts) is real, so swapping in a payment provider does not disturb it.
 */
create or replace function studeasy.checkout()
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  org uuid := studeasy.current_org();
  new_order studeasy.orders%rowtype;
  ref text;
  total integer := 0;
begin
  if caller is null then
    raise exception 'Sign in to check out.';
  end if;
  if not exists (select 1 from studeasy.cart_items where user_id = caller) then
    raise exception 'Your cart is empty.';
  end if;

  select coalesce(sum(c.price_cents), 0) into total
  from studeasy.cart_items ci
  join studeasy.courses c on c.id = ci.course_id
  where ci.user_id = caller;

  ref := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into studeasy.orders (organization_id, user_id, reference, total_cents, status, paid_at)
  values (org, caller, ref, total, 'paid', now())
  returning * into new_order;

  insert into studeasy.order_items (order_id, course_id, title_snapshot, price_cents)
  select new_order.id, c.id, c.title, c.price_cents
  from studeasy.cart_items ci
  join studeasy.courses c on c.id = ci.course_id
  where ci.user_id = caller;

  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select org, ci.course_id, caller
  from studeasy.cart_items ci
  on conflict (course_id, student_id) do nothing;

  delete from studeasy.cart_items where user_id = caller;

  return ref;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema studeasy to anon, authenticated;
grant select on studeasy.organizations to anon, authenticated;
grant select on studeasy.courses to anon, authenticated;
grant insert, update on studeasy.courses to authenticated;
grant select on studeasy.enrolments to authenticated;
grant select, insert, delete on studeasy.cart_items to authenticated;
grant select on studeasy.orders to authenticated;
grant select on studeasy.order_items to authenticated;

grant execute on function studeasy.add_to_cart(uuid) to authenticated;
grant execute on function studeasy.remove_from_cart(uuid) to authenticated;
grant execute on function studeasy.checkout() to authenticated;
grant execute on function studeasy.submit_course_for_review(uuid) to authenticated;
grant execute on function studeasy.set_course_status(uuid, text) to authenticated;
grant execute on function studeasy.current_org() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed catalog, so the marketplace is browsable before any teacher signs up.
-- Obviously fictional, matching the personas already used elsewhere.
-- ---------------------------------------------------------------------------

insert into studeasy.courses
  (organization_id, teacher_name, slug, title, subject, level, summary, emoji,
   kind, format, price_cents, status, rating_avg, rating_count)
values
  (studeasy.default_org(), 'Ms. Patel', 'ncea-l1-algebra-bootcamp',
   'NCEA Level 1 Algebra Bootcamp', 'Mathematics', 'NCEA Level 1',
   'Eight sessions on the algebra that carries the most marks: expanding, factorising, and rearranging formulae.',
   '📐', 'course', 'online', 12000, 'published', 4.9, 212),

  (studeasy.default_org(), 'Mr. Reid', 'physics-mechanics-crash-course',
   'Physics: Mechanics Crash Course', 'Physics', 'NCEA Level 3',
   'Forces, motion and energy, worked from past-paper questions rather than theory first.',
   '⚛️', 'course', 'online', 9500, 'published', 4.8, 98),

  (studeasy.default_org(), 'StudEasy', 'free-diagnostic-assessment',
   'Free Diagnostic Assessment', 'All subjects', null,
   'Forty-five minutes, no charge. You get a written summary of where your child is now.',
   '📝', 'test', 'hybrid', 0, 'published', 4.9, 140),

  (studeasy.default_org(), 'Dr. Nguyen', 'chemistry-l2-l3-bundle',
   'Chemistry Bundle: Level 2 + Level 3', 'Chemistry', 'NCEA Level 2–3',
   'Both years together, with the Level 2 groundwork that Level 3 assumes you already have.',
   '🧪', 'bundle', 'online', 24000, 'published', 5.0, 64),

  (studeasy.default_org(), 'Ms. Patel', 'year-12-calculus-foundations',
   'Year 12 Calculus Foundations', 'Calculus', 'NCEA Level 2',
   'Differentiation from first principles, then the shortcuts — in that order, because the shortcuts stop making sense otherwise.',
   '📈', 'course', 'hybrid', 14000, 'pending_review', null, 0),

  (studeasy.default_org(), 'Mr. Ahmed', 'biology-genetics-intensive',
   'Biology: Genetics Intensive', 'Biology', 'NCEA Level 2',
   'Punnett squares, pedigrees and the exam wording that trips people up.',
   '🧬', 'course', 'in_person', 8500, 'published', 4.7, 51)
on conflict (organization_id, slug) do nothing;
