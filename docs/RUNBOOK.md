# Operations runbook

What to do when something needs fixing, rotating, or restoring. Written for whoever
is on duty during an exam, not just whoever wrote the code.

- Supabase project: **Anticheat system** (`yhfhwageblxsjlaopfqy`, region `ap-northeast-2`)
- App: Next.js in [`web/`](../web), deployed to Vercel
- Scheduled jobs: GitHub Actions ([backup](../.github/workflows/backup.yml), [health check](../.github/workflows/healthcheck.yml))

---

## During an exam

### A student is stuck and cannot continue

Their session is still open, so nothing is lost — answers autosave as they go.

1. Instructor opens **Exams → the exam → Monitor & results**.
2. Find the student. If they need to be released, use **Force submit** — it grades
   whatever they have answered so far and closes the session.
3. If they should be allowed to resume instead, do nothing: reopening `/exam/<id>`
   resumes at the question after their last saved answer.

### A student was flagged unfairly

On the monitor page, open their flag count and press **void** on the specific flag.
Voided flags stay visible with a strikethrough — the record is never deleted, only
marked. Voiding does not reopen an already auto-submitted session; use force submit
or let them retake if the attempt must be discarded.

### The dashboard has stopped updating

The header shows `● Live` when connected and `○ Connecting…` otherwise. The page
re-reads everything from the database on every reconnect, so a refresh always shows
the true state. If it stays disconnected, the exam itself is unaffected — students
keep writing to the database; only the instructor's live view is degraded.

### A student says the timer expired immediately

Check the exam's `started_at` against the server clock. Every timestamp column is
`timestamptz`; if one were ever changed to `timestamp` (no time zone), clients would
read it in local time and a fresh session would look hours old. See migration
`20260904093000_harden_sessions_and_timestamptz`.

---

## Rotating secrets

### A Gemini API key

1. Create the replacement in Google AI Studio.
2. **Admin console → AI provider keys → Add a key**. Paste it, give it a label.
3. Press **Test** on the new key to confirm Google accepts it.
4. **Delete** the old key. That removes both the row and the Vault secret.

Keys are write-only after saving: not the browser, not an admin session, nothing but
server-side code holding the service key can decrypt one. If a key is lost, it cannot
be read back — issue a new one.

Several active keys are better than one. Generation walks them least-recently-used
first and moves on when one is rate-limited, which is the whole point on a free tier.

### The Supabase service (secret) key

1. Supabase dashboard → **Project Settings → API Keys** → roll the secret key.
2. Update `SUPABASE_SECRET_KEY` in Vercel's environment variables **and** in the
   GitHub repository secrets, then redeploy.
3. Local development: update `web/.env.local`.

### The database password

1. Supabase dashboard → **Project Settings → Database → Reset database password**.
2. Update `DATABASE_URL` and `DIRECT_URL` in `web/.env` and in the
   `SUPABASE_DB_URL` repository secret used by the backup workflow.

---

## Backups and restore

### Taking a backup right now (no GitHub Actions needed)

```bash
cd web
npm run backup
```

This works today — it needs neither the database password nor a working Actions
account. It picks a mode automatically:

| Mode | When | Contains |
|---|---|---|
| **full** | `DIRECT_URL` is set *and* Docker is running | `pg_dump` of the whole public schema |
| **data** | otherwise | every table exported as JSON |

A data-only export is still a complete restore path, because every schema change is
committed under `web/prisma/migrations` — replay the migrations, then import the rows.
Either way the archive is gzipped, written to `backups/`, uploaded to the private
`backups` bucket, and recorded in `backup_runs` so **Admin console → Health** reflects
it. A failed run is recorded too, so silence never looks like success.

Full mode needs no local Postgres install: it runs `pg_dump` from the `postgres:17`
Docker image.

### Running it on a schedule without Actions

Windows Task Scheduler, which is real scheduled-job administration and costs nothing:

1. Task Scheduler → **Create Basic Task** → name it "Anticheat nightly backup".
2. Trigger: **Daily**, 02:00.
3. Action: **Start a program**
   - Program: `node`
   - Arguments: `scripts/backup.mjs`
   - Start in: the full path to the `web` folder
4. Tick **Run whether user is logged on or not**, then verify with **Run** and check
   `backup_runs` on the Health page.

### What the nightly workflow does when Actions works

The same thing, plus a 30-day artifact copy. See
[backup.yml](../.github/workflows/backup.yml). Supabase's own daily backups exist as
well, but these are the copy the group controls and can restore without the dashboard.

