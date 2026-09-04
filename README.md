# Web-Based Anti-Cheating System for Exams and Quizzes

BSIT 4C, Group 2 — System Administration course project.

A monitored online exam platform: instructors build exams (by hand or from their own
lesson files via AI), students sit them under browser lockdown, and suspicious activity
reaches the instructor's dashboard live.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind) · Prisma 7 · Supabase (Postgres, Auth,
Storage, Realtime, Vault) · Google Gemini · deployed on Vercel, scheduled jobs on
GitHub Actions.

## What works

| Area | Where |
|---|---|
| Sign-in, three roles, per-role row-level security | `/login` |
| Create accounts and classes (one subject per section), enable/disable users | `/admin` |
| Teacher console — own exams, own students, own classes | `/teacher` |
| Open, close, or schedule when an exam can be sat | `/exams/<id>` → "Availability" |
| Assign who an exam is for, and see who has not sat it | `/exams/<id>` → "Who it is for" |
| Tag an exam with a subject, picked from a shared list | exam builder, or `/exams/<id>` → Settings |
| See which questions the class got wrong | `/exams/<id>/monitor` |
| Export your own students' report | `/teacher/students` → Download CSV |
| Turn classes off entirely — exams then reach only who you send the link to | `/admin/settings` |
| Share an exam by link, the way a Google Form is shared | `/exams/<id>` → "Send this to your students" |
| Students sign up with email or a Google account | `/signup` (see the runbook for the one-time Google setup) |
| Decide whether students join classes by code, or an admin enrols them | `/admin/settings` |
| AI provider keys — encrypted in Vault, round-robin rotation | `/admin/keys` |
| Health, audit trail, backup status | `/admin/health` |
| Exam builder: questions, timers, lockdown settings, publish | `/exams` |
| Generate questions from a lesson file, then review before adding | `/exams/[id]/generate` |
| Live monitoring, flag review, force submit, results | `/exams/[id]/monitor` |
| Sitting an exam under lockdown | `/exam/[id]` |

## Security model

The parts that actually hold are server-side, and each was verified against the live
database rather than assumed:

- **Row-level security on every table.** A student reads only their own rows, an
  instructor only the classes they teach. Enforced on the Realtime stream too, not just on
  queries — a second instructor subscribed to the same channel receives nothing.
- **The answer key is a separate table.** RLS is row-level and students and instructors
  share one Postgres role, so `correct_answer` could not be hidden while it sat on
  `questions` — a student could read the whole key in one query. It now lives in
  `question_answers`, which students have no policy on at all.
- **Students cannot write their own grade.** `WITH CHECK` constrains which *rows* you
  may write, not which *columns*, so a student could once set `score = 100`. Students
  have no UPDATE on sessions; a trigger forces the opening state on INSERT so a session
  cannot be created pre-scored or back-dated.
- **Flags are write-only to students** — they cannot read, edit, or delete the evidence.
- **API keys are encrypted in Supabase Vault.** Not the browser, not even a signed-in
  admin session can decrypt one; only server code holding the service key.
- **The audit log is append-only.** UPDATE and DELETE are revoked, so an administrator
  can read it but cannot rewrite it.

Lockdown mode itself — fullscreen, tab-switch detection, the honeypot — is browser-side
and defeatable with devtools. That is a stated limitation, not a defect.

## Local setup

```bash
cd web
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run dev
```

`DATABASE_URL` and `DIRECT_URL` belong in `web/.env` (Prisma's CLI only auto-loads
`.env`); the Supabase client keys belong in `web/.env.local`. Neither is committed.

## Repository layout

```
web/                     the Next.js application
  src/app/               routes (admin, exams, exam, login)
  src/lib/               supabase clients, auth, grading, shuffle, AI
  prisma/migrations/     every schema change, in order
docs/RUNBOOK.md          restore, rotate, deploy, known issues
.github/workflows/       nightly backup and health check
deploy/                  VPS bootstrap script, kept for reference
```

## Operations

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for restoring a backup, rotating keys,
deploying, and the current known issues.
