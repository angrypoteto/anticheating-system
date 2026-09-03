-- Prisma's @default(uuid()) and @updatedAt are applied by the Prisma client, so the
-- generated DDL carried no database defaults. Writes that don't go through Prisma —
-- i.e. every client-direct Supabase/PostgREST insert this app relies on — failed with
-- a not-null violation. These defaults make the columns work for both paths.

ALTER TABLE public.sections          ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.exams             ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.questions         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.lesson_files      ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.exam_sessions     ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.answers           ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.flags             ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.audit_log         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.backup_runs       ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.ai_provider_keys  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.exams   ALTER COLUMN updated_at  SET DEFAULT NOW();
ALTER TABLE public.answers ALTER COLUMN answered_at SET DEFAULT NOW();

-- @updatedAt is also client-side only, so keep these current for non-Prisma writes too.
CREATE OR REPLACE FUNCTION private.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.touch_answered_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.answered_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exams_touch_updated_at ON public.exams;
CREATE TRIGGER exams_touch_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

DROP TRIGGER IF EXISTS answers_touch_answered_at ON public.answers;
CREATE TRIGGER answers_touch_answered_at
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION private.touch_answered_at();

-- search_path pinned on both trigger functions (added in a follow-up migration
-- upstream; folded in here so a fresh replay creates them correctly first time).
ALTER FUNCTION private.touch_updated_at() SET search_path = public;
ALTER FUNCTION private.touch_answered_at() SET search_path = public;
