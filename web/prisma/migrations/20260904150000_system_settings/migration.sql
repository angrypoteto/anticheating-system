-- System-wide settings, kept to a single row (id is a boolean primary key
-- constrained to TRUE, so a second row is impossible rather than merely
-- discouraged). Readable by any signed-in user because the exam builder needs
-- the defaults; writable only by an admin.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id                           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  institution_name             TEXT NOT NULL DEFAULT 'Proctorly',
  pass_threshold               NUMERIC(5,2) NOT NULL DEFAULT 75,
  default_total_minutes        INT NOT NULL DEFAULT 60,
  default_per_question_seconds INT,
  default_max_strikes          INT NOT NULL DEFAULT 3,
  default_fullscreen           BOOLEAN NOT NULL DEFAULT TRUE,
  default_block_copy_paste     BOOLEAN NOT NULL DEFAULT TRUE,
  default_honeypot             BOOLEAN NOT NULL DEFAULT TRUE,
  allow_student_signup         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                   TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_by                   UUID REFERENCES public.users(id)
);

INSERT INTO public.system_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_read ON public.system_settings;
CREATE POLICY settings_read ON public.system_settings
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS settings_admin_write ON public.system_settings;
CREATE POLICY settings_admin_write ON public.system_settings
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
