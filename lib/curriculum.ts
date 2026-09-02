/**
 * The curriculum options offered at registration. Kept in one place so the
 * marketing marquee and the registration forms cannot drift apart.
 */

export const LEVELS = [
  'NCEA Level 1',
  'NCEA Level 2',
  'NCEA Level 3',
  'Cambridge IGCSE',
  'Cambridge A Level',
]

export const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Statistics',
  'Calculus',
  'Mechanics',
]

export const YEAR_LEVELS = [
  'Year 9',
  'Year 10',
  'Year 11 · NCEA Level 1',
  'Year 12 · NCEA Level 2',
  'Year 13 · NCEA Level 3',
  'Cambridge IGCSE',
  'Cambridge A Level',
]

/**
 * Every qualification StudEasy teaches against. PRD §4 asks for IB and CBSE
 * alongside NCEA and Cambridge, and for subject pages to be driven by this
 * data rather than by code, so adding a board here is the whole change.
 */
export const BOARDS = [
  {
    name: 'NCEA',
    levels: ['Level 1', 'Level 2', 'Level 3'],
    note: 'New Zealand national qualification, Years 11 to 13.',
  },
  {
    name: 'Cambridge',
    levels: ['IGCSE', 'AS Level', 'A Level'],
    note: 'Offered by a number of New Zealand and international schools.',
  },
  {
    name: 'IB',
    levels: ['MYP', 'Diploma SL', 'Diploma HL'],
    note: 'International Baccalaureate, standard and higher level.',
  },
  {
    name: 'CBSE',
    levels: ['Class 9', 'Class 10', 'Class 11', 'Class 12'],
    note: 'Indian national curriculum, for families studying to it here.',
  },
]

/** URL-safe form of a subject name. 'Mathematics' -> 'mathematics'. */
export function subjectSlug(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
