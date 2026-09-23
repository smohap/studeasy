--
-- consent.sql — a child under 13 does not get a learning record until a
-- parent or caregiver says so.
--
-- Run AFTER supabase/multi-role.sql, supabase/marketplace.sql,
-- supabase/family.sql, supabase/audit.sql, supabase/assessments.sql and
-- supabase/economy.sql. Safe to re-run.
--
-- marketplace.sql is in that list for one column: it is what adds
-- profiles.organization_id, which the notification and the audit row below
-- both read.
--
-- WHY THIS EXISTS
--
-- Everything else on this platform asks "may you see this row?". This asks a
-- different question: "should we be collecting this at all?". A 13-year-old
-- can click through a registration form, but they cannot give the consent that
-- makes processing their work lawful. Somebody with parental responsibility
-- has to, and there has to be a record of who did and when.
--
-- THE TWO DECISIONS, STATED PLAINLY
--
--   1. Age is established by a date of birth given at registration, not by a
--      tickbox saying "I am over 16". A tickbox is not an auditable basis: it
--      records that a child clicked something, which is the thing in doubt.
--
--   2. An under-age account is BLOCKED, not merely flagged. Until a linked
--      parent confirms, the student may sign in and look at the waiting
--      screen, and they may answer a parent's link request — and nothing else.
--      No attempts, no answers, no mastery, no coins. The record does not
--      start accumulating and then get deleted if consent never arrives; it
--      never starts.
--
-- THE DEADLOCK, AND WHY THE GATE IS SHAPED THIS WAY
--
-- Consent comes from a parent who is LINKED to the student, and the existing
-- link flow requires the STUDENT to approve the parent's request. So a gate
-- that froze the student entirely would freeze the only person who can let the
-- parent in. Approving a link request is therefore deliberately outside the
-- gate. That is the seam this file is most careful about, and the one the
-- tests hammer.
--
-- FAIL-CLOSED, AND WHAT THAT MEANS FOR ACCOUNTS THAT ALREADY EXIST
--
-- The gate reads `consent_basis is null` — nothing has cleared this student —
-- rather than computing an age at query time. A student with no date of birth
-- is therefore blocked, not waved through, which is the right default for a
-- control of this kind.
--
-- That would lock out every student already registered, since none of them has
-- a date of birth. So this migration backfills existing students with the
-- basis 'legacy', explicitly and visibly, meaning: this account predates the
-- gate and nobody has established its age. Those rows are a known debt, listed
-- by studeasy.students_missing_dob() for an administrator to work through.
-- They are not evidence of consent and are not described as such anywhere.
--

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table studeasy.profiles
  add column if not exists date_of_birth date,
  add column if not exists consent_basis text,
  add column if not exists consent_granted_at timestamptz,
  add column if not exists consent_granted_by uuid
    references studeasy.profiles (id) on delete set null;

/*
 * Why an account is allowed to proceed. Null means it is not.
 *
 *   'not_required' — 16 or over when they registered. No guardian consent is
 *                    needed and none was sought.
 *   'parent'       — a linked parent or caregiver confirmed it. The who and
 *                    the when are in the two columns above.
 *   'legacy'       — registered before this gate existed. Age unknown.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_consent_basis_check'
  ) then
    alter table studeasy.profiles
      add constraint profiles_consent_basis_check
      check (consent_basis in ('not_required', 'parent', 'legacy'));
  end if;
end
$$;

-- A static sanity bound only. "Not in the future" cannot live here: a CHECK
-- constraint must be immutable, and current_date is not, so that half of the
-- test is enforced by guard_profile() below instead.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_dob_plausible_check'
  ) then
    alter table studeasy.profiles
      add constraint profiles_dob_plausible_check
      check (date_of_birth is null or date_of_birth > date '1900-01-01');
  end if;
end
$$;

-- Finding the students still waiting is the parent portal's commonest query.
create index if not exists profiles_consent_pending_idx
  on studeasy.profiles (parent_id)
  where consent_basis is null;

-- ---------------------------------------------------------------------------
-- The age of consent, and who is under it
-- ---------------------------------------------------------------------------

/*
 * Thirteen.
 *
 * Named rather than inlined so there is exactly one place to change it, and so
 * a reader does not have to work out what a bare number in a date expression
 * means. lib/consent.ts holds the same number for the browser and the two must
 * agree; its tests say so.
 *
 * Lowered from sixteen on 23 September 2026, on the operator's reasoning that
 * thirteen-year-olds routinely hold their own accounts. It sat briefly at
 * twelve and was raised the same day: thirteen is the floor COPPA uses in the
 * United States and the lowest a member state may set under GDPR, so twelve
 * was below both while buying nothing the reasoning asked for.
 *
 * Anyone lowering it again should know they are crossing that line
 * deliberately rather than by arithmetic.
 */
