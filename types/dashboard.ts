/**
 * Shapes for the four role dashboards. Every fixture in `mock/` is typed from
 * here, and every dashboard component reads a fixture rather than holding data
 * inline — that keeps one seam to replace when a real API arrives.
 */

export type Urgency = 'now' | 'today' | 'soon'

/** Status is never carried by colour alone; `label` is the accessible text. */
export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral'

export type Status = {
  tone: StatusTone
  label: string
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type Person = {
  id: string
  name: string
  yearLevel?: string
  subjects?: string[]
}

export type Notification = {
  id: string
  title: string
  body: string
  at: string
  unread: boolean
}

export type Message = {
  id: string
  from: string
  preview: string
  at: string
  unread: boolean
}

/** A single AI output. `groundedIn` is rendered, not decorative. */
export type AiOutput = {
  headline: string
  body: string[]
  /** What the answer was generated from — the trust boundary, made visible. */
  groundedIn: string
  suggestedActions?: string[]
}

export type TrendPoint = {
  label: string
  /** Primary series. */
  value: number
  /** Optional comparison series. Two max, by design. */
  compare?: number
}

export type Chart = {
  /** Plain-language one-liner shown above the chart. The number is not the insight. */
  takeaway: string
  points: TrendPoint[]
  seriesLabel: string
  compareLabel?: string
  /** Read out to assistive tech in place of the visual. */
  textEquivalent: string
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export type HubItem = {
  id: string
  kind: 'class' | 'homework' | 'test' | 'task'
  title: string
  detail: string
  due: string
  urgency: Urgency
}

export type SubjectMastery = {
  subject: string
  mastery: number
  predictedGrade: string
  trend: 'up' | 'flat' | 'down'
}

export type Assignment = {
  id: string
  title: string
  subject: string
  due: string
  status: Status
  feedback?: string
  mark?: string
}

export type Badge = {
  id: string
  name: string
  earned: boolean
  detail: string
}

export type StudentData = {
  student: Person
  hub: HubItem[]
  mastery: SubjectMastery[]
  streakDays: number
  recentScores: Chart
  assignments: Assignment[]
  xp: number
  xpToNextLevel: number
  level: number
  badges: Badge[]
  leaderboardPosition: number
  leaderboardOf: number
  coachPrompts: string[]
}

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------

export type ChildOverview = {
  child: Person
  attendancePct: number
  lessonsCompleted: number
  lessonsBooked: number
  homeworkCompletionPct: number
  nextClass: string
  tutor: string
  status: Status
}

export type TutorComment = {
  id: string
  tutor: string
  child: string
  at: string
  body: string
}

export type Invoice = {
  id: string
  reference: string
  period: string
  amount: string
  status: Status
  issued: string
}

export type ParentData = {
  parent: Person
  children: ChildOverview[]
  progressBySubject: Chart
  tutorComments: TutorComment[]
  announcements: Notification[]
  messages: Message[]
  invoices: Invoice[]
  subscription: { plan: string; renews: string; amount: string }
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

export type Attendance = 'unmarked' | 'present' | 'late' | 'absent'

export type ScheduledLesson = {
  id: string
  time: string
  subject: string
  studentName: string
  mode: 'Online' | 'In person'
  attendance: Attendance
}

export type AtRiskStudent = {
  id: string
  name: string
  /** Why the AI flagged them. Never shown without this. */
  reason: string
  severity: Status
  metric: string
}

export type MarkingItem = {
  id: string
  student: string
  title: string
  subject: string
  submitted: string
  aiMark: string
  aiComment: string
  /** AI never reaches a parent or student unreviewed. */
  released: boolean
}

export type StudentPerformanceRow = {
  id: string
  name: string
  yearLevel: string
  strength: string
  weakness: string
  homework: Status
  engagement: Status
}

export type TutorData = {
  tutor: Person
  schedule: ScheduledLesson[]
  atRisk: AtRiskStudent[]
  marking: MarkingItem[]
  performance: StudentPerformanceRow[]
  studentCount: number
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type BusinessFlag = {
  id: string
  title: string
  detail: string
  severity: Status
  metric: string
}

export type Metric = {
  label: string
  value: string
  delta?: string
  deltaTone?: StatusTone
}

export type ManagedUser = {
  id: string
  name: string
  role: 'Student' | 'Tutor'
  detail: string
  status: Status
}

export type FinanceRow = {
  id: string
  reference: string
  kind: 'Payment' | 'Invoice' | 'Refund' | 'Payroll'
  party: string
  amount: string
  status: Status
  at: string
}

export type AdminData = {
  flags: BusinessFlag[]
  metrics: Metric[]
  revenueTrend: Chart
  attendanceTrend: Chart
  retentionTrend: Chart
  users: ManagedUser[]
  finance: FinanceRow[]
}
