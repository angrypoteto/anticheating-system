import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classesEnabled } from "@/lib/settings";
import { loadEnrolment } from "@/lib/enrolment";
import { assessStudent } from "@/lib/risk";
import { Card, Empty, PageHeader, Stat } from "@/app/admin/ui";
import { ClassProgressChart } from "@/app/admin/charts";

export const dynamic = "force-dynamic";

const since = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

/**
 * The teacher's overview.
 *
 * Everything here is read through their own session rather than the service
 * role, so row-level security decides what counts as "theirs" — the same rules
 * that protect the data protect this page from over-reporting it.
 */
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
    supabase.from("exams").select("id, title, status, section_id, published_at, created_by_id"),
    supabase.from("exam_sessions").select("id, exam_id, student_id, status, score, submitted_at"),
    supabase.from("flags").select("id, session_id").is("resolution", null),
    supabase.from("users").select("id, email, full_name, role").eq("role", "STUDENT"),
    loadEnrolment(supabase),
    classesEnabled(),
  ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const mine = exams ?? [];
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

  const alerts: { text: string; href: string }[] = [];
  if (live.length) {
    alerts.push({
      text: `${live.length} student${live.length === 1 ? " is" : "s are"} sitting an exam right now.`,
      href: "/teacher/exams",
    });
  }
  if ((openFlags ?? []).length) {
    alerts.push({
      text: `${(openFlags ?? []).length} flag${(openFlags ?? []).length === 1 ? "" : "s"} raised and not yet resolved.`,
      href: "/teacher/students",
    });
  }
  if (atRisk) {
    alerts.push({
      text: `${atRisk} student${atRisk === 1 ? " is" : "s are"} at risk of failing.`,
      href: "/teacher/students",
    });
  }
  if (drafts.length) {
    alerts.push({
      text: `${drafts.length} exam${drafts.length === 1 ? "" : "s"} still in draft — students cannot see them yet.`,
      href: "/teacher/exams",
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        subtitle={`${settings?.institution_name ?? "Proctorly"} — your exams and the people sitting them.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your exams"
          value={String(mine.length)}
          note={`${published.length} published, ${drafts.length} draft`}
        />
        <Stat label="Sitting now" value={String(live.length)} tone={live.length ? "warn" : "plain"} />
        <Stat label="Submitted (24h)" value={String(submittedToday.length)} />
        <Stat
          label="Open flags"
          value={String((openFlags ?? []).length)}
          tone={(openFlags ?? []).length ? "warn" : "good"}
        />
      </div>

      {alerts.length ? (
        <Card title="Needs attention" flush>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((a) => (
              <li key={a.text} className="flex items-center justify-between gap-4 px-6 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-300">{a.text}</span>
                <Link
                  href={a.href}
                  className="shrink-0 text-sm text-teal-700 underline underline-offset-4 dark:text-teal-400"
                >
                  Look
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card title="Needs attention">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nothing needs your attention right now.
          </p>
        </Card>
      )}

      {useClasses && classRows.length ? (
        <Card
          title="Where each class stands"
          hint="Your students, split by whether they have finished, are sitting an exam now, or have not started."
        >
          <ClassProgressChart rows={classRows} />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your students" hint={`${roll.length} in total`}>
          <div className="space-y-2 text-sm">
            <Row k="At risk of failing" v={String(atRisk)} />
            <Row k="Not yet examined" v={String(notExamined)} />
            <Row k="Sitting an exam now" v={String(live.length)} />
          </div>
          <Link
            href="/teacher/students"
            className="mt-4 inline-block text-sm text-teal-700 underline underline-offset-4 dark:text-teal-400"
          >
            Open the report
          </Link>
        </Card>

        <Card title="Recently published" hint="Newest first.">
          {published.length ? (
            <ul className="space-y-2 text-sm">
              {published
                .slice()
                .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")))
                .slice(0, 5)
                .map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/exams/${e.id}`}
                      className="truncate text-gray-900 underline-offset-4 hover:underline dark:text-gray-100"
                    >
                      {e.title}
                    </Link>
                    <Link
                      href={`/exams/${e.id}/monitor?from=list`}
                      className="shrink-0 text-xs text-teal-700 underline underline-offset-4 dark:text-teal-400"
                    >
                      Watch live
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty>
              Nothing published yet.{" "}
              <Link
                href="/teacher/exams/new"
                className="text-teal-700 underline underline-offset-4 dark:text-teal-400"
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600 dark:text-gray-400">{k}</span>
      <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{v}</span>
    </div>
  );
}
