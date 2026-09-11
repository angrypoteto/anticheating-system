"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isCorrect, scorePercentage, type QuestionType } from "@/lib/grading";

export type DemoResult = { score: number; correct: number; total: number } | { error: string };

/**
 * Mark a demo attempt, and save nothing.
 *
 * The demo is the real paper with the writes taken out, so its marking is the
 * real marking: the same isCorrect() a student's submission goes through,
 * against the same keys. It runs here rather than in the browser so the keys
 * stay on the server even for the person who wrote them — the demo page is the
 * student's page, and the student's page never holds an answer key.
 *
 * Read through the teacher's own session: the keys are only readable by whoever
 * may manage the exam, which is the same rule as the editor.
 */
export async function gradeDemo(
  examId: string,
  answers: Record<string, string>,
): Promise<DemoResult> {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, type, question_answers(correct_answer)")
    .eq("exam_id", examId);

  if (error) return { error: error.message };
  if (!questions?.length) return { error: "This exam has no questions to mark." };

  let correct = 0;
  for (const q of questions) {
    // PostgREST types a to-one embed as an array; accept either.
    const key = (Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers) as
      | { correct_answer: unknown }
      | null
      | undefined;
    const response = answers[q.id];
    if (response != null && isCorrect(q.type as QuestionType, response, key?.correct_answer)) {
      correct++;
    }
  }

  return {
    score: scorePercentage(correct, questions.length),
    correct,
    total: questions.length,
  };
}
