import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";

export type Missing = {
  /** No name on the account, so every screen falls back to their email. */
  name: boolean;
  /** A student who is in no class, where students are the ones who join. */
  className: boolean;
};

/**
 * What an account still owes before it is usable.
 *
 * Signing in with Google hands over an email address and nothing else. The
 * account is real, the person can reach an exam, and the teacher's monitor then
 * shows a column of gmail addresses with no way to tell who is who — which is
 * exactly what happened here. So the gap is closed once, on the way in, rather
 * than left for the teacher to chase afterwards.
 *
 * A class is asked for only where a student could actually supply one: classes
 * switched on, and self-joining allowed. Where an admin does the enrolling, the
 * student has nothing to answer and is not stopped — registering was never
 * meant to depend on the class settings.
 */
export async function whatIsMissing(profile: {
  id: string;
  role: string;
  full_name: string | null;
}): Promise<Missing> {
  const name = !profile.full_name?.trim();

  let className = false;
  if (profile.role === "STUDENT") {
    const [on, selfJoin] = await Promise.all([
      classesEnabled(),
      classSelfJoinAllowed(),
    ]);
    if (on && selfJoin) {
      // Read past RLS: the counts are about the asker themselves, and the
      // answer decides whether to stop them, so it must not depend on their own
      // policy.
      const admin = createAdminClient();
      const [{ count: mine }, { count: available }] = await Promise.all([
        admin
          .from("enrollments")
          .select("student_id", { count: "exact", head: true })
          .eq("student_id", profile.id),
        admin.from("sections").select("id", { count: "exact", head: true }),
      ]);
      // Nobody is stopped for not having picked from a list that is empty. A
      // school that has not entered its sections yet is not a school where
      // students cannot sign in — and since the gate redirects to the page that
      // asks, and the page would have nothing to ask, the two would have sent
      // the student back and forth between them for ever.
      className = (mine ?? 0) === 0 && (available ?? 0) > 0;
    }
  }

  return { name, className };
}

export function isIncomplete(missing: Missing): boolean {
  return missing.name || missing.className;
}
