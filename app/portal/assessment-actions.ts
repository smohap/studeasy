'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { hasRole } from '@/lib/roles'
import { FORMULA_SYMBOLS, MATCH_SEPARATOR } from '@/lib/assessment-types'
import type { AttemptResult, Delivery, QuestionKind } from '@/lib/assessment-types'

export type Result = { error: string | null }

// ---------------------------------------------------------------------------
// Taking
// ---------------------------------------------------------------------------

export async function startAttempt(
  assessmentId: string,
): Promise<Result & { attemptId?: string; deadline?: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_attempt', {
    assessment: assessmentId,
  })
  if (error) return { error: error.message }

  const attemptId = data as string

  /*
   * The deadline comes back with the attempt, and it comes from the server.
   * A countdown the browser works out for itself is reset by a reload, which
   * is exactly what an unpausable timer must not allow. Resuming an attempt
   * returns the original deadline, so the clock never restarts.
   */
  const { data: deadline } = await supabase.rpc('attempt_deadline', {
    attempt: attemptId,
  })

  return { error: null, attemptId, deadline: (deadline as string | null) ?? null }
}

/**
 * Sends responses, never a score. The database marks the objective questions
 * against its own copy of the answers, so a tampered client can change what it
 * answered but not what it scored.
 */
export async function submitAttempt(
  attemptId: string,
  responses: { question_id: string; response: unknown }[],
): Promise<Result & { result?: AttemptResult }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_attempt', {
    attempt: attemptId,
    responses,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/student')
  revalidatePath('/portal/student/achievements')
  return { error: null, result: (data as AttemptResult[])[0] }
}

/** One written answer: the marks, and why. */
export async function markWrittenAnswer(
  answerId: string,
  awarded: number,
  comment: string,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_answer_by_hand', {
    answer: answerId,
    awarded,
    comment,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/marking')
  return { error: null }
}

/** Teacher finishes anything the machine could not mark. */
export async function releaseAttempt(
  attemptId: string,
  extraMarks: number,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_attempt', {
    attempt: attemptId,
    extra_marks: extraMarks,
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/tutor/marking')
  return { error: null }
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

export type NewAssessment = {
  title: string
  description: string
  courseId: string
  /** Linked class. Students holding a seat in it sit this for nothing. */
  classId: string
  delivery: Delivery
  priceDollars: string
  /** Classroom only. */
  location: string
  meetingUrl: string
  /** datetime-local: local wall time, no zone. Blank for no bound. */
  opensAt: string
  closesAt: string
  /** Offline only. */
  paperUrl: string
  allowUpload: boolean
  passMarkPct: string
  attemptsAllowed: string
  timeLimitMinutes: string
  issuesCertificate: boolean
  negativeMarking: boolean
}

/**
 * Turns the form into a row, and refuses the combinations that cannot work.
 *
 * guard_assessment_shape() checks the same things on publish — this is so a
 * teacher hears about it while the form is still in front of them.
 */
function buildAssessmentRow(input: NewAssessment): Record<string, unknown> | string {
  if (!input.title.trim()) return 'Give the assessment a title.'

  if (input.delivery === 'classroom') {
    if (!input.location.trim()) return 'A classroom assessment needs a location.'
    if (!input.opensAt) return 'A classroom assessment needs a date and time.'
  }
  if (input.delivery === 'offline' && !input.paperUrl.trim()) {
    return 'An offline assessment needs a link to the paper students download.'
  }
  if (
    input.opensAt &&
    input.closesAt &&
    new Date(input.closesAt) <= new Date(input.opensAt)
  ) {
    return 'It cannot close before it opens.'
  }

  // Entered in dollars, stored in cents; rounding stops a stray "49.999"
  // becoming an amount Stripe cannot charge.
  const priceCents = Math.round(Number(input.priceDollars || '0') * 100)
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return 'Enter a price of 0 or more.'
  }

  return {
    course_id: input.courseId || null,
    class_id: input.classId || null,
    delivery: input.delivery,
    price_cents: priceCents,
    title: input.title.trim(),
    description: input.description.trim() || null,
    location: input.delivery === 'classroom' ? input.location.trim() || null : null,
    meeting_url: input.meetingUrl.trim() || null,
    opens_at: input.opensAt ? new Date(input.opensAt).toISOString() : null,
    closes_at: input.closesAt ? new Date(input.closesAt).toISOString() : null,
    paper_url: input.delivery === 'offline' ? input.paperUrl.trim() || null : null,
    allow_upload: input.delivery === 'offline' ? input.allowUpload : false,
    pass_mark_pct: Number(input.passMarkPct || '50'),
    attempts_allowed: Number(input.attemptsAllowed || '1'),
    // Only an online paper has a clock; the others are sat away from the app.
    time_limit_minutes:
      input.delivery === 'online' && input.timeLimitMinutes
        ? Number(input.timeLimitMinutes)
        : null,
    issues_certificate: input.issuesCertificate,
    negative_marking: input.negativeMarking,
  }
}

