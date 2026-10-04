-- Migration 023: Create client-photos storage bucket
-- Required by the photo upload feature

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-photos',
  'client-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload/view client photos
CREATE POLICY "Authenticated users can view client photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated users can upload client photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update own client photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');
