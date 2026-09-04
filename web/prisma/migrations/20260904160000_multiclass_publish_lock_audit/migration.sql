-- See the three commit messages for the reasoning; this file is the replayable
-- form of the changes applied through the Management API.

-- #4 one exam, several classes
CREATE TABLE IF NOT EXISTS public.exam_sections (
  exam_id    UUID NOT NULL REFERENCES public.exams(id)    ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, section_id)
);
INSERT INTO public.exam_sections (exam_id, section_id)
SELECT id, section_id FROM public.exams ON CONFLICT DO NOTHING;
ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.exam_reaches_my_section(exam_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.exam_sections es
                 WHERE es.exam_id = exam_uuid AND es.section_id = private.my_section_id());
$$;

DROP POLICY IF EXISTS exam_sections_instructor ON public.exam_sections;
CREATE POLICY exam_sections_instructor ON public.exam_sections FOR ALL TO authenticated
  USING (private.owns_exam(exam_id) AND private.instructs_section(section_id))
  WITH CHECK (private.owns_exam(exam_id) AND private.instructs_section(section_id));
DROP POLICY IF EXISTS exam_sections_admin ON public.exam_sections;
CREATE POLICY exam_sections_admin ON public.exam_sections FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS exam_sections_student_read ON public.exam_sections;
CREATE POLICY exam_sections_student_read ON public.exam_sections FOR SELECT TO authenticated
  USING (section_id = private.my_section_id());

DROP POLICY IF EXISTS exams_select_student ON public.exams;
CREATE POLICY exams_select_student ON public.exams FOR SELECT TO authenticated
  USING (status = 'PUBLISHED'::"ExamStatus" AND private.exam_reaches_my_section(id));
DROP POLICY IF EXISTS questions_select_student ON public.questions;
CREATE POLICY questions_select_student ON public.questions FOR SELECT TO authenticated
  USING (exam_id IN (SELECT e.id FROM public.exams e
                     WHERE e.status = 'PUBLISHED'::"ExamStatus"
                       AND private.exam_reaches_my_section(e.id)));

-- #5 published papers are frozen.
-- A single CASE expression would force the SQL engine to resolve every field it
-- names, so NEW.question_id blew up on the questions table; branch with IF, and
-- read OLD on DELETE where NEW is not assigned.
CREATE OR REPLACE FUNCTION private.block_edit_of_published()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_exam_id UUID; v_qid UUID; v_status "ExamStatus";
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    IF TG_OP = 'DELETE' THEN v_exam_id := OLD.exam_id; ELSE v_exam_id := NEW.exam_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_qid := OLD.question_id; ELSE v_qid := NEW.question_id; END IF;
    SELECT q.exam_id INTO v_exam_id FROM public.questions q WHERE q.id = v_qid;
  END IF;
  SELECT status INTO v_status FROM public.exams WHERE id = v_exam_id;
  IF v_status = 'PUBLISHED'::"ExamStatus" THEN
    RAISE EXCEPTION 'This exam is published and its questions can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $fn$;

DROP TRIGGER IF EXISTS questions_frozen_when_published ON public.questions;
CREATE TRIGGER questions_frozen_when_published BEFORE INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION private.block_edit_of_published();
DROP TRIGGER IF EXISTS answers_frozen_when_published ON public.question_answers;
CREATE TRIGGER answers_frozen_when_published BEFORE INSERT OR UPDATE OR DELETE ON public.question_answers
  FOR EACH ROW EXECUTE FUNCTION private.block_edit_of_published();

CREATE OR REPLACE FUNCTION private.block_unpublish()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF OLD.status = 'PUBLISHED'::"ExamStatus" AND NEW.status = 'DRAFT'::"ExamStatus" THEN
    RAISE EXCEPTION 'A published exam cannot go back to draft. Archive it instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS exams_no_unpublish ON public.exams;
CREATE TRIGGER exams_no_unpublish BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION private.block_unpublish();

-- #7 audit student and teacher activity, with retention.
-- answers are deliberately not audited: autosave would bury everything else.
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS audit_retention_days INT NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION private.audit_session_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_actor UUID := COALESCE((SELECT auth.uid()), NEW.student_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'exam_started', 'exam_sessions', NEW.id, jsonb_build_object('exam_id', NEW.exam_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'IN_PROGRESS'::"SessionStatus"
        AND NEW.status <> 'IN_PROGRESS'::"SessionStatus" THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'exam_submitted', 'exam_sessions', NEW.id,
            jsonb_build_object('exam_id', NEW.exam_id, 'status', NEW.status, 'score', NEW.score));
  END IF;
  RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS audit_exam_sessions ON public.exam_sessions;
CREATE TRIGGER audit_exam_sessions AFTER INSERT OR UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION private.audit_session_event();

CREATE OR REPLACE FUNCTION private.audit_flag_raised()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_student UUID;
BEGIN
  SELECT student_id INTO v_student FROM public.exam_sessions WHERE id = NEW.session_id;
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (COALESCE((SELECT auth.uid()), v_student), 'flag_raised', 'flags', NEW.id,
          jsonb_build_object('type', NEW.type, 'strike', NEW.strike_number, 'session_id', NEW.session_id));
  RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS audit_flags ON public.flags;
CREATE TRIGGER audit_flags AFTER INSERT ON public.flags
  FOR EACH ROW EXECUTE FUNCTION private.audit_flag_raised();

CREATE OR REPLACE FUNCTION public.purge_expired_audit_log()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_days INT; v_removed INT;
BEGIN
  SELECT audit_retention_days INTO v_days FROM public.system_settings WHERE id = TRUE;
  IF v_days IS NULL OR v_days <= 0 THEN RETURN 0; END IF;
  DELETE FROM public.audit_log WHERE created_at < NOW() - (v_days || ' days')::interval;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END; $fn$;
REVOKE ALL ON FUNCTION public.purge_expired_audit_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_log() TO service_role;
