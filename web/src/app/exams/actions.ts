"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { classesEnabled } from "@/lib/settings";
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

  // With classes switched off an exam has no class; the server decides that,
  // not the form, so a stale page cannot smuggle one in either direction.
  const useClasses = await classesEnabled();
  if (useClasses && !sectionId) return { error: "Pick a class." };

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
      section_id: useClasses ? sectionId : null,
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

  const patch: Record<string, unknown> = { status };

  // Stamp the moment it went out, but only the first time: re-publishing an
  // archived exam shouldn't rewrite the date students actually sat it.
  if (status === "PUBLISHED") {
    const { data: current } = await supabase
      .from("exams")
      .select("published_at")
      .eq("id", examId)
      .maybeSingle();
    if (!current?.published_at) patch.published_at = new Date().toISOString();
  }

  const { error } = await supabase.from("exams").update(patch).eq("id", examId);
  if (error) return { error: error.message };

  revalidatePath(`/exams/${examId}`);
  revalidatePath("/exams");
  revalidatePath("/admin/exams");
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

/** Which classes an exam is delivered to. A teacher may hold several. */
export async function setExamClasses(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const wanted = formData.getAll("sectionIds").map(String).filter(Boolean);
  if (!wanted.length) return { error: "Pick at least one class." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("exam_sections")
    .select("section_id")
    .eq("exam_id", examId);

  const have = new Set((current ?? []).map((r) => r.section_id));
  const add = wanted.filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !wanted.includes(id));

  if (add.length) {
    const { error } = await supabase
      .from("exam_sections")
      .insert(add.map((section_id) => ({ exam_id: examId, section_id })));
    if (error) return { error: error.message };
  }

  if (remove.length) {
    const { error } = await supabase
      .from("exam_sections")
      .delete()
      .eq("exam_id", examId)
      .in("section_id", remove);
    if (error) return { error: error.message };
  }

  revalidatePath(`/exams/${examId}`);
  return { success: `Delivered to ${wanted.length} class${wanted.length === 1 ? "" : "es"}.` };
}


/**
 * Set, clear, or override an exam's availability window.
 *
 * Opening and closing by hand is the same operation as scheduling — "close now"
 * is a close time of this instant — so there is only one piece of state and no
 * way for a manual override to disagree with a schedule.
 */
export async function setExamWindow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  if (!examId) return { error: "Which exam?" };

  const mode = String(formData.get("mode") ?? "schedule");
  const supabase = await createClient();

  // The browser sends wall-clock text with no zone. Read it in Manila time,
  // where these exams are sat, rather than in whatever zone the server runs in.
  const toIso = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const d = new Date(`${t}:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Opening and closing on the spot go through the database, so the clock that
  // stamps the time is the clock that enforces it. Doing this from here looked
  // right and was not: a couple of seconds of skew left a "closed" exam still
  // startable.
  if (mode === "close" || mode === "open") {
    const { error } = await supabase.rpc(
      mode === "close" ? "close_exam" : "open_exam",
      { exam_uuid: examId },
    );
    if (error) return { error: error.message };

    revalidatePath(`/exams/${examId}`);
    revalidatePath("/exams");
    revalidatePath("/admin/exams");
    revalidatePath("/teacher/exams");
    return {
      success:
        mode === "close"
          ? "Closed. Nobody can start or submit it now."
          : "Open. Students can sit it now.",
    };
  }

  let patch: { opens_at?: string | null; closes_at?: string | null };

  {
    const opensRaw = String(formData.get("opensAt") ?? "");
    const closesRaw = String(formData.get("closesAt") ?? "");
    const opens = toIso(opensRaw);
    const closes = toIso(closesRaw);

    if (opensRaw.trim() && !opens) return { error: "That opening time is not a date." };
    if (closesRaw.trim() && !closes) return { error: "That closing time is not a date." };
    if (opens && closes && new Date(closes) <= new Date(opens)) {
      return { error: "It has to close after it opens." };
    }
    patch = { opens_at: opens, closes_at: closes };
  }

  const { error } = await supabase.from("exams").update(patch).eq("id", examId);
  if (error) {
    return {
      error: /exams_window_order/.test(error.message)
        ? "It has to close after it opens."
        : error.message,
    };
  }

  revalidatePath(`/exams/${examId}`);
  revalidatePath("/exams");
  revalidatePath("/admin/exams");
  revalidatePath("/teacher/exams");

  return {
    success:
      mode === "close"
        ? "Closed. Nobody can start or submit it now."
        : mode === "open"
          ? "Open. Students can sit it now."
          : "Schedule saved.",
  };
}
