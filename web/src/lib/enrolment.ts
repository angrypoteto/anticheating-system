import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel } from "./classes";

/**
 * Who is in which class, and which exams reach them.
 *
 * A student sits several subjects now, so "their class" is a list and every
 * per-class figure (a roll, a risk band, how many exams they were given) has to
 * be counted per membership rather than per student.
 */
export async function loadEnrolment(supabase: SupabaseClient) {
  const [{ data: sections }, { data: enrollments }, { data: targets }] = await Promise.all([
    supabase.from("sections").select("id, name, subject").order("subject").order("name"),
    supabase.from("enrollments").select("student_id, section_id"),
    supabase.from("exam_sections").select("exam_id, section_id"),
  ]);

  const label = new Map((sections ?? []).map((s) => [s.id, classLabel(s)]));

  const classesOf = new Map<string, string[]>();
  const rollOf = new Map<string, string[]>();
  for (const e of enrollments ?? []) {
    classesOf.set(e.student_id, [...(classesOf.get(e.student_id) ?? []), e.section_id]);
    rollOf.set(e.section_id, [...(rollOf.get(e.section_id) ?? []), e.student_id]);
  }

  // An exam reaches every class in exam_sections, plus the one it was first
  // built for — older exams only have the latter.
  const reaches = new Map<string, Set<string>>();
  for (const t of targets ?? []) {
    const set = reaches.get(t.exam_id) ?? new Set<string>();
    set.add(t.section_id);
    reaches.set(t.exam_id, set);
  }

  return {
    sections: sections ?? [],
    label,
    classesOf,
    rollOf,
    /** Every class this exam is delivered to. */
    classesReached(exam: { id: string; section_id?: string | null }) {
      const set = new Set(reaches.get(exam.id) ?? []);
      if (exam.section_id) set.add(exam.section_id);
      return set;
    },
    /** Does this exam reach any class the student sits? */
    reachesStudent(exam: { id: string; section_id?: string | null }, studentId: string) {
      const mine = classesOf.get(studentId) ?? [];
      const set = new Set(reaches.get(exam.id) ?? []);
      if (exam.section_id) set.add(exam.section_id);
      return mine.some((c) => set.has(c));
    },
    /** The classes a student sits, as readable labels. */
    labelsFor(studentId: string) {
      return (classesOf.get(studentId) ?? []).map((id) => label.get(id) ?? "unknown class");
    },
  };
}
