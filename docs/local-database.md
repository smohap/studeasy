# Running the SQL before a human sees it

## Where this stands

**Today: migrations and tests are run by hand**, pasted into the Supabase SQL
editor, with the result pasted back. Docker will not run on the development
machine, so the local stack below is written but not usable there.

That costs a round trip per defect, and it is worth being concrete about the
price: `consent_test.sql` took seven runs to approach green, and every one of
them surfaced a *different* real fault — a duplicate key, the same key again, a
permission error, a foreign-key violation from an audit trigger, an RLS
visibility problem inside the test's own SQL. None of those were guessable from
reading the file, and two confident predictions about them turned out wrong.

`supabase/tests/conventions.test.ts` catches the classes that *are* visible in
the text of a file, and runs as part of `npm test`. It is not a substitute for
executing the SQL; it only stops the file failing for a reason nobody needs to
be told twice.

## Making it runnable — a scratch database

The intended next step, when there is time for it. It needs no Docker.

1. Create a **second, free Supabase project**. It holds nothing real and can be
   deleted at any time.
2. Put its connection string in `.env.local` — which is gitignored — as
   `SUPABASE_DB_URL`. It stays on your machine; nothing in this repo reads it
   except `scripts/db.mjs` at the moment it connects.
3. `npm run db:apply`, then `npm run db:test`.

**Before switching, add a guard.** The hazard is obvious: one wrong connection
string and `db:test` is creating and deleting `auth.users` rows in production.
The guard is a sentinel — a row that exists only in the scratch project, which
`db:test` refuses to run without. That is a few lines in `scripts/db.mjs` and
should be written at the same time as the switch, not afterwards.

## The commands

```bash
npm run db:apply             # 25 migrations, in dependency order
npm run db:test              # helpers + every *_test.sql
npm run db:test consent      # just the matching ones
node scripts/db.mjs sql supabase/tests/diagnose-dob.sql
```

The migration order lives in `scripts/db.mjs`, taken from each file's own
"Run AFTER" header. A new migration must be added there, and `apply` refuses to
run if the directory and the list disagree.

`npm run db:start` / `db:stop` wrap `supabase start`, which is the part that
needs Docker. They are kept for whenever a machine has it; everything else
works against any Postgres via `SUPABASE_DB_URL`.

## The editor's quirks, which outlive all of this

Production migrations are applied by hand whatever else changes, so these
matter permanently:

- The editor displays **only the last result set** a script produces. A
  `select` after the one you care about hides it — this cost a diagnostic run
  that returned one blank column.
- `finish()` emits nothing at all when every assertion passes, so a blank
  result reads as a failure. Every test file ends with an explicit verdict row.
- `tests.authenticate_as()` does `SET ROLE authenticated`, and that role has no
  `USAGE` on the `tests` schema — deliberately, since the function sets
  arbitrary JWT claims. Every identity switch after the first needs
  `reset role;` before it.

`scripts/db.mjs` reproduces the first of these on purpose rather than improving
on it, so a script that reads correctly there reads correctly in the editor.

## Troubleshooting

- **`Cannot reach Postgres at ...`** — no `SUPABASE_DB_URL`, or nothing
  listening. Under option C above this is expected; the SQL goes in the editor.
- **Port 54322 in use** — another project's stack is up.
- **Docker images fail to pull** — a proxy or a VPN. Nothing here fixes that.
