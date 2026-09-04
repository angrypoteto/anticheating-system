-- When an exam actually went out to students.
-- The list screen wants to show "when is this given", and updated_at was the
-- only candidate — but that moves on every edit, so it answers a different
-- question. Publishing is the moment that matters, so record it directly.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill what can be known: publishing locks an exam against further edits,
-- so for anything already published updated_at is the publish time.
UPDATE public.exams
   SET published_at = updated_at
 WHERE status = 'PUBLISHED' AND published_at IS NULL;
