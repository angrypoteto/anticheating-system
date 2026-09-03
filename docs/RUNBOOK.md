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

### What is backed up

The nightly workflow runs `pg_dump` over the `public` schema, gzips it, uploads it to
the private `backups` bucket in Supabase Storage, and keeps a copy as a GitHub Actions
artifact for 30 days. Each run writes a row to `backup_runs`, which
**Admin console → Health** surfaces with a warning if the last one is over 48 hours old.

Supabase's own daily backups exist too, but this dump is the copy the group controls
and can restore without the dashboard.

### Restoring

```bash
# 1. Fetch the archive (from Storage, or the Actions artifact)
gunzip backup-YYYYMMDDTHHMMSSZ.sql.gz

# 2. Restore into the target database
psql "$SUPABASE_DB_URL" -f backup-YYYYMMDDTHHMMSSZ.sql
```

The dump uses `--clean --if-exists`, so it drops and recreates the public schema's
objects. **This overwrites current data.** Restore into a fresh project first if you
are unsure, and only then decide whether to point the app at it.

What the dump does *not* contain, because `pg_dump --schema=public` excludes them:

- `auth.users` — accounts live in Supabase Auth. Restoring the public schema without
  them leaves `public.users` rows whose logins no longer exist.
- Vault secrets — the AI provider keys must be re-added afterwards.
- Storage objects — lesson files are separate; copy the bucket if they matter.

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

### GitHub Actions runs fail instantly with `startup_failure`

Every workflow, including a three-line one, ends in about a second with no logs and no
annotations. This is **not** a workflow problem — it was reproduced with a minimal file
— and not a minutes problem (0 of 3,000 used). The cause is account-level: usually an
unverified email, a spending limit of $0, or Actions disabled under the account's
Settings → Actions. The reason is printed as a banner on the run page in the browser,
which the API does not expose.

Until it is resolved, backups and health checks do not run on a schedule. The backup
can be taken by hand with the `pg_dump` line above.

### Leaked-password protection is off

Supabase's HaveIBeenPwned check requires a paid plan. The app enforces an 8-character
minimum instead, both in the admin form and in Supabase Auth's own setting.

### Lockdown mode is defeatable

Fullscreen enforcement, tab-switch detection and the honeypot are browser-side checks.
A student with devtools open can suppress them. This is a stated limitation in the
proposal, not a defect — say so plainly rather than implying the browser is secured.
The server-side protections (RLS, the split answer key, forced session state) are the
ones that actually hold.
