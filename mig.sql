-- ============ #4 one exam, several classes ============
-- A teacher already owns many classes (sections.instructor_id is one-to-many),
-- but an exam pointed at exactly one class, so the same paper had to be rebuilt
-- per class. exams.section_id stays as the owning class; exam_sections lists
-- every class the paper is delivered to.
CREATE TABLE IF NOT EXISTS public.exam_sections (
  exam_id    UUID NOT NULL REFERENCES public.exams(id)    ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, section_id)
);

INSERT INTO public.exam_sections (exam_id, section_id)
SELECT id, section_id FROM public.exams
ON CONFLICT DO NOTHING;

ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.exam_reaches_my_section(exam_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exam_sections es
    WHERE es.exam_id = exam_uuid AND es.section_id = private.my_section_id()
  );
$$;

DROP POLICY IF EXISTS exam_sections_instructor ON public.exam_sections;
CREATE POLICY exam_sections_instructor ON public.exam_sections
  FOR ALL TO authenticated
  USING (private.owns_exam(exam_id) AND private.instructs_section(section_id))
  WITH CHECK (private.owns_exam(exam_id) AND private.instructs_section(section_id));

DROP POLICY IF EXISTS exam_sections_admin ON public.exam_sections;
CREATE POLICY exam_sections_admin ON public.exam_sections
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS exam_sections_student_read ON public.exam_sections;
CREATE POLICY exam_sections_student_read ON public.exam_sections
  FOR SELECT TO authenticated
  USING (section_id = private.my_section_id());

-- Students now reach an exam through any class it was published to.
DROP POLICY IF EXISTS exams_select_student ON public.exams;
CREATE POLICY exams_select_student ON public.exams
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED'::"ExamStatus" AND private.exam_reaches_my_section(id));

DROP POLICY IF EXISTS questions_select_student ON public.questions;
CREATE POLICY questions_select_student ON public.questions
  FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT e.id FROM public.exams e
      WHERE e.status = 'PUBLISHED'::"ExamStatus" AND private.exam_reaches_my_section(e.id)
    )
  );

-- ============ #5 published papers are frozen ============
-- Students may already have answered, so the paper must not change underneath
-- them, and a published exam cannot quietly return to draft to get around it.
CREATE OR REPLACE FUNCTION private.block_edit_of_published()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_exam_id UUID;
  v_status  "ExamStatus";
BEGIN
  v_exam_id := COALESCE(
    CASE TG_TABLE_NAME
      WHEN 'questions' THEN COALESCE(NEW.exam_id, OLD.exam_id)
      WHEN 'question_answers' THEN (
        SELECT q.exam_id FROM public.questions q
        WHERE q.id = COALESCE(NEW.question_id, OLD.question_id)
      )
    END
  );

  SELECT status INTO v_status FROM public.exams WHERE id = v_exam_id;

  IF v_status = 'PUBLISHED'::"ExamStatus" THEN
    RAISE EXCEPTION 'This exam is published and its questions can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS questions_frozen_when_published ON public.questions;
CREATE TRIGGER questions_frozen_when_published
  BEFORE INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION private.block_edit_of_published();

DROP TRIGGER IF EXISTS answers_frozen_when_published ON public.question_answers;
CREATE TRIGGER answers_frozen_when_published
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_answers
  FOR EACH ROW EXECUTE FUNCTION private.block_edit_of_published();

CREATE OR REPLACE FUNCTION private.block_unpublish()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'PUBLISHED'::"ExamStatus"
     AND NEW.status = 'DRAFT'::"ExamStatus" THEN
    RAISE EXCEPTION 'A published exam cannot go back to draft. Archive it instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exams_no_unpublish ON public.exams;
CREATE TRIGGER exams_no_unpublish
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION private.block_unpublish();
