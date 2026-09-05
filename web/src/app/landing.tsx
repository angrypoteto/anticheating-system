import Link from "next/link";
import { ShieldMark } from "@/components/auth-shell";

const FEATURES = [
  {
    title: "Lockdown mode",
    body: "The exam runs fullscreen. Leaving it, switching tabs or losing focus is caught, warned, and escalated to an automatic submission on the third strike.",
    icon: "M7 3h6a2 2 0 0 1 2 2v14l-5-3-5 3V5a2 2 0 0 1 2-2Z",
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
  {
    title: "Live proctoring",
    body: "Flags reach the instructor's dashboard in well under a second, while the exam is still running — not in a report afterwards.",
    icon: "M3 12h4l2-5 4 10 2-5h2",
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  {
    title: "Questions from your own lessons",
    body: "Upload a PDF, DOCX or PPTX and get a draft question set from that material. Nothing is published until you have reviewed every item.",
    icon: "M6 3h6l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM12 3v4h4",
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
  {
    title: "Answer keys students cannot read",
    body: "Keys live in a table students have no access to at all, so the paper can be delivered to the browser without delivering the answers with it.",
    icon: "M8 3h8v4H8zM6 7H4v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M9 12l2 2 4-4",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  {
    title: "A record that holds up",
    body: "Every flag is timestamped against the question it happened on. The audit log is append-only — not even an administrator can rewrite it.",
    icon: "M10 2.5A7.5 7.5 0 1 0 17.5 10M17.5 2.5v5h-5M10 6v4l2.5 2.5",
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  {
    title: "Administered, not just hosted",
    body: "Role-based accounts, scheduled backups with a tested restore, and a health dashboard covering sessions, keys and backup freshness.",
    icon: "M4 6h12M4 10h12M4 14h7M15 15l2 2 3-3M10 3v2M10 17v2M3 10H1M19 10h2",
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
];

const STEPS = [
  ["Build the exam", "Write questions yourself, or upload a lesson file and edit the drafts."],
  ["Publish to a class", "Students in that section see it; drafts stay invisible."],
  ["Watch it happen", "The dashboard shows who is in progress and what has been flagged."],
  ["Review and grade", "Scores, time taken and flag counts, with false positives voidable."],
];

const STATS = [
  ["<1s", "flag to dashboard"],
  ["3 strikes", "then auto-submit"],
  ["0", "answer leaks by design"],
  ["100%", "audit trail append-only"],
];

function FeatureIcon({ d, tone }: { d: string; tone: string }) {
  return (
    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
        <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Landing() {
  return (
    <main className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2.5 font-semibold tracking-tight">
            <ShieldMark className="h-8 w-8" />
            <span className="text-[16px]">Proctorly</span>
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 sm:inline-block dark:bg-slate-800 dark:text-slate-400">
              Anti-cheating exams
            </span>
          </span>
          <nav className="flex items-center gap-2 sm:gap-3 text-sm">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-[0_4px_14px_-4px_rgb(79_70_229/0.6)] transition hover:bg-indigo-700"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-[100%] bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-sky-500/15 blur-3xl" />
          <div className="bg-grid-slate mask-fade-b absolute inset-0 opacity-70" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-14 sm:pt-20">
          <div className="max-w-3xl">
            <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              WEB-BASED ANTI-CHEATING SYSTEM · BSIT 4C GROUP 2
            </p>
            <h1 className="animate-fade-up-1 mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[52px]">
              Online exams that notice when something is wrong —{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-indigo-300">
                while it&apos;s still happening.
              </span>
            </h1>
            <p className="animate-fade-up-2 mt-6 max-w-2xl text-[17px] leading-relaxed text-slate-600 dark:text-slate-400">
              Generic quiz tools collect answers. They can&apos;t tell an honest
              submission from a dishonest one. Proctorly watches the session
              itself, tells the instructor the moment something looks off, and
              keeps a record that stands up afterwards.
            </p>
            <div className="animate-fade-up-3 mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(79_70_229/0.7)] transition hover:-translate-y-px hover:bg-indigo-700"
              >
                Create a student account →
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Instructor sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Students need a class code from their instructor.
            </p>

            {/* Stats strip */}
            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map(([v, k]) => (
                <div
                  key={k}
                  className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80"
                >
                  <dt className="order-2 mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Product peek — a quiet mock of the live monitor */}
          <div className="animate-fade-up-3 mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgb(15_23_42/0.25)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                proctorly.live/exams/midterm/monitor
              </span>
              <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 sm:flex dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                12 sitting now
              </span>
            </div>
            <div className="grid sm:grid-cols-[1fr_240px]">
              <div className="space-y-2 p-4">
                {[
                  ["J. Dela Cruz", "Q14 · 82%", "In progress", "emerald"],
                  ["M. Santos", "TAB_SWITCH · Q9", "Flag — open", "amber"],
                  ["A. Reyes", "Q21 · 91%", "In progress", "emerald"],
                ].map(([name, detail, status, tone]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/10 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {name[0]}
                      </span>
                      <span>
                        <span className="block font-medium text-slate-900 dark:text-slate-100">{name}</span>
                        <span className="block text-xs text-slate-500">{detail}</span>
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        tone === "amber"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:border-l sm:border-t-0 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Live flags</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">3</p>
                <p className="text-xs text-slate-500">2 resolved · 1 open</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Every flag is timestamped to the exact question it happened on.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-200/70 bg-slate-50/80 py-16 sm:py-20 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Capabilities
              </p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-tight">
                What it actually does
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Six things, done properly. No camera gimmicks, no vague
              &quot;AI proctoring&quot; promises.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-200/80 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgb(15_23_42/0.2)] dark:border-slate-800 dark:bg-slate-900"
              >
                <FeatureIcon d={f.icon} tone={f.accent} />
                <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            Workflow
          </p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-tight">
            How an exam runs
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li
                key={title}
                className="relative rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-[0_4px_12px_-4px_rgb(79_70_229/0.6)]">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {body}
                </p>
                {i < 3 ? (
                  <span aria-hidden className="absolute right-4 top-6 hidden text-slate-300 lg:block dark:text-slate-700">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Honest limitation */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200/70 bg-amber-50/70 p-7 sm:p-8 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <path d="M10 3 2.5 17h15L10 3ZM10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            What it does not claim to do
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/70">
            Lockdown mode works inside the browser, so it detects and escalates
            rather than physically prevents — a determined student with developer
            tools can interfere with it. There is no camera or biometric
            proctoring, and nothing here sees a second device or another person
            in the room. The protections that genuinely hold are on the server:
            row-level security, the separated answer key, and session state the
            student cannot forge.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-950 px-8 py-14 text-center sm:px-12 dark:bg-gradient-to-b dark:from-indigo-950 dark:to-slate-950">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-indigo-600/30 blur-[90px]" />
            <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-violet-600/25 blur-[90px]" />
            <div className="bg-grid-slate absolute inset-0 opacity-40" />
          </div>
          <div className="relative">
            <ShieldMark className="mx-auto h-11 w-11" />
            <h2 className="mx-auto mt-5 max-w-xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Run your next quiz like it actually matters.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-300">
              Set up a class, publish an exam, and watch the session — not just
              the scores.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-px hover:bg-slate-100"
              >
                Get started free
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:text-slate-400">
          <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
            <ShieldMark className="h-5 w-5" />
            Proctorly
          </span>
          <span>BSIT 4C · Group 2 — System Administration project</span>
        </div>
      </footer>
    </main>
  );
}
