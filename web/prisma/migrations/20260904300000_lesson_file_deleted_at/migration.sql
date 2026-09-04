-- The uploaded lesson file does not need to outlive the questions it produced.
--
-- Its text is extracted once and kept on the row, which is all regeneration ever
-- reads. The bytes themselves — somebody's slide deck or reviewer, sitting in a
-- bucket indefinitely — serve no further purpose, so they are removed as soon as
-- they have been read.
--
-- The row stays, because "this exam was generated from lesson-3.pptx" is worth
-- knowing. This column is what keeps that record honest about the file being
-- gone, rather than leaving a storage_path that silently points at nothing.
ALTER TABLE public.lesson_files
  ADD COLUMN IF NOT EXISTS file_deleted_at TIMESTAMPTZ;
