# A local database, so the SQL can be run before you see it

## Why

The SQL in `supabase/` was written to be pasted into the Supabase SQL editor by
hand, and for a long stretch that was the only way to find out whether any of
it worked. One test file took seven runs to go green, and every one of those
runs turned up a *different* real defect — a duplicate key, a permission error,
a foreign-key violation from an audit trigger, an RLS visibility problem inside
the test's own SQL. Each cost a round trip: paste the file, copy the error,
paste it back.

`supabase/tests/conventions.test.ts` catches the ones visible in the text of a
file. Nothing static catches the rest, because the rest depend on which role is
active, what a trigger did, and what RLS allowed. Those need the SQL to
actually run.

## One-time setup

**1. Install Docker Desktop.** <https://www.docker.com/products/docker-desktop/>
Start it and leave it running — the rest of this needs a Docker daemon.

**2. Start the local stack.**

```bash
npm run db:start
```

First run pulls several images and takes a few minutes. It gives you a
throwaway Postgres on `127.0.0.1:54322` with the `auth` schema, the `anon` and
`authenticated` roles, and the extensions — everything the tests need. The
credentials it prints are local-only and are not secrets.

**3. Apply the migrations.**

```bash
npm run db:apply
```

25 files, in the dependency order each one's "Run AFTER" header declares. The
order lives in `scripts/db.mjs`; a new migration must be added there, and
`apply` refuses to run if the directory and the list disagree.

## Every day

```bash
npm run db:test              # helpers + every *_test.sql
npm run db:test consent      # just the matching ones
```

To start from nothing when a migration has gone crooked:

```bash
npm run db:reset             # drops, recreates, re-applies everything
```

And for anything ad hoc:

```bash
node scripts/db.mjs sql supabase/tests/diagnose-dob.sql
```

## What this does not change

**Production migrations are still applied by hand**, by pasting into the
Supabase SQL editor. This local database is for finding out whether the SQL
works before it gets that far; it is not a deployment pipeline, and
`scripts/db.mjs` never points at a real project unless `SUPABASE_DB_URL` is set
deliberately.

**The editor's quirks still matter**, because that is where this SQL ultimately
runs. Two worth remembering:

- It displays **only the last result set** a script produces. A `select` after
  the one you care about hides it.
- `finish()` emits nothing at all when every assertion passes, so a blank
  result reads as a failure. Every test file ends with a verdict row for that
  reason.

`scripts/db.mjs` reproduces the first of these deliberately — it prints the
last result set with rows, the same as the editor — so a script that reads
correctly here reads correctly there.

## If it will not start

- **`Cannot reach Postgres at ...`** — Docker Desktop is not running, or
  `npm run db:start` has not been run in this session.
- **Port 54322 in use** — another project's stack is up. `npm run db:stop` in
  that one, or change the port in `supabase/config.toml`.
- **Images fail to pull** — usually a proxy or a VPN. Nothing in this repo can
  fix that one.
