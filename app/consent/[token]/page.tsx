import AuthShell from '@/components/AuthShell'
import { createClient, isAuthConfigured } from '@/lib/supabase/server'
import ConsentForm from './ConsentForm'

export const metadata = { robots: { index: false, follow: false } }

/**
 * Each token is unique and single-use — this page must never be served from
 * a cache, static or otherwise.
 */
export const dynamic = 'force-dynamic'

type DescribeRow = { student_name: string; expired: boolean; spent: boolean }

/**
 * One message covers a bad, expired or spent token — distinguishing them
 * would tell someone guessing tokens which guess was once real. The one
 * exception the brief allows: an expired link says the student can send a
 * new one, since that is not information about this particular guess.
 */
function InvalidLink({ expired }: { expired?: boolean }) {
  return (
    <AuthShell title="This link is no longer valid.">
      {expired && (
        <p className="text-[0.92rem] leading-relaxed font-light text-ink-dim">
          The student can send a new link from their own account.
        </p>
      )}
    </AuthShell>
  )
}

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // No credentials configured (an unconfigured preview deployment) is just
  // another shape of "the call didn't work" — same refusal, not a crash.
  if (!isAuthConfigured) return <InvalidLink />

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('describe_consent_invitation', {
    raw_token: token,
  })

  // Never log the token itself — only that the call failed. This also
  // covers the RPC not existing yet in a database consent.sql hasn't been
  // run against: that looks identical to any other Postgres error here, and
  // gets the same refusal rather than a crash.
  if (error) {
    console.error('describe_consent_invitation failed:', error.message)
    return <InvalidLink />
  }

  const row = (data as DescribeRow[] | null)?.[0]

  if (!row || row.spent) return <InvalidLink />
  if (row.expired) return <InvalidLink expired />

  return (
    <AuthShell
      title={`Confirm ${row.student_name}'s account`}
      lede={`${row.student_name} is asking you to agree to something on StudEasy before they can get started.`}
    >
      <div className="flex flex-col gap-6">
        <p className="text-[0.92rem] leading-relaxed font-light text-ink-dim">
          If you agree, StudEasy will keep a record of {row.student_name}&rsquo;s work
          &mdash; their answers, marks, and progress &mdash; and show it to{' '}
          {row.student_name} and their tutors.
        </p>
        <ConsentForm token={token} studentName={row.student_name} />
      </div>
    </AuthShell>
  )
}
