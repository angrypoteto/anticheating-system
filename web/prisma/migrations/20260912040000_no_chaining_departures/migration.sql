-- A departure is measured from where it started, not from its latest signal.
--
-- record_flag() merged a signal into the previous strike when it came within
-- ten seconds of the *most recent* flag. That was meant to fold the burst one
-- Alt+Tab raises (blur, hidden, fullscreen ending, all inside a second or two)
-- into one strike. Measured from the latest flag, though, the window slides:
-- every new signal renews it. A student who switched away, came back, and
-- switched away again every few seconds was merged into the same single strike
-- indefinitely — found on 12 September by switching away twice in two seconds
-- in the demo and getting "Warning 1 of 3" both times.
--
-- Now the window is anchored to the first signal of the strike and is five
-- seconds long. The burst of one departure still lands inside it with room to
-- spare — the burst recorded on 5 September spanned 1.9 seconds, and network
-- delay stretches that — (the runner's own tracker already collapses a burst;
-- this is the database's backstop for two tabs or a reload), and anything
-- later is a new departure and a new strike. Chaining is impossible: a strike
-- cannot outlast its first five seconds.

CREATE OR REPLACE FUNCTION private.flag_settle_window()
RETURNS interval LANGUAGE sql IMMUTABLE SET search_path = '' AS $fn$ SELECT interval '5 seconds' $fn$;

CREATE OR REPLACE FUNCTION public.record_flag(
  p_session_id  uuid,
  p_type        "FlagType",
  p_question_id uuid DEFAULT NULL,
  p_detail      text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_open_no    integer;
  v_open_since timestamptz;
  v_max_no     integer;
  v_no         integer;
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

  -- Evidence for the teacher, not a strike.
  IF p_type::text = 'EXTENSION_DETECTED' THEN
    INSERT INTO public.flags (session_id, type, strike_number, question_id, detail)
    VALUES (p_session_id, p_type, 0, p_question_id, left(p_detail, 300));
    RETURN private.live_strikes(p_session_id);
  END IF;

  SELECT COALESCE(MAX(f.strike_number), 0) INTO v_max_no
  FROM public.flags f WHERE f.session_id = p_session_id;

  -- The newest departure still standing, and when it *began*: the first
  -- signal carrying its number. Not the latest signal, which would let the
  -- window slide forward with every new one.
  SELECT f.strike_number, MIN(f.occurred_at) INTO v_open_no, v_open_since
  FROM public.flags f
  WHERE f.session_id = p_session_id
    AND f.type::text NOT IN ('HONEYPOT', 'EXTENSION_DETECTED')
    AND f.resolution IS NULL
    AND f.strike_number = (
      SELECT MAX(g.strike_number) FROM public.flags g
      WHERE g.session_id = p_session_id
        AND g.type::text NOT IN ('HONEYPOT', 'EXTENSION_DETECTED')
        AND g.resolution IS NULL
    )
  GROUP BY f.strike_number;

  IF p_type = 'HONEYPOT'::"FlagType" THEN
    v_no := v_max_no + 1;
  ELSIF v_open_no IS NOT NULL
    AND NOW() - v_open_since <= private.flag_settle_window() THEN
    v_no := v_open_no;              -- more evidence of the departure under way
  ELSE
    v_no := v_max_no + 1;
  END IF;

  INSERT INTO public.flags (session_id, type, strike_number, question_id, detail)
  VALUES (p_session_id, p_type, v_no, p_question_id, left(p_detail, 300));

  RETURN private.live_strikes(p_session_id);
END;
$fn$;
