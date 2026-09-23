#!/usr/bin/env node
/**
 * Apply the migrations to a local database, and run the pgTAP suite on it.
 *
 * Why this exists: the SQL in supabase/ is written to be pasted into the
 * Supabase SQL editor by hand, and for a long stretch that was the only way to
 * discover whether any of it worked. Seven consecutive runs of one test file
 * turned up seven distinct defects, each costing a round trip through a person
 * pasting an error back. This removes the person from that loop.
 *
 * It talks to Postgres directly rather than shelling out to psql, because psql
 * is not installed on the machine this is developed on and `supabase start`
 * does not put it on the PATH.
 *
 * The database it points at is the local disposable one, never production.
 *
 *   node scripts/db.mjs apply          migrations, in dependency order
 *   node scripts/db.mjs test           helpers + every *_test.sql
 *   node scripts/db.mjs test consent   just the ones matching
 *   node scripts/db.mjs sql <path>     one script, printing its last result
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { MIGRATION_ORDER as ORDER } from '../supabase/migration-order.mjs'

const ROOT = join(import.meta.dirname, '..')
const SQL = join(ROOT, 'supabase')
const TESTS = join(SQL, 'tests')


/** The Supabase CLI's local default. Never a production connection string. */
const URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function connect() {
  const client = new pg.Client({ connectionString: URL })
  try {
    await client.connect()
  } catch (err) {
    console.error(`\nCannot reach Postgres at ${URL}\n`)
    console.error('Start it with:  npx supabase start')
    console.error('That needs Docker Desktop running — see docs/local-database.md\n')
    console.error(String(err.message ?? err))
    process.exit(1)
  }
  return client
}

/** Each migration is sent on its own, so a failure names the file it came from. */
async function apply() {
  const onDisk = readdirSync(SQL).filter((f) => f.endsWith('.sql'))
  const missing = onDisk.filter((f) => !ORDER.includes(f))
  if (missing.length > 0) {
    console.error(`Not listed in ORDER: ${missing.join(', ')}`)
    console.error('Add each one in dependency order in scripts/db.mjs, then re-run.')
    process.exit(1)
  }

  const client = await connect()
  for (const file of ORDER) {
    process.stdout.write(`  ${file.padEnd(26)}`)
    try {
      await client.query(readFileSync(join(SQL, file), 'utf8'))
      console.log('ok')
    } catch (err) {
      console.log('FAILED')
      console.error(`\n${file}: ${err.message}`)
      if (err.where) console.error(err.where)
      await client.end()
      process.exit(1)
    }
  }
  await client.end()
  console.log(`\n${ORDER.length} migrations applied.`)
}

/**
 * Runs one pgTAP file and returns its verdict.
 *
 * Sent as a single multi-statement query, exactly as the SQL editor sends it,
 * so the begin/rollback around it behaves identically. node-postgres returns
 * one result per statement; the verdict is the last one with rows, which
 * mirrors what the editor displays — and is why those files put it last.
 */
async function runTap(client, path) {
  const results = await client.query(readFileSync(path, 'utf8'))
  const sets = Array.isArray(results) ? results : [results]
  const last = [...sets].reverse().find((r) => r.rows?.length > 0)
  return (last?.rows ?? []).map((row) => Object.values(row)[0]).join('\n')
}

async function test(filter) {
  const client = await connect()

  // pgTAP itself, the tests schema, and the three helpers.
  await client.query(readFileSync(join(TESTS, 'helpers.sql'), 'utf8'))

  const files = readdirSync(TESTS)
    .filter((f) => f.endsWith('_test.sql'))
    .filter((f) => !filter || f.includes(filter))
    .sort()

  if (files.length === 0) {
    console.error(`No test file matches "${filter}".`)
    process.exit(1)
  }

  let failed = 0
  for (const file of files) {
    console.log(`\n${'─'.repeat(4)} ${file} ${'─'.repeat(Math.max(0, 48 - file.length))}`)
    try {
      const out = await runTap(client, join(TESTS, file))
      console.log(out || '(no output)')
      if (!out.startsWith('PASS')) failed += 1
    } catch (err) {
      console.log(`ERROR  ${err.message}`)
      if (err.where) console.log(err.where)
      failed += 1
    }
  }

  await client.end()
  console.log(
    failed === 0
      ? `\nAll ${files.length} file(s) passed.`
      : `\n${failed} of ${files.length} file(s) failed.`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

/**
 * What re-running a migration undoes.
 *
 * The runbook's rule is blunt — re-run a file, re-run everything after it —
 * because fourteen functions are defined by more than one migration and a
 * pairwise list is not something anyone follows correctly under pressure. This
 * answers the precise question instead, so the blunt rule only has to be
 * followed when it actually applies.
 *
 *   node scripts/db.mjs after multi-role.sql
 */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const NEWLINE = /\r?\n/

function definitions(file) {
  const sql = readFileSync(join(SQL, file), 'utf8')
    .replace(BLOCK_COMMENT, '')
    .split(NEWLINE)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(String.fromCharCode(10))

  return [
    ...sql.matchAll(/create\s+or\s+replace\s+function\s+studeasy\.(\w+)/gi),
  ].map((m) => m[1])
}

function after(file) {
  const at = ORDER.indexOf(file)
  if (at === -1) {
    console.error(`${file} is not in supabase/migration-order.mjs`)
    process.exit(1)
  }

  const mine = new Set(definitions(file))
  const affected = new Map()

  for (const later of ORDER.slice(at + 1)) {
    const clashes = definitions(later).filter((fn) => mine.has(fn))
    if (clashes.length > 0) affected.set(later, clashes)
  }

  if (affected.size === 0) {
    console.log(`Re-running ${file} reverts nothing. No further action.`)
    return
  }

  console.log(`Re-running ${file} reverts these. Run them again, in this order:
`)
  for (const [f, fns] of affected) {
    console.log(`  ${f.padEnd(26)} ${fns.join(', ')}`)
  }
}

/** Any ad-hoc script, printing its last result set the way the editor would. */
async function sql(path) {
  const client = await connect()
  try {
    const results = await client.query(readFileSync(join(ROOT, path), 'utf8'))
    const sets = Array.isArray(results) ? results : [results]
    const last = [...sets].reverse().find((r) => r.rows?.length > 0)
    console.log(last ? JSON.stringify(last.rows, null, 2) : '(no rows)')
  } catch (err) {
    console.error(err.message)
    if (err.where) console.error(err.where)
    process.exitCode = 1
  }
  await client.end()
}

const [command, arg] = process.argv.slice(2)

if (command === 'apply') await apply()
else if (command === 'test') await test(arg)
else if (command === 'sql' && arg) await sql(arg)
else if (command === 'after' && arg) after(arg)
else {
  console.log(`Usage:
  node scripts/db.mjs apply             apply every migration in order
  node scripts/db.mjs test [filter]     run the pgTAP suite
  node scripts/db.mjs sql <path>        run one script, print its last result
  node scripts/db.mjs after <file>      what re-running that migration undoes`)
  process.exit(1)
}
