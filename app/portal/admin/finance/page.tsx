import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { formatMoney } from '@/lib/class-types'
import { EmptyState, Panel, StatTile, StatusChip } from '@/components/app/Ui'
import type { Status } from '@/types/dashboard'

export const metadata = { title: 'Finance — StudEasy', robots: { index: false } }

type Order = {
  id: string
  reference: string
  total_cents: number
  currency: string
  status: 'pending' | 'paid' | 'refunded' | 'cancelled'
  created_at: string
}

type Payout = {
  id: string
  gross_cents: number
  platform_fee_cents: number
  net_cents: number
  status: 'owed' | 'scheduled' | 'paid' | 'reversed'
  created_at: string
  teacher: { full_name: string | null } | null
}

const ORDER_TONE: Record<Order['status'], Status> = {
  paid: { tone: 'good', label: 'Paid' },
  pending: { tone: 'warn', label: 'Pending' },
  refunded: { tone: 'neutral', label: 'Refunded' },
  cancelled: { tone: 'bad', label: 'Cancelled' },
}

const PAYOUT_TONE: Record<Payout['status'], Status> = {
  owed: { tone: 'warn', label: 'Owed' },
  scheduled: { tone: 'neutral', label: 'Scheduled' },
  paid: { tone: 'good', label: 'Paid' },
  reversed: { tone: 'bad', label: 'Reversed' },
}

export default async function Page() {
  const { profile } = await getCurrentUser()
  guardRole(profile, 'admin')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables to use this."
      />
    )
  }

  const supabase = await createClient()
  const [{ data: orderRows }, { data: payoutRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, reference, total_cents, currency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('payouts')
      .select(
        'id, gross_cents, platform_fee_cents, net_cents, status, created_at, teacher:profiles!payouts_teacher_id_fkey(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const orders = (orderRows ?? []) as Order[]
  const payouts = (payoutRows ?? []) as unknown as Payout[]

  const paid = orders.filter((o) => o.status === 'paid')
  const takings = paid.reduce((sum, o) => sum + o.total_cents, 0)
  const owed = payouts
    .filter((p) => p.status === 'owed')
    .reduce((sum, p) => sum + p.net_cents, 0)
  const fees = payouts.reduce((sum, p) => sum + p.platform_fee_cents, 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">Finance</h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Real orders and the payout ledger. An order only becomes paid when the Stripe
          webhook says so.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <StatTile label="Taken" value={formatMoney(takings)} />
        </li>
        <li>
          <StatTile label="Platform fees" value={formatMoney(fees)} />
        </li>
        <li>
          <StatTile label="Owed to tutors" value={formatMoney(owed)} />
        </li>
        <li>
          <StatTile label="Paid orders" value={String(paid.length)} />
        </li>
      </ul>

      <Panel title="Orders" subtitle="Newest first, most recent 50.">
        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            body="Course and class-seat purchases appear here with their reference."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-3.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[0.88rem] font-medium text-app-ink">
                    {o.reference}
                  </p>
                  <p className="mt-0.5 text-[0.82rem] font-light text-app-muted">
                    {new Date(o.created_at).toLocaleDateString('en-NZ', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <span className="text-[0.9rem] font-semibold text-app-ink">
                    {formatMoney(o.total_cents, o.currency)}
                  </span>
                  <StatusChip status={ORDER_TONE[o.status]} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Tutor payouts"
        subtitle="Written by the webhook when an order settles."
      >
        {payouts.length === 0 ? (
          <EmptyState
            title="Nothing owed yet"
            body="A payout is recorded for each paid line, net of the platform fee."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-medium text-app-ink">
                    {p.teacher?.full_name ?? 'Unassigned'}
                  </p>
                  <p className="mt-0.5 text-[0.82rem] font-light text-app-muted">
                    {formatMoney(p.gross_cents)} gross ·{' '}
                    {formatMoney(p.platform_fee_cents)} fee
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <span className="text-[0.9rem] font-semibold text-app-ink">
                    {formatMoney(p.net_cents)}
                  </span>
                  <StatusChip status={PAYOUT_TONE[p.status]} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
