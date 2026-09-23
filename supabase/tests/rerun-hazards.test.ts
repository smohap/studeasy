import { expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATION_ORDER } from '../migration-order.mjs'

/**
 * Which migrations undo each other when re-run out of order.
 *
 * Every file here is `create or replace` and documented as safe to re-run,
 * which is true of each one alone and false of the set. When a later migration
 * redefines a function an earlier one also defines, re-running the earlier file
 * silently restores the old version — no error, no diff, and the behaviour it
 * was replaced for quietly comes back.
 *
 * This has bitten the project twice, both times expensively:
 *
 *   - touch_streak, defined in both learning-twin.sql and economy.sql, where
 *     re-running the first reverted the second and took the coin economy with
 *     it.
 *   - is_admin() and guard_profile(), where being told to re-run schema.sql to
 *     pick up a fix reverted both to their pre-multi-role versions. The old
 *     is_admin() reads profiles.role, so an administrator who had switched
 *     their active role to look at another portal would silently have lost
 *     admin everywhere is_admin() is consulted.
 *
 * The collisions themselves are legitimate: replacing a function in a later
 * migration is how this schema evolves. Discovering them one at a time in
 * production is not. So they are enumerated here, and a new one fails this
 * test until it is added both to the list below AND to the runbook — which is
 * what actually gets it in front of whoever is pasting the files in.
 */

const DIR = join(import.meta.dirname, '..')

/**
 * Every function more than one migration defines, and the order they define it
 * in. Documented in docs/deploy-consent-gate.md.
 *
 * Fourteen of them, which is the point. This is not a handful of special cases
 * to memorise — the schema evolves by replacing functions in later files, so
 * the hazard is structural. mark_order_paid is rewritten five times across the
 * set; submit_attempt four.
 *
 * That density is why the runbook's rule is the blunt one: re-run a migration
 * and you must re-run every migration after it. A pairwise list of "if X then
 * also Y" would be twenty-two rows nobody can follow under pressure.
 */
const KNOWN: Record<string, string[]> = {
  begin_class_checkout: ['classes-forum.sql', 'scheduling.sql'],
  cancel_class_registration: ['classes-forum.sql', 'scheduling.sql'],
  close_expired_attempts: ['assessment-modes.sql', 'assessment-timing.sql'],
  grade_submission: ['platform.sql', 'classes-followup.sql'],
  guard_profile: ['schema.sql', 'multi-role.sql'],
  is_admin: ['schema.sql', 'multi-role.sql'],
  mark_order_paid: [
    'payments.sql',
    'classes-forum.sql',
    'scheduling.sql',
    'assessment-modes.sql',
    'content-and-help.sql',
  ],
  promote_waitlist: ['classes-forum.sql', 'scheduling.sql'],
  register_for_class: ['classes-forum.sql', 'classes-followup.sql', 'scheduling.sql'],
  request_student_link: ['schema.sql', 'family.sql'],
  start_attempt: ['assessments.sql', 'assessment-modes.sql', 'assessment-timing.sql'],
  submit_attempt: [
    'assessments.sql',
    'assessment-modes.sql',
    'assessment-timing.sql',
    'assessment-marking.sql',
  ],
  teaches: ['messaging.sql', 'learning-twin.sql'],
  touch_streak: ['platform.sql', 'badges.sql', 'learning-twin.sql'],
}

/** Functions a migration defines, ignoring anything inside a comment. */
function definitions(file: string): string[] {
  const sql = readFileSync(join(DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  return [
    ...sql.matchAll(/create\s+or\s+replace\s+function\s+studeasy\.(\w+)/gi),
  ].map((m) => m[1])
}

it('every migration is listed in the shared order', () => {
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith('.sql'))
  expect(onDisk.filter((f) => !MIGRATION_ORDER.includes(f))).toEqual([])
})

it('enumerates every function that more than one migration defines', () => {
  const byFn = new Map<string, string[]>()

  for (const file of MIGRATION_ORDER) {
    for (const fn of definitions(file)) {
      const files = byFn.get(fn) ?? []
      if (!files.includes(file)) files.push(file)
      byFn.set(fn, files)
    }
  }

  const found = Object.fromEntries(
    [...byFn.entries()].filter(([, files]) => files.length > 1).sort(),
  )

  expect(
    found,
    'A migration now redefines a function another one also defines. Add it to ' +
      'KNOWN here, and check the deploy runbook still tells whoever is pasting ' +
      'these in to re-run everything downstream.',
  ).toEqual(KNOWN)
})
