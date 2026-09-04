-- When an exam is open.
--
-- Publishing used to mean "available from now until archived", so a teacher who
-- wanted a paper sat between 8am and 9am had to be at their desk twice. An exam
-- now carries a window, and closing or reopening by hand is just editing that
-- window rather than a separate piece of state that could disagree with it.
--
--   opens_at  NULL - open the moment it is published
--   closes_at NULL - stays open until archived
--
-- The window governs *sitting* the exam, never *seeing* it: a student must still
-- be able to read their own result after the paper closes, and the teacher must
-- still be able to open a closed exam's monitor.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS opens_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_window_order;
-- Equal is allowed, and means what it says: a window of no length, so the exam
-- was never open. That is exactly the state of an exam scheduled for tomorrow
-- that a teacher closes today. A close *before* an open is still nonsense.
ALTER TABLE public.exams ADD CONSTRAINT exams_window_order
  CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at >= opens_at);

-- The one place "can this be sat right now" is decided.
CREATE OR REPLACE FUNCTION private.exam_is_open(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_uuid
      AND e.status = 'PUBLISHED'::"ExamStatus"
      AND (e.opens_at  IS NULL OR NOW() >= e.opens_at)
      AND (e.closes_at IS NULL OR NOW() <  e.closes_at)
  );
$fn$;

-- Starting a sitting now asks the window as well as the roll.
DROP POLICY IF EXISTS exam_sessions_insert_own ON public.exam_sessions;
CREATE POLICY exam_sessions_insert_own ON public.exam_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND private.can_sit_exam(exam_id)
    AND private.exam_is_open(exam_id)
  );

-- And so does answering. Without this the window would only stop people
-- starting: anybody already in the paper could keep writing past the close.
DROP POLICY IF EXISTS answers_insert_own ON public.answers;
CREATE POLICY answers_insert_own ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
        AND private.exam_is_open(s.exam_id)
    )
  );

DROP POLICY IF EXISTS answers_update_own ON public.answers;
CREATE POLICY answers_update_own ON public.answers
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
        AND private.exam_is_open(s.exam_id)
    )
  );

-- The student dashboard needs the window to say "opens Friday" or "closed", so
-- it comes back with everything else rather than through a second query the
-- policies would have to allow.
-- The shape of the result changes, and Postgres will not replace a function
-- whose OUT parameters differ, so it has to be dropped first.
DROP FUNCTION IF EXISTS public.my_exams();
CREATE FUNCTION public.my_exams()
RETURNS TABLE (
  exam_id        UUID,
  title          TEXT,
  teacher        TEXT,
  total_minutes  INT,
  question_count INT,
  session_status TEXT,
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  score          DOUBLE PRECISION,
  pass_mark      NUMERIC,
  passed         BOOLEAN,
  opens_at       TIMESTAMPTZ,
  closes_at      TIMESTAMPTZ,
  is_open        BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    e.id,
    e.title,
    COALESCE(NULLIF(btrim(t.full_name), ''), t.email, 'Your teacher'),
    COALESCE((e.timer_config ->> 'totalMinutes')::INT, 0),
    (SELECT COUNT(*)::INT FROM public.questions q WHERE q.exam_id = e.id),
    s.status::TEXT,
    s.started_at,
    s.submitted_at,
    s.score,
    st.pass_threshold,
    CASE WHEN s.score IS NULL THEN NULL ELSE s.score >= st.pass_threshold END,
    e.opens_at,
    e.closes_at,
    private.exam_is_open(e.id)
  FROM public.exams e
  LEFT JOIN public.users t ON t.id = e.created_by_id
  LEFT JOIN public.exam_sessions s
         ON s.exam_id = e.id AND s.student_id = (SELECT auth.uid())
  CROSS JOIN (SELECT pass_threshold FROM public.system_settings WHERE id) st
  WHERE e.status = 'PUBLISHED'::"ExamStatus"
    AND private.can_sit_exam(e.id)
  ORDER BY s.submitted_at DESC NULLS FIRST, e.created_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.my_exams() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_exams() TO authenticated;

-- Closing and reopening happen on the database's clock, not the app server's.
--
-- Setting closes_at from JavaScript looked right and was not: exam_is_open()
-- compares against NOW() inside Postgres, so a couple of seconds of skew
-- between the two machines left the exam startable after "Close now" said it
-- was shut. Whichever clock enforces the rule has to be the clock that sets it.
CREATE OR REPLACE FUNCTION public.close_exam(exam_uuid uuid)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  stamp TIMESTAMPTZ := NOW();
BEGIN
  IF NOT private.owns_exam(exam_uuid) AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'That is not your exam.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.exams
     SET closes_at = stamp,
         -- A close cannot land before the opening, and an exam scheduled for
         -- later that is closed now was never open at all.
         opens_at = LEAST(COALESCE(opens_at, stamp), stamp)
   WHERE id = exam_uuid;

  RETURN stamp;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.open_exam(exam_uuid uuid)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  stamp TIMESTAMPTZ := NOW();
BEGIN
  IF NOT private.owns_exam(exam_uuid) AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'That is not your exam.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Clear the close, and pull a future opening forward so the exam is actually
  -- open rather than merely un-closed.
  UPDATE public.exams
     SET closes_at = NULL,
         opens_at = CASE WHEN opens_at > stamp THEN NULL ELSE opens_at END
   WHERE id = exam_uuid;

  RETURN stamp;
END;
$fn$;

REVOKE ALL ON FUNCTION public.close_exam(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_exam(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_exam(uuid) TO authenticated;
