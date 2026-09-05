import { describe, it, expect } from 'vitest'
import { gradeLabel, confidenceSentence, masteryBand } from './twin-format'

describe('gradeLabel', () => {
  it('spells out the NCEA grades a family recognises', () => {
    expect(gradeLabel('not_achieved')).toBe('Not Achieved')
    expect(gradeLabel('excellence')).toBe('Excellence')
  })
})

describe('confidenceSentence', () => {
  it('says how little it knows when the sample is small', () => {
    const sentence = confidenceSentence('low', 2)
    expect(sentence).toContain('2 questions')
    expect(sentence).toMatch(/not enough/i)
  })

  it('does not hedge when the sample is large', () => {
    expect(confidenceSentence('high', 40)).not.toMatch(/not enough/i)
  })

  it('does not say "1 questions"', () => {
    expect(confidenceSentence('low', 1)).toContain('1 question')
    expect(confidenceSentence('low', 1)).not.toContain('1 questions')
  })
})

describe('masteryBand', () => {
  it('never calls a fresh topic secure', () => {
    expect(masteryBand(0.5)).toBe('building')
  })

  it('reads a high figure as secure', () => {
    expect(masteryBand(0.85)).toBe('secure')
  })
})