### Restoring a data-only backup (`.json.gz`)

```bash
cd web
npm run restore -- ../backups/backup-<stamp>.json.gz --dry-run   # see the plan first
npm run restore -- ../backups/backup-<stamp>.json.gz
```

Run the migrations against the target database first so the schema exists, then this
replays the rows. It handles the `users` ↔ `sections` foreign-key cycle by inserting
users without a section, then sections, then relinking.

> A dry run only prints the plan; it never touches the database and so cannot catch a
> write-level problem. Restoring over the current data is idempotent, so it is safe to
> exercise the real path as a rehearsal — do that occasionally rather than trusting a
> dry run. That is how a bug that silently skipped the entire answer key was found.

### Restoring a full dump (`.sql.gz`)

```bash
gunzip backup-<stamp>.sql.gz
psql "$DIRECT_URL" -f backup-<stamp>.sql
# or, without a local psql:
docker run --rm -i postgres:17 psql "$DIRECT_URL" < backup-<stamp>.sql
```

The dump uses `--clean --if-exists`, so it drops and recreates the public schema's
objects. **This overwrites current data.** Restore into a fresh project first if you
are unsure, and only then decide whether to point the app at it.

### What no backup here contains

Both modes cover the `public` schema only:

- `auth.users` — accounts live in Supabase Auth. `public.users` rows will come back,
  but nobody can log in until the accounts are recreated.
- **Vault secrets** — `ai_provider_keys` rows restore with a dangling pointer; the API
  keys themselves must be re-added in the admin console.
- **Storage objects** — lesson uploads live in the bucket; copy it separately.

### The backup never ran

`backup_runs` empty, or Health showing a stale backup:

1. Confirm the `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_URL` repository
   secrets exist (Settings → Secrets and variables → Actions).
2. Run it by hand: Actions → **Scheduled backup** → Run workflow.
3. If the run fails instantly with no logs, the problem is the GitHub account, not the
   workflow — see *Known issues* below.

---

## Deploying

The app deploys from `master` on Vercel.

1. Vercel → New Project → import `angrypoteto/anticheating-system`.
2. **Root Directory: `web`** — the repo root holds the proposal and scripts, not the app.
3. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `DATABASE_URL`, `DIRECT_URL`
   - `GEMINI_MODEL` (optional; defaults to `gemini-flash-latest`)
4. Set the function region to match Supabase (`ap-northeast-2`) so server-side calls
   don't cross the Pacific twice.
5. After the first deploy, set the `APP_URL` repository secret so the health check
   starts pinging it.

### Rolling back

Vercel → Deployments → pick the last good one → **Promote to Production**. Database
migrations are *not* rolled back by this; if the bad deploy included a migration,
reverse it deliberately with a new migration.

### Database migrations

Migrations live in `web/prisma/migrations/` and were applied through the Supabase
Management API rather than `prisma migrate deploy`, because the database password was
not available while building. To bring Prisma's own history in line once
`DIRECT_URL` works:

```bash
cd web
npx prisma migrate resolve --applied <migration_folder_name>   # for each, in order
npx prisma migrate status                                       # should read clean
```

---

## Known issues

### GitHub Actions jobs do not start — account locked

Runs end almost immediately with:

> The job was not started because your account is locked due to a billing issue.

This is **not** a workflow problem and **not** a minutes problem (0 of 3,000 used). It
was narrowed by elimination: a three-line workflow failed identically, and making the
repository public moved the runs from an instant `startup_failure` to reaching job
scheduling — proving the workflow files are valid — but the lock still blocks the job
itself.

**Fix:** resolve the billing problem on the GitHub account at
<https://github.com/settings/billing> — typically a past-due invoice or an expired card
on some other paid product on the same account. Actions minutes are free for public
repositories, but a billing lock blocks them regardless.

Until then, backups and health checks do not run on a schedule. Take a backup by hand
with the `pg_dump` command above, and note that `backup_runs` will stay empty, so the
Health page will keep reporting the backup as stale — correctly.

### Leaked-password protection is off

Supabase's HaveIBeenPwned check requires a paid plan. The app enforces an 8-character
minimum instead, both in the admin form and in Supabase Auth's own setting.

### Lockdown mode is defeatable

Fullscreen enforcement, tab-switch detection and the honeypot are browser-side checks.
A student with devtools open can suppress them. This is a stated limitation in the
proposal, not a defect — say so plainly rather than implying the browser is secured.
The server-side protections (RLS, the split answer key, forced session state) are the
ones that actually hold.
