import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type HelpResponse = {
  id: string
  body: string
  responderName: string
  fileName: string | null
  fileUrl: string | null
  isAccepted: boolean
  createdAt: string
}

export type HelpRequest = {
  id: string
  studentId: string
  studentName: string
  title: string
  body: string | null
  subject: string | null
  yearLevel: string | null
  fileName: string | null
  /** Signed; the bucket is private. Null when there is no attachment. */
  fileUrl: string | null
  status: 'open' | 'answered' | 'closed'
  acceptedResponseId: string | null
  createdAt: string
  responses: HelpResponse[]
}

const REQUEST_FIELDS = `id, student_id, title, body, subject, year_level, file_path,
  file_name, status, accepted_response_id, created_at`

type RequestRow = {
  id: string
  student_id: string
  title: string
  body: string | null
  subject: string | null
  year_level: string | null
  file_path: string | null
  file_name: string | null
  status: 'open' | 'answered' | 'closed'
  accepted_response_id: string | null
  created_at: string
}

/**
 * Fills in names, answers and signed links for a set of requests.
 *
 * Shared by the student's own list and the tutor queue so the two cannot drift
 * — a student and the tutor answering them should see the same thing.
 */
async function hydrate(rows: RequestRow[]): Promise<HelpRequest[]> {
  if (rows.length === 0) return []
  const supabase = await createClient()

  const [{ data: answerRows }, { data: people }] = await Promise.all([
    supabase
      .from('help_responses')
      .select(
        'id, request_id, responder_id, body, file_path, file_name, is_accepted, created_at',
      )
      .in(
        'request_id',
        rows.map((r) => r.id),
      )
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', [...new Set(rows.map((r) => r.student_id))]),
  ])

  const answers = (answerRows ?? []) as {
    id: string
    request_id: string
    responder_id: string | null
    body: string
    file_path: string | null
    file_name: string | null
    is_accepted: boolean
    created_at: string
  }[]

  const responderIds = [
    ...new Set(answers.map((a) => a.responder_id).filter(Boolean)),
  ] as string[]

  const { data: responders } = responderIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', responderIds)
    : { data: [] as { id: string; full_name: string | null }[] }

  const names = new Map<string, string>()
  for (const p of [
    ...((people ?? []) as { id: string; full_name: string | null }[]),
    ...((responders ?? []) as { id: string; full_name: string | null }[]),
  ]) {
    names.set(p.id, p.full_name ?? 'Member')
  }

  const sign = async (path: string | null) => {
    if (!path) return null
    const { data } = await supabase.storage
      .from('help-uploads')
      .createSignedUrl(path, 60 * 60)
    return data?.signedUrl ?? null
  }

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: names.get(r.student_id) ?? 'Student',
      title: r.title,
      body: r.body,
      subject: r.subject,
      yearLevel: r.year_level,
      fileName: r.file_name,
      fileUrl: await sign(r.file_path),
      status: r.status,
      acceptedResponseId: r.accepted_response_id,
      createdAt: r.created_at,
      responses: await Promise.all(
        answers
          .filter((a) => a.request_id === r.id)
          .map(async (a) => ({
            id: a.id,
            body: a.body,
            responderName: a.responder_id
              ? (names.get(a.responder_id) ?? 'Tutor')
              : 'Removed',
            fileName: a.file_name,
            fileUrl: await sign(a.file_path),
            isAccepted: a.is_accepted,
            createdAt: a.created_at,
          })),
      ),
    })),
  )
}

/** The signed-in student's own questions. */
export async function listMyHelpRequests(): Promise<HelpRequest[]> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('help_requests')
    .select(REQUEST_FIELDS)
    .eq('student_id', userId)
    .order('created_at', { ascending: false })

  return hydrate((data ?? []) as RequestRow[])
}

/**
 * The queue a tutor works from — everything not yet closed, oldest first.
 *
 * Oldest first on purpose: the question that has been waiting longest is the
 * one a tutor should see, not whichever happens to be newest.
 */
export async function listOpenHelpRequests(): Promise<HelpRequest[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('help_requests')
    .select(REQUEST_FIELDS)
    .neq('status', 'closed')
    .order('created_at', { ascending: true })
    .limit(50)

  return hydrate((data ?? []) as RequestRow[])
}
