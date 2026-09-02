--
-- analytics.sql — real aggregates for the admin and tutor reporting pages.
--
-- Run AFTER supabase/payments.sql, supabase/platform.sql, supabase/multi-role.sql
-- and supabase/content-and-help.sql. Safe to re-run.
--
-- Both reporting pages currently say, correctly, that trend reporting is not
-- built. They used to draw charts from a fixtures file — invented revenue,
-- attendance and "grade improvement" rendered as a business dashboard, which
-- is the most dangerous kind of dummy data because it looks like a basis for a
-- decision. These functions replace that with counts of real rows.
--
-- Two things they deliberately do NOT do:
--
--   * No projections, no "trending up 12%". Every number here is a count or a
--     sum of records that exist. A derived trend needs a baseline this
--     platform has not run long enough to have.
--   * No per-student figures on the tutor page. A teacher's effectiveness
--     measured against named children is a claim needing far more care than an
--     aggregate query, and being wrong about it in either direction is harmful.
--
-- Money is integer cents throughout, as everywhere else in this schema.
--

-- ---------------------------------------------------------------------------
-- Platform-wide, for administrators
-- ---------------------------------------------------------------------------

/*
 * SECURITY DEFINER with an explicit is_admin() gate rather than relying on the
 * RLS each table already has: an aggregate over rows you cannot see would
 * otherwise silently return a smaller number rather than refusing, and a
 * quietly wrong total is worse than an error.
 */
create or replace function studeasy.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = studeasy, public
as $$
declare
  result jsonb;
