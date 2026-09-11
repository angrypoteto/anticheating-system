-- A flag for a browser extension working on the exam page.
--
-- A page cannot turn extensions off, but it can see one touch it: an injected
-- sidebar, a script loaded from an extension's address, a marker attribute.
-- The runner now reports those as EXTENSION_DETECTED, with what it saw in the
-- new `detail` column (an extension id can be looked up in the browser's store).
--
-- They are evidence, not strikes. Plenty of harmless extensions touch every
-- page they load — antivirus link checkers, dark-mode themes, password
-- managers — and a student auto-submitted because their antivirus stamped an
-- attribute on the page would be punished for nothing. So these rows carry
-- strike number 0, never count toward the limit, never merge with a real
-- departure, and are left for the teacher to judge beside the recording.
--
-- The new enum value cannot be used in this same transaction, so the code below
-- compares types as text.

ALTER TYPE "FlagType" ADD VALUE IF NOT EXISTS 'EXTENSION_DETECTED';

ALTER TABLE public.flags ADD COLUMN IF NOT EXISTS detail text;

-- Warnings that still stand against a sitting: extension findings are not any.
CREATE OR REPLACE FUNCTION private.live_strikes(p_session_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(COUNT(DISTINCT f.strike_number), 0)::int
  FROM public.flags f
  WHERE f.session_id = p_session_id
    AND f.resolution IS NULL
    AND f.type::text <> 'EXTENSION_DETECTED';
$fn$;

-- The signature grows a parameter, so the old one goes first; calls that pass
-- three arguments (the runner's beacon, for one) still match the new one.
DROP FUNCTION IF EXISTS public.record_flag(uuid, "FlagType", uuid);

CREATE FUNCTION public.record_flag(
  p_session_id  uuid,
  p_type        "FlagType",
  p_question_id uuid DEFAULT NULL,
  p_detail      text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last_at timestamptz;
  v_last_no integer;
  v_max_no  integer;
  v_no      integer;
BEGIN
  PERFORM 1
  FROM public.exam_sessions s
  WHERE s.id = p_session_id
    AND s.student_id = (SELECT auth.uid())
    AND s.status = 'IN_PROGRESS'::"SessionStatus"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no live sitting of yours with that id'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Evidence for the teacher, not a strike: recorded and answered with the
  -- count as it already stands.
  IF p_type::text = 'EXTENSION_DETECTED' THEN
    INSERT INTO public.flags (session_id, type, strike_number, question_id, detail)
    VALUES (p_session_id, p_type, 0, p_question_id, left(p_detail, 300));
    RETURN private.live_strikes(p_session_id);
  END IF;

  SELECT COALESCE(MAX(f.strike_number), 0) INTO v_max_no
  FROM public.flags f WHERE f.session_id = p_session_id;

  -- The last *departure*: a honeypot is not one, and nor is an extension.
  SELECT f.occurred_at, f.strike_number INTO v_last_at, v_last_no
  FROM public.flags f
  WHERE f.session_id = p_session_id
    AND f.type::text NOT IN ('HONEYPOT', 'EXTENSION_DETECTED')
    AND f.resolution IS NULL
  ORDER BY f.occurred_at DESC
  LIMIT 1;

  IF p_type = 'HONEYPOT'::"FlagType" THEN
    v_no := v_max_no + 1;
  ELSIF v_last_no IS NOT NULL
    AND NOW() - v_last_at <= private.flag_settle_window() THEN
    v_no := v_last_no;
  ELSE
    v_no := v_max_no + 1;
  END IF;

  INSERT INTO public.flags (session_id, type, strike_number, question_id, detail)
  VALUES (p_session_id, p_type, v_no, p_question_id, left(p_detail, 300));

  RETURN private.live_strikes(p_session_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_flag(uuid, "FlagType", uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_flag(uuid, "FlagType", uuid, text) TO authenticated, service_role;

-- What a student is shown about their own warnings: extension findings are
-- not warnings, so they are not listed as one.
CREATE OR REPLACE FUNCTION public.my_strike_log(p_session_id uuid)
RETURNS TABLE(kind "FlagType", at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT DISTINCT ON (f.strike_number) f.type, f.occurred_at
  FROM public.flags f
  WHERE f.resolution IS NULL
    AND f.type::text <> 'EXTENSION_DETECTED'
    AND f.session_id = (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.id = p_session_id AND s.student_id = (SELECT auth.uid())
    )
  ORDER BY f.strike_number,
    CASE f.type::text
      WHEN 'HONEYPOT'        THEN 0
      WHEN 'TAB_SWITCH'      THEN 1
      WHEN 'FULLSCREEN_EXIT' THEN 2
      ELSE 3
    END,
    f.occurred_at;
$fn$;
