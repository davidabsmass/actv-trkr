
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain','application/zip','application/json','text/csv','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path layout: {ticket_id}/{uuid}-{filename}
-- (storage.foldername(name))[1] = ticket_id

CREATE POLICY support_att_select_owner ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.submitted_by_user_id = auth.uid()
    )
  );

CREATE POLICY support_att_select_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY support_att_insert_owner ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.submitted_by_user_id = auth.uid()
    )
  );

CREATE POLICY support_att_insert_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY support_att_update_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY support_att_delete_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'::app_role));
