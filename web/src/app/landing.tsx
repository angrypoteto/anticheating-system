import Link from "next/link";
import { ShieldMark } from "@/components/auth-shell";

const FEATURES = [
  {
    title: "Lockdown mode",
    body: "The exam runs fullscreen. Leaving it, switching tabs or losing focus is caught, warned, and escalated to an automatic submission on the third strike.",
  },
  {
    title: "Live proctoring",
    body: "Flags reach the instructor's dashboard in well under a second, while the exam is still running — not in a report afterwards.",
  },
  {
    title: "Questions from your own lessons",
    body: "Upload a PDF, DOCX or PPTX and get a draft question set from that material. Nothing is published until you have reviewed every item.",
  },
  {
    title: "Answer keys students cannot read",
    body: "Keys live in a table students have no access to at all, so the paper can be delivered to the browser without delivering the answers with it.",
  },
  {
    title: "A record that holds up",
    body: "Every flag is timestamped against the question it happened on. The audit log is append-only — not even an administrator can rewrite it.",
  },
  {
    title: "Administered, not just hosted",
    body: "Role-based accounts, scheduled backups with a tested restore, and a health dashboard covering sessions, keys and backup freshness.",
  },
];

const STEPS = [
  ["Build the exam", "Write questions yourself, or upload a lesson file and edit the drafts."],
  ["Publish to a class", "Students in that section see it; drafts stay invisible."],
  ["Watch it happen", "The dashboard shows who is in progress and what has been flagged."],
  ["Review and grade", "Scores, time taken and flag counts, with false positives voidable."],
];

export function Landing() {
  return (
    <main className="bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 font-semibold text-gray-900 dark:text-gray-50">
          <ShieldMark className="h-8 w-8" />
          Proctorly
        </span>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/login"
            className="text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Create account
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:pt-20">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-widest text-teal-700 dark:text-teal-400">
            Web-based anti-cheating system
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-5xl dark:text-gray-50">
            Online exams that notice when something is wrong — while it is still
            happening.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">
            Generic quiz tools collect answers. They cannot tell an honest
            submission from a dishonest one. Proctorly watches the session
            itself, tells the instructor the moment something looks off, and
            keeps a record that stands up afterwards.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-teal-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Create a student account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Instructor sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Students need a class code from their instructor.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-200 bg-gray-50 py-20 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            What it actually does
          </h2>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            How an exam runs
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-medium text-white dark:bg-teal-600">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-medium text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Honest limitation — stated on the page, not buried */}
      <section className="border-t border-gray-200 py-16 dark:border-gray-800">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
            What it does not claim to do
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
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

      <footer className="border-t border-gray-200 py-10 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
          <span className="flex items-center gap-2">
            <ShieldMark className="h-5 w-5" />
            Proctorly
          </span>
          <span>BSIT 4C · Group 2 — System Administration project</span>
        </div>
      </footer>
    </main>
  );
}
