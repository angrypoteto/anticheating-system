-- Indexes the classroom-scale simulation showed were missing.
--
-- Both of these are foreign keys that every screen filters on, and neither had
-- an index: flags are counted per sitting on the monitor, in the risk report and
-- in the strike rule, and a student's own sittings are looked up by student on
-- every dashboard load. At 34 flags a sequential scan costs nothing; at a term's
-- worth of them it is the slowest thing on the page.
CREATE INDEX IF NOT EXISTS flags_session_idx ON public.flags (session_id);
CREATE INDEX IF NOT EXISTS exam_sessions_student_idx ON public.exam_sessions (student_id);

-- Resolved flags are filtered out everywhere they are counted, and unresolved
-- ones are the only ones a teacher acts on.
CREATE INDEX IF NOT EXISTS flags_unresolved_idx ON public.flags (session_id)
  WHERE resolution IS NULL;
