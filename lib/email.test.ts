import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NAME_FALLBACK, emailSafeFirstName, sendConsentEmail } from './email'

describe('emailSafeFirstName', () => {
  it('keeps only the first word', () => {
    expect(emailSafeFirstName('Aroha Ngata')).toBe('Aroha')
    expect(emailSafeFirstName('  Aroha   Ngata ')).toBe('Aroha')
  })

  it('keeps names that are not English', () => {
    expect(emailSafeFirstName('Mānuka Te Rangi')).toBe('Mānuka')
    expect(emailSafeFirstName('José')).toBe('José')
    expect(emailSafeFirstName('Zoë')).toBe('Zoë')
    expect(emailSafeFirstName('李小龙')).toBe('李小龙')
    expect(emailSafeFirstName('محمد علي')).toBe('محمد')
    // decomposed: e + combining acute
    expect(emailSafeFirstName('José')).toBe('José')
  })

  it('keeps hyphens and apostrophes inside a name', () => {
    expect(emailSafeFirstName('Jean-Luc Picard')).toBe('Jean-Luc')
    expect(emailSafeFirstName("O'Brien")).toBe("O'Brien")
    expect(emailSafeFirstName('O’Brien')).toBe('O’Brien')
  })

  it('refuses anything that looks like a link or an address', () => {
    expect(emailSafeFirstName('evil.com/login please')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('https://evil.example')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('www.evil.example')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('me@evil.example')).toBe(NAME_FALLBACK)
  })

  it('strips punctuation, digits and markup from what is left', () => {
    expect(emailSafeFirstName('<Aroha>')).toBe('Aroha')
    // a closing tag carries a slash, which is refused as link-like outright
    expect(emailSafeFirstName('<b>Aroha</b>')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('Aroha!!!')).toBe('Aroha')
    expect(emailSafeFirstName('Aroha2024')).toBe('Aroha')
  })

  it('caps the length at 40 characters', () => {
    expect(emailSafeFirstName('A'.repeat(200))).toBe('A'.repeat(40))
  })

  it('falls back when nothing usable is left', () => {
    expect(emailSafeFirstName('')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('   ')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName(null)).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName(undefined)).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName('12345')).toBe(NAME_FALLBACK)
    expect(emailSafeFirstName("--''--")).toBe(NAME_FALLBACK)
  })

  it('the fallback reads as a phrase in the subject and the body', () => {
    expect(`Consent needed for ${NAME_FALLBACK} on StudEasy`).toBe(
      'Consent needed for your child on StudEasy',
    )
  })
})

describe('sendConsentEmail with a hostile name', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('sends only the cleaned first name, in the subject and both bodies', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchSpy)

    await sendConsentEmail({
      to: 'parent@example.com',
      studentName: 'Aroha visit evil.example/claim to keep your account',
      url: 'https://studeasy.example/consent/secret-token',
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.subject).toBe('Consent needed for Aroha on StudEasy')
    for (const part of [body.subject, body.text, body.html]) {
      expect(part).not.toContain('evil.example')
      expect(part).not.toContain('keep your account')
    }
  })
})

const input = {
  to: 'parent@example.com',
  studentName: 'Aroha',
  url: 'https://studeasy.example/consent/secret-token',
}

describe('sendConsentEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('does not call fetch and returns no-key when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendConsentEmail(input)

    expect(result).toEqual({ sent: false, reason: 'no-key' })
    expect(fetchSpy).not.toHaveBeenCalled()
    // dev-only logging must carry the link so the flow can be exercised by hand
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(input.url))
  })

  it('does not throw and reports the status on a non-2xx response', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 422 })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendConsentEmail(input)

    expect(result).toEqual({ sent: false, reason: 'http-422' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // never log the URL (it carries the raw token) or the key on a failure
    const warned = warnSpy.mock.calls.flat().join(' ')
    expect(warned).not.toContain(input.url)
    expect(warned).not.toContain('test-key')
  })

  it('does not throw on a network error', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('fetch failed')),
    )

    const result = await sendConsentEmail(input)

    expect(result).toEqual({ sent: false, reason: 'network-error' })
  })
})
