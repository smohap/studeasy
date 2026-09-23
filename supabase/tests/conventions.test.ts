import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static checks on the pgTAP files, because nothing here can run them.
 *
 * There is no Postgres and no Docker on the machine this is developed on, so
 * every SQL mistake costs a round trip through a human pasting the file into
 * the Supabase editor and pasting the error back. Three separate failures of
 * consent_test.sql — a duplicate key, then the same duplicate key, then a
 * permission error — were all visible in the text of the file. These are the
 * rules that would have caught them.
 *
 * This asserts conventions, not correctness. It cannot tell you a policy is
 * wrong. It can tell you the file will not get far enough to find out.
 */

const DIR = join(import.meta.dirname, '.')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('_test.sql'))

/** pgTAP calls that consume one slot of the plan. */
const ASSERTIONS = [
  'ok', 'is', 'isnt', 'throws_ok', 'lives_ok',
  'has_table', 'has_column', 'has_function', 'has_view',
  'col_is_pk', 'results_eq', 'set_eq', 'matches',
]

function read(f: string): string {
  return readFileSync(join(DIR, f), 'utf8')
}

it('finds the pgTAP files', () => {
  expect(FILES.length).toBeGreaterThan(0)
})

describe.each(FILES)('%s', (file) => {
  const sql = read(file)
  const lines = sql.split(/\r?\n/)

  it('plans exactly as many assertions as it makes', () => {
    const planned = /select plan\((\d+)\)/.exec(sql)
    expect(planned, 'no select plan(N)').not.toBeNull()

    const made = lines.filter((l) =>
      ASSERTIONS.some((fn) => l.startsWith(`select ${fn}(`)),
    ).length

    expect(made).toBe(Number(planned![1]))
  })

  /*
   * The 42501 that cost a round trip. authenticate_as() does SET ROLE
   * authenticated, and that role has no USAGE on the tests schema — on
   * purpose, since the function sets arbitrary jwt claims. So every switch
   * after the first needs the role handed back first.
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

    expect(offenders, `authenticate_as without a preceding "reset role;"`).toEqual([])
  })

  /*
   * The 23505 that cost two. A fixed id collides with whatever a previous run
   * left behind; a random one cannot. tests.make_user() is the reason the
   * older files never hit this.
   */
  it('builds auth.users fixtures from generated ids, not literals', () => {
    const block = /insert into auth\.users[\s\S]*?;/gi
    for (const match of sql.match(block) ?? []) {
      expect(
        /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(match),
        'literal UUID in an auth.users fixture — use gen_random_uuid()',
      ).toBe(false)
    }
  })

  it('closes every dollar-quoted block', () => {
    for (const tag of ['$t$', '$fn$', '$$']) {
      const n = sql.split(tag).length - 1
      expect(n % 2, `odd number of ${tag}`).toBe(0)
    }
  })

  /*
   * finish() emits nothing at all when everything passes, which reads as a
   * blank result and looks like a failure. Every file ends with a verdict.
   */
  it('ends with a readable verdict and a rollback', () => {
    expect(sql).toContain('from finish() as t(line)')
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
