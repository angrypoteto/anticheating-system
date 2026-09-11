import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classesEnabled } from "@/lib/settings";
import { loadEnrolment } from "@/lib/enrolment";
import { assessStudent } from "@/lib/risk";
import {
  Card,
  CardLink,
  Empty,
  FactRow,
  ListRow,
  PageHeader,
  Pill,
  PrimaryAction,
  Stat,
  Stats,
} from "@/app/admin/ui";
import { FirstRun } from "@/app/admin/first-run";
import { ClassProgressChart } from "@/app/admin/charts";

export const dynamic = "force-dynamic";

const since = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const hasPassed = (iso: string | null) => !!iso && new Date(iso).getTime() <= Date.now();

/**
 * The teacher's overview.
 *
 * Everything here is read through their own session rather than the service
 * role, so row-level security decides what counts as "theirs" — the same rules
 * that protect the data protect this page from over-reporting it.
 */
export const metadata: Metadata = { title: "Overview" };

export default async function TeacherOverview() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();
  const day = since(24);

  const [
    { data: settings },
    { data: exams },
    { data: sessions },
    { data: openFlags },
    { data: students },
    enrolment,
    useClasses,
  ] = await Promise.all([
    supabase.from("system_settings").select("pass_threshold, institution_name").eq("id", true).maybeSingle(),
    supabase.from("exams").select("id, title, status, section_id, published_at, created_by_id, closes_at"),
    supabase
      .from("exam_sessions")
      .select("id, exam_id, student_id, status, score, started_at, submitted_at"),
    supabase.from("flags").select("id, session_id").is("resolution", null),
    supabase.from("users").select("id, email, full_name, role").eq("role", "STUDENT"),
    loadEnrolment(supabase),
    classesEnabled(),
  ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const mine = exams ?? [];

  // Nothing has been made yet, so there is exactly one useful thing to say.
  // Showing the full console here means four zeroes and two empty charts,
  // none of which can be acted on until a class exists.
  const myClasses = enrolment.rollOf.size;
  if (!mine.length && !myClasses) {
    const name = (me.full_name ?? "").trim().split(/\s+/)[0];
    return (
      <FirstRun
        greeting={name ? `Welcome, ${name}` : "Welcome"}
        lede={
          useClasses
            ? "Nothing has been set yet. Three things and your first class can sit a paper."
            : "Nothing has been set yet. Generate a paper and publish it to get started."
        }
        action={
          useClasses
            ? {
                href: "/teacher/classes",
                label: "Make my first class",
                title: "Make a class",
                detail:
                  "A class is a subject and a section together — System Architecture for BSIT 4C. Students join it with its code, and every exam you publish reaches whoever is on it.",
              }
            : {
                href: "/teacher/exams/new",
                label: "Generate my first paper",
                title: "Generate a paper",
                detail:
                  "Upload a lesson file and the questions are drafted from it. Nothing is published until you have read them.",
              }
        }
        steps={[
          { label: "Account ready", note: "Signed in and your name is set.", done: true },
          ...(useClasses
            ? [
                {
                  label: "Make a class",
                  note: "Then hand its code to your students.",
                  done: false,
                },
              ]
            : []),
          {
            label: "Generate a paper",
            note: "Upload a lesson file and publish what comes back.",
            done: false,
          },
        ]}
        slots={[
          {
            label: "Sitting now",
            says: "Every student on a paper right now, and the ones who have left the window, as it happens.",
          },
          {
            label: "Where each class stands",
            says: "Who has finished, who is mid-paper and who has not started — once a class exists to stand somewhere.",
          },
          {
            label: "Students & risk",
            says: "Anyone whose marks put them near failing, once there are marks to read.",
          },
          {
            label: "Recently published",
            says: "The papers you have published, newest first, with how many sat each one.",
          },
        ]}
      />
    );
  }
  const published = mine.filter((e) => e.status === "PUBLISHED");
  const drafts = mine.filter((e) => e.status === "DRAFT");
  const live = (sessions ?? []).filter((s) => s.status === "IN_PROGRESS");
  const submittedToday = (sessions ?? []).filter(
    (s) => s.status !== "IN_PROGRESS" && s.submitted_at && s.submitted_at >= day,
  );

  // The same indicator the students page shows, so the two never disagree.
  const roll = students ?? [];
  const atRisk = roll.filter((s) => {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const facing = published.filter((e) => enrolment.reachesStudent(e, s.id)).length;
    return (
      assessStudent(
        own.map((o) => ({ score: o.score, status: o.status, flags: 0 })),
        facing,
        passThreshold,
      ).band === "at-risk"
    );
  }).length;

  const notExamined = roll.filter(
    (s) => !(sessions ?? []).some((x) => x.student_id === s.id),
  ).length;

  // Per-class progress, but only over the classes this teacher actually holds.
  const sessionsByStudent = new Map<string, { status: string }[]>();
  for (const x of sessions ?? []) {
    sessionsByStudent.set(x.student_id, [
      ...(sessionsByStudent.get(x.student_id) ?? []),
      { status: x.status },
    ]);
  }

  const classRows = enrolment.sections.map((sec) => {
    const inClass = new Set(enrolment.rollOf.get(sec.id) ?? []);
    let done = 0, taking = 0, notStarted = 0;
    for (const st of roll.filter((s) => inClass.has(s.id))) {
      const own = sessionsByStudent.get(st.id) ?? [];
      if (own.some((o) => o.status === "IN_PROGRESS")) taking++;
      else if (own.length) done++;
      else notStarted++;
    }
    return { name: enrolment.label.get(sec.id) ?? sec.name, done, taking, notStarted };
  });

  // --- sitting now ----------------------------------------------------------
  // Who is in a paper this minute, with how far through and whether anything
  // has been flagged — the thing a teacher opens the console to check. The
  // tallies are read the same way the monitor reads them: counted on the
  // server, because an answer row is not readable by the teacher's client.
  const sitting = live
    .slice()
    .sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")))
    .slice(0, 8);
  const sittingIds = sitting.map((s) => s.id);
  const sittingExamIds = [...new Set(sitting.map((s) => s.exam_id))];

  const [{ data: given }, { data: asked }] = await Promise.all([
    sittingIds.length
      ? supabase.from("answers").select("session_id").in("session_id", sittingIds)
      : Promise.resolve({ data: [] as { session_id: string }[] }),
    sittingExamIds.length
      ? supabase.from("questions").select("exam_id").in("exam_id", sittingExamIds)
      : Promise.resolve({ data: [] as { exam_id: string }[] }),
  ]);

  const answeredBy = new Map<string, number>();
  for (const a of given ?? []) answeredBy.set(a.session_id, (answeredBy.get(a.session_id) ?? 0) + 1);
  const askedIn = new Map<string, number>();
  for (const q of asked ?? []) askedIn.set(q.exam_id, (askedIn.get(q.exam_id) ?? 0) + 1);
  const flagsOn = new Map<string, number>();
  for (const f of openFlags ?? []) flagsOn.set(f.session_id, (flagsOn.get(f.session_id) ?? 0) + 1);

  const examTitle = new Map(mine.map((e) => [e.id, e.title]));
  const studentName = new Map(roll.map((s) => [s.id, s.full_name || s.email]));

  const sittingRows = sitting.map((s) => ({
    id: s.id,
    examId: s.exam_id,
    name: studentName.get(s.student_id) ?? "A student",
    exam: examTitle.get(s.exam_id) ?? "An exam",
    answered: answeredBy.get(s.id) ?? 0,
    of: askedIn.get(s.exam_id) ?? 0,
    minutes: s.started_at ? minutesSince(s.started_at) : null,
    flags: flagsOn.get(s.id) ?? 0,
  }));

  const openFlagCount = (openFlags ?? []).length;
  const alerts: { text: string; href: string; action: string }[] = [];
  if (live.length) {
    alerts.push({
      text: `${live.length} student${live.length === 1 ? " is" : "s are"} sitting an exam right now`,
      href: "/teacher/exams",
      action: "Watch",
    });
  }
  if (openFlagCount) {
    alerts.push({
      text: `${openFlagCount} flag${openFlagCount === 1 ? "" : "s"} raised and not yet resolved`,
      href: "/teacher/students",
      action: "Review",
    });
  }
  if (atRisk) {
    alerts.push({
      text: `${atRisk} student${atRisk === 1 ? " is" : "s are"} at risk of failing`,
      href: "/teacher/students",
      action: "See who",
    });
  }
  if (drafts.length) {
    alerts.push({
      text: `${drafts.length} exam${drafts.length === 1 ? "" : "s"} still in draft, so students cannot see ${drafts.length === 1 ? "it" : "them"}`,
      href: "/teacher/exams",
      action: "Open drafts",
    });
  }

  const recent = published
    .slice()
    .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        subtitle="Your exams and the people sitting them."
        action={<PrimaryAction href="/teacher/exams/new">Generate an exam</PrimaryAction>}
      />

      <Stats>
        <Stat
          label="Your exams"
          value={String(mine.length)}
          note={`${published.length} published, ${drafts.length} in draft`}
        />
        <Stat
          label="Sitting now"
          value={String(live.length)}
          note={
            sittingExamIds.length
              ? `${sittingExamIds.length} paper${sittingExamIds.length === 1 ? "" : "s"} open`
              : "Nobody is in a paper"
          }
        />
        <Stat label="Submitted in the last day" value={String(submittedToday.length)} />
        <Stat
          label="Open flags"
          value={String(openFlagCount)}
          tone={openFlagCount ? "warn" : "plain"}
        />
      </Stats>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card
          title="Sitting now"
          flush
          action={<CardLink href="/teacher/exams">Exams &amp; quizzes</CardLink>}
        >
          {sittingRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead className="text-[12.5px] text-gray-400">
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2.5 font-medium">Student</th>
                    <th className="px-3 py-2.5 font-medium">Progress</th>
                    <th className="px-3 py-2.5 font-medium">Time</th>
                    <th className="px-5 py-2.5 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {sittingRows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/exams/${r.examId}/monitor?from=list`}
                          className="block font-medium text-gray-900 hover:underline hover:underline-offset-[3px]"
                        >
                          {r.name}
                        </Link>
                        <span className="block text-[12.5px] text-gray-400">{r.exam}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-1 w-24 overflow-hidden rounded-full bg-gray-100">
                            <span
                              className="rounded-full bg-gray-900"
                              style={{ width: `${r.of ? Math.min(100, (r.answered / r.of) * 100) : 0}%` }}
                            />
                          </span>
                          <span className="tabular-nums text-gray-500">
                            {r.answered} of {r.of || "?"}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-500">
                        {r.minutes == null ? "—" : `${r.minutes} min`}
                      </td>
                      <td className="px-5 py-2.5">
                        {r.flags ? (
                          <Pill tone="warn">
                            {r.flags} open
                          </Pill>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nobody is sitting one of your exams right now.</Empty>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Needs attention" flush>
            {alerts.length ? (
              <ul>
                {alerts.map((a) => (
                  <li
                    key={a.text}
                    className="flex items-baseline justify-between gap-4 border-b border-gray-100 px-5 py-3 text-[13.5px] text-gray-900 last:border-b-0"
                  >
                    <span>{a.text}</span>
                    <CardLink href={a.href}>{a.action}</CardLink>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing needs your attention right now.</Empty>
            )}
          </Card>

          <Card
            title="Your students"
            hint={`${roll.length} in total`}
            flush
            action={<CardLink href="/teacher/students">Open the report</CardLink>}
          >
            <FactRow label="At risk of failing">
              <span
                className={`font-semibold tabular-nums ${atRisk ? "text-amber-800" : "text-gray-900"}`}
              >
                {atRisk}
              </span>
            </FactRow>
            <FactRow label="Not yet examined">
              <span className="font-semibold tabular-nums">{notExamined}</span>
            </FactRow>
            <FactRow label="Sitting an exam now">
              <span className="font-semibold tabular-nums">{live.length}</span>
            </FactRow>
          </Card>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {useClasses && classRows.length ? (
          <Card
            title="Where each class stands"
            hint="Whether each student has finished, is sitting an exam now, or has not started."
          >
            <ClassProgressChart rows={classRows} />
          </Card>
        ) : null}

        <Card
          title="Recently published"
          flush
          action={<CardLink href="/teacher/exams">All exams &amp; quizzes</CardLink>}
        >
          {recent.length ? (
            <div>
              {recent.map((e) => {
                // Closed papers are a record, not something to watch.
                const closed = hasPassed(e.closes_at);
                return (
                  <ListRow
                    key={e.id}
                    title={
                      <Link href={`/exams/${e.id}`} className="hover:underline hover:underline-offset-[3px]">
                        {e.title}
                      </Link>
                    }
                    detail={`Published ${publishedOn(e.published_at)}, ${closed ? "closed" : "open"}`}
                  >
                    <CardLink href={`/exams/${e.id}/monitor?from=list`}>
                      {closed ? "Records" : "Watch live"}
                    </CardLink>
                  </ListRow>
                );
              })}
            </div>
          ) : (
            <Empty>
              Nothing published yet.{" "}
              <Link
                href="/teacher/exams/new"
                className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px]"
              >
                Generate one
              </Link>
              .
            </Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Manila time, since that is where the exams are sat. */
function publishedOn(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-PH", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Manila",
      })
    : "recently";
}
