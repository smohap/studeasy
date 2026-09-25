/**
 * Pure string handling for email addresses, safe to import from a client
 * component. It lives apart from lib/consent-token.ts because that file pulls
 * in node:crypto, which has no business in the browser bundle; consent-token
 * re-exports these so the server side keeps one import.
 */

/**
 * Enough of an address to recognise your own, not enough to read a stranger's.
 *
 * The holding screen shows this to a child who may be on a shared or classroom
 * screen, so the local part keeps only its first and last character.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1) return address

  const local = address.slice(0, at)
  const domain = address.slice(at)
  if (local.length <= 2) return `${local[0]}*${local.slice(1)}${domain}`

  return `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}${domain}`
}

/**
 * Deliberately loose. Whether an address is valid is decided by whether the
 * mail arrives, not by a regex, and strict patterns reject real addresses.
 * This only catches what is obviously not one.
 */
export function isEmailish(value: string): boolean {
  const v = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254
}

/** The form an address is stored and compared in. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}
