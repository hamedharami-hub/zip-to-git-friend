
CREATE TABLE public.scenario_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_slug TEXT,
  sub_slugs TEXT[] NOT NULL DEFAULT '{}',
  category_label TEXT,
  scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_index INTEGER,
  user_role TEXT,
  ai_role TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  used_sentence_ids TEXT[] NOT NULL DEFAULT '{}',
  target_sentence_ids TEXT[] NOT NULL DEFAULT '{}',
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scenario_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scenario sessions" ON public.scenario_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scenario sessions" ON public.scenario_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scenario sessions" ON public.scenario_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own scenario sessions" ON public.scenario_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_scenario_sessions_user_created ON public.scenario_sessions(user_id, created_at DESC);

CREATE TRIGGER trg_scenario_sessions_updated_at
  BEFORE UPDATE ON public.scenario_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.scenario_saved_sentences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.scenario_sessions(id) ON DELETE SET NULL,
  english TEXT NOT NULL,
  persian TEXT,
  source_role TEXT,
  note TEXT,
  grammar_correction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scenario_saved_sentences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own saved sentences" ON public.scenario_saved_sentences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saved sentences" ON public.scenario_saved_sentences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own saved sentences" ON public.scenario_saved_sentences
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own saved sentences" ON public.scenario_saved_sentences
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_scenario_saved_user ON public.scenario_saved_sentences(user_id, created_at DESC);
