-- A single CASE expression forces the SQL engine to resolve every field named
-- inside it, so NEW.question_id blew up on the questions table even when that
-- branch was not taken. Branch with IF instead, and read OLD on DELETE where
-- NEW is not assigned at all.
CREATE OR REPLACE FUNCTION private.block_edit_of_published()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_exam_id UUID;
  v_qid     UUID;
  v_status  "ExamStatus";
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
END;
$fn$;
