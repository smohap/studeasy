'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLE_HOME, type Role } from '@/lib/roles'

export type Result = { error: string | null }

/*
 * Every one of these is a thin call onto a SECURITY DEFINER function that
 * checks is_admin() for itself. Nothing here decides who may do what — if this
 * file were the only thing between a student and the admin role, a forged
 * request would be enough.
 */

export async function grantRole(target: string, role: Role): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('grant_role', { target, wanted: role })
  if (error) return { error: error.message }

  revalidatePath('/portal/admin/people')
  revalidatePath('/portal/admin')
  return { error: null }
}

export async function revokeRole(target: string, role: Role): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_role', { target, unwanted: role })
  if (error) return { error: error.message }

  revalidatePath('/portal/admin/people')
  revalidatePath('/portal/admin')
  return { error: null }
}

/** Approve or decline a claimed role — in practice, a tutor signup. */
export async function approveRole(
  target: string,
  role: Role,
  approve: boolean,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_role', { target, wanted: role, approve })
  if (error) return { error: error.message }

  revalidatePath('/portal/admin/people')
  revalidatePath('/portal/admin')
  return { error: null }
}

/**
 * Move yourself between the roles you already hold.
 *
 * Redirects rather than returning, because the portal's whole shape — nav,
 * dashboard, guards — follows the active role, and staying on a page the new
 * role does not own would only bounce.
 */
export async function switchActiveRole(role: Role): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_active_role', { wanted: role })
  if (error) throw new Error(error.message)

  revalidatePath('/portal', 'layout')
  redirect(ROLE_HOME[role])
}
