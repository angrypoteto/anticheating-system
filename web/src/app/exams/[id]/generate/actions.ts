"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { extractText } from "@/lib/ai/extract";
import { generateQuestions, type DraftQuestion } from "@/lib/ai/gemini";

export type GenerateState = {
  error?: string;
  notice?: string;
  drafts?: DraftQuestion[];
  sourceChars?: number;
};

const MAX_QUESTIONS = 20;

/**
 * The file is already in Storage (uploaded client-direct, so its bytes never pass
 * through a serverless request body). This reads it back, extracts the text, and
 * asks the model for drafts. Nothing is written to `questions` — the instructor
 * reviews first.
 */
export async function generateFromFile(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const storagePath = String(formData.get("storagePath") ?? "");
  const filename = String(formData.get("filename") ?? "");
  const count = Math.min(MAX_QUESTIONS, Math.max(1, Number(formData.get("count") ?? 5)));
  const mix = String(formData.get("mix") ?? "a mix of multiple choice and identification");

  if (!storagePath) return { error: "Upload a lesson file first." };

  // Confirm the caller owns this exam under RLS before the service role touches
  // anything on their behalf.
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return { error: "Exam not found, or not yours." };

  const admin = createAdminClient();
  const { data: blob, error: dlError } = await admin.storage
    .from("lesson-files")
    .download(storagePath);
  if (dlError || !blob) return { error: `Could not read the uploaded file: ${dlError?.message}` };

  const buffer = Buffer.from(await blob.arrayBuffer());
  const extracted = await extractText(buffer, filename);
  if (!extracted.ok) return { error: extracted.error };

  const result = await generateQuestions(extracted.text, count, mix);
  if (!result.ok) return { error: result.error };

  // Record the source file now that we know it parsed.
  await admin.from("lesson_files").insert({
    exam_id: examId,
    uploaded_by_id: user.id,
    storage_path: storagePath,
    parsed_text: extracted.text.slice(0, 500_000),
  });

  return {
    drafts: result.questions,
    sourceChars: extracted.chars,
    notice:
      `${result.questions.length} draft${result.questions.length === 1 ? "" : "s"} from ` +
      `${extracted.chars.toLocaleString()} characters, using key “${result.keyLabel}”.`,
  };
}

/** Writes approved drafts into the exam as real questions. */
export async function acceptDrafts(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const payload = String(formData.get("drafts") ?? "[]");

  let drafts: DraftQuestion[];
  try {
    drafts = JSON.parse(payload);
  } catch {
    return { error: "Could not read the edited drafts." };
  }
  if (!drafts.length) return { error: "Nothing selected to add." };

  const supabase = await createClient();
  const { count: existing } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  let order = existing ?? 0;
  let added = 0;

  for (const d of drafts) {
    const { data: created, error } = await supabase
      .from("questions")
      .insert({
        exam_id: examId,
        type: d.type,
        prompt: d.prompt,
        choices: d.type === "MULTIPLE_CHOICE" ? (d.choices ?? []) : null,
        source: "AI_DRAFT",
        // Approved by a human at this point — that's what the review screen is.
        review_status: "APPROVED",
        order: order++,
      })
      .select("id")
      .single();

    if (error) return { error: `${error.message} (added ${added} before failing)` };

    const { error: keyError } = await supabase.from("question_answers").insert({
      question_id: created.id,
      correct_answer: d.type === "MULTIPLE_CHOICE" ? d.answer : [d.answer],
    });
    if (keyError) {
      await supabase.from("questions").delete().eq("id", created.id);
      return { error: `${keyError.message} (added ${added} before failing)` };
    }
    added++;
  }

  revalidatePath(`/exams/${examId}`);
  return { notice: `Added ${added} question${added === 1 ? "" : "s"} to the exam.` };
}
