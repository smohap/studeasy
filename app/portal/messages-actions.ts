'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'

export type MessageResult = { error: string | null; threadId?: string }

/**
 * Opens a conversation, or adds to the existing one with the same person.
 *
 * Every permission question is answered by start_thread() — may_message()
 * decides, and it raises rather than returning a row when the answer is no.
 * Nothing is checked here that the database does not check again.
 */
export async function startThread(
  recipientId: string,
  body: string,
  subject: string,
): Promise<MessageResult> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return { error: 'Sign in to send a message.' }
  if (!recipientId) return { error: 'Choose who to message.' }
  if (!body.trim()) return { error: 'Write a message first.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_thread', {
    other: recipientId,
    first_message: body,
    subject: subject.trim() || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/portal/messages')
  return { error: null, threadId: data as string }
}

/**
 * Replies in a thread.
 *
 * A plain insert rather than an RPC: messages_insert already requires
 * `sender_id = auth.uid() and in_thread(thread_id)`, which is exactly the
 * rule, and the messages_bump_thread trigger moves last_message_at.
 */
export async function sendMessage(
  threadId: string,
  body: string,
): Promise<MessageResult> {
  const { userId } = await getCurrentUser()
  if (!isAuthConfigured || !userId) return { error: 'Sign in to send a message.' }
  if (!body.trim()) return { error: 'Write a message first.' }

  const supabase = await createClient()
  const { error } = await supabase.from('messages').insert({
    thread_id: threadId,
    sender_id: userId,
    body: body.trim(),
  })

  if (error) {
    return {
      error: error.message.includes('row-level security')
        ? 'You are not part of this conversation.'
        : error.message,
    }
  }

  revalidatePath('/portal/messages')
  revalidatePath(`/portal/messages/${threadId}`)
  return { error: null, threadId }
}

/** Clears the unread badge for the caller. Safe to call on every thread open. */
export async function markThreadRead(threadId: string): Promise<void> {
  if (!isAuthConfigured) return
  const supabase = await createClient()
  await supabase.rpc('mark_thread_read', { thread: threadId })
}
