-- What a student should see about their own exams.
--
-- The dashboard wants the date they sat it, who set it, their score and whether
-- that is a pass. Most of that they can already read; the teacher's name they
-- cannot, because a student has no SELECT on anybody else's row in users — and
-- opening one would hand over the whole row, since RLS restricts rows and not
-- columns. That is the trap this schema has fallen into three times.
--
-- So instead of widening a policy, one SECURITY DEFINER function returns
-- exactly the columns the screen needs, for exactly the caller's own sittings.
-- It answers only for auth.uid(), so there is nothing to leak by asking it
-- about somebody else.

CREATE OR REPLACE FUNCTION public.my_exams()
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
  passed         BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    e.id,
    e.title,
    -- A teacher who has filled in their profile is shown by name; otherwise the
    -- address the exam came from, which is the next most useful thing a student
    -- can act on.
    COALESCE(NULLIF(btrim(t.full_name), ''), t.email, 'Your teacher'),
    COALESCE((e.timer_config ->> 'totalMinutes')::INT, 0),
    (SELECT COUNT(*)::INT FROM public.questions q WHERE q.exam_id = e.id),
    s.status::TEXT,
    s.started_at,
    s.submitted_at,
    s.score,
    st.pass_threshold,
    CASE
      WHEN s.score IS NULL THEN NULL
      ELSE s.score >= st.pass_threshold
    END
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
