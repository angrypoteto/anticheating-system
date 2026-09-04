-- Somewhere for a running generation to say how far it has got.
--
-- A big order is several model calls in sequence, and a server action cannot
-- stream: the browser sees nothing between submitting and the drafts arriving,
-- which on a sixty-question order is a minute of a button that looks stuck.
--
-- The alternative to this table is a bar that advances on a guess. A guess that
-- reaches 90% and sits there is worse than no bar at all, because the next time
-- the teacher sees it they will not believe it. So the action records each batch
-- as it finishes and the page reads the real number.
CREATE TABLE IF NOT EXISTS public.generation_progress (
  run_id     UUID PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  done       INT NOT NULL DEFAULT 0,
  total      INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generation_progress_owner_idx
  ON public.generation_progress (owner_id);

ALTER TABLE public.generation_progress ENABLE ROW LEVEL SECURITY;

-- You may watch your own run and nobody else's. There is deliberately no
-- INSERT or UPDATE policy: only the action writes these, through the service
-- role, so a browser cannot invent a run or fake its progress.
DROP POLICY IF EXISTS generation_progress_own ON public.generation_progress;
CREATE POLICY generation_progress_own ON public.generation_progress
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS generation_progress_admin ON public.generation_progress;
CREATE POLICY generation_progress_admin ON public.generation_progress
  FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- A run that dies mid-way leaves a row behind, so the action clears anything
-- older than an hour on its way in. That is a plain delete with the service
-- role rather than a function: a maintenance routine in the private schema is
-- unreachable from PostgREST, which is exactly the sort of call that fails
-- silently forever because nothing ever checks its result.