export async function createAssessment(input: NewAssessment): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  // Membership, not the active role — see createClassSession() for why.
  if (!userId || !profile || !hasRole(profile, 'tutor')) {
    return { error: 'Only an approved teacher can create an assessment.' }
  }

  const row = buildAssessmentRow(input)
  if (typeof row === 'string') return { error: row }

  const supabase = await createClient()
  const { error } = await supabase.from('assessments').insert({
    ...row,
    organization_id: profile.organization_id,
    teacher_id: userId,
    status: 'draft',
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/assessments')
  return { error: null }
}

/**
 * Edit one you already made.
 *
 * status is deliberately absent — publishing and archiving go through
 * setAssessmentStatus(), which refuses to publish an empty paper.
 */
export async function updateAssessment(
  assessmentId: string,
  input: NewAssessment,
): Promise<Result> {
  const { userId, profile } = await getCurrentUser()
  if (!userId || !profile || !hasRole(profile, 'tutor')) {
    return { error: 'Only an approved teacher can edit an assessment.' }
  }

  const row = buildAssessmentRow(input)
  if (typeof row === 'string') return { error: row }

  // assessments_write limits this to the teacher who owns it, or an admin.
  const supabase = await createClient()
  const { error } = await supabase.from('assessments').update(row).eq('id', assessmentId)

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/assessments')
  revalidatePath(`/assess/${assessmentId}`)
  return { error: null }
}

/** Records where a student's uploaded answer file landed in Storage. */
export async function attachAttemptUpload(
  attemptId: string,
  path: string,
  fileName: string,
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('attach_attempt_upload', {
    attempt: attemptId,
    path,
    file_name: fileName,
  })
  if (error) return { error: error.message }
  return { error: null }
}

export type NewQuestion = {
  assessmentId: string
  kind: QuestionKind
  prompt: string
  marks: string
  /** One per line, for the kinds that need choices. */
  optionsText: string
  /** The answer: an option, a number, or every accepted wording. */
  answerText: string
  tolerance: string
  explanation: string
  /** matching: one "left = right" pair per line. */
  pairsText?: string
  /** ordering: one item per line, in the correct order. */
  itemsText?: string
  /** image: where the uploaded diagram went in the question-images bucket. */
  imagePath?: string | null
}

/**
 * Turns the form into the shapes mark_answer() expects. Getting this wrong
 * means a question that can never be answered correctly, so each kind is
 * handled explicitly rather than by a clever generic.
 */
function buildPayloadAndCorrect(input: NewQuestion): {
  payload: Record<string, unknown>
  correct: unknown | null
  error?: string
} {
  const options = input.optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
  const answers = input.answerText
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean)

  switch (input.kind) {
    case 'mcq':
      if (options.length < 2)
        return { payload: {}, correct: null, error: 'Give at least two options.' }
      if (answers.length !== 1)
        return { payload: {}, correct: null, error: 'Give exactly one correct option.' }
      if (!options.includes(answers[0])) {
        return {
          payload: {},
          correct: null,
          error: 'The answer must match one of the options exactly.',
        }
      }
      return { payload: { options }, correct: answers[0] }

    case 'multi_select':
      if (options.length < 2)
        return { payload: {}, correct: null, error: 'Give at least two options.' }
      if (answers.length === 0)
        return { payload: {}, correct: null, error: 'Mark at least one option correct.' }
      return { payload: { options }, correct: answers }

    case 'true_false':
      if (!['true', 'false'].includes(answers[0]?.toLowerCase())) {
        return { payload: {}, correct: null, error: 'The answer must be true or false.' }
      }
      return { payload: { options: ['true', 'false'] }, correct: answers[0].toLowerCase() }

    case 'numerical': {
      const value = Number(answers[0])
      if (!Number.isFinite(value))
        return { payload: {}, correct: null, error: 'The answer must be a number.' }
      return {
        payload: { tolerance: Number(input.tolerance || '0') },
        correct: String(value),
      }
    }

    case 'fill_blank':
      if (answers.length === 0)
        return { payload: {}, correct: null, error: 'List at least one accepted answer.' }
      return { payload: {}, correct: answers }

    // Marked by hand — no stored answer at all.
    case 'short_answer':
    case 'essay':
      return { payload: {}, correct: null }

    case 'matching': {
      const pairs = (input.pairsText ?? '')
        .split('\n')
        .map((line) => line.split(MATCH_SEPARATOR))
        .filter((parts) => parts.length >= 2)
        .map((parts) => ({
          left: parts[0].trim(),
          // Rejoin, so a right-hand side containing '=' survives.
          right: parts.slice(1).join(MATCH_SEPARATOR).trim(),
        }))
        .filter((p) => p.left && p.right)

      if (pairs.length < 2) {
        return {
          payload: {},
          correct: null,
          error: 'Give at least two pairs, one per line, written as "left = right".',
        }
      }
      if (new Set(pairs.map((p) => p.left)).size !== pairs.length) {
        return {
          payload: {},
          correct: null,
          error: 'Two pairs have the same left-hand side, so the answer would be ambiguous.',
        }
      }

      /*
       * The right-hand column is shuffled once, here, and stored shuffled.
       * Shuffling on each render would mean the stored answer indices no
       * longer point at what the student is looking at.
       *
       * The answer is stored as "leftIndex:rightIndex" strings rather than the
       * text itself, so a pair whose text contains the separator cannot break
       * marking. mark_answer() compares matching as an unordered set, which is
       * right: which row the student filled in first is not part of the answer.
       */
      const right = pairs.map((p) => p.right)
      for (let i = right.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[right[i], right[j]] = [right[j], right[i]]
      }

      const correct = pairs.map(
        (p, i) => `${i}:${right.indexOf(p.right)}`,
      )
      return { payload: { left: pairs.map((p) => p.left), right }, correct }
    }

    case 'ordering': {
      const items = (input.itemsText ?? '')
        .split('\n')
        .map((i) => i.trim())
        .filter(Boolean)

      if (items.length < 2) {
        return {
          payload: {},
          correct: null,
          error: 'Give at least two items, one per line, in the correct order.',
        }
      }
      if (new Set(items).size !== items.length) {
        return {
          payload: {},
          correct: null,
          error: 'Two items are identical, so there is no single correct order.',
        }
      }

      /*
       * Shuffled for display, stored in the authored order as the answer.
       * mark_answer() compares ordering with jsonb equality, so the response
       * must be the same strings in the student's chosen sequence.
       */
      const shown = [...items]
      for (let i = shown.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shown[i], shown[j]] = [shown[j], shown[i]]
      }
      // A shuffle that returns the answer is not a question.
      if (shown.every((v, i) => v === items[i])) shown.reverse()

      return { payload: { items: shown }, correct: items }
    }

    case 'formula':
      /*
       * Marked as text, exactly like fill_blank — mark_answer() handles the
       * two together. It is not algebra: '2x+1' and '1+2x' are different
       * answers, which is why the editor asks for every accepted form rather
       * than pretending to solve anything.
       */
      if (answers.length === 0) {
        return {
          payload: {},
          correct: null,
          error: 'List at least one accepted form of the answer.',
        }
      }
      return { payload: { symbols: FORMULA_SYMBOLS }, correct: answers }

    case 'image':
      // The picture is the question. There is nothing to compare an answer to,
      // so this goes to the teacher's marking queue like an essay.
      if (!input.imagePath) {
        return { payload: {}, correct: null, error: 'Upload the image first.' }
      }
      return { payload: {}, correct: null }

    default:
      return {
        payload: {},
        correct: null,
        error: 'That question type is not supported by the builder yet.',
      }
  }
}

