import Link from "next/link";
import { ShieldMark } from "@/components/auth-shell";

/**
 * The one page somebody sees before they have an account.
 *
 * It opens on navy because the product is navy: a landing page in a different
 * palette to the thing it is selling makes the first screen after signing in
 * feel like a different site. The claims are the ones the system can actually
 * keep — including the section that says what it cannot do, which is given the
 * same weight as the rest rather than being a footnote. A proctoring tool that
 * oversells itself is the one thing a school cannot afford to buy.
 */

/** 20px, stroke-based, one weight — the house icon style. */
const ICONS: Record<string, React.ReactNode> = {
  lock: (
    <>
      <rect x="4.75" y="10.5" width="14.5" height="9.75" rx="2" strokeWidth="1.6" />
      <path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75" strokeWidth="1.6" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="2.25" strokeWidth="1.6" />
      <path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 19.4a10.4 10.4 0 0 0 0-14.8" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  paper: (
    <>
      <path d="M6 3.75h7.5L18.5 8.75V20.25H6z" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.25 3.9V9h5.1M9 13h6M9 16.5h4" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  key: (
    <>
      <circle cx="8.5" cy="12" r="3.75" strokeWidth="1.6" />
      <path d="M12.25 12H20M17 12v3.25M19.5 12v2.25" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  ledger: (
    <>
      <path d="M5.5 4.75h13v14.5h-13z" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 4.75v14.5M12 9h4M12 12.5h4M12 16h2.5" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  server: (
    <>
      <rect x="4.25" y="4.75" width="15.5" height="6" rx="1.6" strokeWidth="1.6" />
      <rect x="4.25" y="13.25" width="15.5" height="6" rx="1.6" strokeWidth="1.6" />
      <path d="M7.75 7.75h.01M7.75 16.25h.01" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

function Icon({ name, className }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={className}>
      {ICONS[name]}
    </svg>
  );
}

const FEATURES = [
  {
    icon: "lock",
    title: "Lockdown mode",
    body: "The exam runs fullscreen. Leaving it, switching tabs or losing focus is caught, warned, and escalated to an automatic submission on the third strike.",
  },
  {
    icon: "live",
    title: "Live proctoring",
    body: "Flags reach the instructor's dashboard in well under a second, while the exam is still running — not in a report afterwards.",
  },
  {
    icon: "paper",
    title: "Questions from your own lessons",
    body: "Upload a PDF, DOCX or PPTX and get a draft question set from that material. Nothing is published until you have reviewed every item.",
  },
  {
    icon: "key",
    title: "Answer keys students cannot read",
    body: "Keys live in a table students have no access to at all, so the paper can be delivered to the browser without delivering the answers with it.",
  },
  {
    icon: "ledger",
    title: "A record that holds up",
    body: "Every flag is timestamped against the question it happened on. The audit log is append-only — not even an administrator can rewrite it.",
  },
  {
    icon: "server",
    title: "Administered, not just hosted",
    body: "Role-based accounts, scheduled backups with a tested restore, and a health dashboard covering sessions, keys and backup freshness.",
  },
];

const STEPS: [string, string][] = [
  ["Build the exam", "Write questions yourself, or upload a lesson file and edit the drafts."],
  ["Publish to a class", "Students in that section see it; drafts stay invisible."],
  ["Watch it happen", "The dashboard shows who is in progress and what has been flagged."],
  ["Review and grade", "Scores, time taken and flag counts, with false positives voidable."],
];

const PROMISES = [
  "Fullscreen papers that pause the moment a student leaves them",
  "One departure is one warning, never three for the same glance away",
  "Answer keys unreadable to students by design",
];

function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Stamped at build rather than read from a clock during render: a footer year
 * that depends on when the page happens to re-render is a value that can
 * disagree with itself between two visitors on New Year's Eve.
 */
const YEAR = new Date().getFullYear();

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-white">
        {title}
      </h2>
      <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-[13.5px] text-gray-300 transition hover:text-white"
      >
        {children}
      </Link>
    </li>
  );
}

