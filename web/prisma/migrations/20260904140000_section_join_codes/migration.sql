-- Self-service signup needs a gate: without one, disabling Supabase's public
-- signup endpoint would just move the open door rather than close it. A class
-- code means only students an instructor has invited can register, and it puts
-- them in the right section automatically.
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS join_code TEXT;

UPDATE public.sections
SET join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE join_code IS NULL;

ALTER TABLE public.sections ALTER COLUMN join_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sections_join_code_key ON public.sections(join_code);
ALTER TABLE public.sections
  ALTER COLUMN join_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
