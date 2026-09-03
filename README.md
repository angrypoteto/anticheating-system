# Web-Based Anti-Cheating System for Exams and Quizzes

BSIT 4C, Group 2 — System Administration course project.

- [AntiCheating_Project_Proposal.docx](AntiCheating_Project_Proposal.docx) — the proposal submitted to the instructor.
- [web/](web/) — the Next.js application (TypeScript, App Router, Tailwind, Prisma).
- [deploy/provision-vps.sh](deploy/provision-vps.sh) — VPS bootstrap script, kept as reference; current deploy target is Vercel (see below).

## Stack

Next.js + TypeScript, Prisma ORM, Supabase (Postgres, Auth, Storage, Realtime), deployed on Vercel.

## Local setup

```
cd web
npm install
npm run dev
```

Environment variables live in `web/.env.local` (never committed — see `.gitignore`). Copy `web/.env.example` once it exists and fill in the Supabase project's connection strings and API keys.

## Where things stand

See the build plan (published as a Claude artifact during planning) for the phased roadmap, data model, and team task split.
