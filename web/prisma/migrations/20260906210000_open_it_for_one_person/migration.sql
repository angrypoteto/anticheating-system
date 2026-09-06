-- Letting one student answer a paper that is closed to everybody else.
--
-- Reopening a sitting put the student back in the exam and then left them
-- unable to write in it: answering asks whether the *exam* is open, and the
-- teacher had closed it hours ago. The only remedy on offer was to reopen the
-- whole window — which reopens it for the class, which is not what somebody
-- wants when they are making an allowance for one person who was ill, or whose
-- laptop died, or who was ended by a bug.
--
-- So the allowance is per sitting and it expires. A teacher grants time to a
-- named student, and the grant runs out on its own; nobody has to remember to
-- close a door they opened, which is the failure mode of every permanent
-- exception.

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS reopened_until TIMESTAMPTZ;

COMMENT ON COLUMN public.exam_sessions.reopened_until IS
  'While this is in the future, this one sitting may be answered even though the exam''s own window has closed.';

/**
 * Whether this sitting may be written in at this moment.
 *
 * The exam's window, or an allowance made for this student and not yet expired.
 * Publication is required either way: an allowance is a way past the clock, not
 * a way into an archived paper.
 */
CREATE OR REPLACE FUNCTION private.may_answer(p_session_id uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_sessions s
    JOIN public.exams e ON e.id = s.exam_id
    WHERE s.id = p_session_id
      AND e.status = 'PUBLISHED'::"ExamStatus"
      AND (
        private.exam_is_open(s.exam_id)
        OR (s.reopened_until IS NOT NULL AND NOW() < s.reopened_until)
      )
  );
$fn$;

-- The window question moves out of the policies and into that one function, so
-- the two policies cannot drift apart on it.
DROP POLICY IF EXISTS answers_insert_own ON public.answers;
CREATE POLICY answers_insert_own ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
    )
    AND private.may_answer(session_id)
  );

DROP POLICY IF EXISTS answers_update_own ON public.answers;
CREATE POLICY answers_update_own ON public.answers
  FOR UPDATE TO authenticated
  USING (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
    )
  )
  WITH CHECK (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
    )
    AND private.may_answer(session_id)
  );

/**
 * Give this one student until a moment from now.
 *
 * Measured from when it is granted rather than added to whatever was there
 * before: pressing it twice by accident should not quietly hand out an hour.
 */
CREATE OR REPLACE FUNCTION public.extend_sitting(p_session_id uuid, p_minutes integer DEFAULT 30)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_exam UUID;
  v_until TIMESTAMPTZ;
  -- Bounded at both ends: a slip of the keyboard should not grant a week, and
  -- an allowance shorter than a few minutes is not one.
  v_minutes INT := LEAST(GREATEST(COALESCE(p_minutes, 30), 5), 480);
BEGIN
  SELECT s.exam_id INTO v_exam FROM public.exam_sessions s WHERE s.id = p_session_id;
  IF v_exam IS NULL THEN
    RAISE EXCEPTION 'That sitting has gone.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT private.may_manage_exam(v_exam) THEN
    RAISE EXCEPTION 'That exam is not yours.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_until := NOW() + make_interval(mins => v_minutes);
  UPDATE public.exam_sessions SET reopened_until = v_until WHERE id = p_session_id;
  RETURN v_until;
END;
$fn$;

/** Take the allowance back, without waiting for it to run out. */
CREATE OR REPLACE FUNCTION public.end_extension(p_session_id uuid)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_exam UUID;
BEGIN
  SELECT s.exam_id INTO v_exam FROM public.exam_sessions s WHERE s.id = p_session_id;
  IF v_exam IS NULL THEN
    RAISE EXCEPTION 'That sitting has gone.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT private.may_manage_exam(v_exam) THEN
    RAISE EXCEPTION 'That exam is not yours.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.exam_sessions SET reopened_until = NULL WHERE id = p_session_id;
  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.extend_sitting(uuid, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.end_extension(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.extend_sitting(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_extension(uuid) TO authenticated;