begin
  if not studeasy.is_admin() then
    raise exception 'Administrators only.';
  end if;

  select jsonb_build_object(
    'people', jsonb_build_object(
      'students', (select count(*) from studeasy.profile_roles
                    where role = 'student' and status = 'active'),
      'parents', (select count(*) from studeasy.profile_roles
                   where role = 'parent' and status = 'active'),
      'tutors', (select count(*) from studeasy.profile_roles
                  where role = 'tutor' and status = 'active'),
      -- Teachers waiting on an admin decision; the number that needs acting on.
      'tutors_pending', (select count(*) from studeasy.profile_roles
                          where role = 'tutor' and status = 'pending')
    ),
    'catalog', jsonb_build_object(
      'courses_published', (select count(*) from studeasy.courses
                             where status = 'published' and deleted_at is null),
      'courses_draft', (select count(*) from studeasy.courses
                         where status = 'draft' and deleted_at is null),
      -- 'pending_review', per the check constraint in marketplace.sql. Getting
      -- this literal wrong returns 0 rather than an error, which is the exact
      -- quietly-wrong failure this file is meant to avoid.
      'courses_in_review', (select count(*) from studeasy.courses
                             where status = 'pending_review' and deleted_at is null),
      'classes_upcoming', (select count(*) from studeasy.class_sessions
                            where starts_at > now() and status = 'published')
    ),
    'activity', jsonb_build_object(
      'enrolments', (select count(*) from studeasy.enrolments
                      where status <> 'cancelled'),
      'class_registrations', (select count(*) from studeasy.class_registrations
                               where status = 'confirmed'),
      'attempts_30d', (select count(*) from studeasy.attempts
                        where submitted_at > now() - interval '30 days'),
      'help_open', (select count(*) from studeasy.help_requests
                     where status = 'open'),
      -- Work sitting on a person: handed in, not yet released.
      'marking_waiting', (select count(*) from studeasy.attempts
                           where submitted_at is not null and not released)
    ),
    'revenue', jsonb_build_object(
      'paid_cents', coalesce((select sum(total_cents) from studeasy.orders
                               where status = 'paid'), 0),
      'paid_orders', (select count(*) from studeasy.orders where status = 'paid'),
      'refunded_cents', coalesce((select sum(total_cents) from studeasy.orders
                                   where status = 'refunded'), 0),
      'pending_orders', (select count(*) from studeasy.orders
                          where status = 'pending'),
      'payouts_owed_cents', coalesce((select sum(net_cents) from studeasy.payouts
                                       where status in ('owed', 'scheduled')), 0),
      -- Last twelve months of settled money, oldest first.
      'monthly', coalesce((
        select jsonb_agg(m order by m->>'month')
        from (
          select jsonb_build_object(
                   'month', to_char(o.paid_at, 'YYYY-MM'),
                   'cents', sum(o.total_cents),
                   'orders', count(*)
                 ) as m
          from studeasy.orders o
          where o.status = 'paid'
            and o.paid_at is not null
            and o.paid_at > now() - interval '12 months'
          group by to_char(o.paid_at, 'YYYY-MM')
        ) months
      ), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- One teacher's own numbers
-- ---------------------------------------------------------------------------

/*
 * Scoped to auth.uid() throughout — a teacher sees their own work and nobody
 * else's. No admin arm: an administrator looking at a specific teacher is a
 * different screen answering a different question, and quietly reusing this
 * one would make "my numbers" and "their numbers" the same call.
 */
create or replace function studeasy.tutor_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = studeasy, public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  select jsonb_build_object(
    'courses', jsonb_build_object(
      'published', (select count(*) from studeasy.courses
                     where teacher_id = me and status = 'published'
                       and deleted_at is null),
      'draft', (select count(*) from studeasy.courses
                 where teacher_id = me and status = 'draft'
                   and deleted_at is null)
    ),
    'classes', jsonb_build_object(
      'upcoming', (select count(*) from studeasy.class_sessions
                    where teacher_id = me and starts_at > now()
                      and status = 'published'),
      'held', (select count(*) from studeasy.class_sessions
                where teacher_id = me and ends_at < now())
    ),
    -- Distinct people, so someone in two of this teacher's classes counts once.
    'students', (
      select count(distinct s) from (
        select e.student_id as s
        from studeasy.enrolments e
        join studeasy.courses c on c.id = e.course_id
        where c.teacher_id = me and e.status <> 'cancelled'
        union
        select r.student_id
        from studeasy.class_registrations r
        join studeasy.class_sessions cs on cs.id = r.class_id
        where cs.teacher_id = me and r.status = 'confirmed'
      ) people
    ),
    'marking', jsonb_build_object(
      'waiting', (select count(*)
                   from studeasy.attempts a
                   join studeasy.assessments s on s.id = a.assessment_id
                   where s.teacher_id = me
                     and a.submitted_at is not null and not a.released)
    ),
    'assessments', jsonb_build_object(
      'submitted', (select count(*)
                     from studeasy.attempts a
                     join studeasy.assessments s on s.id = a.assessment_id
                     where s.teacher_id = me and a.submitted_at is not null),
      'passed', (select count(*)
                  from studeasy.attempts a
                  join studeasy.assessments s on s.id = a.assessment_id
                  where s.teacher_id = me and a.passed),
      -- Null rather than 0 when nothing has been marked: "no data" and
      -- "everybody failed" must not render as the same number.
      'pass_rate_pct', (
        select case
          when count(*) filter (where a.released and a.passed is not null) = 0
            then null
          else round(
            100.0 * count(*) filter (where a.passed)
            / count(*) filter (where a.released and a.passed is not null)
          )
        end
        from studeasy.attempts a
        join studeasy.assessments s on s.id = a.assessment_id
        where s.teacher_id = me
      )
    ),
    'rating', jsonb_build_object(
      'reviews', coalesce((select sum(rating_count) from studeasy.courses
                            where teacher_id = me), 0),
      'average', (
        -- Weighted by review count, so a 5.0 from one review does not
        -- outweigh a 4.5 from forty.
        select round(
                 sum(rating_avg * rating_count) / nullif(sum(rating_count), 0), 2)
        from studeasy.courses
        where teacher_id = me and rating_count > 0
      )
    ),
    'earnings', jsonb_build_object(
      'paid_cents', coalesce((select sum(net_cents) from studeasy.payouts
                               where teacher_id = me and status = 'paid'), 0),
      'owed_cents', coalesce((select sum(net_cents) from studeasy.payouts
                               where teacher_id = me
                                 and status in ('owed', 'scheduled')), 0),
      'monthly', coalesce((
        select jsonb_agg(m order by m->>'month')
        from (
          select jsonb_build_object(
                   'month', to_char(p.created_at, 'YYYY-MM'),
                   'cents', sum(p.net_cents)
                 ) as m
          from studeasy.payouts p
          where p.teacher_id = me
            and p.status <> 'reversed'
            and p.created_at > now() - interval '12 months'
          group by to_char(p.created_at, 'YYYY-MM')
        ) months
      ), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Both are gated inside: admin_analytics() by is_admin(), tutor_analytics() by
-- scoping every subquery to auth.uid().
grant execute on function studeasy.admin_analytics() to authenticated;
grant execute on function studeasy.tutor_analytics() to authenticated;
