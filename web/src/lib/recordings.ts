import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { RECORDING_BUCKET } from "@/lib/screen-recorder";

/**
 * Remove every screen recording of these sittings from Storage.
 *
 * The rows go with their sittings (the table cascades), but the video is in
 * Storage, which the database cannot reach — so whoever deletes an exam or an
 * account calls this for the sittings that went with it. Best effort, like the
 * lesson-file cleanup beside it: a completed deletion is not failed over a
 * leftover file.
 */
export async function removeRecordings(sessionIds: string[]) {
  if (!sessionIds.length) return;
  try {
    const bucket = createAdminClient().storage.from(RECORDING_BUCKET);
    for (const id of sessionIds) {
      const { data: left } = await bucket.list(id, { limit: 1000 });
      const paths = (left ?? []).map((x) => `${id}/${x.name}`);
      // remove() takes a bounded list; a long sitting has a few hundred pieces.
      for (let i = 0; i < paths.length; i += 500) {
        await bucket.remove(paths.slice(i, i + 500));
      }
    }
  } catch {
    // Nothing the person deleting can do about it, and the data is already gone.
  }
}

/** The sittings an exam or a student has, read before they are deleted. */
export async function sittingsOf(filter: { examId: string } | { studentId: string }) {
  const admin = createAdminClient();
  const { data } =
    "examId" in filter
      ? await admin.from("exam_sessions").select("id").eq("exam_id", filter.examId)
      : await admin.from("exam_sessions").select("id").eq("student_id", filter.studentId);
  return (data ?? []).map((s) => s.id as string);
}
