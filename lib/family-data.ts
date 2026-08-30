import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type ChildClass = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  registrationStatus: string
  attendance: string | null
}

export type ChildSummary = {
  id: string
  fullName: string | null
  studentCode: string | null
  yearLevel: string | null
  subjects: string[]
  /** Soonest first; classes that have already finished are left out. */
  upcoming: ChildClass[]
  handedIn: number
  marked: number
  /** Mean of released marks as a percentage, or null if nothing is marked yet. */
  averagePct: number | null
}

/**
 * The children linked to the signed-in parent, with what they have actually
 * done.
 *
 * Every number here is counted from real rows. The parent dashboard used to
 * show invented attendance and homework percentages against invented children,
 * which is worse than showing nothing — a parent could have acted on it.
 *
 * These rows are visible because a parent's policies carry an is_my_child()
 * arm. A link the student has not approved yet returns nothing at all.
 */
export async function getMyChildren(): Promise<ChildSummary[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()

  const { data: kids } = await supabase
    .from('profiles')
    .select('id, full_name, student_code, year_level, subjects')
    .eq('parent_id', userId)
    .order('full_name', { ascending: true })

  const children = (kids ?? []) as {
    id: string
    full_name: string | null
    student_code: string | null
    year_level: string | null
    subjects: string[] | null
  }[]

  if (children.length === 0) return []

  const ids = children.map((c) => c.id)

  const [{ data: subs }, { data: regs }] = await Promise.all([
    supabase
      .from('submissions')
      .select('student_id, marks, released, assignment:assignments(max_marks)')
      .in('student_id', ids),
    supabase
      .from('class_registrations')
      .select(
        'student_id, status, attendance, class:class_sessions(id, title, starts_at, ends_at)',
      )
      .in('student_id', ids)
      .in('status', ['confirmed', 'offered']),
  ])

  type Sub = {
    student_id: string
    marks: number | null
    released: boolean
    assignment: { max_marks: number } | null
  }
  type Reg = {
    student_id: string
    status: string
    attendance: string | null
    class: { id: string; title: string; starts_at: string; ends_at: string } | null
  }

  const submissions = (subs ?? []) as unknown as Sub[]
  const registrations = (regs ?? []) as unknown as Reg[]
  const now = Date.now()

  return children.map((c) => {
    const mine = submissions.filter((s) => s.student_id === c.id)
    // Only released marks count. An unreleased mark is the teacher's working
    // out, not a result, and a parent should not see it before the student.
    const scored = mine.filter(
      (s) => s.released && s.marks != null && (s.assignment?.max_marks ?? 0) > 0,
    )

    const averagePct =
      scored.length > 0
        ? Math.round(
            scored.reduce(
              (sum, s) => sum + ((s.marks ?? 0) / (s.assignment?.max_marks ?? 1)) * 100,
              0,
            ) / scored.length,
          )
        : null

    const upcoming = registrations
      .filter((r) => r.student_id === c.id && r.class)
      .filter((r) => new Date(r.class!.ends_at).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.class!.starts_at).getTime() - new Date(b.class!.starts_at).getTime(),
      )
      .map((r) => ({
        id: r.class!.id,
        title: r.class!.title,
        startsAt: r.class!.starts_at,
        endsAt: r.class!.ends_at,
        registrationStatus: r.status,
        attendance: r.attendance,
      }))

    return {
      id: c.id,
      fullName: c.full_name,
      studentCode: c.student_code,
      yearLevel: c.year_level,
      subjects: c.subjects ?? [],
      upcoming,
      handedIn: mine.length,
      marked: scored.length,
      averagePct,
    }
  })
}
