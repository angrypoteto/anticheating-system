"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { gradeAndClose } from "@/lib/grade-session";

export type SubmitState = { error?: string; submitted?: boolean; score?: number };

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
    .select("id, exam_id, student_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found." };
  if (session.student_id !== user.id) return { error: "Not your session." };
  if (session.status !== "IN_PROGRESS") return { submitted: true };

  const result = await gradeAndClose(sessionId, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/exam/${session.exam_id}`);
  return { submitted: true, score: result.score };
}
