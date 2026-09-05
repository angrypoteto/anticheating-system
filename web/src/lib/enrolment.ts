import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel } from "./classes";
import { readAllRows } from "./read-all";

/**
 * Who is in which class, and which exams reach them.
 *
 * A student sits several subjects now, so "their class" is a list and every
 * per-class figure (a roll, a risk band, how many exams they were given) has to
 * be counted per membership rather than per student.
 */
export async function loadEnrolment(supabase: SupabaseClient) {
  // Enrolments and link grants both grow with every class and every exam, so
  // these are paged: a reply stops at a thousand rows without saying so, and a
  // short read here would silently drop students out of every figure below.
  const [{ data: sections }, enrollments, targets, grants] = await Promise.all([
    supabase.from("sections").select("id, name, subject").order("subject").order("name"),
    readAllRows<{ student_id: string; section_id: string }>(
      (f, t) => supabase.from("enrollments").select("student_id, section_id").range(f, t)),
    readAllRows<{ exam_id: string; section_id: string }>(
      (f, t) => supabase.from("exam_sections").select("exam_id, section_id").range(f, t)),
    // A share link reaches a student without any class at all, and with
    // classes switched off it is the *only* way an exam reaches anybody.
    readAllRows<{ exam_id: string; student_id: string }>(
      (f, t) => supabase.from("exam_access").select("exam_id, student_id").range(f, t)),
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

  const granted = new Map<string, Set<string>>();
  for (const g of grants ?? []) {
    const set = granted.get(g.exam_id) ?? new Set<string>();
    set.add(g.student_id);
    granted.set(g.exam_id, set);
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
    /**
     * Was this exam given to this student — by their class, or by its link?
     *
     * Missing the link half made the risk report believe nobody had been set
     * anything whenever classes were switched off, so "not taken" was always
     * zero and nobody ever appeared to owe an exam.
     */
    reachesStudent(exam: { id: string; section_id?: string | null }, studentId: string) {
      if (granted.get(exam.id)?.has(studentId)) return true;
      const mine = classesOf.get(studentId) ?? [];
      const set = new Set(reaches.get(exam.id) ?? []);
      if (exam.section_id) set.add(exam.section_id);
      return mine.some((c) => set.has(c));
    },

    /** Every student this exam was given to, however they were given it. */
    audienceOf(exam: { id: string; section_id?: string | null }) {
      const people = new Set(granted.get(exam.id) ?? []);
      const classes = new Set(reaches.get(exam.id) ?? []);
      if (exam.section_id) classes.add(exam.section_id);
      for (const c of classes) for (const s of rollOf.get(c) ?? []) people.add(s);
      return people;
    },
    /** The classes a student sits, as readable labels. */
    labelsFor(studentId: string) {
      return (classesOf.get(studentId) ?? []).map((id) => label.get(id) ?? "unknown class");
    },
  };
}
