import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Logs an action performed with the service role.
 *
 * Writes made through a user's own session are captured by the database triggers
 * instead — those carry auth.uid() and the trigger records them automatically.
 * Service-role writes have no session, so the trigger skips them on purpose and
 * they are recorded here, where the real actor is known. Nothing is logged twice.
 */
export async function auditServerAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata ?? null,
  });

  // An audit write must never take down the action it describes, but a silent
  // failure would leave a gap in the record — so it is surfaced in the logs.
  if (error) console.error("[audit] failed to record", action, error.message);
}
