-- Where each student is in the paper, for the teacher watching it live.
--
-- The monitor could say how many answers a sitting had saved, but not which
-- question the student was looking at — and on a forward-only paper with
-- per-question timers those drift apart. The runner now reports its position
-- as it moves, and the monitor hears it on the exam_sessions stream it already
-- listens to.
--
-- current_question is 1-based, in the student's own order; 0 means they have
-- reached the end and are checking their answers; NULL means not yet known.

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS current_question integer;

/**
 * The student's own report of where they are.
 *
 * A function rather than an update policy: students have no update rights on
 * their sitting at all (its status and score are not theirs to write), and a
 * policy cannot be narrowed to one column. This touches only the position, only
 * on the caller's own sitting, and only while it is still being sat.
 */
CREATE OR REPLACE FUNCTION public.report_position(
  p_session_id uuid,
  p_number     integer
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_exam  uuid;
  v_count integer;
BEGIN
  SELECT s.exam_id INTO v_exam
  FROM public.exam_sessions s
  WHERE s.id = p_session_id
    AND s.student_id = (SELECT auth.uid())
    AND s.status = 'IN_PROGRESS'::"SessionStatus";

  IF v_exam IS NULL THEN
    RETURN; -- not theirs, or already handed in: nothing to say
  END IF;

  SELECT count(*) INTO v_count FROM public.questions q WHERE q.exam_id = v_exam;
  IF p_number IS NULL OR p_number < 0 OR p_number > v_count THEN
    RAISE EXCEPTION 'No such question.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.exam_sessions
     SET current_question = p_number
   WHERE id = p_session_id
     AND current_question IS DISTINCT FROM p_number;
END;
$fn$;

REVOKE ALL ON FUNCTION public.report_position(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_position(uuid, integer) TO authenticated, service_role;
