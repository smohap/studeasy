import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { EmptyState } from '@/components/app/Ui'

export const metadata = { title: 'Messages — StudEasy', robots: { index: false } }

/*
 * Messaging has a schema (threads, thread_participants, messages) and no
 * interface yet. This page used to show invented messages from invented tutors,
 * which read as a working inbox — a parent could have sat waiting for a reply
 * to a conversation that never existed. Saying so is the honest version.
 */
export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'parent')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Messages
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Direct messaging is not switched on yet.
        </p>
      </div>

      <EmptyState
        title="No inbox yet"
        body="Until this is built, questions are best asked on the forum — teachers answer there, and the whole class benefits from the reply."
        action={
          <Link
            href="/forum"
            className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
          >
            Go to the forum
          </Link>
        }
      />
    </div>
  )
}
