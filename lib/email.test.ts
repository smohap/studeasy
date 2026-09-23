import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendConsentEmail } from './email'

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
