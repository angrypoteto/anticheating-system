"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { extractText } from "@/lib/ai/extract";
import { describeMix, type DraftQuestion } from "@/lib/ai/gemini";
import { generateQuestions } from "@/lib/ai/generate";
import { mergeDrafts, planBatches } from "@/lib/ai/batches";

export type GenerateState = {
  error?: string;
  notice?: string;
  drafts?: DraftQuestion[];
  sourceChars?: number;
};

/**
 * Remove a lesson file's bytes from Storage.
 *
 * The extracted text is already on the lesson_files row and is all that
 * regeneration reads, so once a file has been read it has no further use. It is
 * somebody's slide deck; leaving it in a bucket indefinitely is a cost with no
 * benefit. Failing to delete is not worth failing the request over — the sweep
 * after the drafts are kept will catch it.
 */
async function removeLessonFile(
  admin: ReturnType<typeof createAdminClient>,
  storagePath: string,
) {
  const { error } = await admin.storage.from("lesson-files").remove([storagePath]);
  if (error) return false;
  await admin
    .from("lesson_files")
    .update({ file_deleted_at: new Date().toISOString() })
    .eq("storage_path", storagePath);
  return true;
}

/** Everything still sitting in this exam's folder, gone. */
async function sweepLessonFiles(
  admin: ReturnType<typeof createAdminClient>,
  examId: string,
) {
  const { data: left } = await admin.storage.from("lesson-files").list(examId);
  const paths = (left ?? []).map((f) => `${examId}/${f.name}`);
  if (!paths.length) return 0;

  const { error } = await admin.storage.from("lesson-files").remove(paths);
  if (error) return 0;
  await admin
    .from("lesson_files")
    .update({ file_deleted_at: new Date().toISOString() })
    .in("storage_path", paths);
  return paths.length;
}

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

  // Composition is specified per type, the way the proposal frames it:
  // "ten multiple-choice items and five identification items".
  const mcCount = Math.max(0, Math.floor(Number(formData.get("mcCount") ?? 0)));
  const identCount = Math.max(0, Math.floor(Number(formData.get("identCount") ?? 0)));
  const count = mcCount + identCount;

  if (!storagePath) return { error: "Upload a lesson file first." };
  if (!Number.isFinite(count) || count < 1) {
    return { error: "Ask for at least one question." };
  }

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

  // The file is read once. Asking again for more questions from the same lesson
  // uses the text already on the row, which is also what makes deleting the
  // upload safe.
  const { data: already } = await admin
    .from("lesson_files")
    .select("parsed_text")
    .eq("exam_id", examId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  let text: string;
  let chars: number;

  if (already?.parsed_text) {
    text = already.parsed_text;
    chars = text.length;
  } else {
    const { data: blob, error: dlError } = await admin.storage
      .from("lesson-files")
      .download(storagePath);
    if (dlError || !blob) {
      return { error: `Could not read the uploaded file: ${dlError?.message}` };
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const extracted = await extractText(buffer, filename);
    if (!extracted.ok) return { error: extracted.error };

    text = extracted.text;
    chars = extracted.chars;

    // Record the text before removing the file, so a failure between the two
    // cannot lose both.
    await admin.from("lesson_files").insert({
      exam_id: examId,
      uploaded_by_id: user.id,
      storage_path: storagePath,
      parsed_text: text.slice(0, 500_000),
    });
    await removeLessonFile(admin, storagePath);
  }

  // One call per batch, merged. A batch that fails does not lose the ones that
  // worked — a teacher would rather have 45 of 60 than an error message.
  // Report each batch as it lands, so the page can show real progress rather
  // than a bar advancing on a guess.
  const runId = String(formData.get("runId") ?? "");
  const batches = planBatches(mcCount, identCount);

  const say = async (done: number) => {
    if (!runId) return;
    await admin.from("generation_progress").upsert(
      {
        run_id: runId,
        owner_id: user.id,
        done,
        total: batches.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id" },
    );
  };

  // Clear anything abandoned by a run that died. A failed sweep must not stop a
  // teacher generating, but it should not vanish either.
  const { error: sweepError } = await admin
    .from("generation_progress")
    .delete()
    .lt("updated_at", new Date(Date.now() - 3600_000).toISOString());
  if (sweepError) console.warn(`stale progress sweep failed: ${sweepError.message}`);

  await say(0);
  const returned: DraftQuestion[][] = [];
  let keyLabel = "";
  let lastError = "";
  let failedCount = 0;

  for (const batch of batches) {
    const result = await generateQuestions(
      text,
      batch.mc + batch.ident,
      describeMix(batch.mc, batch.ident),
    );

    if (!result.ok) {
      lastError = result.error;
      failedCount++;
      await say(returned.length + failedCount);
      continue;
    }

    keyLabel = result.keyLabel;
    returned.push(result.questions);
    await say(returned.length + failedCount);
  }

  const drafts = mergeDrafts(returned);

  // The run is over either way; leaving the row would make the next one look
  // finished before it started.
  if (runId) await admin.from("generation_progress").delete().eq("run_id", runId);

  if (!drafts.length) {
    return { error: lastError || "The model returned nothing usable." };
  }

  const short = count - drafts.length;

  return {
    drafts,
    sourceChars: chars,
    notice:
      `${drafts.length} draft${drafts.length === 1 ? "" : "s"} from ` +
      `${chars.toLocaleString()} characters` +
      (batches.length > 1 ? ` across ${batches.length} requests` : "") +
      (keyLabel ? `, using key “${keyLabel}”` : "") +
      "." +
      (short > 0
        ? ` You asked for ${count}; ${short} came back repeated or missing, so generate again for the rest.`
        : ""),
  };
}

/**
 * Regenerates a single draft, leaving the others alone. Uses the text already
 * extracted from the uploaded file, so it costs one model call and no re-upload.
 */
export async function regenerateDraft(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  await requireRole("INSTRUCTOR", "ADMIN");

  const examId = String(formData.get("examId") ?? "");
  const index = Number(formData.get("index") ?? -1);
  const wantType = String(formData.get("type") ?? "MULTIPLE_CHOICE");
  const payload = String(formData.get("drafts") ?? "[]");

  let drafts: DraftQuestion[];
  try {
    drafts = JSON.parse(payload);
  } catch {
    return { error: "Could not read the current drafts." };
  }
  if (index < 0 || index >= drafts.length) return { error: "That item is gone." };

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return { error: "Exam not found, or not yours." };

  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lesson_files")
    .select("parsed_text")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lesson?.parsed_text) {
    return { error: "No lesson text on file for this exam — upload the file again." };
  }

  const mix =
    wantType === "IDENTIFICATION" ? describeMix(0, 1) : describeMix(1, 0);
  const result = await generateQuestions(lesson.parsed_text, 1, mix);
  if (!result.ok) return { error: result.error };

  const replacement = result.questions[0];
  if (!replacement) return { error: "The model returned nothing usable — try again." };

  const next = [...drafts];
  next[index] = replacement;
  return { drafts: next, notice: `Item ${index + 1} regenerated.` };
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

  // Confirm the exam is theirs under RLS before the service role sweeps its
  // folder — this is the only place that touches another exam's path shape.
  const { data: ownExam } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .maybeSingle();
  if (!ownExam) return { error: "Exam not found, or not yours." };

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

  // Done with the lesson material: the questions exist now, and anything still
  // in the bucket is a file nobody will read again. Catches uploads whose
  // generation failed as well as the one just used.
  const swept = await sweepLessonFiles(createAdminClient(), examId);

  revalidatePath(`/exams/${examId}`);
  return {
    notice:
      `Added ${added} question${added === 1 ? "" : "s"} to the exam.` +
      (swept ? ` Your uploaded file was deleted.` : ""),
  };
}
