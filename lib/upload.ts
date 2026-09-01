import { createClient } from '@/lib/supabase/client'

/** What a student may attach to a question, and a tutor to an answer. */
export const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.txt,application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'

/** Nothing here needs to be large, and a runaway upload is a bad surprise. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export type Uploaded = { path: string; name: string }

/**
 * Puts a file in a private bucket and hands back where it went.
 *
 * Every bucket in this app keys its policies off the first path segment being
 * the owner's id, so that shape is enforced here rather than left to each
 * caller to remember.
 *
 * The size check is a courtesy, not a control — the bucket's own limit is what
 * actually holds. It exists so somebody who picks a 400MB video is told
 * immediately rather than after a long silent wait.
 */
export async function uploadTo(
  bucket: string,
  scope: string,
  file: File,
): Promise<Uploaded> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    )
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Your session expired. Sign in and try again.')

  // Spaces and punctuation in object keys cause more trouble than they are
  // worth; the original name is returned alongside the path for display.
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${user.id}/${scope}/${Date.now()}-${safe}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
  })
  if (error) throw new Error(error.message)

  return { path, name: file.name }
}
