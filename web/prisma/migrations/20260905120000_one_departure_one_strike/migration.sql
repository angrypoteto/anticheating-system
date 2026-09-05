-- The strike count belongs to the database, not to a browser tab.
--
-- A real sitting, recorded on 5 September: four flags in one second and
-- fifty-eight milliseconds, the paper auto-submitted blank, and two of those
-- four numbered "strike 1".
--
--     13:43:22.741  WINDOW_BLUR      #1
--     13:43:23.924  WINDOW_BLUR      #1     <- a second tally, starting over
--     13:43:24.137  TAB_SWITCH       #2
--     13:43:24.630  FULLSCREEN_EXIT  #3     <- three strikes, exam over
--
-- Two rows carrying the same strike number cannot come from one counter, so
-- there were two: the count lived in a React ref that starts at zero for every
-- mount. Open the exam in a second tab, or reload the page, and the browser has
-- a fresh tally that knows nothing of the first — while the *limit* is checked
-- against whichever tally happens to be counting. lib/departure.ts collapses one
-- departure into one strike, and it works, but it can only collapse the events
-- one tab sees. The arithmetic had no single home.
--
-- It has one now. The count is derived from the flags themselves, under a lock
-- on the session row so simultaneous tabs cannot interleave, and the events of a
-- single departure share a strike number instead of each spending one.
--
-- Two rules decide the number:
--
--   * Signals close together are one departure. Alt-tabbing out of a fullscreen
--     exam blurs the window, hides the document and ends fullscreen, in any
--     order, within a moment. Coming back and leaving again takes a person
--     appreciably longer than the settle window, so a genuine second departure
--     still earns a second strike.
--   * A voided flag stops counting. Teachers already have "void" on the monitor;
--     until now it only changed how the page looked. It now hands the warning
--     back, which is what a teacher pressing it means.
--
-- Every signal is still written down. Collapsing changes what a strike costs,
-- never what the monitor is allowed to see.

-- One departure's signals, however many the browser fires, arrive inside this.
CREATE OR REPLACE FUNCTION private.flag_settle_window()
RETURNS interval LANGUAGE sql IMMUTABLE AS $fn$ SELECT interval '10 seconds' $fn$;

-- Warnings that still stand against a sitting.
CREATE OR REPLACE FUNCTION private.live_strikes(p_session_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(COUNT(DISTINCT f.strike_number), 0)::int
  FROM public.flags f
  WHERE f.session_id = p_session_id
    AND f.resolution IS NULL;
$fn$;

/**
 * Record one proctoring signal and answer with the count that now stands.
 *
 * Returns the number of live strikes against the sitting — the figure the
 * runner shows and compares with the limit. A caller that is told "1" after
 * three events knows the three were one departure.
 */
CREATE OR REPLACE FUNCTION public.record_flag(
  p_session_id  uuid,
  p_type        "FlagType",
  p_question_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last_at timestamptz;
  v_last_no integer;
  v_max_no  integer;
  v_no      integer;
BEGIN
  -- The sitting must be the caller's own and still open. Locking it here is what
  -- makes two tabs take turns rather than both reading the same "last flag".
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

  SELECT COALESCE(MAX(f.strike_number), 0) INTO v_max_no
  FROM public.flags f WHERE f.session_id = p_session_id;

  -- The last *departure*: a honeypot is not one, and must not swallow a strike
  -- or be swallowed by one.
  SELECT f.occurred_at, f.strike_number INTO v_last_at, v_last_no
  FROM public.flags f
  WHERE f.session_id = p_session_id
    AND f.type <> 'HONEYPOT'::"FlagType"
    AND f.resolution IS NULL
  ORDER BY f.occurred_at DESC
  LIMIT 1;

  IF p_type = 'HONEYPOT'::"FlagType" THEN
    v_no := v_max_no + 1;
  ELSIF v_last_no IS NOT NULL
    AND NOW() - v_last_at <= private.flag_settle_window() THEN
    v_no := v_last_no;              -- more evidence of a departure already counted
  ELSE
    v_no := v_max_no + 1;
  END IF;

  INSERT INTO public.flags (session_id, type, strike_number, question_id)
  VALUES (p_session_id, p_type, v_no, p_question_id);

  RETURN private.live_strikes(p_session_id);
END;
$fn$;

/**
 * The warnings a student is carrying, for the runner to start from.
 *
 * Students cannot read the flags table — they should not be able to audit what
 * the proctor saw — but they must be shown the count they are being held to, and
 * a reload has to resume it rather than quietly forgive it.
 */
CREATE OR REPLACE FUNCTION public.my_strikes(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_sessions s
    WHERE s.id = p_session_id AND s.student_id = (SELECT auth.uid())
  ) THEN
    RETURN 0;
  END IF;
  RETURN private.live_strikes(p_session_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_flag(uuid, "FlagType", uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.my_strikes(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_flag(uuid, "FlagType", uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_strikes(uuid) TO authenticated;

-- live_strikes() and record_flag() both look a session's flags up by session and
-- read the newest first; the existing index on session_id alone leaves that a
-- sort every time a student so much as blinks.
CREATE INDEX IF NOT EXISTS flags_session_occurred_idx
  ON public.flags (session_id, occurred_at DESC);
