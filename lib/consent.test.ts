import { describe, expect, it } from 'vitest'
import {
  ageOn,
  birthDateBounds,
  isPlausibleBirthDate,
  needsGuardianConsent,
  parseDateOnly,
} from './consent'

/** A fixed "today" — these assertions must not change meaning next year. */
const TODAY = new Date(2026, 8, 23) // 23 September 2026

describe('parseDateOnly', () => {
  it('reads a date input value in local time, not UTC', () => {
    const d = parseDateOnly('2010-01-01')
    // The UTC-parsing bug shows up here: in New Zealand it would read 31 Dec.
    expect(d?.getFullYear()).toBe(2010)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(1)
  })

  it('rejects a day that does not exist rather than rolling it forward', () => {
    expect(parseDateOnly('2025-02-30')).toBeNull()
  })

  it('rejects anything that is not yyyy-mm-dd', () => {
    expect(parseDateOnly('23/09/2010')).toBeNull()
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly(null)).toBeNull()
  })
})

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn(new Date(2000, 8, 23), TODAY)).toBe(26)
  })

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageOn(new Date(2000, 8, 24), TODAY)).toBe(25)
  })
})

describe('needsGuardianConsent', () => {
  it('holds a thirteen-year-old', () => {
    expect(needsGuardianConsent('2013-01-01', TODAY)).toBe(true)
  })

  it('releases them on their sixteenth birthday, not the day after', () => {
    expect(needsGuardianConsent('2010-09-23', TODAY)).toBe(false)
    expect(needsGuardianConsent('2010-09-24', TODAY)).toBe(true)
  })

  /*
   * Matches studeasy.needs_guardian_consent(null) in supabase/consent.sql. If
   * this ever returns false the two halves of the gate have drifted, and the
   * client would start telling children they are fine while the database
   * refuses their work.
   */
  it('treats an unknown date as a child', () => {
    expect(needsGuardianConsent(null, TODAY)).toBe(true)
    expect(needsGuardianConsent('not a date', TODAY)).toBe(true)
  })
})

describe('isPlausibleBirthDate', () => {
  it('rejects the future and the impossible', () => {
    expect(isPlausibleBirthDate('2030-01-01', TODAY)).toBe(false)
    expect(isPlausibleBirthDate('1850-01-01', TODAY)).toBe(false)
    expect(isPlausibleBirthDate('2013-01-01', TODAY)).toBe(true)
  })
})

describe('birthDateBounds', () => {
  it('stops the picker offering a date in the future', () => {
    expect(birthDateBounds(TODAY).max).toBe('2026-09-23')
    expect(birthDateBounds(TODAY).min).toBe('1906-09-23')
  })
})
