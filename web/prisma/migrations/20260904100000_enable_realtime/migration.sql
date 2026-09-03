-- Realtime publishes nothing by default; tables must be added explicitly.
-- RLS still applies to subscribers, so an instructor only receives rows for
-- sessions in their own sections (verified: a second instructor and the student
-- themselves receive nothing).
ALTER PUBLICATION supabase_realtime ADD TABLE public.flags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;

-- Realtime needs the full old row to evaluate RLS on UPDATE/DELETE events;
-- without this, voiding a flag wouldn't reach the dashboard.
ALTER TABLE public.flags         REPLICA IDENTITY FULL;
ALTER TABLE public.exam_sessions REPLICA IDENTITY FULL;
