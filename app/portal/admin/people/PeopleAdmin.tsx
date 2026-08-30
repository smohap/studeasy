'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { EmptyState, Panel } from '@/components/app/Ui'
import { ROLE_LABEL, type GrantedRole, type Role } from '@/lib/roles'
import type { PersonRow } from '@/lib/admin-data'
import { approveRole, grantRole, revokeRole } from '@/app/portal/admin/role-actions'

/** admin is absent on purpose — it comes from the allowlist, never from here. */
const GRANTABLE: Role[] = ['student', 'parent', 'tutor']

function when(iso: string | null, fallback: string) {
  if (!iso) return fallback
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "3 days ago" is the question an admin is actually asking of a sign-in date. */
function ago(iso: string | null) {
  if (!iso) return 'Never signed in'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return when(iso, '—')
}

export default function PeopleAdmin({ people }: { people: PersonRow[] }) {
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        (p.fullName ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.studentCode ?? '').toLowerCase().includes(q),
    )
  }, [people, query])

  const pending = people.filter((p) => p.roles.some((r) => r.status === 'pending'))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-app-ink">
          People &amp; roles
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed font-light text-app-muted">
          Every real account, when they joined and when they were last here. One person
          can hold several roles — a tutor who is also a parent needs one login, not two.
        </p>
      </div>

      {pending.length > 0 && (
        <Panel
          title={`${pending.length} waiting on you`}
          subtitle="A tutor cannot teach until their role is approved."
        >
          <ul className="flex flex-col gap-3">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border p-4"
              >
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-app-ink">
                    {p.fullName ?? 'Unnamed account'}
                  </p>
                  <p className="mt-0.5 truncate text-[0.84rem] font-light text-app-muted">
                    {p.email} · asked {when(p.signedUpAt, '—')}
                  </p>
                </div>
                <span className="flex flex-wrap gap-2">
                  {p.roles
                    .filter((r) => r.status === 'pending')
                    .map((r) => (
                      <Decision key={r.role} personId={p.id} role={r.role} />
                    ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title={`${people.length} ${people.length === 1 ? 'account' : 'accounts'}`}
        actions={
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted"
            />
            <label htmlFor="people-search" className="sr-only">
              Search people
            </label>
            <input
              id="people-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email or student ID"
              className="w-56 rounded-full border border-app-border bg-app py-2 pr-4 pl-9 text-[0.85rem] font-light text-app-ink placeholder:text-app-muted"
            />
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            title={people.length === 0 ? 'No accounts yet' : 'Nobody matches that'}
            body={
              people.length === 0
                ? 'Real signups appear here the moment someone registers.'
                : 'Try a shorter search, or clear it to see everyone.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function PersonCard({ person: p }: { person: PersonRow }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const held = new Set(p.roles.map((r) => r.role))
  const addable = GRANTABLE.filter((r) => !held.has(r))

  return (
    <li className="rounded-xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-medium text-app-ink">
            {p.fullName ?? 'Unnamed account'}
            {!p.emailConfirmed && (
              <span className="ml-2 rounded-full bg-app-warn-bg px-2 py-0.5 text-[0.72rem] font-medium text-app-warn">
                email unconfirmed
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[0.84rem] font-light text-app-muted">
            {p.email}
            {p.studentCode && (
              <span className="ml-2 font-mono text-[0.78rem]">{p.studentCode}</span>
            )}
          </p>
        </div>

        <dl className="flex shrink-0 gap-6 text-right">
          <div>
            <dt className="text-[0.72rem] font-medium text-app-muted">Joined</dt>
            <dd className="mt-0.5 text-[0.84rem] text-app-ink">
              {when(p.signedUpAt, '—')}
            </dd>
          </div>
          <div>
            <dt className="text-[0.72rem] font-medium text-app-muted">Last seen</dt>
            <dd className="mt-0.5 text-[0.84rem] text-app-ink">{ago(p.lastSignInAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.roles.map((r) => (
          <RoleChip
            key={r.role}
            personId={p.id}
            granted={r}
            isActive={p.activeRole === r.role}
          />
        ))}

        {addable.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-app-border px-2 py-1">
            <Plus size={13} aria-hidden className="text-app-muted" />
            <label htmlFor={`add-${p.id}`} className="sr-only">
              Add a role for {p.fullName ?? p.email}
            </label>
            <select
              id={`add-${p.id}`}
              value=""
              disabled={pending}
              onChange={(e) => {
                const role = e.target.value as Role
                if (!role) return
                start(async () => setError((await grantRole(p.id, role)).error))
              }}
              className="bg-transparent text-[0.8rem] font-medium text-app-ink"
            >
              <option value="">Add role…</option>
              {addable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[0.84rem] text-app-bad">
          {error}
        </p>
      )}
    </li>
  )
}

function RoleChip({
  personId,
  granted,
  isActive,
}: {
  personId: string
  granted: GrantedRole
  isActive: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tone =
    granted.status === 'active'
      ? 'bg-app-good-bg text-app-good'
      : granted.status === 'pending'
        ? 'bg-app-warn-bg text-app-warn'
        : 'bg-app-bad-bg text-app-bad'

  return (
    <span
      title={error ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8rem] font-medium ${tone}`}
    >
      {ROLE_LABEL[granted.role]}
      {granted.status !== 'active' && ` · ${granted.status}`}
      {isActive && <span className="text-[0.7rem] opacity-70">(in use)</span>}

      {granted.status === 'pending' && (
        <Decision personId={personId} role={granted.role} compact />
      )}

      {/* The allowlist owns admin, so it is never removable from here. */}
      {granted.role !== 'admin' && (
        <button
          type="button"
          disabled={pending}
          aria-label={`Remove the ${ROLE_LABEL[granted.role]} role`}
          onClick={() =>
            start(async () => setError((await revokeRole(personId, granted.role)).error))
          }
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </span>
  )
}

function Decision({
  personId,
  role,
  compact,
}: {
  personId: string
  role: Role
  compact?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const decide = (approve: boolean) =>
    start(async () => setError((await approveRole(personId, role, approve)).error))

  if (compact) {
    return (
      <button
        type="button"
        disabled={pending}
        aria-label={`Approve the ${ROLE_LABEL[role]} role`}
        onClick={() => decide(true)}
        className="ml-1 rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
      >
        <Check size={12} aria-hidden />
      </button>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[0.82rem] font-light text-app-muted">{ROLE_LABEL[role]}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(true)}
        className="rounded-full bg-accent px-4 py-2 text-[0.82rem] font-medium text-[#100c00] disabled:opacity-60"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(false)}
        className="rounded-full border border-app-border px-4 py-2 text-[0.82rem] font-medium text-app-ink disabled:opacity-60"
      >
        Decline
      </button>
      {error && (
        <span role="alert" className="text-[0.82rem] text-app-bad">
          {error}
        </span>
      )}
    </span>
  )
}
