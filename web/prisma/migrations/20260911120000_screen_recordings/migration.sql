-- Screen recordings, so a teacher can see what a flag actually was.
--
-- A flag says "left fullscreen at 10:42:13". It cannot say whether that was a
-- notification, a student opening the answers in another window, or a laptop
-- going to sleep — and a teacher deciding whether to void it had nothing but
-- the word. With the screen recorded for the whole sitting, every flag becomes
-- a moment in a video that can be watched.
--
-- What is stored where:
--
--   * The video is in Storage, in 30-second pieces, under the sitting's id:
--       screen-recordings/<session_id>/<recording_id>_<seq>_<offset_ms>_<duration_ms>.webm
--     Each piece is a complete file on its own, so a sitting that ends badly
--     loses at most the piece that was being recorded, and each one can be
--     played and seeked without the others.
--   * One row per recording in screen_recordings. A sitting can have several —
--     a student who stops sharing and shares again, or reloads, starts a new one.
--
-- The clock. Flags are stamped by the database (record_flag uses now()), and a
-- student's laptop clock can be minutes out. So a recording's start is stamped
-- by the database too, in begin_screen_recording(), and every piece is placed by
-- its offset from that stamp, measured on the browser's monotonic clock. Both
-- ends of a "flag at 12:04 into the video" are then read off the same clock.

-- Stopping the share mid-exam is a signal in its own right: the recording has
-- gone dark. It is recorded like a departure and merged like one.
ALTER TYPE "FlagType" ADD VALUE IF NOT EXISTS 'SCREEN_SHARE_ENDED';

CREATE TABLE public.screen_recordings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.exam_sessions (id) ON DELETE CASCADE,
  -- Database time, so it sits on the same clock as flags.occurred_at.
  started_at  timestamptz(3) NOT NULL DEFAULT now(),
  mime_type   text NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX screen_recordings_session_idx
  ON public.screen_recordings (session_id, started_at);

ALTER TABLE public.screen_recordings ENABLE ROW LEVEL SECURITY;

-- Whoever may manage the exam may see its recordings. Students get no policy:
-- they make recordings, they do not review them.
CREATE POLICY screen_recordings_manager_select ON public.screen_recordings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions s
      WHERE s.id = session_id AND private.may_manage_exam(s.exam_id)
    )
  );

/**
 * Open a recording for the caller's own live sitting, stamped by the database.
 *
 * The row is created here rather than by an insert policy so the student gets
 * the database's own start time back — the anchor every piece is placed from.
 */
CREATE OR REPLACE FUNCTION public.begin_screen_recording(
  p_session_id uuid,
  p_mime_type  text
) RETURNS TABLE (id uuid, started_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_sessions s
    WHERE s.id = p_session_id
      AND s.student_id = (SELECT auth.uid())
      AND s.status = 'IN_PROGRESS'::"SessionStatus"
  ) THEN
    RAISE EXCEPTION 'no live sitting of yours with that id'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  INSERT INTO public.screen_recordings AS r (session_id, mime_type)
  VALUES (p_session_id, left(coalesce(p_mime_type, ''), 100))
  RETURNING r.id, r.started_at;
END;
$fn$;

REVOKE ALL ON FUNCTION public.begin_screen_recording(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.begin_screen_recording(uuid, text) TO authenticated;

-- --- Storage ------------------------------------------------------------------

-- Private: a recording of somebody's screen is never publicly fetchable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'screen-recordings', 'screen-recordings', FALSE, 52428800,  -- 50 MB a piece
  ARRAY['video/webm', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

/**
 * May the caller add a piece under this folder?
 *
 * Only to their own sitting, and only while it is live — plus a short grace
 * after it ends, because the last piece is still uploading when the paper is
 * submitted (by the student, the clock, or the teacher). Takes the folder as
 * text: a path that is not a uuid is simply refused rather than raising.
 */
CREATE OR REPLACE FUNCTION private.may_upload_recording(p_folder text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  -- CASE, not AND: SQL does not promise to test the pattern before the cast,
  -- and a cast of something that is not a uuid raises rather than refusing.
  SELECT CASE
    WHEN p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      EXISTS (
        SELECT 1 FROM public.exam_sessions s
        WHERE s.id = p_folder::uuid
          AND s.student_id = (SELECT auth.uid())
          AND (
            s.status = 'IN_PROGRESS'::"SessionStatus"
            OR s.submitted_at > now() - interval '15 minutes'
          )
      )
    ELSE false
  END;
$fn$;

/** May the caller watch the pieces under this folder? Whoever manages the exam. */
CREATE OR REPLACE FUNCTION private.may_review_recording(p_folder text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      EXISTS (
        SELECT 1 FROM public.exam_sessions s
        WHERE s.id = p_folder::uuid AND private.may_manage_exam(s.exam_id)
      )
    ELSE false
  END;
$fn$;

GRANT EXECUTE ON FUNCTION private.may_upload_recording(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.may_review_recording(text) TO authenticated;

CREATE POLICY screen_recordings_student_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'screen-recordings'
    AND private.may_upload_recording((storage.foldername(name))[1])
  );

CREATE POLICY screen_recordings_manager_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'screen-recordings'
    AND private.may_review_recording((storage.foldername(name))[1])
  );

CREATE POLICY screen_recordings_manager_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'screen-recordings'
    AND private.may_review_recording((storage.foldername(name))[1])
  );

-- --- The default for new exams ------------------------------------------------

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS default_record_screen boolean NOT NULL DEFAULT true;
