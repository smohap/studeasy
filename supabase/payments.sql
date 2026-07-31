-- StudEasy — Stripe payments and the teacher payout ledger.
--
-- Run AFTER supabase/marketplace.sql. Safe to re-run.
--
-- Design note: the webhook is the only thing that may mark an order paid. The
-- browser never can — a client that could would let anyone enrol for free by
-- calling the function directly. That is why mark_order_paid() checks for the
-- service role and nothing else.

-- ---------------------------------------------------------------------------
-- Orders gain their Stripe identity
-- ---------------------------------------------------------------------------

alter table studeasy.orders
  add column if not exists stripe_session_id text unique,
  add column if not exists stripe_payment_intent text,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists failure_reason text;

-- 'pending' now means "checkout started, not yet paid".
alter table studeasy.orders drop constraint if exists orders_status_check;
alter table studeasy.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled'));

create index if not exists orders_session_idx on studeasy.orders (stripe_session_id);

-- ---------------------------------------------------------------------------
-- Teacher payouts
--
-- One row per course sale. Stripe Connect will later settle these; for now the
-- ledger records what is owed so the earnings dashboard is truthful.
-- ---------------------------------------------------------------------------

create table if not exists studeasy.payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references studeasy.organizations (id) on delete cascade,
  teacher_id uuid references studeasy.profiles (id) on delete set null,
  order_id uuid references studeasy.orders (id) on delete set null,
  course_id uuid references studeasy.courses (id) on delete set null,
  gross_cents integer not null,
  platform_fee_cents integer not null,
  net_cents integer not null,
  status text not null default 'owed'
    check (status in ('owed', 'scheduled', 'paid', 'reversed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists payouts_teacher_idx
  on studeasy.payouts (teacher_id, status);

alter table studeasy.payouts enable row level security;

drop policy if exists payouts_select on studeasy.payouts;
create policy payouts_select on studeasy.payouts
  for select using (teacher_id = auth.uid() or studeasy.is_admin());

grant select on studeasy.payouts to authenticated;

-- ---------------------------------------------------------------------------
-- Checkout, in two halves
-- ---------------------------------------------------------------------------

/*
 * Half one: turn the cart into a pending order and hand back what Stripe needs
 * to price the session. Enrols nobody — payment has not happened.
 */
create or replace function studeasy.begin_checkout()
returns table (order_id uuid, reference text, total_cents integer)
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

  insert into studeasy.orders (organization_id, user_id, reference, total_cents, status)
  values (org, caller, ref, total, 'pending')
  returning * into new_order;

  insert into studeasy.order_items (order_id, course_id, title_snapshot, price_cents)
  select new_order.id, c.id, c.title, c.price_cents
  from studeasy.cart_items ci
  join studeasy.courses c on c.id = ci.course_id
  where ci.user_id = caller;

  return query select new_order.id, new_order.reference, new_order.total_cents;
end;
$$;

/*
 * Half two: the webhook confirms payment. Enrolments, payout ledger lines and
 * the cart clear all happen here, so they only ever follow real money.
 *
 * Idempotent — Stripe retries webhooks, and a retry must not double-enrol or
 * double-credit a teacher.
 */
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
begin
  -- Only the service role reaches this. A browser session must never be able
  -- to declare an order paid.
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
    return 'already_paid';           -- webhook retry
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
  select o.organization_id, oi.course_id, o.user_id
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  insert into studeasy.payouts
    (organization_id, teacher_id, order_id, course_id,
     gross_cents, platform_fee_cents, net_cents)
  select
    o.organization_id,
    c.teacher_id,
    o.id,
    c.id,
    oi.price_cents,
    round(oi.price_cents * coalesce(fee_pct, 20) / 100.0),
    oi.price_cents - round(oi.price_cents * coalesce(fee_pct, 20) / 100.0)
  from studeasy.order_items oi
  join studeasy.courses c on c.id = oi.course_id
  where oi.order_id = o.id and oi.price_cents > 0;

  delete from studeasy.cart_items where user_id = o.user_id;

  return 'paid';
end;
$$;

create or replace function studeasy.attach_stripe_session(
  order_id uuid,
  session_id text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  update studeasy.orders
  set stripe_session_id = session_id
  where id = order_id and user_id = auth.uid() and status = 'pending';
end;
$$;

/* Free enrolments still need a path that takes no money. */
create or replace function studeasy.claim_free_order(order_id uuid)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  o studeasy.orders%rowtype;
begin
  select * into o from studeasy.orders
  where id = order_id and user_id = auth.uid();

  if not found then
    raise exception 'Unknown order.';
  end if;
  if o.total_cents <> 0 then
    raise exception 'That order has to be paid for.';
  end if;
  if o.status = 'paid' then
    return 'already_paid';
  end if;

  update studeasy.orders set status = 'paid', paid_at = now() where id = o.id;

  insert into studeasy.enrolments (organization_id, course_id, student_id)
  select o.organization_id, oi.course_id, o.user_id
  from studeasy.order_items oi
  where oi.order_id = o.id and oi.course_id is not null
  on conflict (course_id, student_id) do nothing;

  delete from studeasy.cart_items where user_id = o.user_id;
  return 'paid';
end;
$$;

grant execute on function studeasy.begin_checkout() to authenticated;
grant execute on function studeasy.attach_stripe_session(uuid, text) to authenticated;
grant execute on function studeasy.claim_free_order(uuid) to authenticated;
revoke all on function studeasy.mark_order_paid(text, text) from anon, authenticated;

-- The old single-step checkout took no money. Remove it so it cannot be called.
drop function if exists studeasy.checkout();
