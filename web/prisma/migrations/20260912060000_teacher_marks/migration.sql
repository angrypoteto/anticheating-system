-- A teacher can overrule the answer key, one answer at a time.
--
-- Marking was all-or-nothing and automatic: a submitted paper was scored
-- against the key, and that number was final. An identification answer spelt
-- a little differently, a multiple-choice key that was simply wrong, a fair
-- reading of an ambiguous question — none of it could be put right.
--
-- Each answer now carries an optional teacher's mark. NULL means "as the key
-- marks it"; TRUE or FALSE is the teacher's own decision and wins over the key.
-- Who made it and when are kept beside it. The score is recomputed from the
-- key and these marks together, by the application's own marking code, so it
-- cannot drift from what a fresh submission would get.

ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS marked_correct boolean,
  ADD COLUMN IF NOT EXISTS marked_by_id   uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_at      timestamptz(3);

/**
 * Only whoever manages the exam can set a mark.
 *
 * Students write their own answer rows while they sit (answers_insert_own and
 * answers_update_own), and those policies cover every column — so without
 * this a student could post marked_correct = true alongside their answer. On
 * any write by somebody who does not manage the exam, the mark columns are put
 * back as they were (or left empty on a new row). The service role, which has
 * no auth.uid(), is the application acting on its own authority and passes.
 */
CREATE OR REPLACE FUNCTION private.marks_are_the_teachers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_exam uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.exam_id INTO v_exam FROM public.exam_sessions s WHERE s.id = NEW.session_id;
  IF v_exam IS NOT NULL AND private.may_manage_exam(v_exam) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.marked_correct := NULL;
    NEW.marked_by_id   := NULL;
    NEW.marked_at      := NULL;
  ELSE
    NEW.marked_correct := OLD.marked_correct;
    NEW.marked_by_id   := OLD.marked_by_id;
    NEW.marked_at      := OLD.marked_at;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS answers_marks_are_the_teachers ON public.answers;
CREATE TRIGGER answers_marks_are_the_teachers
  BEFORE INSERT OR UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION private.marks_are_the_teachers();

/**
 * Set, change or clear the teacher's mark on one answer.
 *
 * p_correct TRUE or FALSE overrules the key; NULL hands the answer back to the
 * key. Only for a paper that has been handed in — a sitting still in progress
 * is marked when it ends — and only by whoever manages the exam. The score is
 * recomputed by the caller, which holds the marking code.
 */
CREATE OR REPLACE FUNCTION public.mark_answer(
  p_session_id  uuid,
  p_question_id uuid,
  p_correct     boolean
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_exam   uuid;
  v_status "SessionStatus";
BEGIN
  SELECT s.exam_id, s.status INTO v_exam, v_status
  FROM public.exam_sessions s WHERE s.id = p_session_id;

  IF v_exam IS NULL THEN
    RAISE EXCEPTION 'That sitting has gone.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT private.may_manage_exam(v_exam) THEN
    RAISE EXCEPTION 'That exam is not yours.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status = 'IN_PROGRESS'::"SessionStatus" THEN
    RAISE EXCEPTION 'This paper is still being sat. Mark it once it has been handed in.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.answers
     SET marked_correct = p_correct,
         marked_by_id   = CASE WHEN p_correct IS NULL THEN NULL ELSE (SELECT auth.uid()) END,
         marked_at      = CASE WHEN p_correct IS NULL THEN NULL ELSE now() END
   WHERE session_id = p_session_id AND question_id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That question was left blank, so there is no answer to mark.'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_answer(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_answer(uuid, uuid, boolean) TO authenticated, service_role;
