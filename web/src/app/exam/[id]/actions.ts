"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { gradeAndClose } from "@/lib/grade-session";
import { parseReason, type SubmitReason } from "@/lib/submission";

export type SubmitState = {
  error?: string;
  submitted?: boolean;
  score?: number;
  /** Why it ended, so the runner can say so rather than just "submitted". */
  reason?: SubmitReason;
};

export async function submitExam(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const user = await requireRole("STUDENT", "INSTRUCTOR", "ADMIN");
  const sessionId = String(formData.get("sessionId") ?? "");
  const raw = String(formData.get("reason") ?? "manual");
  const reason = (["manual", "timeout", "strikes"] as const).includes(
    raw as "manual" | "timeout" | "strikes",
  )
    ? (raw as "manual" | "timeout" | "strikes")
    : "manual";

  // Read through the caller's own session so RLS proves the session is theirs
  // before grading escalates to the service role.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, exam_id, student_id, status, score, submitted_reason")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found." };
  if (session.student_id !== user.id) return { error: "Not your session." };
  // Already closed — a second submit, or a tab that did not know. Answer with
  // what the record says rather than a bare "submitted".
  if (session.status !== "IN_PROGRESS") {
    return {
      submitted: true,
      score: session.score ?? undefined,
      reason: parseReason(session.submitted_reason) ?? undefined,
    };
  }

  const result = await gradeAndClose(sessionId, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/exam/${session.exam_id}`);
  return { submitted: true, score: result.score, reason: result.reason };
}
