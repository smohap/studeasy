/**
 * Server-only. This is the one file that knows Resend exists — everything
 * Resend-specific (its endpoint, its auth header, its request shape) lives
 * here and nowhere else, so switching provider later is a one-file change.
 * Never import this from a client component: it reads RESEND_API_KEY, which
 * must never be exposed to the browser (never NEXT_PUBLIC_-prefixed) and
 * must never appear in a log, an error, or a commit. `server-only` is not a
 * dependency of this project, so nothing enforces that at build time — it is
 * enforced by convention: only server actions and route handlers call this.
 *
 * No SDK: a plain `fetch` to Resend's HTTP API. Pulling in a dependency for
 * one POST isn't worth it.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Operator sets RESEND_FROM once a sending domain is verified with Resend.
 * Until then this falls back to Resend's own test sender, which only
 * delivers to the account's own verified address but lets the flow be
 * exercised end to end without any domain setup.
 */
const DEFAULT_FROM = 'StudEasy <onboarding@resend.dev>'

export type SendConsentEmailInput = {
  to: string
  /** As stored — possibly empty. Cleaned by emailSafeFirstName before use. */
  studentName: string
  url: string
}

export type SendConsentEmailResult = {
  sent: boolean
  reason?: string
}

/** What the email calls the child when their name leaves nothing usable. */
export const NAME_FALLBACK = 'your child'

const NAME_MAX = 40

/**
 * The name as it may appear in an email to an address the student typed.
 *
 * `full_name` is whatever the student entered, and this email goes from the
 * project's verified domain to any address they choose — so an unfiltered
 * name is a way to put arbitrary text, including a link, in front of a
 * stranger under StudEasy's name. What survives here is the first word only
 * (the same first-name rule describe_consent_invitation() applies with
 * split_part), with anything that looks like a link or an address refused
 * outright, every character that is not a letter, a combining mark, a hyphen
 * or an apostrophe removed, and at most 40 characters kept. Unicode property
 * escapes, so Māori, Chinese or Arabic names come through intact.
 *
 * Falls back to "your child", which reads correctly everywhere the name is
 * used: "Consent needed for your child", "your child's work".
 */
export function emailSafeFirstName(raw: string | null | undefined): string {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? ''

  // A domain, a URL or an email address: nothing in it is a name.
  if (/[@/\\:]|www\.|\.\p{L}{2,}/iu.test(first)) return NAME_FALLBACK

  const cleaned = first
    .replace(/[^\p{L}\p{M}'’-]/gu, '')
    .replace(/^['’-]+|['’-]+$/gu, '')
  const capped = Array.from(cleaned).slice(0, NAME_MAX).join('')

  return /\p{L}/u.test(capped) ? capped : NAME_FALLBACK
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildText(studentName: string, url: string): string {
  return [
    `You're being asked to agree to something for ${studentName} on StudEasy.`,
    '',
    `If you say yes, StudEasy will keep a record of ${studentName}'s work — their answers, marks, and progress — and show it to ${studentName} and their tutors.`,
    '',
    `To agree, open this link: ${url}`,
    '',
    'The link lasts 14 days and works once.',
    '',
    "If you weren't expecting this, you can ignore it — nothing happens unless you open the link.",
  ].join('\n')
}

function buildHtml(studentName: string, url: string): string {
  const safeName = escapeHtml(studentName)
  return [
    '<div style="font-family: sans-serif; font-size: 16px; line-height: 1.5; color: #1a1a1a;">',
    `<p>You're being asked to agree to something for <strong>${safeName}</strong> on StudEasy.</p>`,
    `<p>If you say yes, StudEasy will keep a record of ${safeName}'s work &mdash; their answers, marks, and progress &mdash; and show it to ${safeName} and their tutors.</p>`,
    `<p><a href="${url}">Click here to agree</a></p>`,
    '<p>The link lasts 14 days and works once.</p>',
    "<p>If you weren't expecting this, you can ignore it &mdash; nothing happens unless you open the link.</p>",
    '</div>',
  ].join('\n')
}

/**
 * Sends the parental-consent email. Never throws: registration must never
 * fail because mail failed, so every failure path returns
 * `{ sent: false, reason }` instead. `reason` is a short machine-readable
 * string for logs and callers, never the URL (it carries the raw token) and
 * never anything from the API key.
 *
 * With no RESEND_API_KEY configured — the default on a fresh checkout and on
 * any preview deployment nobody has wired up yet — this logs the URL under
 * an explicit "[dev only]" marker so the flow can still be exercised by
 * hand, and returns `{ sent: false, reason: 'no-key' }`.
 */
export async function sendConsentEmail({
  to,
  studentName: rawName,
  url,
}: SendConsentEmailInput): Promise<SendConsentEmailResult> {
  // The only place the name is cleaned — callers pass it as stored.
  const studentName = emailSafeFirstName(rawName)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[dev only] consent email not sent (no RESEND_API_KEY) — link: ${url}`)
    return { sent: false, reason: 'no-key' }
  }

  const from = process.env.RESEND_FROM ?? DEFAULT_FROM

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Consent needed for ${studentName} on StudEasy`,
        text: buildText(studentName, url),
        html: buildHtml(studentName, url),
      }),
    })

    if (!response.ok) {
      console.warn(`consent email failed to send: Resend returned ${response.status}`)
      return { sent: false, reason: `http-${response.status}` }
    }

    return { sent: true }
  } catch {
    console.warn('consent email failed to send: network error calling Resend')
    return { sent: false, reason: 'network-error' }
  }
}
