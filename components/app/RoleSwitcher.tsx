'use client'

import { useRouter } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { ROLES, ROLE_HOME, ROLE_LABEL, type Role } from '@/lib/roles'

/**
 * DEV-ONLY SCAFFOLDING — delete this file and its two usages to remove.
 *
 * Jumps between the four dashboards without signing in and out. Rendered only
 * when the shell is passed devPreview, which is itself gated on
 * NODE_ENV === 'development' in app/portal/layout.tsx. Styled to look nothing
 * like the real UI so it cannot be mistaken for a product feature.
 */
export default function RoleSwitcher({ current }: { current: Role }) {
  const router = useRouter()

  return (
    <div className="hidden shrink-0 items-center gap-2 rounded-lg border border-dashed border-fuchsia-500 bg-fuchsia-50 px-2.5 py-1.5 sm:flex">
      <FlaskConical size={14} aria-hidden className="text-fuchsia-700" />
      <label htmlFor="dev-role" className="text-[0.7rem] font-semibold tracking-wide text-fuchsia-700 uppercase">
        Dev
      </label>
      <select
        id="dev-role"
        value={current}
        onChange={(e) => router.push(ROLE_HOME[e.target.value as Role])}
        className="bg-transparent text-[0.8rem] font-medium text-fuchsia-900"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  )
}
