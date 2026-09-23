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


// Pure and crypto-free, so they live where a client component can reach them.
export { isEmailish, maskEmail } from './email-address'
