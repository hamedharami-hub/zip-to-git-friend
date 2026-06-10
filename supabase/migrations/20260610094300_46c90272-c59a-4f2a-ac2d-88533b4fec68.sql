CREATE TABLE public.paragraph_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paragraph_hash text NOT NULL,
  book_client_id text,
  chapter_index integer,
  translation text NOT NULL DEFAULT '',
  vocabulary jsonb NOT NULL DEFAULT '[]'::jsonb,
  idioms jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paragraph_hash)
);

CREATE INDEX paragraph_analyses_user_hash_idx
  ON public.paragraph_analyses (user_id, paragraph_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paragraph_analyses TO authenticated;
GRANT ALL ON public.paragraph_analyses TO service_role;

ALTER TABLE public.paragraph_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own paragraph analyses"
  ON public.paragraph_analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own paragraph analyses"
  ON public.paragraph_analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own paragraph analyses"
  ON public.paragraph_analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own paragraph analyses"
  ON public.paragraph_analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER paragraph_analyses_set_updated_at
  BEFORE UPDATE ON public.paragraph_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();