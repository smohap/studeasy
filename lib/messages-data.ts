import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type ThreadSummary = {
  id: string
  subject: string | null
  lastAt: string
  otherName: string
  preview: string | null
  unread: number
}

export type ThreadMessage = {
  id: string
  body: string
  sentAt: string
  senderId: string | null
  senderName: string
  mine: boolean
}

export type ThreadDetail = {
  id: string
  subject: string | null
  otherName: string
  messages: ThreadMessage[]
}

export type Person = { id: string; name: string; role: string }

/**
 * The caller's inbox, newest first.
 *
 * list_threads() does the unread counting and the name lookup in one query
 * rather than the app issuing one per thread.
 */
export async function listThreads(): Promise<ThreadSummary[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_threads')
  if (error) {
    console.error('list_threads failed:', error.message)
    return []
  }

  return (
    (data ?? []) as {
      t_id: string
      t_subject: string | null
      t_last_at: string
      other_name: string
      preview: string | null
      unread_count: number
    }[]
  ).map((r) => ({
    id: r.t_id,
    subject: r.t_subject,
    lastAt: r.t_last_at,
    otherName: r.other_name,
    preview: r.preview,
    unread: r.unread_count,
  }))
}

/**
 * One conversation. Null when the caller is not a participant — threads_select
 * and messages_select both require in_thread(), so a guessed id returns
 * nothing rather than somebody else's conversation.
 */
export async function getThread(threadId: string): Promise<ThreadDetail | null> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return null

  const supabase = await createClient()

  const { data: thread } = await supabase
    .from('threads')
    .select('id, subject')
    .eq('id', threadId)
    .maybeSingle()

  if (!thread) return null

  const [{ data: messageRows }, { data: participantRows }] = await Promise.all([
    supabase
      .from('messages')
      .select('id, body, sent_at, sender_id, sender:profiles(full_name)')
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true }),
    supabase
      .from('thread_participants')
      .select('profile_id, person:profiles(full_name)')
      .eq('thread_id', threadId),
  ])

  const others = (
    (participantRows ?? []) as unknown as {
      profile_id: string
      person: { full_name: string | null } | null
    }[]
  )
    .filter((p) => p.profile_id !== userId)
    .map((p) => p.person?.full_name ?? 'StudEasy member')

  const messages = (
    (messageRows ?? []) as unknown as {
      id: string
      body: string
      sent_at: string
      sender_id: string | null
      sender: { full_name: string | null } | null
    }[]
  ).map((m) => ({
    id: m.id,
    body: m.body,
    sentAt: m.sent_at,
    senderId: m.sender_id,
    // sender_id is ON DELETE SET NULL, so a message can outlive its author.
    senderName: m.sender?.full_name ?? 'Former member',
    mine: m.sender_id === userId,
  }))

  return {
    id: (thread as { id: string }).id,
    subject: (thread as { subject: string | null }).subject,
    otherName: others.join(', ') || 'StudEasy',
    messages,
  }
}

/**
 * Everyone the caller may start a conversation with.
 *
 * The list comes from may_message() server-side, so it is the same rule
 * start_thread() enforces — this cannot drift into offering a recipient the
 * database will then refuse.
 */
export async function listMessageablePeople(): Promise<Person[]> {
  if (!isAuthConfigured) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_messageable_people')
  if (error) {
    console.error('list_messageable_people failed:', error.message)
    return []
  }

  return (
    (data ?? []) as { person_id: string; person_name: string; role_label: string }[]
  ).map((p) => ({ id: p.person_id, name: p.person_name, role: p.role_label }))
}
