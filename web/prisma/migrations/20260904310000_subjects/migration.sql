-- Subjects an exam belongs to, typed once and picked thereafter.
--
-- A class already carries a subject, but a class is optional and can be switched
-- off entirely — which leaves an exam with no subject at all, and a teacher
-- retyping "System Administration" onto every paper. This is the list itself,
-- separate from classes, so it survives them being turned off.
--
-- The list is school-wide rather than per teacher. Two teachers of the same
-- subject should not end up with two spellings of it, and a subject name is not
-- private.

CREATE TABLE IF NOT EXISTS public.subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subjects_name_not_blank CHECK (btrim(name) <> '')
);

-- "Mathematics" and "mathematics" are the same subject.
CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_key ON public.subjects (lower(btrim(name)));

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS subject_id UUID
  REFERENCES public.subjects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exams_subject_idx ON public.exams (subject_id);

-- Start the list from the subjects already in use on classes, so a school that
-- has been running with classes on does not begin with an empty picker.
INSERT INTO public.subjects (name)
SELECT DISTINCT btrim(subject) FROM public.sections
WHERE subject IS NOT NULL AND btrim(subject) <> ''
ON CONFLICT DO NOTHING;

-- And point existing exams at the subject of the class they were built for.
UPDATE public.exams e
   SET subject_id = s.id
  FROM public.sections sec
  JOIN public.subjects s ON lower(btrim(s.name)) = lower(btrim(sec.subject))
 WHERE e.section_id = sec.id AND e.subject_id IS NULL;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read the list: a student sees which subject an exam
-- belongs to, and a teacher picks from it.
DROP POLICY IF EXISTS subjects_read ON public.subjects;
CREATE POLICY subjects_read ON public.subjects
  FOR SELECT TO authenticated USING (true);

-- Anyone who can set an exam can name a subject for it. Renaming and deleting
-- stay with admins, because those reach across everybody else's exams.
DROP POLICY IF EXISTS subjects_insert_staff ON public.subjects;
CREATE POLICY subjects_insert_staff ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (private.is_instructor() OR private.is_admin());

DROP POLICY IF EXISTS subjects_admin_all ON public.subjects;
CREATE POLICY subjects_admin_all ON public.subjects
  FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Students read an exam's subject through my_exams() rather than by joining, so
-- it comes back with everything else.
DROP FUNCTION IF EXISTS public.my_exams();
CREATE FUNCTION public.my_exams()
RETURNS TABLE (
  exam_id        UUID,
  title          TEXT,
  subject        TEXT,
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
    subj.name,
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
  LEFT JOIN public.subjects subj ON subj.id = e.subject_id
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
