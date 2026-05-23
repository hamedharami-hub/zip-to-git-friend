-- Sentence Lab catalog (publicly readable to authenticated users)
CREATE TABLE public.sentence_lab (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'published',
  category text,
  subcategory text,
  cefr_level text,
  english text NOT NULL,
  persian text,
  english_aussie text,
  exam_task_type text,
  expected_duration_seconds integer,
  expected_intent text,
  ai_counter_prompt text,
  grammar_focus text[] NOT NULL DEFAULT '{}',
  vocabulary_tags text[] NOT NULL DEFAULT '{}',
  common_mistakes text[] NOT NULL DEFAULT '{}',
  audio_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sentence_lab_status_chk CHECK (status IN ('draft','reviewed','published'))
);

ALTER TABLE public.sentence_lab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read published sentences"
  ON public.sentence_lab FOR SELECT
  TO authenticated
  USING (status = 'published' OR created_by = auth.uid());

CREATE POLICY "Users can insert own sentences"
  ON public.sentence_lab FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own sentences"
  ON public.sentence_lab FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete own sentences"
  ON public.sentence_lab FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER sentence_lab_set_updated_at
  BEFORE UPDATE ON public.sentence_lab
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sentence_lab_status ON public.sentence_lab(status);
CREATE INDEX idx_sentence_lab_cefr ON public.sentence_lab(cefr_level);
CREATE INDEX idx_sentence_lab_category ON public.sentence_lab(category);

-- Per-user SRS progress
CREATE TABLE public.sentence_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL REFERENCES public.sentence_lab(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'new',
  stability numeric NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 5,
  elapsed_days integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  next_review_date timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  pronunciation_score integer,
  fluency_score integer,
  grammar_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);

ALTER TABLE public.sentence_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
  ON public.sentence_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.sentence_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.sentence_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
  ON public.sentence_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER sentence_progress_set_updated_at
  BEFORE UPDATE ON public.sentence_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sentence_progress_user_due
  ON public.sentence_progress(user_id, next_review_date);
CREATE INDEX idx_sentence_progress_sentence
  ON public.sentence_progress(sentence_id);