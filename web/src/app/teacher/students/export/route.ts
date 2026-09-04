import { createClient } from "@/lib/supabase/server";
import { loadEnrolment } from "@/lib/enrolment";
import { classesEnabled } from "@/lib/settings";
import { requireRole } from "@/lib/auth";
import { assessStudent, BAND_LABEL } from "@/lib/risk";

/**
 * The teacher's own report, for a spreadsheet.
 *
 * Read through their session rather than the service role, so it carries exactly
 * the students the page shows and cannot quietly export the whole school. The
 * numbers come from the same assessStudent() the page renders, so the file and
 * the screen cannot disagree.
 */
export async function GET() {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [
    { data: settings },
    { data: students },
    { data: exams },
    { data: sessions },
    { data: flags },
    enrolment,
    useClasses,
  ] = await Promise.all([
    supabase.from("system_settings").select("pass_threshold").eq("id", true).maybeSingle(),
    supabase.from("users").select("id, email, full_name, status").eq("role", "STUDENT"),
    supabase.from("exams").select("id, title, section_id, status").eq("status", "PUBLISHED"),
    supabase.from("exam_sessions").select("id, exam_id, student_id, status, score"),
    supabase.from("flags").select("session_id, resolution"),
    loadEnrolment(supabase),
    classesEnabled(),
  ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);

  // The same scoping as the page: with classes off, "your students" means the
  // people given one of your exams, not everyone in the school.
  const everyone = students ?? [];
  const roll = useClasses
    ? everyone
    : everyone.filter(
        (s) =>
          (exams ?? []).some((e) => enrolment.reachesStudent(e, s.id)) ||
          (sessions ?? []).some((x) => x.student_id === s.id),
      );

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
    "Name", "Email", "Class", "Status", "Attempts", "Graded", "Average %",
    "Not taken", "Still to sit", "Auto-submitted", "Open flags",
    "Risk band", "Confidence", "Reasons",
  ];
  const lines = [header.join(",")];

  for (const s of roll) {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const facing = (exams ?? []).filter((e) => enrolment.reachesStudent(e, s.id));
    const taken = new Set(own.map((t) => t.exam_id));
    const risk = assessStudent(
      own.map((o) => ({ score: o.score, status: o.status, flags: openFlags.get(o.id) ?? 0 })),
      facing.length,
      passThreshold,
    );

    lines.push([
      s.full_name ?? "",
      s.email,
      enrolment.labelsFor(s.id).join("; "),
      s.status,
      own.length,
      risk.graded,
      risk.average ?? "",
      risk.notTaken,
      facing.filter((e) => !taken.has(e.id)).map((e) => e.title).join("; "),
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
      "Content-Disposition": `attachment; filename="my-students-${stamp}.csv"`,
    },
  });
}