export function Landing() {
  return (
    <main className="bg-gray-50">
      {/* ---------------------------------------------------------------- */}
      {/* The hero is the product's own chrome, so the first screen after   */}
      {/* signing in is recognisably the same place.                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-gray-900 text-white">

        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5.5">
          <span className="flex items-center gap-2.5 text-[16px] font-bold tracking-tight">
            <ShieldMark className="h-6 w-6" />
            Proctorly
          </span>
          <nav className="flex items-center gap-2.5 sm:gap-5">
            <Link
              href="/login"
              className="px-1 text-sm text-gray-300 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9.5 items-center rounded-lg bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
            >
              Create account
            </Link>
          </nav>
        </header>

        <section className="mx-auto max-w-6xl px-6 pt-14 pb-16 sm:pt-24 sm:pb-20">
          <h1 className="max-w-[19ch] text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-white sm:text-[60px]">
            Online exams that notice when something is wrong.
          </h1>
          <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-gray-300">
            Generic quiz tools collect answers. They cannot tell an honest
            submission from a dishonest one. Proctorly watches the session
            itself, tells the instructor the moment something looks off, and
            keeps a record that stands up afterwards.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 text-[15px] font-medium text-gray-900 hover:bg-gray-100"
            >
              Create a student account
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-6 text-[15px] font-medium text-white hover:border-white/50"
            >
              Instructor sign in
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-gray-400">
            Students need a class code from their instructor.
          </p>

          <ul className="mt-14 grid gap-4 border-t border-white/12 pt-8 sm:grid-cols-3 sm:gap-8">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3 text-sm leading-relaxed text-gray-300">
                <Tick className="mt-0.5 h-4.5 w-4.5 shrink-0 text-white" />
                {p}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---------------------------------------------------------------- */}
      <section id="capabilities" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20 sm:py-24">
        <div className="max-w-[52ch]">
          <h2 className="text-[27px] leading-tight font-semibold tracking-[-0.025em] text-gray-900 sm:text-[34px]">
            What it actually does
          </h2>
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="bg-white p-7">
              <Icon name={f.icon} className="h-6 w-6 text-gray-900" />
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight text-gray-900">
                {f.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section id="how-it-runs" className="scroll-mt-8 border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="max-w-[52ch]">
            <h2 className="text-[27px] leading-tight font-semibold tracking-[-0.025em] text-gray-900 sm:text-[34px]">
              How an exam runs
            </h2>
          </div>

          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="relative">
                {/* The rule carries the eye to the next step and stops at the
                    last one, so the sequence reads as finite. */}
                <span
                  aria-hidden
                  className={`absolute top-4 left-11 hidden h-px bg-gray-200 lg:block ${
                    i === STEPS.length - 1 ? "w-0" : "right-0 -mr-8"
                  }`}
                />
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-[13px] font-medium text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4.5 text-[15px] font-semibold tracking-tight text-gray-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Given the weight of a section rather than a footnote. A tool that */}
      {/* oversells what it catches is the one a school cannot afford.      */}
      {/* ---------------------------------------------------------------- */}
      <section id="limits" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20 sm:py-24">
        <div className="grid gap-10 rounded-2xl border border-gray-200 bg-white px-8 py-10 sm:px-12 sm:py-12 lg:grid-cols-[minmax(0,22ch)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-gray-900">
              What it does not claim to do
            </h2>
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-gray-700">
            <p>
              Lockdown mode works inside the browser, so it detects and escalates
              rather than physically prevents — a determined student with developer
              tools can interfere with it. There is no camera or biometric
              proctoring, and nothing here sees a second device or another person
              in the room.
            </p>
            <p>
              The protections that genuinely hold are on the server: row-level
              security, the separated answer key, and session state the student
              cannot forge.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* ---------------------------------------------------------------- */}
      {/* Only destinations that exist. A column of Privacy / Terms / Docs  */}
      {/* links that 404 is worse than a short footer: it is the first      */}
      {/* promise the site breaks.                                          */}
      {/* ---------------------------------------------------------------- */}
      <footer className="bg-gray-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:gap-12">
            <div>
              <span className="flex items-center gap-2.5 text-[16px] font-bold tracking-tight">
                <ShieldMark className="h-6 w-6" />
                Proctorly
              </span>
              <p className="mt-3.5 max-w-[42ch] text-[13.5px] leading-relaxed text-gray-300">
                Lockdown exams, live proctoring and question sets drafted from
                your own lesson files, with a record that holds up afterwards.
              </p>
              <p className="mt-4 text-[12.5px] leading-relaxed text-gray-400">
                Built as a System Administration project. It is run for one
                school, not sold as a service.
              </p>
            </div>

            <FooterColumn title="Get started">
              <FooterLink href="/signup">Create a student account</FooterLink>
              <FooterLink href="/login">Instructor sign in</FooterLink>
              <FooterLink href="/login">Administrator sign in</FooterLink>
            </FooterColumn>

            <FooterColumn title="What it does">
              <FooterLink href="#capabilities">Capabilities</FooterLink>
              <FooterLink href="#how-it-runs">How an exam runs</FooterLink>
              <FooterLink href="#limits">What it does not claim</FooterLink>
            </FooterColumn>

            <FooterColumn title="Students">
              <li className="text-[13.5px] leading-relaxed text-gray-300">
                You need a class code from your instructor before an exam will
                appear.
              </li>
              <li className="text-[13.5px] leading-relaxed text-gray-300">
                Exams run fullscreen. Leaving the window is recorded, and three
                warnings submit the paper as it stands.
              </li>
            </FooterColumn>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-white/12 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-gray-400">
              &copy; {YEAR} Proctorly, BSIT 4C Group 2
            </p>
            <p className="text-[12.5px] text-gray-400">
              Detects and escalates in the browser; it does not physically
              prevent, and there is no camera proctoring.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
