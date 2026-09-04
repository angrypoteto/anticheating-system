"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  DEFAULT_LOCKDOWN,
  DEFAULT_TIMER,
  type LockdownConfig,
  type TimerConfig,
} from "@/lib/exam-config";

export type ActionState = { error?: string; success?: string };

const QUESTION_TYPES = ["MULTIPLE_CHOICE", "IDENTIFICATION"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

// Writes go through the instructor's own session, so RLS decides whether they own
// the section/exam. No service-role shortcuts here.
export async function createExam(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const title = String(formData.get("title") ?? "").trim();
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!title) return { error: "Title is required." };
  if (!sectionId) return { error: "Pick a section." };

  const supabase = await createClient();

  // New exams start from the system-wide defaults an admin set in Settings,
  // falling back to the built-in ones if the row is somehow missing.
  const { data: settings } = await supabase
    .from("system_settings")
    .select(
      "default_total_minutes, default_per_question_seconds, default_max_strikes, default_fullscreen, default_block_copy_paste, default_honeypot",
    )
    .eq("id", true)
    .maybeSingle();

  const timer: TimerConfig = settings
    ? {
        totalMinutes: settings.default_total_minutes,
        perQuestionSeconds: settings.default_per_question_seconds,
      }
    : DEFAULT_TIMER;

  const lockdown: LockdownConfig = settings
    ? {
        fullscreenRequired: settings.default_fullscreen,
        blockCopyPaste: settings.default_block_copy_paste,
        maxStrikes: settings.default_max_strikes,
        honeypot: settings.default_honeypot,
      }
    : DEFAULT_LOCKDOWN;

  const { data, error } = await supabase
    .from("exams")
    .insert({
      title,
      section_id: sectionId,
      created_by_id: user.id,
      status: "DRAFT",
      timer_config: timer,
      lockdown_config: lockdown,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/exams/${data.id}`);
}

export async function updateExamSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const timer: TimerConfig = {
    totalMinutes: Math.max(0, Number(formData.get("totalMinutes") ?? 0)),
    perQuestionSeconds: formData.get("perQuestionEnabled")
      ? Math.max(1, Number(formData.get("perQuestionSeconds") ?? 60))
      : null,
  };

  const lockdown: LockdownConfig = {
    fullscreenRequired: formData.get("fullscreenRequired") === "on",
    blockCopyPaste: formData.get("blockCopyPaste") === "on",
    maxStrikes: Math.max(1, Number(formData.get("maxStrikes") ?? 3)),
    honeypot: formData.get("honeypot") === "on",
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("exams")
    .update({ title, timer_config: timer, lockdown_config: lockdown })
    .eq("id", examId);

  if (error) return { error: error.message };

  revalidatePath(`/exams/${examId}`);
  return { success: "Settings saved." };
}

export async function setExamStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();

  if (status === "PUBLISHED") {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);
    if (!count) {
      return { error: "Add at least one question before publishing." };
    }
  }

  const { error } = await supabase
    .from("exams")
    .update({ status })
    .eq("id", examId);
  if (error) return { error: error.message };

  revalidatePath(`/exams/${examId}`);
  revalidatePath("/exams");
  return { success: `Exam ${status.toLowerCase()}.` };
}

export async function deleteExam(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");
  const examId = String(formData.get("examId") ?? "");

  const supabase = await createClient();

  // Questions reference the exam with ON DELETE RESTRICT, so clear them first.
  const { error: qError } = await supabase
    .from("questions")
    .delete()
    .eq("exam_id", examId);
  if (qError) return { error: qError.message };

  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) return { error: error.message };

  redirect("/exams");
}

function parseChoices(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function saveQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const type = String(formData.get("type") ?? "") as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();

  if (!QUESTION_TYPES.includes(type)) return { error: "Pick a question type." };
  if (!prompt) return { error: "Question text is required." };

  let choices: string[] | null = null;
  let correctAnswer: unknown;

  if (type === "MULTIPLE_CHOICE") {
    choices = parseChoices(String(formData.get("choices") ?? ""));
    if (choices.length < 2) {
      return { error: "Give at least two choices, one per line." };
    }
    const correctIndex = Number(formData.get("correctIndex") ?? -1);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      return { error: "Pick which choice is correct." };
    }
    // Stored as the choice text, not its index — the displayed order is shuffled
    // per student, so an index would point at the wrong option.
    correctAnswer = choices[correctIndex];
  } else {
    const answer = String(formData.get("answer") ?? "").trim();
    if (!answer) return { error: "Give the expected answer." };
    // Accepted spellings, one per line.
    correctAnswer = parseChoices(String(formData.get("answer") ?? ""));
  }

  const supabase = await createClient();
  // The answer key lives in question_answers, which students have no policy on —
  // keeping it on questions would expose it to anyone who can read the paper.
  const payload = {
    exam_id: examId,
    type,
    prompt,
    choices,
    source: "MANUAL" as const,
    review_status: "APPROVED" as const,
  };

  if (questionId) {
    const { error } = await supabase
      .from("questions")
      .update(payload)
      .eq("id", questionId);
    if (error) return { error: error.message };

    const { error: keyError } = await supabase
      .from("question_answers")
      .upsert({ question_id: questionId, correct_answer: correctAnswer });
    if (keyError) return { error: keyError.message };
  } else {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);

    const { data: created, error } = await supabase
      .from("questions")
      .insert({ ...payload, order: count ?? 0 })
      .select("id")
      .single();
    if (error) return { error: error.message };

    const { error: keyError } = await supabase
      .from("question_answers")
      .insert({ question_id: created.id, correct_answer: correctAnswer });
    if (keyError) {
      // Don't leave a question that can never be graded.
      await supabase.from("questions").delete().eq("id", created.id);
      return { error: keyError.message };
    }
  }

  revalidatePath(`/exams/${examId}`);
  return { success: questionId ? "Question updated." : "Question added." };
}

export async function deleteQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", questionId);
  if (error) return { error: error.message };

  revalidatePath(`/exams/${examId}`);
  return { success: "Question deleted." };
}
