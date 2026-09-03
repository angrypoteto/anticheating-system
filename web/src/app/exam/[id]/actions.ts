"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { isCorrect, scorePercentage, type QuestionType } from "@/lib/grading";
import { parseTimer } from "@/lib/exam-config";

export type SubmitState = { error?: string; submitted?: boolean; score?: number };

/**
 * Grading needs the answer key, which students have no policy to read — so this is
 * one of the few places the service role is warranted. Ownership of the session is
 * checked against the caller's own identity first.
 */
export async function submitExam(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const user = await requireRole("STUDENT", "INSTRUCTOR", "ADMIN");
  const sessionId = String(formData.get("sessionId") ?? "");
  const reason = String(formData.get("reason") ?? "manual");

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, exam_id, student_id, status, started_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found." };
  if (session.student_id !== user.id) return { error: "Not your session." };
  if (session.status !== "IN_PROGRESS") {
    return { submitted: true, score: undefined };
  }

  const admin = createAdminClient();

  const [{ data: questions }, { data: answers }, { data: exam }] = await Promise.all([
    admin
      .from("questions")
      .select("id, type, question_answers(correct_answer)")
      .eq("exam_id", session.exam_id),
    admin.from("answers").select("question_id, response").eq("session_id", sessionId),
    admin.from("exams").select("timer_config").eq("id", session.exam_id).single(),
  ]);

  const responses = new Map(
    (answers ?? []).map((a) => [a.question_id, a.response]),
  );

  let correct = 0;
  for (const q of questions ?? []) {
    const embed = q.question_answers as
      | { correct_answer: unknown }
      | { correct_answer: unknown }[]
      | null;
    const key = (Array.isArray(embed) ? embed[0] : embed)?.correct_answer;
    if (isCorrect(q.type as QuestionType, responses.get(q.id), key)) correct++;
  }

  const score = scorePercentage(correct, (questions ?? []).length);

  // Trust the server clock, not the client's, for whether time ran out.
  const timer = parseTimer(exam?.timer_config);
  const elapsedMinutes =
    (Date.now() - new Date(session.started_at).getTime()) / 60000;
  const ranOver = timer.totalMinutes > 0 && elapsedMinutes > timer.totalMinutes;

  const status =
    reason === "manual" && !ranOver ? "SUBMITTED" : "AUTO_SUBMITTED";

  const { error } = await admin
    .from("exam_sessions")
    .update({ status, score, submitted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "IN_PROGRESS");

  if (error) return { error: error.message };

  revalidatePath(`/exam/${session.exam_id}`);
  return { submitted: true, score };
}
