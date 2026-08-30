import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Frees class seats that were offered but never paid for, and hands them to
 * whoever is next on the waiting list.
 *
 * register_for_class() already sweeps a class before counting its seats, so a
 * seat is never wrongly withheld from someone actively trying to take it. This
 * job exists for the other half: a student sitting on a waiting list has no
 * reason to keep retrying, so somebody has to notice on their behalf and send
 * the notification.
 *
 * Runs with the service role, which bypasses RLS — hence the shared-secret
 * check first. Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled
 * invocations. With no CRON_SECRET set the route refuses rather than running
 * open, because an unauthenticated caller could otherwise force promotions.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not set, so this job will not run.' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('release_expired_offers')

  if (error) {
    console.error('release_expired_offers failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ freed: (data as number) ?? 0 })
}
