import type { ParentData } from '@/types/dashboard'
import { AROHA, DAVID, JAYDEN, MESSAGES, NOTIFICATIONS } from './shared'

export const PARENT: ParentData = {
  parent: DAVID,

  children: [
    {
      child: AROHA,
      attendancePct: 96,
      lessonsCompleted: 22,
      lessonsBooked: 24,
      homeworkCompletionPct: 88,
      nextClass: 'Today, 4:00pm — Mathematics',
      tutor: 'Ms. Patel',
      status: { tone: 'good', label: 'On track' },
    },
    {
      child: JAYDEN,
      attendancePct: 79,
      lessonsCompleted: 15,
      lessonsBooked: 20,
      homeworkCompletionPct: 54,
      nextClass: 'Thursday, 5:30pm — Physics',
      tutor: 'Ms. Patel',
      status: { tone: 'warn', label: 'Needs attention' },
    },
  ],

  progressBySubject: {
    takeaway:
      'Aroha is up nine points this term. Jayden has flattened out since the holidays.',
    seriesLabel: 'Aroha — accuracy',
    compareLabel: 'Jayden — accuracy',
    points: [
      { label: 'Wk 1', value: 68, compare: 71 },
      { label: 'Wk 3', value: 71, compare: 70 },
      { label: 'Wk 5', value: 74, compare: 66 },
      { label: 'Wk 7', value: 77, compare: 67 },
    ],
    textEquivalent:
      "Aroha's accuracy over four checkpoints: 68, 71, 74 then 77 percent. Jayden's over the same period: 71, 70, 66 then 67 percent.",
  },

  tutorComments: [
    {
      id: 'tc1',
      tutor: 'Ms. Patel',
      child: 'Aroha M.',
      at: 'Yesterday',
      body: 'Aroha is asking better questions — she stopped me twice to check why a step worked rather than copying it. That is the shift I wanted.',
    },
    {
      id: 'tc2',
      tutor: 'Ms. Patel',
      child: 'Jayden K.',
      at: 'Last Thursday',
      body: 'Jayden understands the material in the room but is not doing the between-lesson practice, and it shows in the tests. Worth a conversation at home.',
    },
  ],

  announcements: NOTIFICATIONS,
  messages: MESSAGES,

  invoices: [
    {
      id: 'i1',
      reference: 'INV-1042',
      period: 'This month',
      amount: '$320.00',
      status: { tone: 'warn', label: 'Due in 6 days' },
      issued: '1st of this month',
    },
    {
      id: 'i2',
      reference: 'INV-1031',
      period: 'Last month',
      amount: '$320.00',
      status: { tone: 'good', label: 'Paid' },
      issued: '1st of last month',
    },
    {
      id: 'i3',
      reference: 'INV-1019',
      period: 'Two months ago',
      amount: '$280.00',
      status: { tone: 'good', label: 'Paid' },
      issued: 'Two months ago',
    },
  ],

  subscription: {
    plan: 'Two children · weekly, term-time',
    renews: 'Start of next term',
    amount: '$320.00 / month',
  },
}
