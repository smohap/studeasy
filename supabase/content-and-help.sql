-- StudEasy — a content library, and somewhere to ask for help.
--
-- Run AFTER supabase/assessment-marking.sql. Safe to re-run.
--
-- Two things:
--
--   content_items   Notes, worksheets, past papers, videos. A tutor or an
--                   administrator writes one and either gives it away or sells
--                   it. Pricing rides the same order pipeline as everything
--                   else, so Stripe, the webhook and the payout ledger are
--                   unchanged.
--
--   help_requests   A student is stuck on something and says so — typed out,
--                   or as the Word or PDF they were handed. Tutors answer, and
--                   the student marks the answer that actually helped.

-- ---------------------------------------------------------------------------
-- The library
-- ---------------------------------------------------------------------------

create table if not exists studeasy.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  author_id uuid references studeasy.profiles (id) on delete set null,
  -- Snapshot, so a listing still reads correctly if the author leaves.
  author_name text not null,

  title text not null,
  summary text,
  subject text,
  year_level text,
  kind text not null default 'notes'
    check (kind in ('notes', 'worksheet', 'video', 'slides', 'past_paper', 'other')),

  -- The goods: an uploaded file, a link, or both.
  file_path text,
  file_name text,
  external_url text,
  /* Shown to everyone, bought or not — nobody pays for a title alone. */
  preview text,

  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'NZD',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_published_idx
  on studeasy.content_items (organization_id, status, subject);
create index if not exists content_author_idx
  on studeasy.content_items (author_id);

