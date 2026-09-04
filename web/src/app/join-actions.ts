"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export type JoinState = { error?: string; success?: string };

/**
 * Join a class from its code.
 *
 * This runs as the student, not the service role, and calls join_class() —
 * a SECURITY DEFINER function that is the only path into the enrollments
 * table for a student. There is deliberately no student INSERT policy, so a
 * crafted request cannot enrol someone into a class whose code they never had.
 */
export async function joinClass(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  await requireRole("STUDENT");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the class code your teacher gave you." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_class", { code });

  if (error) {
    return /does not match/i.test(error.message)
      ? { error: "That code doesn't match any class. Check it with your teacher." }
      : { error: error.message };
  }

  revalidatePath("/");
  return { success: "Joined. The subject's exams will show up below." };
}
