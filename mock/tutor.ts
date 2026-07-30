import type { TutorData } from '@/types/dashboard'
import { MS_PATEL } from './shared'

export const TUTOR: TutorData = {
  tutor: MS_PATEL,
  studentCount: 25,

  schedule: [
    {
      id: 's1',
      time: '3:00pm',
      subject: 'Mathematics',
      studentName: 'Mia T.',
      mode: 'In person',
      attendance: 'present',
    },
    {
      id: 's2',
      time: '4:00pm',
      subject: 'Mathematics',
      studentName: 'Aroha M.',
      mode: 'Online',
      attendance: 'unmarked',
    },
    {
      id: 's3',
      time: '5:30pm',
      subject: 'Physics',
      studentName: 'Jayden K.',
      mode: 'Online',
      attendance: 'unmarked',
    },
    {
      id: 's4',
      time: '6:30pm',
      subject: 'Physics',
      studentName: 'Group of 4',
      mode: 'In person',
      attendance: 'unmarked',
    },
  ],

  atRisk: [
    {
      id: 'r1',
      name: 'Jayden K.',
      reason: 'Homework completion fell from 80% to 54% over three weeks, and two absences in a row.',
      severity: { tone: 'bad', label: 'High risk' },
      metric: '54% homework · 79% attendance',
    },
    {
      id: 'r2',
      name: 'Mia T.',
      reason: 'Accuracy is holding but time-on-task has halved — she is finishing early and guessing.',
      severity: { tone: 'warn', label: 'Watch' },
      metric: 'Time-on-task down 51%',
    },
  ],

  marking: [
    {
      id: 'mk1',
      student: 'Aroha M.',
      title: 'Motion graphs practice',
      subject: 'Physics',
      submitted: 'Yesterday, 8:14pm',
      aiMark: '17 / 20',
      aiComment:
        'Gradient used correctly to find acceleration. Units confused on Q6 and Q7 — m/s given where m/s² was needed.',
      released: false,
    },
    {
      id: 'mk2',
      student: 'Mia T.',
      title: 'Algebra worksheet 6',
      subject: 'Mathematics',
      submitted: 'Yesterday, 6:02pm',
      aiMark: '12 / 20',
      aiComment:
        'Consistent sign error when moving terms across the equals sign — same mistake in Q2, Q5 and Q8, so this is a rule she has misremembered rather than carelessness.',
      released: false,
    },
    {
      id: 'mk3',
      student: 'Jayden K.',
      title: 'Vectors problem set',
      subject: 'Physics',
      submitted: 'Two days ago',
      aiMark: '15 / 20',
      aiComment: 'Component resolution is solid. Lost marks presenting final answers without direction.',
      released: true,
    },
  ],

  performance: [
    {
      id: 'p1',
      name: 'Aroha M.',
      yearLevel: 'Year 11',
      strength: 'Quadratics, factorising',
      weakness: 'Indices',
      homework: { tone: 'good', label: '88% complete' },
      engagement: { tone: 'good', label: 'High' },
    },
    {
      id: 'p2',
      name: 'Jayden K.',
      yearLevel: 'Year 13',
      strength: 'Vector components',
      weakness: 'Between-lesson practice',
      homework: { tone: 'bad', label: '54% complete' },
      engagement: { tone: 'warn', label: 'Falling' },
    },
    {
      id: 'p3',
      name: 'Mia T.',
      yearLevel: 'Year 10',
      strength: 'Mental arithmetic',
      weakness: 'Rearranging equations',
      homework: { tone: 'good', label: '91% complete' },
      engagement: { tone: 'warn', label: 'Rushing' },
    },
  ],
}
