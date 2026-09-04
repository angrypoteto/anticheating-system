import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEnrolment } from "@/lib/enrolment";
import { classesEnabled } from "@/lib/settings";
import { assessSection, assessStudent, BAND_LABEL, type Risk } from "@/lib/risk";
import { Card, Empty, PageHeader, Pill, Stat } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

const BAND_TONE = {
  "on-track": "good",
  watch: "warn",
  "at-risk": "bad",
  "no-data": "muted",
} as const;

/**
 * The risk report, scoped to this teacher's own students.
 *
 * Read through their session, so "their students" is decided by row-level
 * security rather than by a filter this page could get wrong. The maths is the
 * same assessStudent/assessSection the admin report uses, so the two cannot
 * disagree about who is in trouble.
 */
export default async function TeacherStudentsPage() {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [
    { data: settings },
    { data: students },
    { data: exams },
    { data: sessions },
    { data: flagRows },
    enrolment,
    useClasses,
  ] = await Promise.all([
    supabase.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
    supabase.from("users").select("id, email, full_name, status").eq("role", "STUDENT"),
    supabase.from("exams").select("id, title, section_id, status").eq("status", "PUBLISHED"),
    supabase.from("exam_sessions").select("id, exam_id, student_id, status, score, started_at"),
    supabase.from("flags").select("session_id, resolution"),
    loadEnrolment(supabase),
    classesEnabled(),
  ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const roll = students ?? [];

  const flagsBySession = new Map<string, number>();
  for (const f of flagRows ?? []) {
    if (f.resolution) continue; // voided flags don't count against anyone
    flagsBySession.set(f.session_id, (flagsBySession.get(f.session_id) ?? 0) + 1);
  }

  const facing = (studentId: string) =>
    (exams ?? []).filter((e) => enrolment.reachesStudent(e, studentId)).length;

  const assessed = roll
    .map((s) => {
      const own = (sessions ?? []).filter((x) => x.student_id === s.id);
      const risk = assessStudent(
        own.map((o) => ({
          score: o.score,
          status: o.status,
          flags: flagsBySession.get(o.id) ?? 0,
        })),
        facing(s.id),
        passThreshold,
      );
      const taken = new Set(own.map((t) => t.exam_id));
      const missing = (exams ?? [])
        .filter((e) => enrolment.reachesStudent(e, s.id) && !taken.has(e.id))
        .map((e) => e.title);
      return { student: s, risk, missing };
    })
    .sort((a, b) => {
      const order = { "at-risk": 0, watch: 1, "no-data": 2, "on-track": 3 };
      return order[a.risk.band] - order[b.risk.band];
    });

  // A student sitting three of your subjects counts towards all three.
  const bySection = new Map<string, { name: string; risks: Risk[] }>();
  if (useClasses) {
    for (const a of assessed) {
      const mineIds = enrolment.classesOf.get(a.student.id) ?? [];
      for (const key of mineIds.length ? mineIds : ["none"]) {
        const name =
          key === "none" ? "No class assigned" : (enrolment.label.get(key) ?? "Unknown class");
        if (!bySection.has(key)) bySection.set(key, { name, risks: [] });
        bySection.get(key)!.risks.push(a.risk);
      }
    }
  }
  const sectionRisks = [...bySection.entries()]
    .map(([id, v]) => ({ id, name: v.name, ...assessSection(v.risks) }))
    .sort((a, b) => b.atRisk - a.atRisk || (a.average ?? 101) - (b.average ?? 101));

  const outstanding = assessed.filter((a) => a.missing.length);
  const inProgress = (sessions ?? []).filter((s) => s.status === "IN_PROGRESS").length;

  const name = (s: { full_name?: string | null; email: string }) => s.full_name || s.email;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Students & risk"
        subtitle="Who is on track, who is drifting, and who still owes you an exam. Rule-based, from scores and attendance — not a prediction model."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Your students" value={String(roll.length)} />
        <Stat
          label="At risk"
          value={String(assessed.filter((a) => a.risk.band === "at-risk").length)}
          tone="bad"
        />
        <Stat
          label="Not yet examined"
          value={String(assessed.filter((a) => a.risk.band === "no-data").length)}
          tone="warn"
        />
        <Stat label="Sitting now" value={String(inProgress)} />
      </div>

      {useClasses && sectionRisks.length ? (
        <Card
          title="Class projection"
          hint="Which of your classes is trending toward trouble. Ranked by students at risk, then by average."
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Class</th>
                  <th className="px-6 py-3 font-medium">Students</th>
                  <th className="px-6 py-3 font-medium">Average</th>
                  <th className="px-6 py-3 font-medium">Projected pass rate</th>
                  <th className="px-6 py-3 font-medium">At risk</th>
                </tr>
              </thead>
              <tbody>
                {sectionRisks.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">{s.students}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                      {s.average == null ? "—" : `${s.average}%`}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                      {s.projectedPassRate == null ? "—" : `${s.projectedPassRate}%`}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">{s.atRisk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Every student" hint={`${assessed.length} in total, most at risk first`} flush>
        {assessed.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {assessed.map((a) => (
              <li key={a.student.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                        {name(a.student)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                        {useClasses ? `${enrolment.labelsFor(a.student.id).join(", ") || "No class"} · ` : ""}
                        {a.risk.graded} graded
                        {a.risk.average == null ? "" : ` · average ${a.risk.average}%`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Pill tone={BAND_TONE[a.risk.band]}>{BAND_LABEL[a.risk.band]}</Pill>
                      <span
                        aria-hidden
                        className="text-gray-400 transition group-open:rotate-90 dark:text-gray-500"
                      >
                        ›
                      </span>
                    </span>
                  </summary>

                  <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4 dark:border-gray-800 dark:bg-gray-950/40">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {a.risk.reasons.join(" ")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Confidence: {a.risk.confidence} · {a.risk.notTaken} not taken ·{" "}
                      {a.risk.autoSubmitted} auto-submitted · {a.risk.flags} flag
                      {a.risk.flags === 1 ? "" : "s"}
                    </p>
                    {a.missing.length ? (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Still to sit: {a.missing.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            No students yet. They appear here once someone joins a class of yours, or opens a
            link to one of your exams.
          </Empty>
        )}
      </Card>

      <Card
        title="Still owes you an exam"
        hint={`${outstanding.length} student${outstanding.length === 1 ? "" : "s"}`}
        flush
      >
        {outstanding.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {outstanding.map((o) => (
              <li key={o.student.id} className="px-6 py-3">
                <p className="text-sm text-gray-900 dark:text-gray-100">{name(o.student)}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {o.missing.length} outstanding: {o.missing.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Everyone has sat everything you have published.</Empty>
        )}
      </Card>
    </div>
  );
}
