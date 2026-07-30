import type { AdminData } from '@/types/dashboard'

export const ADMIN: AdminData = {
  flags: [
    {
      id: 'f1',
      title: 'Year 13 Physics attendance is sliding',
      detail:
        'Four of nine Year 13 Physics students have missed two or more sessions this month. Same cohort, same weeknight — worth checking whether the 5:30pm slot is the problem.',
      severity: { tone: 'bad', label: 'Needs a decision' },
      metric: 'Attendance 79%, down from 94%',
    },
    {
      id: 'f2',
      title: 'Chemistry demand is outrunning capacity',
      detail:
        'Eleven enquiries for Chemistry in three weeks against one tutor with four free hours. Either add a tutor or stop advertising the subject.',
      severity: { tone: 'warn', label: 'Watch' },
      metric: '11 enquiries · 4 hrs capacity',
    },
    {
      id: 'f3',
      title: 'Ms. Patel is at 92% occupancy',
      detail:
        'Little slack left for the term. Any new Maths or Physics enrolment will need a second tutor or a waitlist.',
      severity: { tone: 'warn', label: 'Watch' },
      metric: '92% of bookable hours',
    },
  ],

  metrics: [
    { label: 'Monthly revenue', value: '$18,240', delta: '+6.2%', deltaTone: 'good' },
    { label: 'Active students', value: '61', delta: '+3', deltaTone: 'good' },
    { label: 'Active tutors', value: '5', delta: '0', deltaTone: 'neutral' },
    { label: 'Bookings this week', value: '84', delta: '−4', deltaTone: 'warn' },
    { label: 'Occupancy', value: '78%', delta: '+2 pts', deltaTone: 'good' },
  ],

  revenueTrend: {
    takeaway: 'Revenue is up for four months, but the last month grew slower than the three before it.',
    seriesLabel: 'Revenue',
    points: [
      { label: 'Mar', value: 14200 },
      { label: 'Apr', value: 15400 },
      { label: 'May', value: 16800 },
      { label: 'Jun', value: 17180 },
      { label: 'Jul', value: 18240 },
    ],
    textEquivalent:
      'Monthly revenue: March $14,200, April $15,400, May $16,800, June $17,180, July $18,240.',
  },

  attendanceTrend: {
    takeaway: 'Overall attendance holds near 93%, but Year 13 has pulled away from the rest.',
    seriesLabel: 'All students',
    compareLabel: 'Year 13',
    points: [
      { label: 'Mar', value: 95, compare: 94 },
      { label: 'Apr', value: 94, compare: 90 },
      { label: 'May', value: 94, compare: 86 },
      { label: 'Jun', value: 93, compare: 82 },
      { label: 'Jul', value: 93, compare: 79 },
    ],
    textEquivalent:
      'All-student attendance: 95, 94, 94, 93, 93 percent across five months. Year 13 over the same months: 94, 90, 86, 82, 79 percent.',
  },

  retentionTrend: {
    takeaway: 'Term-over-term renewals have recovered to 87% after a dip in April.',
    seriesLabel: 'Renewal rate',
    points: [
      { label: 'Term 1', value: 84 },
      { label: 'Term 2', value: 79 },
      { label: 'Term 3', value: 87 },
    ],
    textEquivalent: 'Renewal rate by term: 84, 79 then 87 percent.',
  },

  users: [
    {
      id: 'u1',
      name: 'Aroha M.',
      role: 'Student',
      detail: 'Year 11 · Mathematics, Physics',
      status: { tone: 'good', label: 'Active' },
    },
    {
      id: 'u2',
      name: 'Jayden K.',
      role: 'Student',
      detail: 'Year 13 · Physics, Calculus',
      status: { tone: 'warn', label: 'Churn risk' },
    },
    {
      id: 'u3',
      name: 'Mia T.',
      role: 'Student',
      detail: 'Year 10 · Mathematics',
      status: { tone: 'good', label: 'Active' },
    },
    {
      id: 'u4',
      name: 'Ms. Patel',
      role: 'Tutor',
      detail: 'Mathematics, Physics · 25 students',
      status: { tone: 'good', label: 'Approved' },
    },
  ],

  finance: [
    {
      id: 'fin1',
      reference: 'PAY-3391',
      kind: 'Payment',
      party: 'David M.',
      amount: '$320.00',
      status: { tone: 'good', label: 'Settled' },
      at: 'Today',
    },
    {
      id: 'fin2',
      reference: 'INV-1042',
      kind: 'Invoice',
      party: 'David M.',
      amount: '$320.00',
      status: { tone: 'warn', label: 'Outstanding' },
      at: '1st of this month',
    },
    {
      id: 'fin3',
      reference: 'PYR-0088',
      kind: 'Payroll',
      party: 'Ms. Patel',
      amount: '$2,140.00',
      status: { tone: 'neutral', label: 'Scheduled' },
      at: 'End of month',
    },
    {
      id: 'fin4',
      reference: 'REF-0007',
      kind: 'Refund',
      party: 'Withdrawn enrolment',
      amount: '$80.00',
      status: { tone: 'good', label: 'Processed' },
      at: 'Last week',
    },
  ],
}
