import { describe, expect, it } from 'vitest'
import { normaliseEmail } from './email-address'

describe('normaliseEmail', () => {
  it('trims and lower-cases, so the same address always compares equal', () => {
    expect(normaliseEmail('  Aroha.Ngata@Example.COM  ')).toBe('aroha.ngata@example.com')
  })

  it('is idempotent', () => {
    const once = normaliseEmail('Mum@Example.co.NZ')
    expect(normaliseEmail(once)).toBe(once)
  })
})
