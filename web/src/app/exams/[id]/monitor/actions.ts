"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { gradeAndClose } from "@/lib/grade-session";
import { auditServerAction } from "@/lib/audit";

export type MonitorState = { error?: string; success?: string };

/** Marks a flag as a false positive. RLS limits this to the owning instructor. */
export async function voidFlag(
  _prev: MonitorState,
  formData: FormData,
): Promise<MonitorState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const flagId = String(formData.get("flagId") ?? "");
  const examId = String(formData.get("examId") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flags")
    .update({ resolution: "VOIDED", resolved_by_id: user.id })
    .eq("id", flagId)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Flag not found, or not yours to void." };

  revalidatePath(`/exams/${examId}/monitor`);
  return { success: "Flag voided." };
}

/**
 * Put a student back into a sitting that has already ended.
 *
 * A paper can end for reasons that have nothing to do with the student: a laptop
 * that died, a network that dropped, or — as happened here on 5 September — a
 * proctoring bug that spent three warnings on one alt-tab. Until now the only
 * remedy was none: one sitting per student per exam, and no way to undo it.
 *
 * Deliberately not a wipe. Their answers are kept, because the common case is
 * somebody cut off partway through and telling them to start again would be a
 * second injustice. What is reset is everything that would end the sitting a
 * second time on the strength of the first: the warnings are voided and the
 * clock restarts.
 */
export async function allowRetake(
  _prev: MonitorState,
  formData: FormData,
): Promise<MonitorState> {
  const actor = await requireRole("INSTRUCTOR", "ADMIN");
  const sessionId = String(formData.get("sessionId") ?? "");
  const examId = String(formData.get("examId") ?? "");

  // RLS proves the exam is this teacher's before anything escalates.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, exam_id, status, score")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found, or not yours." };
  if (session.status === "IN_PROGRESS") return { error: "That sitting is still open." };

  const admin = createAdminClient();

  // Warnings from the attempt that ended must not carry into the new one; the
  // strike count is derived from flags that still stand, so leaving them would
  // end the sitting again the moment the student so much as blinked.
  const { data: cleared } = await admin
    .from("flags")
    .update({ resolution: "VOIDED", resolved_by_id: actor.id })
    .eq("session_id", sessionId)
    .is("resolution", null)
    .select("id");

  const { error } = await admin
    .from("exam_sessions")
    .update({
      status: "IN_PROGRESS",
      score: null,
      submitted_at: null,
      submitted_reason: null,
      // Otherwise the old start time makes the timer expire on the first tick.
      started_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  await auditServerAction(actor.id, "allow_retake", "exam_sessions", sessionId, {
    was_scored: session.score,
    flags_cleared: cleared?.length ?? 0,
  });

  // Reopening the sitting is not enough on its own: answering also asks whether
  // the exam itself is open, so a teacher who forgets the window would send the
  // student to a page that refuses their answers without saying why.
  const { data: exam } = await admin
    .from("exams")
    .select("opens_at, closes_at, status")
    .eq("id", session.exam_id)
    .maybeSingle();

  const now = Date.now();
  const shut =
    exam?.status !== "PUBLISHED" ||
    (exam?.opens_at && new Date(exam.opens_at).getTime() > now) ||
    (exam?.closes_at && new Date(exam.closes_at).getTime() <= now);

  revalidatePath(`/exams/${examId}/monitor`);
  return {
    success: shut
      ? "Sitting reopened, but this exam is closed — reopen its window too or they still cannot answer."
      : `Sitting reopened. Answers kept, ${cleared?.length ?? 0} warning${(cleared?.length ?? 0) === 1 ? "" : "s"} cleared, clock restarted.`,
  };
}

export async function forceSubmit(
  _prev: MonitorState,
  formData: FormData,
): Promise<MonitorState> {
  const actor = await requireRole("INSTRUCTOR", "ADMIN");
  const sessionId = String(formData.get("sessionId") ?? "");
  const examId = String(formData.get("examId") ?? "");

  // Confirm ownership under RLS before grading escalates to the service role.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found, or not yours." };
  if (session.status !== "IN_PROGRESS") return { error: "Already submitted." };

  const result = await gradeAndClose(sessionId, "instructor");
  if (!result.ok) return { error: result.error };

  // Grading runs as service role, so the trigger cannot see who did it.
  await auditServerAction(actor.id, "force_submit_session", "exam_sessions", sessionId, {
    score: result.score,
  });

  revalidatePath(`/exams/${examId}/monitor`);
  return { success: `Submitted — scored ${result.score}%.` };
}


/**
 * Void every unresolved flag on this exam, or on one sitting.
 *
 * A wobbly projector or a class told to alt-tab to a reference sheet can raise
 * a flag against everybody at once, and clearing forty of those one at a time
 * is how a teacher learns to ignore flags altogether. RLS still limits this to
 * the owning instructor, and it never touches a flag already resolved.
 */
export async function voidAllFlags(
  _prev: MonitorState,
  formData: FormData,
): Promise<MonitorState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const examId = String(formData.get("examId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!examId) return { error: "Which exam?" };

  const supabase = await createClient();

  // Scope to this exam's sittings; a teacher may own several exams and this
  // button means "these flags", not "all my flags everywhere".
  const { data: sittings } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("exam_id", examId);

  const ids = (sittings ?? [])
    .map((s) => s.id)
    .filter((id) => !sessionId || id === sessionId);
  if (!ids.length) return { error: "Nothing to clear." };

  const { data, error } = await supabase
    .from("flags")
    .update({ resolution: "VOIDED", resolved_by_id: user.id })
    .in("session_id", ids)
    .is("resolution", null)
    .select("id");

  if (error) return { error: error.message };

  await auditServerAction(user.id, "void_flags_bulk", "exams", examId, {
    session_id: sessionId || null,
    voided: data?.length ?? 0,
  });

  revalidatePath(`/exams/${examId}/monitor`);
  return {
    success: data?.length
      ? `${data.length} flag${data.length === 1 ? "" : "s"} voided.`
      : "There was nothing left to void.",
  };
}
