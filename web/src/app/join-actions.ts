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
export async function joinSection(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  await requireRole("STUDENT");

  const sectionId = String(formData.get("sectionId") ?? "").trim();
  if (!sectionId) return { error: "Choose a section from the list." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_section", { p_section_id: sectionId });

  if (error) {
    // join_section() is the authority — it refuses a section that has gone, an
    // inactive account, and a school that assigns classes itself.
    if (/no longer exists/i.test(error.message)) {
      return { error: "That section has been removed. Ask your teacher." };
    }
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: "Joined. The subject's exams will show up below." };
}
