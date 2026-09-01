'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { hasRole } from '@/lib/roles'
import type { ContentKind } from '@/lib/content-types'

export type Result = { error: string | null }

export type NewContent = {
  title: string
  summary: string
  subject: string
  yearLevel: string
  kind: ContentKind
  /** Storage path from the browser upload, or blank when it is link-only. */
  filePath: string
  fileName: string
  externalUrl: string
  preview: string
  priceDollars: string
}

function buildRow(input: NewContent): Record<string, unknown> | string {
  if (!input.title.trim()) return 'Give it a title.'

  // Entered in dollars, stored in cents; rounding stops a stray "4.999"
  // becoming an amount Stripe cannot charge.
  const priceCents = Math.round(Number(input.priceDollars || '0') * 100)
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return 'Enter a price of 0 or more.'
  }

  return {
    title: input.title.trim(),
    summary: input.summary.trim() || null,
    subject: input.subject.trim() || null,
    year_level: input.yearLevel.trim() || null,
    kind: input.kind,
    file_path: input.filePath.trim() || null,
    file_name: input.fileName.trim() || null,
    external_url: input.externalUrl.trim() || null,
    preview: input.preview.trim() || null,
    price_cents: priceCents,
  }
}

/**
 * Tutors and administrators both write content, so this checks for either
 * rather than for the tutor role alone.
 */
export async function createContent(input: NewContent): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || !profile || (!hasRole(profile, 'tutor') && !hasRole(profile, 'admin'))) {
    return { error: 'Only a tutor or an administrator can publish content.' }
  }

  const row = buildRow(input)
  if (typeof row === 'string') return { error: row }

  const supabase = await createClient()
  const { error } = await supabase.from('content_items').insert({
    ...row,
    organization_id: profile.organization_id,
    author_id: userId,
    author_name: profile.full_name ?? 'StudEasy',
    status: 'draft',
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/library')
  return { error: null }
}

export async function updateContent(contentId: string, input: NewContent): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || !profile) return { error: 'You are not signed in.' }

  const row = buildRow(input)
  if (typeof row === 'string') return { error: row }

  // content_items_write limits this to the author, or an admin.
  const supabase = await createClient()
  const { error } = await supabase.from('content_items').update(row).eq('id', contentId)

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/library')
  revalidatePath(`/library/${contentId}`)
  return { error: null }
}

export async function setContentStatus(
  contentId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('content_items')
    .update({ status })
    .eq('id', contentId)

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/library')
  revalidatePath('/library')
  return { error: null }
}
