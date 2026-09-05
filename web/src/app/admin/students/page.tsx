import { createAdminClient } from "@/lib/supabase/admin";
import { loadEnrolment } from "@/lib/enrolment";
import { classesEnabled } from "@/lib/settings";
import { assessSection, assessStudent, BAND_LABEL, type Risk } from "@/lib/risk";
import { Card, Empty, PageHeader, Pill, Stat } from "../ui";
import { ReportActions } from "./report-actions";

export const dynamic = "force-dynamic";

const BAND_TONE = {
  "on-track": "good",
  watch: "warn",
  "at-risk": "bad",
  "no-data": "muted",
} as const;

export default async function StudentsPage() {
  const admin = createAdminClient();

  const [{ data: settings }, { data: users }, { data: exams }, enrolment] =
    await Promise.all([
      admin.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
      admin
        .from("users")
        .select("id, email, full_name, role, status")
        .eq("role", "STUDENT"),
      admin.from("exams").select("id, title, section_id, status").eq("status", "PUBLISHED"),
      loadEnrolment(admin),
    ]);

  const useClasses = await classesEnabled();

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const students = users ?? [];
  const { label: sectionName, classesOf } = enrolment;
  const classesText = (studentId: string) => {
    if (!useClasses) return "";
    const names = enrolment.labelsFor(studentId);
    return names.length ? names.join(", ") : "No class";
  };

  const { data: sessions } = await admin
    .from("exam_sessions")
    .select("id, exam_id, student_id, status, score, started_at");
  const { data: flagRows } = await admin.from("flags").select("session_id, resolution");

  const flagsBySession = new Map<string, number>();
  for (const f of flagRows ?? []) {
    if (f.resolution) continue; // voided flags don't count against anyone
    flagsBySession.set(f.session_id, (flagsBySession.get(f.session_id) ?? 0) + 1);
  }

  // Every published exam that reaches any class the student sits.
  const examsFacing = (studentId: string) =>
    (exams ?? []).filter((e) => enrolment.reachesStudent(e, studentId)).length;

  // --- per student ---
  const assessed = students.map((s) => {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const risk = assessStudent(
      own.map((o) => ({
        score: o.score,
        status: o.status,
        flags: flagsBySession.get(o.id) ?? 0,
      })),
      examsFacing(s.id),
      passThreshold,
    );
    return { student: s, risk, attempts: own };
  });

  // --- per class ---
  // A student sitting three subjects counts towards all three classes, so the
  // per-class picture reflects who actually turns up to that class.
  const bySection = new Map<string, { name: string; risks: Risk[] }>();
  for (const a of assessed) {
    const mine = classesOf.get(a.student.id) ?? [];
    const keys = mine.length ? mine : ["none"];
    for (const key of keys) {
      const name =
        key === "none" ? "No class assigned" : (sectionName.get(key) ?? "Unknown class");
      if (!bySection.has(key)) bySection.set(key, { name, risks: [] });
      bySection.get(key)!.risks.push(a.risk);
    }
  }
  const sectionRisks = [...bySection.entries()]
    .map(([id, v]) => ({ id, name: v.name, ...assessSection(v.risks) }))
    .sort((a, b) => (b.atRisk - a.atRisk) || (a.average ?? 101) - (b.average ?? 101));

  // --- who still owes an exam ---
  const outstanding = assessed
    .filter((a) => a.risk.notTaken > 0)
    .map((a) => {
      const taken = new Set(a.attempts.map((t) => t.exam_id));
      const missing = (exams ?? [])
        .filter((e) => enrolment.reachesStudent(e, a.student.id) && !taken.has(e.id))
        .map((e) => e.title);
      return { ...a, missing };
    })
    .sort((a, b) => b.missing.length - a.missing.length);

  const inProgress = (sessions ?? []).filter((s) => s.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Students & risk"
        subtitle={`Performance across published exams, with a pass mark of ${passThreshold}%. Change it in Settings.`}
        action={<ReportActions />}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Students" value={String(students.length)} />
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

      {/* Class projection only means something when exams are organised by class. */}
      {useClasses ? (
      <Card
        title="Class projection"
        hint="Which class is trending toward trouble. Ranked by students at risk, then by average."
        flush
      >
        {sectionRisks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Class</th>
                  <th className="px-6 py-3 font-medium">Students</th>
                  <th className="px-6 py-3 font-medium">Average</th>
                  <th className="px-6 py-3 font-medium">Projected pass rate</th>
                  <th className="px-6 py-3 font-medium">Breakdown</th>
                  <th className="px-6 py-3 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {sectionRisks.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{s.students}</td>
                    <td className="px-6 py-3 text-slate-900 dark:text-slate-100">
                      {s.average != null ? `${s.average}%` : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {s.projectedPassRate != null ? (
                        <Pill tone={s.projectedPassRate >= 75 ? "good" : s.projectedPassRate >= 50 ? "warn" : "bad"}>
                          {s.projectedPassRate}%
                        </Pill>
                      ) : (
                        <span className="text-slate-400">not enough data</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {s.atRisk} at risk · {s.watch} watch · {s.onTrack} on track
                      {s.noData ? ` · ${s.noData} unexamined` : ""}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{s.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No students yet.</Empty>
        )}
        <p className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          This is a rule-based indicator, not a trained model: it compares averages
          against the pass mark and notes missed or auto-submitted attempts. Every
          band is explained per student below. Treat low-confidence rows as a
          prompt to look, not a conclusion.
        </p>
      </Card>
      ) : null}

      {/* --- who hasn't sat an exam --- */}
      <Card
        title="Outstanding exams"
        hint="Students with a published exam in their class that they have not attempted."
        flush
      >
        {outstanding.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {outstanding.map((o) => (
              <li key={o.student.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 dark:text-slate-100">{o.student.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {classesText(o.student.id)} ·
                    {" "}
                    {o.missing.join(", ")}
                  </p>
                </div>
                <Pill tone="warn">
                  {o.missing.length} not taken
                </Pill>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Everyone has attempted every published exam in their class.</Empty>
        )}
      </Card>

      {/* --- per-student report --- */}
      <Card title="Student report" hint="Each band with the reasoning behind it." flush>
        {assessed.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {assessed
              .slice()
              .sort((a, b) => {
                const order = { "at-risk": 0, watch: 1, "no-data": 2, "on-track": 3 };
                return order[a.risk.band] - order[b.risk.band];
              })
              .map(({ student, risk }) => (
                <li key={student.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {student.email}
                        {student.status !== "ACTIVE" ? (
                          <span className="ml-2 text-xs text-slate-400">(disabled)</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {classesText(student.id)} ·{" "}
                        {risk.graded} graded · confidence: {risk.confidence}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {risk.average != null ? `${risk.average}%` : "—"}
                      </span>
                      <Pill tone={BAND_TONE[risk.band]}>{BAND_LABEL[risk.band]}</Pill>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {risk.reasons.map((r) => (
                      <li key={r} className="text-xs text-slate-600 dark:text-slate-400">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        ) : (
          <Empty>No students yet.</Empty>
        )}
      </Card>
    </div>
  );
}
