-- A published exam can be taken back to edit.
--
-- Publishing was one-way: once out, the questions were frozen and the exam
-- could never return to draft. The only move left was Archive, and an archived
-- exam had no way back either — so a teacher who spotted a typo, or a wrong
-- answer key, after publishing had an exam they could neither fix nor send
-- out again.
--
-- The freeze was protecting something real: students may be in the middle of
-- the paper. Changing questions under somebody who is answering them, or
-- pulling the paper away mid-sitting, is what must never happen. So that is
-- the rule now, and nothing broader:
--
--   * Published → draft is allowed, except while any sitting is in progress.
--     Wait for them to submit, or close the exam first.
--   * While published, the questions and keys stay frozen, exactly as before.
--   * Papers already submitted keep the score they were marked with. A
--     question somebody has answered cannot be deleted (their answer points at
--     it), only edited.

CREATE OR REPLACE FUNCTION private.block_unpublish()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF OLD.status = 'PUBLISHED'::"ExamStatus"
     AND NEW.status = 'DRAFT'::"ExamStatus"
     AND EXISTS (
       SELECT 1 FROM public.exam_sessions s
       WHERE s.exam_id = NEW.id AND s.status = 'IN_PROGRESS'::"SessionStatus"
     ) THEN
    RAISE EXCEPTION 'Students are sitting this exam right now. Wait until they have submitted, or close the exam first, then edit it.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