create table if not exists studeasy.content_purchases (
  content_id uuid not null references studeasy.content_items (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,
  order_id uuid references studeasy.orders (id) on delete set null,
  amount_paid_cents integer not null default 0,
  purchased_at timestamptz not null default now(),
  primary key (content_id, student_id)
);

alter table studeasy.order_items
  add column if not exists content_id uuid
    references studeasy.content_items (id) on delete set null;

/*
 * A published item has to actually contain something. Checked on publish, not
 * as a table constraint, because a draft is mid-writing by definition.
 */
create or replace function studeasy.guard_content_shape()
returns trigger
language plpgsql
set search_path = studeasy, public
as $$
begin
  new.updated_at := now();

  if new.status = 'published'
     and coalesce(trim(new.file_path), '') = ''
     and coalesce(trim(new.external_url), '') = '' then
    raise exception 'Attach a file or a link before publishing this.';
  end if;

  return new;
end;
$$;

drop trigger if exists content_items_shape on studeasy.content_items;
create trigger content_items_shape
  before insert or update on studeasy.content_items
  for each row execute function studeasy.guard_content_shape();

/*
 * Whether the caller may open the goods — as opposed to seeing the listing,
 * which anyone signed in may do. Selling something nobody can find would be a
 * strange kind of shop.
 */
create or replace function studeasy.can_access_content(content uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1 from studeasy.content_items c
    where c.id = content
      and (
        c.author_id = auth.uid()
        or studeasy.is_admin()
        or (
          c.status = 'published'
          and (
            c.price_cents = 0
            or exists (
              select 1 from studeasy.content_purchases p
              where p.content_id = c.id and p.student_id = auth.uid()
            )
          )
        )
      )
  );
$$;

create or replace function studeasy.begin_content_checkout(content uuid)
returns table (order_id uuid, reference text, total_cents integer)
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  c studeasy.content_items%rowtype;
  new_order studeasy.orders%rowtype;
  ref text;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;

  select * into c from studeasy.content_items where id = content;
  if not found or c.status <> 'published' then
    raise exception 'That is not on sale.';
  end if;
  if c.price_cents = 0 then
    raise exception 'That one is free — there is nothing to pay.';
  end if;
  if studeasy.can_access_content(content) then
    raise exception 'You already have this.';
  end if;

  ref := 'LIB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into studeasy.orders
    (organization_id, user_id, reference, status, total_cents, currency)
  values (c.organization_id, caller, ref, 'pending', c.price_cents, c.currency)
  returning * into new_order;

  insert into studeasy.order_items
    (order_id, content_id, student_id, title_snapshot, price_cents)
  values (new_order.id, content, caller, c.title, c.price_cents);

  return query select new_order.id, ref, c.price_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- Asking for help
-- ---------------------------------------------------------------------------

create table if not exists studeasy.help_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  student_id uuid not null references studeasy.profiles (id) on delete cascade,

  title text not null,
  /* Typed out, or empty when the question is entirely in the attachment. */
  body text,
  subject text,
  year_level text,

  -- The Word or PDF they were handed, if there is one.
  file_path text,
  file_name text,

  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  accepted_response_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists help_requests_open_idx
  on studeasy.help_requests (organization_id, status, created_at desc);
create index if not exists help_requests_student_idx
  on studeasy.help_requests (student_id, created_at desc);

create table if not exists studeasy.help_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references studeasy.help_requests (id) on delete cascade,
  responder_id uuid references studeasy.profiles (id) on delete set null,
  body text not null,
  -- A worked solution can be a file too.
  file_path text,
  file_name text,
  is_accepted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists help_responses_request_idx
  on studeasy.help_responses (request_id, created_at);

/*
 * Answering. Restricted to tutors and administrators on purpose: a student
 * asking for help on their own homework should get an answer from someone who
 * teaches, not from a classmate guessing. The open forum is where students
 * help each other.
 */
create or replace function studeasy.answer_help_request(
  request uuid,
  body text,
  path text default null,
  file_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  r studeasy.help_requests%rowtype;
  new_id uuid;
begin
  if caller is null then
    raise exception 'Sign in first.';
  end if;
  if not studeasy.has_role('tutor') and not studeasy.is_admin() then
    raise exception 'Only a tutor can answer a help request.';
  end if;
  if coalesce(trim(body), '') = '' then
    raise exception 'Write an answer first.';
  end if;

  select * into r from studeasy.help_requests where id = request;
  if not found then raise exception 'That request no longer exists.'; end if;
  if r.status = 'closed' then
    raise exception 'That request is closed.';
  end if;

  insert into studeasy.help_responses
    (request_id, responder_id, body, file_path, file_name)
  values (request, caller, trim(body), path, file_name)
  returning id into new_id;

  update studeasy.help_requests
  set status = case when status = 'open' then 'answered' else status end,
      updated_at = now()
  where id = request;

  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  values (
    r.organization_id, r.student_id, 'help_answered',
    'Someone answered: ' || r.title,
    left(trim(body), 140),
    '/portal/student/help'
  );

  return new_id;
end;
$$;

/* The student says which answer actually helped. */
create or replace function studeasy.accept_help_response(response uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  resp studeasy.help_responses%rowtype;
  r studeasy.help_requests%rowtype;
begin
  select * into resp from studeasy.help_responses where id = response;
  if not found then raise exception 'No such answer.'; end if;

  select * into r from studeasy.help_requests where id = resp.request_id;
  if r.student_id <> caller and not studeasy.is_admin() then
    raise exception 'Only the person who asked can accept an answer.';
  end if;

  update studeasy.help_responses set is_accepted = false where request_id = r.id;
  update studeasy.help_responses set is_accepted = true where id = response;

  update studeasy.help_requests
  set accepted_response_id = response, status = 'answered', updated_at = now()
  where id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table studeasy.content_items enable row level security;
alter table studeasy.content_purchases enable row level security;
alter table studeasy.help_requests enable row level security;
alter table studeasy.help_responses enable row level security;

drop policy if exists content_items_select on studeasy.content_items;
create policy content_items_select on studeasy.content_items
  for select using (
    status = 'published' or author_id = auth.uid() or studeasy.is_admin()
  );

drop policy if exists content_items_write on studeasy.content_items;
create policy content_items_write on studeasy.content_items
  for all using (author_id = auth.uid() or studeasy.is_admin())
  with check (author_id = auth.uid() or studeasy.is_admin());

drop policy if exists content_purchases_select on studeasy.content_purchases;
create policy content_purchases_select on studeasy.content_purchases
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or studeasy.is_admin()
    or exists (
      select 1 from studeasy.content_items c
      where c.id = content_purchases.content_id and c.author_id = auth.uid()
    )
  );

/*
 * A help request is visible to the student who asked, their parent, and anyone
 * who could answer it. Tutors seeing the queue is the entire point.
 */
drop policy if exists help_requests_select on studeasy.help_requests;
create policy help_requests_select on studeasy.help_requests
  for select using (
    student_id = auth.uid()
    or studeasy.is_my_child(student_id)
    or studeasy.has_role('tutor')
    or studeasy.is_admin()
  );

drop policy if exists help_requests_insert on studeasy.help_requests;
create policy help_requests_insert on studeasy.help_requests
  for insert with check (student_id = auth.uid());

drop policy if exists help_requests_update on studeasy.help_requests;
create policy help_requests_update on studeasy.help_requests
  for update using (student_id = auth.uid() or studeasy.is_admin())
  with check (student_id = auth.uid() or studeasy.is_admin());

drop policy if exists help_responses_select on studeasy.help_responses;
create policy help_responses_select on studeasy.help_responses
  for select using (
    exists (
      select 1 from studeasy.help_requests r
      where r.id = help_responses.request_id
        and (
          r.student_id = auth.uid()
          or studeasy.is_my_child(r.student_id)
          or studeasy.has_role('tutor')
          or studeasy.is_admin()
        )
    )
  );

-- Writes go through answer_help_request() and accept_help_response().

-- ---------------------------------------------------------------------------
-- Payment
-- ---------------------------------------------------------------------------

/* Same contract; a content line now grants the buyer access. */
create or replace function studeasy.mark_order_paid(
  session_id text,
  payment_intent text
)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  o studeasy.orders%rowtype;
  fee_pct numeric;
  line record;
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(
       (current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''
     ) <> 'service_role' then
    raise exception 'Only the payment webhook can settle an order.';
  end if;

  select * into o from studeasy.orders where stripe_session_id = session_id;
  if not found then
    raise exception 'Unknown checkout session.';
  end if;
  if o.status = 'paid' then
    return 'already_paid';
  end if;

  select platform_fee_pct into fee_pct
  from studeasy.organizations where id = o.organization_id;

  update studeasy.orders
  set status = 'paid',
      paid_at = now(),
      stripe_payment_intent = payment_intent,
      platform_fee_cents = round(o.total_cents * coalesce(fee_pct, 20) / 100.0)
  where id = o.id;

  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select o.organization_id, oi.course_id, coalesce(oi.student_id, o.user_id)
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  for line in
    select class_id, student_id, price_cents from studeasy.order_items
    where order_id = o.id and class_id is not null
  loop
    perform studeasy.confirm_class_seat(
      line.class_id, coalesce(line.student_id, o.user_id), o.id, line.price_cents
    );
  end loop;

  insert into studeasy.assessment_purchases
    (assessment_id, student_id, order_id, amount_paid_cents)
  select oi.assessment_id, coalesce(oi.student_id, o.user_id), o.id, oi.price_cents
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.assessment_id is not null
  on conflict (assessment_id, student_id) do nothing;

  insert into studeasy.content_purchases
    (content_id, student_id, order_id, amount_paid_cents)
  select oi.content_id, coalesce(oi.student_id, o.user_id), o.id, oi.price_cents
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.content_id is not null
  on conflict (content_id, student_id) do nothing;

  insert into studeasy.payouts
    (organization_id, teacher_id, order_id, course_id,
     gross_cents, platform_fee_cents, net_cents)
  select
    o.organization_id,
    coalesce(c.teacher_id, cs.teacher_id, asm.teacher_id, ci.author_id),
    o.id,
    c.id,
    oi.price_cents,
    round(oi.price_cents * coalesce(fee_pct, 20) / 100.0),
    oi.price_cents - round(oi.price_cents * coalesce(fee_pct, 20) / 100.0)
  from studeasy.order_items oi
  left join studeasy.courses c on c.id = oi.course_id
  left join studeasy.class_sessions cs on cs.id = oi.class_id
  left join studeasy.assessments asm on asm.id = oi.assessment_id
  left join studeasy.content_items ci on ci.id = oi.content_id
  where oi.order_id = o.id and oi.price_cents > 0;

  delete from studeasy.cart_items where user_id = o.user_id;

  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('content-library', 'content-library', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('help-uploads', 'help-uploads', false)
on conflict (id) do nothing;

/*
 * Both buckets key on the first path segment being the owner, so an insert is
 * a string comparison. Reading the library is the interesting one: it has to
 * follow entitlement, or a paid worksheet would be one URL away from free.
 */
drop policy if exists content_library_insert on storage.objects;
create policy content_library_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-library'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists content_library_select on storage.objects;
create policy content_library_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'content-library'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or studeasy.is_admin()
      or exists (
        select 1 from studeasy.content_items c
        where c.file_path = storage.objects.name
          and studeasy.can_access_content(c.id)
      )
    )
  );

drop policy if exists content_library_update on storage.objects;
create policy content_library_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'content-library'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists help_uploads_insert on storage.objects;
create policy help_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'help-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists help_uploads_select on storage.objects;
create policy help_uploads_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'help-uploads'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or studeasy.is_admin()
      -- Whoever can see the request can see what was attached to it.
      or studeasy.has_role('tutor')
      or exists (
        select 1 from studeasy.help_requests r
        where r.file_path = storage.objects.name
          and studeasy.is_my_child(r.student_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on studeasy.content_items to anon, authenticated;
grant insert, update on studeasy.content_items to authenticated;
grant select on studeasy.content_purchases to authenticated;
grant select, insert, update on studeasy.help_requests to authenticated;
grant select on studeasy.help_responses to authenticated;

grant execute on function studeasy.can_access_content(uuid) to authenticated;
grant execute on function studeasy.begin_content_checkout(uuid) to authenticated;
grant execute on function studeasy.answer_help_request(uuid, text, text, text) to authenticated;
grant execute on function studeasy.accept_help_response(uuid) to authenticated;

revoke all on function studeasy.mark_order_paid(text, text) from anon, authenticated;
revoke all on function studeasy.guard_content_shape() from anon, authenticated;