create or replace function studeasy.consent_age()
returns integer language sql immutable as $$ select 13 $$;

create or replace function studeasy.needs_guardian_consent(born date)
returns boolean
language sql
stable
as $$
  -- Unknown age counts as a child. The whole point of this file is that we do
  -- not guess in the permissive direction.
  select born is null
      or born > current_date - (studeasy.consent_age() || ' years')::interval;
$$;

/*
 * Is this account still waiting on a guardian?
 *
 * Reads consent_basis rather than recomputing an age, so a student who turns
 * 16 the day after a parent consents does not flicker between states, and so
 * the answer is a stored fact an administrator can look at rather than an
 * arithmetic result.
 *
 * Non-students are never gated: a parent or tutor account is an adult's
 * account, and a 15-year-old is not registering as a tutor.
 */
create or replace function studeasy.consent_pending(student uuid)
returns boolean
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select exists (
    select 1
    from studeasy.profiles p
    where p.id = student
      and p.consent_basis is null
      and (
        p.role = 'student'
        or exists (
          select 1 from studeasy.profile_roles r
          where r.profile_id = p.id and r.role = 'student'
        )
      )
  );
$$;

grant execute on function studeasy.consent_pending(uuid) to authenticated;
grant execute on function studeasy.needs_guardian_consent(date) to authenticated;
grant execute on function studeasy.consent_age() to authenticated;

-- ---------------------------------------------------------------------------
-- Establishing the age, and freezing what the account may say about itself
--
-- None of this is folded into schema.sql's handle_new_user() or
-- guard_profile(). Those are `create or replace`, so re-running schema.sql —
-- which the runbook tells an operator to do freely, because it is idempotent —
-- would silently delete the consent logic and leave a gate that looks present
-- and does nothing. Separate triggers survive that. This project has already
-- lost an evening to exactly that failure, on touch_streak.
-- ---------------------------------------------------------------------------

/*
 * The date of birth the registration form collected.
 *
 * It arrives in raw_user_meta_data alongside everything else the wizard asked
 * for, and handle_new_user() does not know about it, so this picks it up
 * afterwards. Named with 'dob' rather than 'consent' so it sorts after
 * studeasy_on_auth_user_created: Postgres fires same-timing triggers in name
 * order, and there is no profile row to update until that one has run.
 */
create or replace function studeasy.apply_signup_dob()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  born date;
begin
  if (meta ->> 'date_of_birth') is null then
    return new;
  end if;

  -- A malformed date is dropped rather than raised: failing the signup
  -- transaction over it would lock somebody out of an account they have
  -- already been charged nothing for and cannot retry. They are then gated,
  -- which is the safe end of the failure.
  begin
    born := (meta ->> 'date_of_birth')::date;
  exception when others then
    return new;
  end;

  perform set_config('studeasy.consent_write', 'on', true);

  update studeasy.profiles
  set date_of_birth = coalesce(date_of_birth, born)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists studeasy_on_auth_user_dob on auth.users;
create trigger studeasy_on_auth_user_dob
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function studeasy.apply_signup_dob();

revoke all on function studeasy.apply_signup_dob() from public, anon, authenticated;

/*
 * What an account may not say about itself.
 *
 * Two different jobs, and it is worth being clear which is which.
 *
 * FREEZING is a security control. consent_basis, consent_granted_at and
 * consent_granted_by are writable only by grant_parental_consent() and the
 * signup path, both of which announce themselves with a transaction-local
 * flag. Without the flag the values are silently reverted, exactly as
 * guard_profile() already does for parent_id. A student who edits the request
 * their browser sends gets an unchanged row back and no error, because telling
 * them which field was rejected is telling them where to aim next.
 *
 * DERIVING is not a security control, and this file should not pretend
 * otherwise. A date of birth given at registration is self-declared: a
 * determined 14-year-old can type 1998. What the freeze buys is that they must
 * declare it ONCE, before they know it matters, and can never revise it
 * afterwards — so the account carries a fixed, dated, auditable statement of
 * age rather than one that moves whenever it is inconvenient. That is the same
 * basis every other service in this position relies on, and claiming more for
 * it would be dishonest.
 */
create or replace function studeasy.guard_consent()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  authorised boolean :=
    coalesce(current_setting('studeasy.consent_write', true), '') = 'on';
  is_student boolean;
