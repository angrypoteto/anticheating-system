-- Private bucket: lesson material is the instructor's own teaching content and the
-- source of exam questions, so it must never be publicly fetchable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-files', 'lesson-files', FALSE, 20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Files live under <exam_id>/<filename>, so ownership of the first path segment's
-- exam decides access. Students get no policy at all.
CREATE POLICY lesson_files_instructor_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-files'
    AND private.owns_exam(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY lesson_files_instructor_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lesson-files'
    AND private.owns_exam(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY lesson_files_instructor_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-files'
    AND private.owns_exam(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY lesson_files_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'lesson-files' AND private.is_admin())
  WITH CHECK (bucket_id = 'lesson-files' AND private.is_admin());
