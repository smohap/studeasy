import type { Grade, Confidence } from './twin-types'

const GRADE_LABELS: Record<Grade, string> = {
  not_achieved: 'Not Achieved',
  achieved: 'Achieved',
  merit: 'Merit',
  excellence: 'Excellence',
}

export function gradeLabel(grade: Grade): string {
  return GRADE_LABELS[grade]
}

/**
 * Says what the projection is standing on. A low-confidence grade shown bare
 * reads as a verdict; shown with its sample size it reads as what it is.
 */
export function confidenceSentence(confidence: Confidence, seen: number): string {
  const questions = `${seen} question${seen === 1 ? '' : 's'}`
  if (confidence === 'low') {
    return `Based on ${questions} — not enough yet to be confident.`
  }
  if (confidence === 'moderate') {
    return `Based on ${questions}. More recent practice would sharpen this.`
  }
  return `Based on ${questions}.`
}

/**
 * Three bands, not a percentage. The underlying figure is shrunk and decayed,
 * and showing it to two decimal places would imply a precision it does not
 * have.
 */
export function masteryBand(mastery: number): 'building' | 'developing' | 'secure' {
  if (mastery < 0.55) return 'building'
  if (mastery < 0.75) return 'developing'
  return 'secure'
}