begin
  if tg_op = 'UPDATE' and not studeasy.is_admin() and not authorised then
    -- Write-once. Set at registration, never revised.
    new.date_of_birth   := coalesce(old.date_of_birth, new.date_of_birth);
    new.consent_basis      := old.consent_basis;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  /*
   * The link that carried the consent has gone.
   *
   * unlink_student() lets either side end the relationship, and a consent
   * granted by a parent who is no longer the child's linked guardian is not a
   * consent — it is a stale row that happens to still say 'parent'. Leaving it
   * would mean a child could be unlinked from the adult responsible for them
   * and carry on unsupervised on the strength of a permission that adult can
   * no longer withdraw.
   *
   * This lives here rather than inside unlink_student() so that re-running
   * family.sql cannot quietly remove it.
   */
  if tg_op = 'UPDATE'
     and old.parent_id is not null
     and new.parent_id is distinct from old.parent_id
     and old.consent_basis = 'parent'
     and old.consent_granted_by = old.parent_id
  then
    new.consent_basis      := null;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  end if;

  -- The half of the plausibility test a CHECK constraint cannot hold.
  if new.date_of_birth > current_date then
    raise exception 'That date of birth is in the future.';
  end if;

  is_student := new.role = 'student' or exists (
    select 1 from studeasy.profile_roles r
    where r.profile_id = new.id and r.role = 'student'
  );

  /*
   * Clearing an account that does not need a guardian. Runs on every path —
   * email signup, Google account completing at /register/complete, an admin
   * correcting a record — because all three end in a write to this row and
   * none of them should have to remember to do this.
   *
   * There is no matching branch setting the basis for an under-age child. That
   * is the point: they stay null, and null is the gate.
   */
  if is_student
     and new.consent_basis is null
     and new.date_of_birth is not null
     and not studeasy.needs_guardian_consent(new.date_of_birth)
  then
    new.consent_basis := 'not_required';
  end if;

  return new;
end;
$$;

/*
 * Fires after profiles_guard, which Postgres decides by name. That order
 * matters: guard_profile() is what settles new.role, and the branch above
 * asks what the role ended up being.
 */
drop trigger if exists profiles_guard_consent on studeasy.profiles;
create trigger profiles_guard_consent
  before insert or update on studeasy.profiles
  for each row execute function studeasy.guard_consent();

revoke all on function studeasy.guard_consent() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Giving it, and taking it back
-- ---------------------------------------------------------------------------

/*
 * A linked parent or caregiver confirms.
 *
 * Being linked is the whole authorisation, and it is a high bar already: the
 * parent had to quote the Student ID and the STUDENT had to approve the
 * request. Holding a six-character code is not enough to get here.
 *
 * Deliberately not offered to tutors or administrators. An administrator can
 * correct a record directly, which leaves their name in the audit log; giving
 * them a one-click "consent on behalf of a parent" button would produce rows
 * indistinguishable from a real parent's, which is the one thing a consent
 * record must never contain.
 */
