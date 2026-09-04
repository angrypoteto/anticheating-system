-- Subjects, and a student who takes more than one of them.
--
-- A "section" used to be a single group of students with one join code, and
-- users.section_id put each student in exactly one. That cannot describe a real
-- timetable: BSIT 4C sits System Administration and Networking and Capstone,
-- each with its own teacher and its own code.
--
-- So a row in sections is now a *class* in the Google Classroom sense — one
-- subject taught to one section, carrying its own join code — and enrolment
-- becomes many-to-many. The table keeps its name because every policy, foreign
-- key and query in the system already says section_id; renaming it would be a
-- large change that buys nothing the comment above doesn't.

ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS subject TEXT;

-- Same subject, same section, twice is a mistake rather than a timetable.
CREATE UNIQUE INDEX IF NOT EXISTS sections_subject_name_key
  ON public.sections (lower(coalesce(subject, '')), lower(name));

CREATE TABLE IF NOT EXISTS public.enrollments (
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, section_id)
);

CREATE INDEX IF NOT EXISTS enrollments_section_idx ON public.enrollments (section_id);

-- Carry every existing placement across before anything starts reading the new
-- table, so nobody loses their class.
INSERT INTO public.enrollments (student_id, section_id)
SELECT id, section_id FROM public.users
WHERE section_id IS NOT NULL AND role = 'STUDENT'::"Role"
ON CONFLICT DO NOTHING;

-- Every class a student is in. Replaces my_section_id(), which could only ever
-- name one.
CREATE OR REPLACE FUNCTION private.my_section_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT section_id FROM public.enrollments WHERE student_id = (SELECT auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION private.exam_reaches_my_section(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.exam_sections es
    WHERE es.exam_id = exam_uuid
      AND es.section_id IN (SELECT private.my_section_ids())
  );
$fn$;

-- Does the caller teach any class this student sits in?
CREATE OR REPLACE FUNCTION private.teaches_student(student_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.sections s ON s.id = e.section_id
    WHERE e.student_id = student_uuid AND s.instructor_id = (SELECT auth.uid())
  );
$fn$;

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollments_admin_all ON public.enrollments;
CREATE POLICY enrollments_admin_all ON public.enrollments
  FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS enrollments_select_own ON public.enrollments;
CREATE POLICY enrollments_select_own ON public.enrollments
  FOR SELECT TO authenticated USING (student_id = (SELECT auth.uid()));

-- A teacher manages the roll of the classes they teach, and no others.
DROP POLICY IF EXISTS enrollments_instructor ON public.enrollments;
CREATE POLICY enrollments_instructor ON public.enrollments
  FOR ALL TO authenticated
  USING (private.instructs_section(section_id))
  WITH CHECK (private.instructs_section(section_id));

-- Students join by code, never by guessing a section id: there is deliberately
-- no student INSERT policy, so this function is the only way in. It is also the
-- only place that decides a code is valid.
CREATE OR REPLACE FUNCTION public.join_class(code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  target UUID;
  caller UUID := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO target FROM public.sections
   WHERE upper(join_code) = upper(btrim(code));

  IF target IS NULL THEN
    RAISE EXCEPTION 'That class code does not match any class.'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.enrollments (student_id, section_id)
  VALUES (caller, target)
  ON CONFLICT DO NOTHING;

  RETURN target;
END;
$fn$;

REVOKE ALL ON FUNCTION public.join_class(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_class(TEXT) TO authenticated;

-- Repoint everything that assumed one class per student.
DROP POLICY IF EXISTS exam_sections_student_read ON public.exam_sections;
CREATE POLICY exam_sections_student_read ON public.exam_sections
  FOR SELECT TO authenticated
  USING (section_id IN (SELECT private.my_section_ids()));

DROP POLICY IF EXISTS sections_select_member ON public.sections;
CREATE POLICY sections_select_member ON public.sections
  FOR SELECT TO authenticated
  USING (
    instructor_id = (SELECT auth.uid())
    OR id IN (SELECT private.my_section_ids())
  );

DROP POLICY IF EXISTS users_select_instructor ON public.users;
CREATE POLICY users_select_instructor ON public.users
  FOR SELECT TO authenticated
  USING (private.is_instructor() AND private.teaches_student(id));

-- users.section_id is now enrollments' job. Drop it rather than leave a second
-- answer to "which class is this student in" for someone to read by mistake —
-- the trigger that guards profile edits has to stop naming it in the same
-- breath, or it fails on the next update.
CREATE OR REPLACE FUNCTION private.protect_user_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF NEW.id <> OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only your name and username can be changed here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP FUNCTION IF EXISTS private.my_section_id();
ALTER TABLE public.users DROP COLUMN IF EXISTS section_id;
