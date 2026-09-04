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
replays the rows in dependency order: people first, then classes, then `enrollments`,
which says who sits which subject. Class membership used to be a column on the user
row, which made a foreign-key cycle; it no longer is.

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

Uploaded lesson files **are** included: every object in the `lesson-files` bucket is
copied to `backups/lesson-files/<stamp>/…` on each run. Restore them by copying that
folder back into `lesson-files`.

Still outside both modes, because they live outside the `public` schema:

- `auth.users` — accounts live in Supabase Auth. `public.users` rows will come back,
  but nobody can log in until the accounts are recreated.
- **Vault secrets** — `ai_provider_keys` rows restore with a dangling pointer; the API
  keys themselves must be re-added in the admin console.

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


## Turning classes off

`Settings → Classes → Organise exams by class and subject` controls whether the
system knows about subjects at all.

**On** (the default) a class is one subject taught to one section, with its own
join code; an exam reaches only the classes it is set for, and a teacher sees
only the students they teach.

**Off**, classes, subjects, join codes and enrolment disappear from every
teacher and student screen, and an exam reaches exactly the people you send its
link to — nobody else sees it at all. A teacher can read every student's
account, though: they have to, to show results, and there is no longer a class
to say whose results are whose. That widening is the price of the setting, and
it is the only thing the switch gives away.

Nothing is deleted either way. Classes, enrolments and join codes sit untouched
while it is off and come back exactly as they were when it is switched on.

The rule is enforced in the database, not in the pages: `private.classes_enabled()`
is read by `exam_reaches_my_section()`, `owns_exam()` and the instructor policies
on `exams` and `users`. Hiding the UI is a convenience; the switch would still
hold with the UI bypassed.


## Exam share links

Every exam carries an unguessable token and a link at `/e/<token>`, shown on the
exam editor and in the exam list. It is the Google Forms idea: finish the paper,
publish it, send one link.

Opening the link is what grants access. That matters — a link that only worked
for people already enrolled would be pointless, since those students already see
the exam. Following it records a row in `exam_access` for that **one exam**, so
sending a link never adds anyone to a class or hands over a teacher's other
papers. The grant is per person, so an exam still knows who sat it and every
flag, score and timer applies as normal.

Signed-out visitors are sent to `/login?next=…` and land on the paper afterwards.
A link to an unpublished exam says the exam is not open rather than letting
anyone in, and starts working the moment it is published.

To withdraw someone, delete their row from `exam_access`; the teacher who owns
the exam can see and remove those rows. To invalidate a link entirely, change the
exam's `share_token`.


## Signing in with Google

The code is in place; the provider still has to be switched on, which needs
credentials only you can create.

**1. Google Cloud Console** — <https://console.cloud.google.com/apis/credentials>

Create an OAuth 2.0 Client ID of type *Web application*. Under
*Authorised redirect URIs* add exactly:

    https://yhfhwageblxsjlaopfqy.supabase.co/auth/v1/callback

That is Supabase's address, not this site's — Google returns to Supabase, which
then returns to us. You will also need to fill in the OAuth consent screen once;
"External" plus your own email as a test user is enough while developing.

**2. Supabase** — Authentication → Providers → Google: paste the client ID and
secret, and enable it. Then Authentication → URL Configuration:

- *Site URL*: the address people actually use (currently `http://localhost:3000`)
- *Redirect URLs*: add `http://localhost:3000/auth/callback` and the same path on
  your production domain

**3. Supabase** — Authentication → Sign In / Providers: turn **off** "Disable
signup". Google cannot create an account while that is on, and it is on today.

That last step is the one to think about, because it opens Supabase's own public
registration endpoint — which can be called directly, without visiting our
signup page. Two things stand between that and trouble, both in the database
rather than in the forms:

- the trigger only ever creates a STUDENT, whatever the request claims;
- **Settings → Accepted email domains** disables anyone outside your school's
  addresses. Blank means any address, so **set it before opening registration**
  if this is running anywhere public — it is the only rule that decides who
  belongs here.

DISABLED is enforced by row-level security, not only by the pages: a disabled
account can sign in and see nothing at all.

## Who assigns classes

**Settings → Let students join a class with a code** decides that, and nothing
else. It has never been about whether people may register.

**On**, a student types a class code at sign-up and can add more subjects from
their dashboard.

**Off**, they register exactly as before and simply arrive with no class; the
code fields disappear from sign-up and from the dashboard, and `join_class()`
refuses a code even if one is sent by hand. You or their teacher enrols them
from Accounts, which is unaffected.


## The two consoles

`/admin` is the whole institution; `/teacher` is one person's own work. They
share their components — the cards, the charts, the risk maths, the exam list
and builder — so the two cannot drift into disagreeing about who is at risk or
how many exams exist.

What they do not share is how they read the database. The admin console uses
the service role, because an administrator is meant to see everything. The
teacher console reads through the teacher's own session, so row-level security
decides what counts as theirs — a filter in page code could be written wrong,
a policy cannot be bypassed by forgetting one.

That means the teacher console needs no scoping logic of its own, and it is
worth keeping it that way. If a page there ever needs `createAdminClient()`,
that is the moment to stop and ask what it is really trying to show.


## Opening, closing and scheduling an exam

An exam carries a window: `opens_at` (null means "from the moment it is
published") and `closes_at` (null means "until it is archived"). The teacher
sets both on the exam page under **Availability**, and **Close now** and **Open
now** are the same thing — a close time of this instant, and clearing it.
Keeping it to one piece of state means a manual override can never contradict
a schedule.

The window governs **sitting** the exam, never **seeing** it. A student still
reads their own score after the paper closes, and the teacher can still open a
closed exam's monitor. It is enforced by `private.exam_is_open()` in three
policies — starting a session, inserting an answer, updating an answer — so
closing an exam stops the people already inside it, not only new arrivals.

Two things this got wrong first time, both worth remembering:

- **Close now must be stamped by the database.** Setting `closes_at` from the
  app server looked right and was not: `exam_is_open()` compares against
  Postgres's `NOW()`, and a couple of seconds of clock skew left a "closed"
  exam still startable. `close_exam()` and `open_exam()` are SECURITY DEFINER
  functions so the clock that enforces the rule is the clock that sets it.
- **Closing an exam scheduled for later gives a zero-length window.** Opens and
  closes land on the same instant, which is precisely correct — it was never
  open — so the ordering constraint allows equal, and rejects only a close
  *before* an open.


## Generating a lot of questions

There is no cap on how many questions can be asked for. There is a cap on how
many go in one model call — `PER_CALL` in `lib/ai/batches.ts`, currently 15 —
because a single reply cannot hold 60 good questions: it runs past the output
limit and the later items degrade into restatements of the earlier ones.

A large order is planned into calls that preserve the requested mix in total,
run one after another, and merged with repeats dropped. A call that fails does
not discard the ones that worked; the notice says how many came back and
suggests generating again for any shortfall.

Sequential calls take time, and the page carries `maxDuration = 60`, which is
the ceiling on Vercel's hobby plan. Past roughly sixty questions in one go the
request is likely to be cut off, so split it over two goes. Raising the limit
means a paid plan, not a code change.
