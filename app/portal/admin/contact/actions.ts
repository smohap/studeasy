'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Mark one message read or closed.
 *
 * No is_admin() check here: set_contact_message_status() does it in the
 * database and raises otherwise. Repeating the check in the action would be
 * the second-best place to enforce it and would suggest the first place is
 * optional.
 */
export async function setContactStatus(
  id: string,
  status: 'new' | 'read' | 'closed',
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_contact_message_status', {
    p_id: id,
    p_status: status,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/admin/contact')
  return { error: null }
}
