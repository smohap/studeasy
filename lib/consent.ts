/**
 * The age of consent, and the arithmetic around it.
 *
 * This duplicates studeasy.needs_guardian_consent() in supabase/consent.sql on
 * purpose, and the two must agree. The database is the authority — it is what
 * actually refuses the write — but the wizard has to tell a 13-year-old what
 * is about to happen BEFORE they submit, and it cannot ask Postgres mid-form.
 *
 * The rule, stated once: you need a guardian until your twelfth birthday, and
 * not on it. An unknown date of birth counts as under age, because the whole
 * point of the gate is that we do not guess in the permissive direction.
 *
 * Twelve is the operator's decision, taken on the reasoning that
 * thirteen-year-olds routinely hold their own accounts. supabase/consent.sql
 * carries the same number and the note about where it sits relative to COPPA
 * and GDPR; changing one without the other is a bug the tests here catch.
 */

export const CONSENT_AGE = 12

/** Day-precision only. Time of day has no business in a birthday comparison. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Parses the `yyyy-mm-dd` an <input type="date"> produces.
 *
 * Deliberately not `new Date(value)`: that parses a bare date string as UTC
 * midnight, so anyone in New Zealand — UTC+12 or +13 — reads it back as the
 * previous day. On a birthday comparison that is a real off-by-one, and it
 * would land on exactly the people this gate is about.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null

  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)

  // Rejects 2025-02-30, which the constructor would roll forward to March.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null
  }
  return date
}

/** Whole years elapsed, or null if the date is unusable. */
export function ageOn(born: Date | null, today: Date = new Date()): number | null {
  if (!born) return null

  const now = startOfDay(today)
  let years = now.getFullYear() - born.getFullYear()

  const hadBirthday =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate())

  if (!hadBirthday) years -= 1
  return years
}

/** The gate predicate. Unknown or unparseable means yes. */
export function needsGuardianConsent(
  born: string | Date | null | undefined,
  today: Date = new Date(),
): boolean {
  const date = typeof born === 'string' ? parseDateOnly(born) : (born ?? null)
  const age = ageOn(date, today)
  return age === null || age < CONSENT_AGE
}

/** Is this a date a person could plausibly have been born on? */
export function isPlausibleBirthDate(
  born: string | Date | null | undefined,
  today: Date = new Date(),
): boolean {
  const date = typeof born === 'string' ? parseDateOnly(born) : (born ?? null)
  if (!date) return false

  const age = ageOn(date, today)
  return age !== null && age >= 0 && age <= 120
}

/** `min`/`max` for the date input, so the picker cannot offer nonsense. */
export function birthDateBounds(today: Date = new Date()): {
  min: string
  max: string
} {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`

  const now = startOfDay(today)
  return {
    min: iso(new Date(now.getFullYear() - 120, now.getMonth(), now.getDate())),
    max: iso(now),
  }
}
