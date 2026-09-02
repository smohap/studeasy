--
-- refunds.sql — giving money back.
--
-- Run AFTER supabase/payments.sql and supabase/audit.sql. Safe to re-run.
--
-- payments.sql has one rule: the webhook is the only thing that may mark an
-- order paid, because a client that could would let anyone enrol for free.
-- This file is the mirror image, and the reason is the same shape.
--
--   * An administrator may REQUEST a refund. That writes a row saying somebody
--     asked, and changes nothing about the order, the enrolment or the payout.
--   * Only the Stripe webhook may SETTLE one. The order becomes refunded, the
--     seat is withdrawn and the teacher's credit is reversed only after Stripe
--     has confirmed the money actually moved.
--
-- The failure this avoids is the expensive one: a refund recorded here that
-- then fails at Stripe. The student loses their seat, the teacher loses their
-- credit, and nobody is any richer. Settling only on confirmation means the
-- worst case is a request that stays visibly stuck, which somebody can see.
--
-- Amounts are integer cents throughout, as everywhere else.
--

-- ---------------------------------------------------------------------------
-- Orders learn how much has gone back
-- ---------------------------------------------------------------------------

/*
 * Partial refunds are real — a family that bought a term and left after three
 * weeks. So the order keeps a running total rather than a boolean, and only
 * becomes 'refunded' when the whole amount has gone back. A partially refunded
 * order stays 'paid', because it is.
 */
alter table studeasy.orders
  add column if not exists refunded_cents integer not null default 0;

-- ---------------------------------------------------------------------------
-- The refund ledger
-- ---------------------------------------------------------------------------

create table if not exists studeasy.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references studeasy.orders (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'NZD',

  reason text not null check (reason in (
    'requested_by_customer', 'duplicate', 'fraudulent', 'service_not_provided'
  )),
  note text,

  status text not null default 'requested' check (status in (
    'requested', 'processing', 'succeeded', 'failed', 'cancelled'
  )),

  stripe_refund_id text unique,
  failure_reason text,

  requested_by uuid references studeasy.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  settled_at timestamptz,

  -- Whether the student keeps the course. Decided when the refund is asked
  -- for, applied only when it settles.
  revoke_access boolean not null default true
);

create index if not exists refunds_order_idx on studeasy.refunds (order_id);
create index if not exists refunds_open_idx
  on studeasy.refunds (status, requested_at desc);

alter table studeasy.refunds enable row level security;

/*
 * A student may see that their own order was refunded — it is their money.
 * Nobody may write through PostgREST at all: every change comes from one of
 * the functions below.
 */
