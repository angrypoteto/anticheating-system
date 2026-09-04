import { createAdminClient } from "@/lib/supabase/admin";
import { assessSection, assessStudent, BAND_LABEL, type Risk } from "@/lib/risk";
import { Card, Empty, PageHeader, Pill, Stat } from "../ui";

export const dynamic = "force-dynamic";

const BAND_TONE = {
  "on-track": "good",
  watch: "warn",
  "at-risk": "bad",
  "no-data": "muted",
} as const;

export default async function StudentsPage() {
  const admin = createAdminClient();

  const [{ data: settings }, { data: users }, { data: sections }, { data: exams }] =
    await Promise.all([
      admin.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
      admin.from("users").select("id, email, role, status, section_id").eq("role", "STUDENT"),
      admin.from("sections").select("id, name"),
      admin.from("exams").select("id, title, section_id, status").eq("status", "PUBLISHED"),
    ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const students = users ?? [];
  const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));

  const { data: sessions } = await admin
    .from("exam_sessions")
    .select("id, exam_id, student_id, status, score, started_at");
  const { data: flagRows } = await admin.from("flags").select("session_id, resolution");

  const flagsBySession = new Map<string, number>();
  for (const f of flagRows ?? []) {
    if (f.resolution) continue; // voided flags don't count against anyone
    flagsBySession.set(f.session_id, (flagsBySession.get(f.session_id) ?? 0) + 1);
  }

  const examsForSection = (sectionId: string | null) =>
    (exams ?? []).filter((e) => e.section_id === sectionId).length;

  // --- per student ---
  const assessed = students.map((s) => {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const risk = assessStudent(
      own.map((o) => ({
        score: o.score,
        status: o.status,
        flags: flagsBySession.get(o.id) ?? 0,
      })),
      examsForSection(s.section_id),
      passThreshold,
    );
    return { student: s, risk, attempts: own };
  });

  // --- per class ---
  const bySection = new Map<string, { name: string; risks: Risk[] }>();
  for (const a of assessed) {
    const key = a.student.section_id ?? "none";
    const name = a.student.section_id
      ? (sectionName.get(a.student.section_id) ?? "Unknown class")
      : "No class assigned";
    if (!bySection.has(key)) bySection.set(key, { name, risks: [] });
    bySection.get(key)!.risks.push(a.risk);
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
        .filter((e) => e.section_id === a.student.section_id && !taken.has(e.id))
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

      {/* --- class projection --- */}
      <Card
        title="Class projection"
        hint="Which class is trending toward trouble. Ranked by students at risk, then by average."
        flush
      >
        {sectionRisks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
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
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{s.students}</td>
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-100">
                      {s.average != null ? `${s.average}%` : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {s.projectedPassRate != null ? (
                        <Pill tone={s.projectedPassRate >= 75 ? "good" : s.projectedPassRate >= 50 ? "warn" : "bad"}>
                          {s.projectedPassRate}%
                        </Pill>
                      ) : (
                        <span className="text-gray-400">not enough data</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {s.atRisk} at risk · {s.watch} watch · {s.onTrack} on track
                      {s.noData ? ` · ${s.noData} unexamined` : ""}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400">{s.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No students yet.</Empty>
        )}
        <p className="border-t border-gray-200 px-6 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          This is a rule-based indicator, not a trained model: it compares averages
          against the pass mark and notes missed or auto-submitted attempts. Every
          band is explained per student below. Treat low-confidence rows as a
          prompt to look, not a conclusion.
        </p>
      </Card>

      {/* --- who hasn't sat an exam --- */}
      <Card
        title="Outstanding exams"
        hint="Students with a published exam in their class that they have not attempted."
        flush
      >
        {outstanding.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {outstanding.map((o) => (
              <li key={o.student.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">{o.student.email}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {o.student.section_id ? sectionName.get(o.student.section_id) : "No class"} ·
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
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
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
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {student.email}
                        {student.status !== "ACTIVE" ? (
                          <span className="ml-2 text-xs text-gray-400">(disabled)</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {student.section_id ? sectionName.get(student.section_id) : "No class"} ·{" "}
                        {risk.graded} graded · confidence: {risk.confidence}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {risk.average != null ? `${risk.average}%` : "—"}
                      </span>
                      <Pill tone={BAND_TONE[risk.band]}>{BAND_LABEL[risk.band]}</Pill>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {risk.reasons.map((r) => (
                      <li key={r} className="text-xs text-gray-600 dark:text-gray-400">
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
