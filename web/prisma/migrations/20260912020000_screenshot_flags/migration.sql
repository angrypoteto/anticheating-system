-- A flag for a screenshot, on a computer.
--
-- A web page cannot stop the operating system taking a screenshot, and there is
-- no browser event for one. What a page does receive is the keys that start
-- one: Print Screen itself, and the Windows or Command key held with Shift —
-- the start of Win+Shift+S on Windows and Cmd+Shift+3/4/5 on a Mac. The runner
-- reports those as SCREENSHOT (with which one in `detail`), and hides the
-- questions the instant the Windows or Command key goes down, so a capture
-- taken with that shortcut shows a blank panel instead of the paper.
--
-- A screenshot is a departure in all but name — the snipping overlay takes the
-- window's focus as it opens — so it is counted and merged exactly like one:
-- the shortcut and the blur it causes are one strike, not two. What changes is
-- the word on the record: where both arrive for the same strike, the student's
-- own log now says "screenshot" rather than "clicked away".

ALTER TYPE "FlagType" ADD VALUE IF NOT EXISTS 'SCREENSHOT';

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
      WHEN 'SCREENSHOT'      THEN 1
      WHEN 'TAB_SWITCH'      THEN 2
      WHEN 'FULLSCREEN_EXIT' THEN 3
      ELSE 4
    END,
    f.occurred_at;
$fn$;
