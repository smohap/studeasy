import type { Message, Notification, Person } from '@/types/dashboard'

/**
 * Demo personas. Deliberately fictional — this stands in for minors' data, so
 * there are no plausible real addresses, phone numbers, NHI numbers or emails
 * anywhere in these fixtures.
 */
export const AROHA: Person = {
  id: 'stu-aroha',
  name: 'Aroha M.',
  yearLevel: 'Year 11 · NCEA Level 1',
  subjects: ['Mathematics', 'Physics'],
}

export const JAYDEN: Person = {
  id: 'stu-jayden',
  name: 'Jayden K.',
  yearLevel: 'Year 13 · NCEA Level 3',
  subjects: ['Physics', 'Calculus'],
}

export const MIA: Person = {
  id: 'stu-mia',
  name: 'Mia T.',
  yearLevel: 'Year 10',
  subjects: ['Mathematics'],
}

export const DAVID: Person = { id: 'par-david', name: 'David M.' }

export const MS_PATEL: Person = {
  id: 'tut-patel',
  name: 'Ms. Patel',
  subjects: ['Mathematics', 'Physics'],
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    title: 'Term 3 reports are out',
    body: 'Written reports for every enrolled student are now in the portal.',
    at: 'Today, 8:02am',
    unread: true,
  },
  {
    id: 'n2',
    title: 'Public holiday — no classes Monday',
    body: 'Monday sessions move to Tuesday at the same time.',
    at: 'Yesterday',
    unread: true,
  },
  {
    id: 'n3',
    title: 'New practice sets: Algebra',
    body: 'Twelve new questions on rearranging formulae.',
    at: '3 days ago',
    unread: false,
  },
]

export const MESSAGES: Message[] = [
  {
    id: 'm1',
    from: 'Ms. Patel',
    preview: 'Aroha nailed the quadratics starter today — worth telling her.',
    at: '11:40am',
    unread: true,
  },
  {
    id: 'm2',
    from: 'StudEasy office',
    preview: 'Your invoice for this month is ready.',
    at: 'Tuesday',
    unread: false,
  },
]
