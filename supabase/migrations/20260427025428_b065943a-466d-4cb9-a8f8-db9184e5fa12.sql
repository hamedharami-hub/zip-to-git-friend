-- Add new columns to leitner_cards
ALTER TABLE public.leitner_cards
  ADD COLUMN IF NOT EXISTS example_sentence text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS folder_id uuid,
  ADD COLUMN IF NOT EXISTS source_start_ms integer,
  ADD COLUMN IF NOT EXISTS source_end_ms integer,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_title text;

-- Folders table (hierarchical: type='video'|'audio'|'book'|'language_book'|'news'|'custom')
CREATE TABLE IF NOT EXISTS public.leitner_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom',
  source_ref text,
  parent_id uuid REFERENCES public.leitner_folders(id) ON DELETE CASCADE,
  color text,
  client_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.leitner_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders" ON public.leitner_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folders" ON public.leitner_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.leitner_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders" ON public.leitner_folders FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_leitner_folders
  BEFORE UPDATE ON public.leitner_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_leitner_folders_user ON public.leitner_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_leitner_folders_parent ON public.leitner_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_leitner_cards_folder ON public.leitner_cards(folder_id);

-- Storage bucket for short audio clips (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('leitner-audio', 'leitner-audio', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket: users can only access their own folder
CREATE POLICY "Users can view own leitner audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own leitner audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own leitner audio"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own leitner audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage bucket for AI-generated images (public so img tags work without signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('leitner-images', 'leitner-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view leitner images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'leitner-images');

CREATE POLICY "Users can upload own leitner images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own leitner images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own leitner images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);