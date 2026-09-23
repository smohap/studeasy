import { createHash, randomBytes } from 'node:crypto'

/**
 * The secret that goes in the email. 32 bytes of CSPRNG output, base64url so
 * it survives a URL and a double-click without escaping.
 *
 * Minted here rather than in Postgres: this is the application's secret to
 * generate and send, and the database should only ever see its hash.
 */
export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * What the database stores.
 *
 * Must stay byte-identical to Postgres's encode(digest(token,'sha256'),'hex'),
 * because redeem_consent_invitation() hashes the raw token it is handed and
 * compares. The test pins a known vector rather than round-tripping against
 * ourselves: a drift here means no token ever redeems, and nothing else in the
 * system would say why.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

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
