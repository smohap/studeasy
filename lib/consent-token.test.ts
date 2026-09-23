import { describe, expect, it } from 'vitest'
import { hashToken, isEmailish, maskEmail, mintToken } from './consent-token'

describe('mintToken', () => {
  it('is url-safe and long enough to be unguessable', () => {
    expect(mintToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken()))
    expect(seen.size).toBe(200)
  })
})

describe('hashToken', () => {
  it('is stable, lower-case hex, 64 characters', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the SHA-256 Postgres produces', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('maskEmail', () => {
  it('shows enough to recognise and not enough to read', () => {
    expect(maskEmail('aroha.ngata@example.com')).toBe('a*********a@example.com')
    expect(maskEmail('jo@example.com')).toBe('j*o@example.com')
  })

  it('does not fall over on something that is not an address', () => {
    expect(maskEmail('nonsense')).toBe('nonsense')
  })
})

describe('isEmailish', () => {
  it('accepts an ordinary address and rejects obvious rubbish', () => {
    expect(isEmailish('mum@example.co.nz')).toBe(true)
    expect(isEmailish('mum@example')).toBe(false)
    expect(isEmailish('no-at-sign.com')).toBe(false)
    expect(isEmailish('')).toBe(false)
  })
})
