"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
