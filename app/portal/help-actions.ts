'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

export type Result = { error: string | null }

export type NewHelpRequest = {
  title: string
  /** Typed out. May be empty when the whole question is in the attachment. */
  body: string
  subject: string
  yearLevel: string
  /** Storage path from the browser upload, or blank. */
  filePath: string
  fileName: string
}

export async function askForHelp(
  input: NewHelpRequest,
): Promise<Result & { requestId?: string }> {
  const { userId, profile } = await getCurrentUser()
  if (!userId) return { error: 'Sign in to ask for help.' }
  if (!input.title.trim()) return { error: 'Say what the question is about.' }

  /*
   * Either a description or a file. A title alone gives a tutor nothing to work
   * from, and they would have to ask before they could help.
   */
  if (!input.body.trim() && !input.filePath.trim()) {
    return { error: 'Type the question out, or attach the file it came in.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('help_requests')
    .insert({
      organization_id: profile?.organization_id,
      student_id: userId,
      title: input.title.trim(),
      body: input.body.trim() || null,
      subject: input.subject.trim() || null,
      year_level: input.yearLevel.trim() || profile?.year_level || null,
      file_path: input.filePath.trim() || null,
      file_name: input.fileName.trim() || null,
    })
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }

  revalidatePath('/portal/student/help')
  revalidatePath('/portal/tutor/help')
  return { error: null, requestId: (data as { id: string } | null)?.id }
}

/**
 * A tutor answers. answer_help_request() checks the role, so a student cannot
 * answer another student's homework here — the open forum is where they help
 * each other.
 */
export async function answerHelp(
  requestId: string,
  body: string,
  filePath?: string,
  fileName?: string,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('answer_help_request', {
    request: requestId,
    body,
    path: filePath ?? null,
    file_name: fileName ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/help')
  revalidatePath('/portal/student/help')
  return { error: null }
}

export async function acceptAnswer(responseId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_help_response', { response: responseId })
  if (error) return { error: error.message }

  revalidatePath('/portal/student/help')
  return { error: null }
}

/** The student is done with it. */
export async function closeHelpRequest(requestId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('help_requests')
    .update({ status: 'closed' })
    .eq('id', requestId)

  if (error) return { error: error.message }

  revalidatePath('/portal/student/help')
  revalidatePath('/portal/tutor/help')
  return { error: null }
}