create or replace function studeasy.grant_parental_consent(student uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  linked_parent uuid;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;
  if not studeasy.has_role('parent') then
    raise exception 'Only a parent or caregiver account can confirm this.';
  end if;

  select p.parent_id into linked_parent
  from studeasy.profiles p where p.id = student;

  if not found then
    raise exception 'We could not find that student.';
  end if;
  if linked_parent is distinct from caller then
    raise exception 'You are not linked to that student.';
  end if;

  if not studeasy.consent_pending(student) then
    return;  -- Already settled. Confirming twice is not an error.
  end if;

  perform set_config('studeasy.consent_write', 'on', true);

  update studeasy.profiles
  set consent_basis      = 'parent',
      consent_granted_at = now(),
      consent_granted_by = caller,
      updated_at         = now()
  where id = student;

  /*
   * notifications.organization_id is NOT NULL, and a profile that somehow has
   * no organisation would therefore fail this insert and roll back the consent
   * along with it. Telling the child is worth doing; it is not worth losing
   * the consent over, so a student with no org simply goes untold.
   */
  insert into studeasy.notifications (organization_id, profile_id, kind, title, body, link)
  select p.organization_id, student, 'consent_granted',
         'You can get started',
         'Your parent or caregiver has confirmed your account. Everything is open now.',
         '/portal/student'
  from studeasy.profiles p
  where p.id = student and p.organization_id is not null;
end;
$$;

/*
 * And withdrawing it. A guardian who can give consent but not take it back has
 * not really been asked for consent.
 *
 * The student's existing work is left alone rather than deleted: erasure is a
 * separate request with its own consequences, and silently destroying a term's
 * marking because somebody clicked the wrong button would be worse than the
 * problem. What stops is the collecting — from here the account is gated
 * again and cannot add to the record.
 */
create or replace function studeasy.withdraw_parental_consent(student uuid)
returns void
language plpgsql
security definer
set search_path = studeasy, public
as $$
declare
  caller uuid := auth.uid();
  linked_parent uuid;
begin
  if caller is null then
    raise exception 'You must be signed in.';
  end if;

  select p.parent_id into linked_parent
  from studeasy.profiles p where p.id = student;

  if not found then
    raise exception 'We could not find that student.';
  end if;
  if linked_parent is distinct from caller and not studeasy.is_admin() then
    raise exception 'Only the linked parent or caregiver can withdraw this.';
  end if;

  perform set_config('studeasy.consent_write', 'on', true);

  update studeasy.profiles
  set consent_basis      = null,
      consent_granted_at = null,
      consent_granted_by = null,
      updated_at         = now()
  where id = student
    and consent_basis = 'parent';   -- never re-gate a 16-year-old
end;
$$;

grant execute on function studeasy.grant_parental_consent(uuid) to authenticated;
grant execute on function studeasy.withdraw_parental_consent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Where the gate actually bites
--
-- The decision was "cannot sit assessments or accumulate a record", so the
-- enforcement is on the two writes that start a record: an attempt, and the
-- coins an attempt earns. Reads are untouched — a gated student can still see
-- their own name, their Student ID and the waiting screen, which they need in
-- order to get themselves unstuck.
--
-- Note what is NOT gated: answering a parent's link request. The parent who
-- can lift the gate can only be linked by the student approving them, so
-- freezing that would leave the account permanently stuck with no way out.
-- ---------------------------------------------------------------------------

drop policy if exists attempts_insert on studeasy.attempts;
create policy attempts_insert on studeasy.attempts
  for insert with check (
    student_id = auth.uid()
    and not studeasy.consent_pending(auth.uid())
  );

/*
 * Belt and braces on answers.
 *
 * The answers policy already routes through the attempt, so no attempt means
 * no answers and this changes nothing today. It is here because the day
 * somebody adds a second way to create an attempt — an import, a fixture, a
 * migration that backfills — the gate should already be on the row that holds
 * the child's actual work, not only on the row that points at it.
 */
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
          or studeasy.is_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from studeasy.attempts t
      where t.id = answers.attempt_id
        and (
          (t.student_id = auth.uid() and not studeasy.consent_pending(auth.uid()))
          or exists (
            select 1 from studeasy.assessments a
            where a.id = t.assessment_id and a.teacher_id = auth.uid()
          )
          or studeasy.is_admin()
        )
    )
  );

/*
 * The durable half of the gate.
 *
 * The policy above is the right place for this rule, but policies are declared
 * in assessments.sql and this file rewrites one of them — so an operator who
 * re-runs assessments.sql afterwards would silently restore the ungated
 * version and the gate would be gone with no error and no diff. A trigger
 * defined here is not touched by that file, so the rule survives any paste
 * order. Both are kept: the policy refuses silently, the trigger says why.
 */
create or replace function studeasy.block_ungated_attempt()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if studeasy.is_admin() then
    return new;
  end if;
  if studeasy.consent_pending(new.student_id) then
    raise exception
      'This account is waiting for a parent or caregiver to confirm it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists attempts_consent_gate on studeasy.attempts;
create trigger attempts_consent_gate
  before insert on studeasy.attempts
  for each row execute function studeasy.block_ungated_attempt();

revoke all on function studeasy.block_ungated_attempt() from public, anon, authenticated;

/*
 * Coins and house points, the same way.
 *
 * Blocking attempts does not cover this on its own: touch_streak() pays a
 * student for signing in, and a gated child signing in to read the waiting
 * screen would quietly start banking currency and climbing a house table. A
 * ledger is a record, and the decision was that the record does not start.
 *
 * These skip the row rather than raising. Every caller is a side effect of
 * something else — marking, a streak, a challenge — and failing the parent
 * transaction because a child has no consent yet would break the thing that
 * was legitimately happening.
 */