drop policy if exists refunds_select on studeasy.refunds;
create policy refunds_select on studeasy.refunds
  for select using (
    studeasy.is_admin()
    or exists (
      select 1 from studeasy.orders o
      where o.id = refunds.order_id and o.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- What is still refundable
-- ---------------------------------------------------------------------------

/*
 * Paid, minus what has already gone back, minus what is currently in flight.
 * Counting 'requested' and 'processing' against the balance is what stops two
 * administrators refunding the same order at once and sending back twice what
 * was paid — Stripe would reject the second, but only after this database had
 * already promised it.
 */
create or replace function studeasy.refundable_cents(p_order uuid)
returns integer
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select greatest(
    0,
    coalesce((select o.total_cents from studeasy.orders o
               where o.id = p_order and o.status = 'paid'), 0)
    - coalesce((select sum(r.amount_cents) from studeasy.refunds r
                 where r.order_id = p_order
                   and r.status in ('requested', 'processing', 'succeeded')), 0)
  );
$$;

-- ---------------------------------------------------------------------------
-- Asking for one
-- ---------------------------------------------------------------------------

create or replace function studeasy.request_refund(
  p_order uuid,
  p_amount_cents integer,
  p_reason text,
  p_note text default null,
  p_revoke_access boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  o studeasy.orders%rowtype;
  available integer;
  new_id uuid;
begin
  if not studeasy.is_admin() then
    raise exception 'Only an administrator can refund an order.';
  end if;

  select * into o from studeasy.orders where id = p_order;
  if not found then
    raise exception 'No such order.';
  end if;
  if o.status <> 'paid' then
    raise exception 'That order is %, so there is nothing to refund.', o.status;
  end if;
  if o.stripe_payment_intent is null then
    raise exception 'That order has no Stripe payment against it — it was a free enrolment, or it was settled outside Stripe.';
  end if;

  if p_reason not in ('requested_by_customer', 'duplicate', 'fraudulent', 'service_not_provided') then
    raise exception 'Unknown refund reason.';
  end if;

  available := studeasy.refundable_cents(p_order);
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A refund has to be for more than nothing.';
  end if;
  if p_amount_cents > available then
    raise exception 'Only % cents are still refundable on that order, counting refunds already in flight.', available;
  end if;

  insert into studeasy.refunds
    (order_id, amount_cents, currency, reason, note, requested_by, revoke_access)
  values
    (p_order, p_amount_cents, o.currency, p_reason, nullif(btrim(p_note), ''),
     auth.uid(), coalesce(p_revoke_access, true))
  returning id into new_id;

  return new_id;
end;
$$;

/*
 * Called immediately after Stripe accepts the refund. Recording the id is what
 * lets the webhook find this row again; without it a refund that succeeds at
 * Stripe would settle nothing here.
 */
create or replace function studeasy.mark_refund_processing(
  p_refund uuid,
  p_stripe_refund_id text
)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only an administrator can send a refund to Stripe.';
  end if;

  update studeasy.refunds
  set status = 'processing',
      stripe_refund_id = p_stripe_refund_id
  where id = p_refund and status = 'requested';

  if not found then
    raise exception 'That refund is not waiting to be sent.';
  end if;
end;
$$;

/* Stripe refused it outright — no money moved, and nothing else changes. */
create or replace function studeasy.fail_refund(p_refund uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if not studeasy.is_admin() then
    raise exception 'Only an administrator can do that.';
  end if;

  update studeasy.refunds
  set status = 'failed',
      failure_reason = left(coalesce(p_reason, 'Stripe refused the refund.'), 500),
      settled_at = now()
  where id = p_refund and status in ('requested', 'processing');
end;
$$;

-- ---------------------------------------------------------------------------
-- Settling one — the webhook, and nothing else
-- ---------------------------------------------------------------------------

/*
 * Stripe has confirmed the money moved. This is where the consequences happen,
 * and it happens exactly once per refund however many times Stripe retries.
 *
 * Three consequences, in order of how much they matter to a person:
 *
 *   1. The order records what went back, and becomes 'refunded' only when all
 *      of it has.
 *   2. The seat is withdrawn, if the administrator asked for that. A goodwill
 *      partial refund usually should not cost a child their course, so it is a
 *      decision made at request time rather than assumed here.
 *   3. The teacher's credit is reversed. A sale that was given back is not
 *      earnings. Reversing a payout already marked 'paid' does not claw money
 *      out of anybody's bank account — it records that the ledger is now owed
 *      the other way, which is a person's problem to settle, not a trigger's.
 */
create or replace function studeasy.settle_refund(
  p_stripe_refund_id text,
  p_status text,
  p_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  r studeasy.refunds%rowtype;
  o studeasy.orders%rowtype;
  total_back integer;
begin
  -- Only the service role reaches this. The same rule as mark_order_paid():
  -- a browser session must never be able to declare that money moved.
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(
       (current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''
     ) <> 'service_role' then
    raise exception 'Only the payment webhook can settle a refund.';
  end if;

  select * into r from studeasy.refunds where stripe_refund_id = p_stripe_refund_id;
  if not found then
    -- A refund created straight from the Stripe dashboard, with no row here.
    -- Acknowledged rather than raised: telling Stripe to retry forever would
    -- not conjure the row, and the finance page shows the order's own totals.
    return 'unknown_refund';
  end if;

  if r.status in ('succeeded', 'failed', 'cancelled') then
    return 'already_settled';                       -- webhook retry
  end if;

  if p_status <> 'succeeded' then
    update studeasy.refunds
    set status = case when p_status = 'canceled' then 'cancelled' else 'failed' end,
        failure_reason = left(coalesce(p_failure_reason, p_status), 500),
        settled_at = now()
    where id = r.id;
    return 'not_succeeded';
  end if;

  update studeasy.refunds
  set status = 'succeeded', settled_at = now(), failure_reason = null
  where id = r.id;

  select * into o from studeasy.orders where id = r.order_id;

  select coalesce(sum(x.amount_cents), 0) into total_back
  from studeasy.refunds x
  where x.order_id = r.order_id and x.status = 'succeeded';

  update studeasy.orders
  set refunded_cents = total_back,
      status = case when total_back >= o.total_cents then 'refunded' else status end
  where id = o.id;

  if r.revoke_access then
    update studeasy.enrolments e
    set status = 'cancelled'
    from studeasy.order_items oi
    where oi.order_id = o.id
      and oi.course_id = e.course_id
      and e.student_id = o.user_id
      and e.status <> 'cancelled';
  end if;

  /*
   * Reverse the teacher's credit only when the whole order has gone back.
   * A payout row is per course sale and carries no partial amount, so
   * reversing it for a partial refund would take more off the teacher than
   * the customer got back.
   */
  if total_back >= o.total_cents then
    update studeasy.payouts
    set status = 'reversed', settled_at = now()
    where order_id = o.id and status <> 'reversed';
  end if;

  return 'refunded';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the ledger
-- ---------------------------------------------------------------------------

create or replace function studeasy.list_refunds(p_limit integer default 100)
returns table (
  id uuid,
  order_id uuid,
  order_reference text,
  buyer_name text,
  amount_cents integer,
  currency text,
  reason text,
  note text,
  status text,
  failure_reason text,
  requested_by_name text,
  requested_at timestamptz,
  settled_at timestamptz
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
  select
    r.id, r.order_id, o.reference,
    buyer.full_name,
    r.amount_cents, r.currency, r.reason, r.note, r.status, r.failure_reason,
    asked.full_name,
    r.requested_at, r.settled_at
  from studeasy.refunds r
  join studeasy.orders o on o.id = r.order_id
  left join studeasy.profiles buyer on buyer.id = o.user_id
  left join studeasy.profiles asked on asked.id = r.requested_by
  order by (r.status in ('requested', 'processing')) desc, r.requested_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

/* Paid orders with something left to give back, for the refund form. */
create or replace function studeasy.list_refundable_orders(p_limit integer default 100)
returns table (
  id uuid,
  reference text,
  buyer_name text,
  total_cents integer,
  refunded_cents integer,
  refundable_cents integer,
  currency text,
  paid_at timestamptz,
  items text
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
  select
    o.id, o.reference, p.full_name, o.total_cents, o.refunded_cents,
    studeasy.refundable_cents(o.id), o.currency, o.paid_at,
    (select string_agg(oi.title_snapshot, ', ' order by oi.title_snapshot)
       from studeasy.order_items oi where oi.order_id = o.id)
  from studeasy.orders o
  left join studeasy.profiles p on p.id = o.user_id
  where o.status = 'paid'
    and o.stripe_payment_intent is not null
    and studeasy.refundable_cents(o.id) > 0
  order by o.paid_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit
--
-- Its own trigger function rather than another branch inside write_audit(),
-- so running this file does not require re-running audit.sql. Same table, same
-- shape of entry — and, as there, auth.uid() is null when the Stripe webhook
-- did it, which is information rather than a gap: it says no signed-in person
-- was responsible for that particular transition.
-- ---------------------------------------------------------------------------

create or replace function studeasy.audit_refund()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  org uuid;
begin
  select o.organization_id into org
  from studeasy.orders o
  where o.id = coalesce(new.order_id, old.order_id);

  insert into studeasy.audit_log
    (organization_id, actor_id, action, entity, entity_id, detail)
  values (
    org,
    auth.uid(),
    case when tg_op = 'INSERT' then 'refund.created' else 'refund.updated' end,
    'refund',
    coalesce(new.id, old.id)::text,
    jsonb_build_object(
      'order_id', coalesce(new.order_id, old.order_id),
      'amount_cents', coalesce(new.amount_cents, old.amount_cents),
      'reason', coalesce(new.reason, old.reason),
      'from_status', case when tg_op = 'INSERT' then null else old.status end,
      'to_status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists refunds_audit on studeasy.refunds;
create trigger refunds_audit
  after insert or update on studeasy.refunds
  for each row
  when (tg_op = 'INSERT' or old.status is distinct from new.status)
  execute function studeasy.audit_refund();

-- ---------------------------------------------------------------------------
-- Grants
--
-- settle_refund() is deliberately absent: it is reached only by the service
-- role, which bypasses grants, exactly as mark_order_paid() is. Granting it to
-- `authenticated` would be granting the right to declare money moved.
-- ---------------------------------------------------------------------------

grant select on studeasy.refunds to authenticated;

grant execute on function studeasy.refundable_cents(uuid) to authenticated;
grant execute on function studeasy.request_refund(uuid, integer, text, text, boolean)
  to authenticated;
grant execute on function studeasy.mark_refund_processing(uuid, text) to authenticated;
grant execute on function studeasy.fail_refund(uuid, text) to authenticated;
grant execute on function studeasy.list_refunds(integer) to authenticated;
grant execute on function studeasy.list_refundable_orders(integer) to authenticated;

revoke all on function studeasy.settle_refund(text, text, text) from anon, authenticated;
revoke all on function studeasy.audit_refund() from public;
