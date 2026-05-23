-- Restrict public bucket listing to actual file paths only (prevent listing)
DROP POLICY IF EXISTS "Public can view leitner images" ON storage.objects;
CREATE POLICY "Public can view leitner images" ON storage.objects FOR SELECT
  USING (bucket_id = 'leitner-images' AND (storage.foldername(name))[1] IS NOT NULL);

DROP POLICY IF EXISTS "Sentence audio is publicly readable" ON storage.objects;
CREATE POLICY "Sentence audio is publicly readable" ON storage.objects FOR SELECT
  USING (bucket_id = 'sentence-audio' AND name IS NOT NULL);

-- Revoke public execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;