create or replace function studeasy.skip_ungated_award()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  if studeasy.consent_pending(new.profile_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists coin_ledger_consent_gate on studeasy.coin_ledger;
create trigger coin_ledger_consent_gate
  before insert on studeasy.coin_ledger
  for each row execute function studeasy.skip_ungated_award();

drop trigger if exists house_points_consent_gate on studeasy.house_points;
create trigger house_points_consent_gate
  before insert on studeasy.house_points
  for each row execute function studeasy.skip_ungated_award();

revoke all on function studeasy.skip_ungated_award() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The audit record
--
-- A consent you cannot evidence afterwards is not much of a consent. This
-- reuses audit.sql's trigger rather than writing rows from the functions
-- above, for the reason that file gives: a trail that depends on every future
-- code path remembering to log is one that will develop gaps.
-- ---------------------------------------------------------------------------

create or replace function studeasy.write_consent_audit()
returns trigger
language plpgsql
security definer
set search_path = studeasy, public
as $$
begin
  insert into studeasy.audit_log
    (organization_id, actor_id, action, entity, entity_id, detail)
  values (
    new.organization_id,
    auth.uid(),
    case when new.consent_basis is null
         then 'consent.withdrawn' else 'consent.granted' end,
    'consent',
    new.id::text,
    jsonb_build_object(
      'from_basis', old.consent_basis,
      'to_basis', new.consent_basis,
      'granted_by', new.consent_granted_by,
      'granted_at', new.consent_granted_at
    )
  );
  return new;
end;
$$;

drop trigger if exists profiles_consent_audit on studeasy.profiles;
create trigger profiles_consent_audit
  after update on studeasy.profiles
  for each row
  when (old.consent_basis is distinct from new.consent_basis)
  execute function studeasy.write_consent_audit();

revoke all on function studeasy.write_consent_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading the state back
-- ---------------------------------------------------------------------------

/*
 * The children this parent is linked to who are still waiting on them.
 *
 * A parent can already read a linked child's profile row, so this adds no
 * visibility. It exists so the portal asks one question instead of filtering
 * client-side and getting the predicate subtly wrong.
 */
create or replace function studeasy.my_children_awaiting_consent()
returns table (student_id uuid, full_name text, student_code text, born date)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select p.id, p.full_name, p.student_code, p.date_of_birth
  from studeasy.profiles p
  where p.parent_id = auth.uid()
    and studeasy.consent_pending(p.id)
  order by p.full_name;
$$;

/*
 * The backfilled accounts, for an administrator to work through.
 *
 * 'legacy' is a debt, not a basis. This is how it gets paid down, and why the
 * value is a distinct string rather than being folded into 'not_required'
 * where it would become invisible.
 */
create or replace function studeasy.students_missing_dob()
returns table (student_id uuid, full_name text, email text, registered timestamptz)
language sql
stable
security definer
set search_path = studeasy, public
as $$
  select p.id, p.full_name, p.email, p.created_at
  from studeasy.profiles p
  where p.consent_basis = 'legacy' and p.date_of_birth is null
    and studeasy.is_admin()
  order by p.created_at;
$$;

grant execute on function studeasy.my_children_awaiting_consent() to authenticated;
grant execute on function studeasy.students_missing_dob() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
--
-- Runs last, so every trigger above is in place before any row moves.
--
-- Every student who already exists is marked 'legacy': registered before this
-- gate, age never established. They are NOT locked out, because locking a live
-- platform's entire student body out of its own work on the day a migration
-- runs is not a defensible way to introduce a safeguard — and because a
-- retrospective block would not undo the collection that has already happened,
-- which is the thing consent is about.
--
-- What it does buy is that the set is finite, named and visible. Anyone added
-- from here is gated properly.
-- ---------------------------------------------------------------------------

do $$
declare
  touched integer;
begin
  perform set_config('studeasy.consent_write', 'on', true);

  update studeasy.profiles p
  set consent_basis = 'legacy'
  where p.consent_basis is null
    and (
      p.role = 'student'
      or exists (
        select 1 from studeasy.profile_roles r
        where r.profile_id = p.id and r.role = 'student'
      )
    );

  get diagnostics touched = row_count;
  raise notice
    'consent.sql: % existing student account(s) marked legacy. List them with: select * from studeasy.students_missing_dob();',
    touched;
end
$$;

-- ---------------------------------------------------------------------------
-- Verification — run this after the file and read the four columns.
-- ---------------------------------------------------------------------------

select
  (select count(*) from studeasy.profiles where consent_basis = 'legacy')
    as legacy_backfilled,
  to_regprocedure('studeasy.grant_parental_consent(uuid)') is not null
    as grant_fn_present,
  exists (select 1 from pg_trigger where tgname = 'attempts_consent_gate')
    as attempt_gate_live,
  exists (select 1 from pg_trigger where tgname = 'profiles_guard_consent')
    as profile_guard_live;
