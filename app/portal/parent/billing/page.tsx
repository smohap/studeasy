import Link from 'next/link'
import { createClient, getCurrentUser, isAuthConfigured } from '@/lib/supabase/server'
import { guardRole } from '@/lib/portal-guard'
import { formatMoney } from '@/lib/class-types'
import { EmptyState, Panel, StatusChip } from '@/components/app/Ui'
import type { Status } from '@/types/dashboard'

export const metadata = {
  title: 'Bookings & payments — StudEasy',
  robots: { index: false },
}

type Order = {
  id: string
  reference: string
  total_cents: number
  currency: string
  status: 'pending' | 'paid' | 'refunded' | 'cancelled'
  created_at: string
  paid_at: string | null
  items: { title_snapshot: string; price_cents: number }[]
}

const TONE: Record<Order['status'], Status> = {
  paid: { tone: 'good', label: 'Paid' },
  pending: { tone: 'warn', label: 'Awaiting payment' },
  refunded: { tone: 'neutral', label: 'Refunded' },
  cancelled: { tone: 'bad', label: 'Cancelled' },
}

export default async function Page() {
  const { userId, profile } = await getCurrentUser()
  guardRole(profile, 'parent')

  if (!isAuthConfigured) {
    return (
      <EmptyState
        title="Not configured"
        body="Add the Supabase environment variables to use this."
      />
    )
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select(
      'id, reference, total_cents, currency, status, created_at, paid_at, items:order_items(title_snapshot, price_cents)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const orders = (data ?? []) as unknown as Order[]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          Bookings &amp; payments
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Every order on your account. Nothing is charged until Stripe confirms it.
        </p>
      </div>

      <Panel title={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`}>
        {orders.length === 0 ? (
          <EmptyState
            title="Nothing bought yet"
            body="Courses and class seats you pay for appear here with their reference."
            action={
              <Link
                href="/classes"
                className="inline-block rounded-full bg-accent px-6 py-2.5 text-[0.88rem] font-medium text-[#100c00]"
              >
                Find a class
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-app-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.9rem] font-medium text-app-ink">
                      {o.reference}
                    </p>
                    <p className="mt-1 text-[0.84rem] font-light text-app-muted">
                      {new Date(o.created_at).toLocaleDateString('en-NZ', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      {o.paid_at && ' · paid'}
                    </p>
                    {o.items?.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {o.items.map((i, n) => (
                          <li
                            key={`${o.id}-${n}`}
                            className="text-[0.85rem] font-light text-app-muted"
                          >
                            {i.title_snapshot} — {formatMoney(i.price_cents, o.currency)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[1rem] font-semibold text-app-ink">
                      {formatMoney(o.total_cents, o.currency)}
                    </p>
                    <div className="mt-2">
                      <StatusChip status={TONE[o.status]} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
