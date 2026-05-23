
CREATE TABLE public.sentence_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  color text NOT NULL DEFAULT 'red',
  label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);

ALTER TABLE public.sentence_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own flags" ON public.sentence_flags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own flags" ON public.sentence_flags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own flags" ON public.sentence_flags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own flags" ON public.sentence_flags FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sentence_flags_user_color ON public.sentence_flags(user_id, color);
CREATE INDEX idx_sentence_flags_user_sentence ON public.sentence_flags(user_id, sentence_id);

CREATE TRIGGER trg_sentence_flags_updated
BEFORE UPDATE ON public.sentence_flags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
