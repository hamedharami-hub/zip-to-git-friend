INSERT INTO storage.buckets (id, name, public)
VALUES ('sentence-audio', 'sentence-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (cache is shared across users to save TTS costs)
CREATE POLICY "Sentence audio is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sentence-audio');

-- Any authenticated user may upload a cached file
CREATE POLICY "Authenticated users can upload sentence audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sentence-audio');

-- Owner of the uploaded file may update/delete it
CREATE POLICY "Uploaders can update their sentence audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'sentence-audio' AND owner = auth.uid());

CREATE POLICY "Uploaders can delete their sentence audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sentence-audio' AND owner = auth.uid());