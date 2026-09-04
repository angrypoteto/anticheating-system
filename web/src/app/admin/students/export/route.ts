import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { assessStudent, BAND_LABEL } from "@/lib/risk";

/** CSV of the student report — the same numbers the page shows, for a spreadsheet. */
export async function GET() {
  await requireRole("ADMIN");
  const admin = createAdminClient();

  const [{ data: settings }, { data: users }, { data: sections }, { data: exams }, { data: sessions }, { data: flags }] =
    await Promise.all([
      admin.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
      admin.from("users").select("id, email, role, status, section_id").eq("role", "STUDENT"),
      admin.from("sections").select("id, name"),
      admin.from("exams").select("id, section_id, status").eq("status", "PUBLISHED"),
      admin.from("exam_sessions").select("id, exam_id, student_id, status, score, started_at, submitted_at"),
      admin.from("flags").select("session_id, resolution"),
    ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const openFlags = new Map<string, number>();
  for (const f of flags ?? []) {
    if (f.resolution) continue;
    openFlags.set(f.session_id, (openFlags.get(f.session_id) ?? 0) + 1);
  }

  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "Email", "Class", "Status", "Attempts", "Graded", "Average %",
    "Not taken", "Auto-submitted", "Open flags", "Risk band", "Confidence", "Reasons",
  ];

  const lines = [header.join(",")];

  for (const s of users ?? []) {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const available = (exams ?? []).filter((e) => e.section_id === s.section_id).length;
    const risk = assessStudent(
      own.map((o) => ({ score: o.score, status: o.status, flags: openFlags.get(o.id) ?? 0 })),
      available,
      passThreshold,
    );
    lines.push([
      s.email,
      s.section_id ? (sectionName.get(s.section_id) ?? "") : "",
      s.status,
      own.length,
      risk.graded,
      risk.average ?? "",
      risk.notTaken,
      risk.autoSubmitted,
      risk.flags,
      BAND_LABEL[risk.band],
      risk.confidence,
      risk.reasons.join(" "),
    ].map(esc).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="student-report-${stamp}.csv"`,
    },
  });
}
