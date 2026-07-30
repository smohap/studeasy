import type { AiOutput } from '@/types/dashboard'

/**
 * The AI seam. Every AI panel in the app calls exactly one function from this
 * file, so replacing fixtures with real calls is a one-file change.
 *
 * Each output carries `groundedIn`, which the UI renders. Parents are paying
 * for the guarantee that answers come from the academy's own material rather
 * than a general-purpose model, so that has to be legible on screen — not just
 * true somewhere in a backend.
 */

const DELAY = 700

function resolve<T>(value: T, ms = DELAY): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms))
}

/** Student — "What should I study today?" */
export function studentDailyPlan(): Promise<AiOutput> {
  return resolve({
    headline: 'Half an hour on indices, then the algebra worksheet',
    body: [
      'You lost marks on indices in both of your last two tests — the same rule each time, so it is worth 20 minutes rather than another full topic review.',
      'Then do worksheet 7 while quadratics is still fresh from today. You are at 78% mastery there and it is your strongest topic.',
      'Leave physics until Wednesday. The motion test is Thursday and you retain graph work better the day after practice.',
    ],
    groundedIn: "Your last two test scripts, this week's lessons, and Ms. Patel's own worksheets",
    suggestedActions: ['Start indices practice', 'Open worksheet 7', 'Book a physics catch-up'],
  })
}

/** Student — chat reply in the study coach panel. */
export function studentCoachReply(question: string): Promise<AiOutput> {
  const trimmed = question.trim()
  return resolve({
    headline: trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed,
    body: [
      'Start by getting the squared term on its own, then halve the coefficient of x and square it — that is the step Ms. Patel calls "completing the box".',
      'Your worked example from last Tuesday does this in three lines. The mistake you made then was dropping the sign when moving the constant across.',
      'Try it on 2x² + 8x − 3 = 0 and check your first line against the example before carrying on.',
    ],
    groundedIn: "The academy's Level 1 Algebra worksheets and your marked script from 12 days ago",
    suggestedActions: ['Show me the worked example', 'Give me three more like this'],
  })
}

/** Parent — "How is my child really doing?" */
export function parentInsight(childName: string): Promise<AiOutput> {
  const first = childName.split(' ')[0]
  return resolve({
    headline: `${first} has turned a corner on algebra, and it is showing in the marks`,
    body: [
      `${first} has moved from 61% to 81% across four maths tests this term. The change is not that she is working more hours — it is that she now spots which step she has got wrong without being told.`,
      'What is still shaky is indices. It has cost her marks in both recent tests, the same rule each time. Her tutor has put it at the front of next week.',
      'At home, the useful thing is not more practice. Ask her to explain one question back to you — if she can talk through why a step works, it has landed.',
    ],
    groundedIn: "Four marked test scripts, this term's lesson notes, and homework scans from the last three weeks",
    suggestedActions: ['Read the full report', 'Message Ms. Patel', 'Book an extra session'],
  })
}

/** Tutor — lesson plan, worksheet or quiz from a topic. */
export function tutorTeachingPlan(topic: string): Promise<AiOutput> {
  return resolve({
    headline: `Lesson plan — ${topic || 'Year 10 Algebra'}`,
    body: [
      'Objectives: rearrange a formula to isolate any variable; recognise when to divide before subtracting; check an answer by substitution.',
      'Starter (5 min): three one-step rearrangements from the Term 2 worksheet, ramping to two-step.',
      'Worked examples (15 min): two from your own set, then one you build with the class talking you through it.',
      'Practice (20 min): eight questions, difficulty-matched, avoiding the four this group has already seen.',
      'Homework: six questions plus one "explain the error" question using a script from last week.',
    ],
    groundedIn: 'Your own worksheets and quizzes, plus this group’s last four homework sets',
    suggestedActions: ['Generate the worksheet', 'Generate a 10-question quiz', 'Save to this class'],
  })
}

/** Admin — flagged business trends, narrated. */
export function adminBusinessSummary(): Promise<AiOutput> {
  return resolve({
    headline: 'One decision needed: the Thursday 5:30pm Year 13 Physics slot',
    body: [
      'Year 13 Physics attendance has fallen from 94% to 79% over five months while every other cohort held steady. The absences cluster on one weeknight, which points at the timetable rather than the teaching.',
      'Chemistry enquiries are outrunning capacity — eleven in three weeks against four bookable hours. Continuing to advertise it will cost you goodwill.',
      'Ms. Patel is at 92% occupancy. The next Maths or Physics enrolment needs a second tutor or a waitlist.',
    ],
    groundedIn: 'Five months of attendance and booking records, tutor capacity, and enquiry logs',
    suggestedActions: ['Move the Year 13 slot', 'Open a Chemistry tutor role', 'Review the waitlist'],
  })
}
