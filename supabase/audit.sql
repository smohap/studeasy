--
-- audit.sql — makes the audit log record something.
--
-- Run AFTER supabase/platform.sql and supabase/multi-role.sql. Safe to re-run.
--
-- platform.sql created studeasy.audit_log with an index and an admin-only read
-- policy, and nothing has ever inserted a row. An empty audit log is worse
-- than no audit log, because its emptiness reads as "nothing happened".
--
-- The decision worth stating: this is written by TRIGGERS, not by calls placed
-- in the server actions. An audit trail that depends on every future code path
-- remembering to log is one that will quietly develop gaps, and a trail with
-- gaps is dangerous precisely because people trust it. Triggers also fire for
-- the SQL editor and for a future admin script, not just for this application.
--
-- audit_log has no insert policy, on purpose. Everything here is SECURITY
-- DEFINER, so nothing a user does can forge or delete an entry.
--

-- ---------------------------------------------------------------------------
-- What gets recorded
-- ---------------------------------------------------------------------------

/*
 * One trigger function for every audited table.
 *
 * TG_ARGV[0] is the entity name. The row's own columns decide the rest, so
 * auditing another table later means adding a trigger, not editing this.
 */
create or replace function studeasy.write_audit()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  entity_name text := tg_argv[0];
  row_id text;
  org uuid;
  act text;
  info jsonb;
begin
  if tg_op = 'DELETE' then
    act := entity_name || '.deleted';
  elsif tg_op = 'INSERT' then
    act := entity_name || '.created';
  else
    act := entity_name || '.updated';
  end if;

  if entity_name = 'role' then
    -- profile_roles has a composite key; the person is what matters here.
    row_id := coalesce(new.profile_id, old.profile_id)::text;
    select p.organization_id into org
    from studeasy.profiles p
    where p.id = coalesce(new.profile_id, old.profile_id);
    info := jsonb_build_object(
      'role', coalesce(new.role, old.role),
      'from_status', case when tg_op = 'INSERT' then null else old.status end,
      'to_status', case when tg_op = 'DELETE' then null else new.status end
    );

  elsif entity_name = 'course' then
    row_id := coalesce(new.id, old.id)::text;
    org := coalesce(new.organization_id, old.organization_id);
    info := jsonb_build_object(
      'title', coalesce(new.title, old.title),
      'teacher_id', coalesce(new.teacher_id, old.teacher_id),
      'from_status', case when tg_op = 'INSERT' then null else old.status end,
      'to_status', case when tg_op = 'DELETE' then null else new.status end
    );

  else -- 'order'
    row_id := coalesce(new.id, old.id)::text;
    org := coalesce(new.organization_id, old.organization_id);
    info := jsonb_build_object(
      'total_cents', coalesce(new.total_cents, old.total_cents),
      'buyer_id', coalesce(new.user_id, old.user_id),
      'from_status', case when tg_op = 'INSERT' then null else old.status end,
      'to_status', case when tg_op = 'DELETE' then null else new.status end
    );
  end if;

  insert into studeasy.audit_log
    (organization_id, actor_id, action, entity, entity_id, detail)
  -- auth.uid() is null when the Stripe webhook or a migration did it. That
  -- null is information: it says no signed-in person was responsible.
  values (org, auth.uid(), act, entity_name, row_id, info);

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Where it fires
-- ---------------------------------------------------------------------------

/*
 * Role changes. The most sensitive thing on the platform: the record of who
 * was made a teacher, who approved it, and who took it away.
 */
drop trigger if exists profile_roles_audit on studeasy.profile_roles;
create trigger profile_roles_audit
  after insert or update or delete on studeasy.profile_roles
  for each row execute function studeasy.write_audit('role');

/*
 * Courses, but only when the status moves. An author fixing a typo is not an
 * audit event; publishing, approving or archiving is.
 */
drop trigger if exists courses_audit on studeasy.courses;
create trigger courses_audit
  after update on studeasy.courses
  for each row
  when (old.status is distinct from new.status)
  execute function studeasy.write_audit('course');

/*
 * Money. Status changes only — the row is written as 'pending', and what
 * matters is the move to paid, refunded or cancelled.
 */
drop trigger if exists orders_audit on studeasy.orders;
create trigger orders_audit
  after update on studeasy.orders
  for each row
  when (old.status is distinct from new.status)
  execute function studeasy.write_audit('order');

-- ---------------------------------------------------------------------------
-- Reading it back
-- ---------------------------------------------------------------------------

/*
 * The log with actor names resolved, newest first.
 *
 * audit_log.actor_id is ON DELETE SET NULL, so an entry outlives the account
 * that caused it — deliberately. 'System' covers both a deleted account and an
 * action with no signed-in actor, such as the Stripe webhook.
 *
 * Output columns are prefixed so no OUT parameter shadows a column of the same
 * name inside the body.
 */
create or replace function studeasy.list_audit_log(limit_to integer default 200)
returns table (
  a_id bigint,
  a_at timestamptz,
  actor_name text,
  a_action text,
  a_entity text,
  a_entity_id text,
  a_detail jsonb
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
      l.id,
      l.at,
      coalesce(p.full_name, 'System'),
      l.action,
      l.entity,
      l.entity_id,
      l.detail
    from studeasy.audit_log l
    left join studeasy.profiles p on p.id = l.actor_id
    order by l.at desc
    limit greatest(least(limit_to, 1000), 1);
end;
$$;

grant execute on function studeasy.list_audit_log(integer) to authenticated;

-- No grant of insert, update or delete on audit_log to anybody. The triggers
-- are SECURITY DEFINER and are the only writer; an append-only log a user can
-- edit is not a log.
