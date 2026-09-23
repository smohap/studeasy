import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static checks on the pgTAP files, because nothing here can run them.
 *
 * There is no Postgres and no Docker on the machine this is developed on, so
 * every SQL mistake costs a round trip: a person pastes the file into the
 * Supabase editor and pastes the error back. Four separate failures of
 * consent_test.sql — a duplicate key, the same duplicate key again, a
 * permission error, and a foreign key violation — were every one of them
 * visible in the text of the file. These are the rules that would have caught
 * them.
 *
 * This asserts conventions, not correctness. It cannot tell you a policy is
 * wrong. It can only tell you the file will not survive long enough to find
 * out.
 */

const DIR = join(import.meta.dirname, '.')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('_test.sql'))

/** pgTAP calls that consume one slot of the plan. */
const ASSERTIONS = [
  'ok', 'is', 'isnt', 'throws_ok', 'lives_ok',
  'has_table', 'has_column', 'has_function', 'has_view',
  'col_is_pk', 'results_eq', 'set_eq', 'matches',
]

/**
 * Comments are prose, not code, and these files are heavily commented.
 *
 * Without this the checks below read explanations as if they were statements.
 * The jwt-claims rule first shipped passing on a file that did not clear them,
 * because the comment above the delete mentioned `tests.clear_auth()` while
 * explaining why it was deliberately not used.
 *
 * Only whole-line `--` comments are dropped, so a double hyphen inside a
 * string literal survives.
 */
function code(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

it('finds the pgTAP files', () => {
  expect(FILES.length).toBeGreaterThan(0)
})

describe.each(FILES)('%s', (file) => {
  const sql = code(readFileSync(join(DIR, file), 'utf8'))
  const lines = sql.split(/\r?\n/)

  it('plans exactly as many assertions as it makes', () => {
    const planned = /select plan\((\d+)\)/.exec(sql)
    expect(planned, 'no select plan(N)').not.toBeNull()

    const made = lines.filter((line) =>
      ASSERTIONS.some((fn) => line.startsWith(`select ${fn}(`)),
    ).length

    expect(made).toBe(Number(planned![1]))
  })

  /*
   * The 42501. authenticate_as() does SET ROLE authenticated, and that role
   * has no USAGE on the tests schema — on purpose, since the function sets
   * arbitrary jwt claims and granting it would hand every signed-in account
   * an impersonation primitive. So every switch after the first needs the
   * role handed back first.
   */
  it('resets the role before every identity switch after the first', () => {
    const offenders: number[] = []
    let seen = 0
    let resetSince = true

    lines.forEach((line, i) => {
      const l = line.trim()
      if (l === 'reset role;') resetSince = true
      if (l.startsWith('select tests.authenticate_as(')) {
        seen += 1
        if (seen > 1 && !resetSince) offenders.push(i + 1)
        resetSince = false
      }
    })

    expect(offenders, 'authenticate_as with no "reset role;" before it').toEqual([])
  })

  /*
   * The 23505, twice. A fixed id collides with whatever a previous run left
   * behind; a generated one cannot. tests.make_user() is the reason the older
   * files never hit this.
   */
  it('builds auth.users fixtures from generated ids, not literals', () => {
    const UUID = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i
    const inserts = sql.match(/insert into auth\.users[\s\S]*?;/gi) ?? []

    for (const stmt of inserts) {
      expect(
        UUID.test(stmt),
        'literal UUID in an auth.users fixture — use gen_random_uuid()',
      ).toBe(false)
    }
  })

  /*
   * The 23503. Deleting a fixture account cascades to its profile and its
   * profile_roles; the profile_roles delete fires audit.sql's write_audit(),
   * which records auth.uid() as the actor — against a profiles row vanishing
   * in the same statement, and actor_id is a foreign key into profiles.
   *
   * `reset role;` alone does not help: it restores the role and leaves the
   * claims, so auth.uid() still names a test user.
   */
  it('clears the jwt claims, not just the role, before deleting fixtures', () => {
    const at = sql.search(/delete\s+from\s+auth\.users/i)
    if (at === -1) return

    const before = sql.slice(0, at)
    const cleared =
      /set_config\(\s*'request\.jwt\.claims'\s*,\s*null/i.test(before) ||
      /tests\.clear_auth\(\)/.test(before)

    expect(
      cleared,
      'delete from auth.users without clearing request.jwt.claims first',
    ).toBe(true)
  })

  it('closes every dollar-quoted block', () => {
    for (const tag of ['$t$', '$fn$', '$$']) {
      const count = sql.split(tag).length - 1
      expect(count % 2, `odd number of ${tag}`).toBe(0)
    }
  })

  /*
   * finish() emits nothing at all when everything passes, which arrives as a
   * blank result and reads as a failure. Every file ends with a verdict.
   */
  it('ends with a readable verdict and a rollback', () => {
    expect(sql).toContain('from finish() as t(line)')
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