export async function addQuestion(input: NewQuestion): Promise<Result> {
  if (!input.prompt.trim()) return { error: 'Write the question.' }

  const built = buildPayloadAndCorrect(input)
  if (built.error) return { error: built.error }

  const supabase = await createClient()

  const { data: last } = await supabase
    .from('questions')
    .select('position')
    .eq('assessment_id', input.assessmentId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('questions').insert({
    assessment_id: input.assessmentId,
    position: ((last as { position: number } | null)?.position ?? -1) + 1,
    kind: input.kind,
    prompt: input.prompt.trim(),
    marks: Number(input.marks || '1'),
    image_path: input.imagePath ?? null,
    payload: built.payload,
    correct: built.correct,
    explanation: input.explanation.trim() || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/assessments')
  return { error: null }
}

export async function setAssessmentStatus(
  assessmentId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result> {
  const supabase = await createClient()

  // Publishing an empty paper would let a student "pass" with nothing to answer.
  if (status === 'published') {
    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId)

    if ((count ?? 0) === 0) {
      return { error: 'Add at least one question before publishing.' }
    }
  }

  const { error } = await supabase
    .from('assessments')
    .update({ status })
    .eq('id', assessmentId)

  if (error) return { error: error.message }
  revalidatePath('/portal/tutor/assessments')
  return { error: null }
}
