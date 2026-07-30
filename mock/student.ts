import type { StudentData } from '@/types/dashboard'
import { AROHA } from './shared'

export const STUDENT: StudentData = {
  student: AROHA,

  hub: [
    {
      id: 'h1',
      kind: 'class',
      title: 'Mathematics with Ms. Patel',
      detail: 'Quadratics — factorising and the formula',
      due: 'Today, 4:00pm',
      urgency: 'now',
    },
    {
      id: 'h2',
      kind: 'homework',
      title: 'Algebra worksheet 7',
      detail: 'Six questions on rearranging formulae',
      due: 'Today, 9:00pm',
      urgency: 'now',
    },
    {
      id: 'h3',
      kind: 'task',
      title: 'Redo the three questions you lost marks on',
      detail: 'Recommended: your last two tests both slipped on indices',
      due: 'Before Thursday',
      urgency: 'today',
    },
    {
      id: 'h4',
      kind: 'test',
      title: 'Physics topic test — Motion',
      detail: 'Covers speed, acceleration and graphs',
      due: 'Thursday, 9:00am',
      urgency: 'soon',
    },
  ],

  mastery: [
    { subject: 'Mathematics', mastery: 78, predictedGrade: 'Merit', trend: 'up' },
    { subject: 'Physics', mastery: 64, predictedGrade: 'Achieved', trend: 'flat' },
  ],

  streakDays: 12,

  recentScores: {
    takeaway: 'Your maths marks have climbed for three tests running; physics has not moved.',
    seriesLabel: 'Mathematics',
    compareLabel: 'Physics',
    points: [
      { label: 'Test 1', value: 61, compare: 58 },
      { label: 'Test 2', value: 68, compare: 62 },
      { label: 'Test 3', value: 74, compare: 60 },
      { label: 'Test 4', value: 81, compare: 63 },
    ],
    textEquivalent:
      'Mathematics scores across four tests: 61, 68, 74 then 81 percent. Physics over the same tests: 58, 62, 60 then 63 percent.',
  },

  assignments: [
    {
      id: 'a1',
      title: 'Algebra worksheet 7',
      subject: 'Mathematics',
      due: 'Today, 9:00pm',
      status: { tone: 'warn', label: 'Due today' },
    },
    {
      id: 'a2',
      title: 'Motion graphs practice',
      subject: 'Physics',
      due: 'Last Friday',
      status: { tone: 'good', label: 'Marked' },
      mark: '17 / 20',
      feedback:
        'Good use of gradient to find acceleration. Watch your units on the last two — m/s and m/s² are not interchangeable.',
    },
    {
      id: 'a3',
      title: 'Indices problem set',
      subject: 'Mathematics',
      due: 'Two weeks ago',
      status: { tone: 'bad', label: 'Not submitted' },
    },
  ],

  xp: 2340,
  xpToNextLevel: 2800,
  level: 7,

  badges: [
    { id: 'b1', name: '12-day streak', earned: true, detail: 'Logged in and practised 12 days running' },
    { id: 'b2', name: 'Quadratics cleared', earned: true, detail: 'Mastery above 75% in quadratics' },
    { id: 'b3', name: 'Homework hero', earned: true, detail: 'Ten assignments in on time' },
    { id: 'b4', name: 'Physics climber', earned: false, detail: 'Reach 75% mastery in physics' },
  ],

  leaderboardPosition: 4,
  leaderboardOf: 26,

  coachPrompts: [
    'Explain the quadratic formula the way Ms. Patel does',
    'Why did I get question 3 wrong last time?',
    'Give me five practice questions on indices',
    'What should I revise before Thursday?',
  ],
}
