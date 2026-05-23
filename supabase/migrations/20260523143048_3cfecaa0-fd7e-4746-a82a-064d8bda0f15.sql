-- Profiles table (basic user info)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leitner cards
CREATE TABLE public.leitner_cards (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  front_normalized TEXT NOT NULL,
  back TEXT NOT NULL,
  box SMALLINT NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  next_review TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed TIMESTAMPTZ,
  source_app TEXT NOT NULL DEFAULT 'video',
  source_ref TEXT,
  source_cue_id TEXT,
  client_id TEXT,
  example_sentence text,
  audio_url text,
  image_url text,
  folder_id uuid,
  source_start_ms integer,
  source_end_ms integer,
  source_url text,
  source_title text,
  last_interval_ms bigint,
  lapse_count integer NOT NULL DEFAULT 0,
  ease_factor real NOT NULL DEFAULT 2.0,
  review_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  cefr text,
  part_of_speech text,
  starred boolean NOT NULL DEFAULT false,
  synonyms text[] NOT NULL DEFAULT '{}',
  antonyms text[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, front_normalized)
);
ALTER TABLE public.leitner_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cards" ON public.leitner_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.leitner_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.leitner_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.leitner_cards FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX leitner_cards_user_idx ON public.leitner_cards(user_id);
CREATE INDEX leitner_cards_user_next_review_idx ON public.leitner_cards(user_id, next_review);
CREATE INDEX leitner_cards_user_source_app_idx ON public.leitner_cards(user_id, source_app);
CREATE INDEX idx_leitner_cards_folder ON public.leitner_cards(folder_id);
CREATE INDEX idx_leitner_cards_starred ON public.leitner_cards (user_id) WHERE starred = true;
CREATE TRIGGER leitner_cards_set_updated_at BEFORE UPDATE ON public.leitner_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.leitner_cards REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leitner_cards;

-- Leitner folders
CREATE TABLE public.leitner_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom',
  source_ref text,
  parent_id uuid REFERENCES public.leitner_folders(id) ON DELETE CASCADE,
  color text,
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leitner_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own folders" ON public.leitner_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folders" ON public.leitner_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.leitner_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders" ON public.leitner_folders FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_leitner_folders BEFORE UPDATE ON public.leitner_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_leitner_folders_user ON public.leitner_folders(user_id);
CREATE INDEX idx_leitner_folders_parent ON public.leitner_folders(parent_id);

-- Books
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  language TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  last_chapter_index INTEGER NOT NULL DEFAULT 0,
  last_scroll_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_read_seconds INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX books_user_id_idx ON public.books(user_id);
CREATE INDEX books_updated_at_idx ON public.books(updated_at DESC);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own books" ON public.books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own books" ON public.books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own books" ON public.books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own books" ON public.books FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER books_set_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Book chapters
CREATE TABLE public.book_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, chapter_index)
);
CREATE INDEX book_chapters_book_idx ON public.book_chapters(book_id, chapter_index);
CREATE INDEX book_chapters_user_idx ON public.book_chapters(user_id);
ALTER TABLE public.book_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own chapters" ON public.book_chapters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chapters" ON public.book_chapters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chapters" ON public.book_chapters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chapters" ON public.book_chapters FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER book_chapters_set_updated_at BEFORE UPDATE ON public.book_chapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('book-files', 'book-files', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('leitner-audio', 'leitner-audio', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('leitner-images', 'leitner-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('sentence-audio', 'sentence-audio', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read own book files" ON storage.objects FOR SELECT
  USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own book files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own book files" ON storage.objects FOR UPDATE
  USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own book files" ON storage.objects FOR DELETE
  USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own leitner audio" ON storage.objects FOR SELECT
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own leitner audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own leitner audio" ON storage.objects FOR UPDATE
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own leitner audio" ON storage.objects FOR DELETE
  USING (bucket_id = 'leitner-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view leitner images" ON storage.objects FOR SELECT USING (bucket_id = 'leitner-images');
CREATE POLICY "Users can upload own leitner images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own leitner images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own leitner images" ON storage.objects FOR DELETE
  USING (bucket_id = 'leitner-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Sentence audio is publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'sentence-audio');
CREATE POLICY "Authenticated users can upload sentence audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sentence-audio');
CREATE POLICY "Uploaders can update their sentence audio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sentence-audio' AND owner = auth.uid());
CREATE POLICY "Uploaders can delete their sentence audio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sentence-audio' AND owner = auth.uid());

-- News
CREATE TABLE public.news_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'topic', 'site')),
  name TEXT NOT NULL,
  url TEXT, topic TEXT, language TEXT,
  folder_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own news sources" ON public.news_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own news sources" ON public.news_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own news sources" ON public.news_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own news sources" ON public.news_sources FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER news_sources_updated_at BEFORE UPDATE ON public.news_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_news_sources_folder ON public.news_sources(user_id, folder_id);

CREATE TABLE public.news_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_id UUID REFERENCES public.news_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL, title TEXT NOT NULL, author TEXT, excerpt TEXT,
  content_md TEXT, content_html TEXT, image_url TEXT, site_name TEXT, language TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  word_count INTEGER NOT NULL DEFAULT 0,
  is_saved boolean NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
CREATE INDEX news_articles_user_published_idx ON public.news_articles (user_id, published_at DESC NULLS LAST);
CREATE INDEX news_articles_source_idx ON public.news_articles (source_id);
CREATE INDEX news_articles_user_saved_idx ON public.news_articles (user_id, is_saved) WHERE is_saved = true;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own articles" ON public.news_articles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own articles" ON public.news_articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own articles" ON public.news_articles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own articles" ON public.news_articles FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER news_articles_updated_at BEFORE UPDATE ON public.news_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.news_digests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_id UUID REFERENCES public.news_sources(id) ON DELETE SET NULL,
  length TEXT NOT NULL CHECK (length IN ('short','long','max')),
  scope TEXT NOT NULL,
  topic TEXT,
  window_hours INTEGER NOT NULL DEFAULT 24,
  title TEXT NOT NULL, content_md TEXT NOT NULL, content_html TEXT NOT NULL,
  source_articles JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_count INTEGER NOT NULL DEFAULT 0, model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_digests_user_created_idx ON public.news_digests (user_id, created_at DESC);
ALTER TABLE public.news_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own digests" ON public.news_digests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own digests" ON public.news_digests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own digests" ON public.news_digests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own digests" ON public.news_digests FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER news_digests_updated_at BEFORE UPDATE ON public.news_digests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.news_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL, color text, icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own folders" ON public.news_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own folders" ON public.news_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own folders" ON public.news_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own folders" ON public.news_folders FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_news_folders_updated BEFORE UPDATE ON public.news_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.news_blocked_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
ALTER TABLE public.news_blocked_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own blocked" ON public.news_blocked_domains FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own blocked" ON public.news_blocked_domains FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own blocked" ON public.news_blocked_domains FOR DELETE USING (auth.uid() = user_id);

-- Sentence Lab
CREATE TABLE public.sentence_lab (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'published',
  category text, subcategory text, cefr_level text,
  english text NOT NULL, persian text, english_aussie text,
  exam_task_type text,
  expected_duration_seconds integer, expected_intent text, ai_counter_prompt text,
  grammar_focus text[] NOT NULL DEFAULT '{}',
  vocabulary_tags text[] NOT NULL DEFAULT '{}',
  common_mistakes text[] NOT NULL DEFAULT '{}',
  audio_url text, created_by uuid,
  difficulty_score integer,
  variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  cultural_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sentence_lab_status_chk CHECK (status IN ('draft','reviewed','published'))
);
ALTER TABLE public.sentence_lab ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read published sentences" ON public.sentence_lab FOR SELECT TO authenticated
  USING (status = 'published' OR created_by = auth.uid());
CREATE POLICY "Users can insert own sentences" ON public.sentence_lab FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own sentences" ON public.sentence_lab FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Users can delete own sentences" ON public.sentence_lab FOR DELETE TO authenticated USING (created_by = auth.uid());
CREATE TRIGGER sentence_lab_set_updated_at BEFORE UPDATE ON public.sentence_lab FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_sentence_lab_status ON public.sentence_lab(status);
CREATE INDEX idx_sentence_lab_cefr ON public.sentence_lab(cefr_level);
CREATE INDEX idx_sentence_lab_category ON public.sentence_lab(category);

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
  pronunciation_score integer, fluency_score integer, grammar_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sentence_id)
);
ALTER TABLE public.sentence_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own progress" ON public.sentence_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.sentence_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.sentence_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own progress" ON public.sentence_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER sentence_progress_set_updated_at BEFORE UPDATE ON public.sentence_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_sentence_progress_user_due ON public.sentence_progress(user_id, next_review_date);
CREATE INDEX idx_sentence_progress_sentence ON public.sentence_progress(sentence_id);

CREATE TABLE public.sentence_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
  parent_id UUID REFERENCES public.sentence_categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  is_default BOOLEAN NOT NULL DEFAULT false,
  domain text NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);
CREATE INDEX idx_sentence_categories_parent ON public.sentence_categories(parent_id);
CREATE INDEX idx_sentence_categories_created_by ON public.sentence_categories(created_by);
ALTER TABLE public.sentence_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View default or own categories" ON public.sentence_categories FOR SELECT TO authenticated
  USING (is_default = true OR created_by = auth.uid());
CREATE POLICY "Insert own categories" ON public.sentence_categories FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own categories" ON public.sentence_categories FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Delete own categories" ON public.sentence_categories FOR DELETE TO authenticated USING (created_by = auth.uid());
CREATE TRIGGER update_sentence_categories_updated_at BEFORE UPDATE ON public.sentence_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sentence_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, name text NOT NULL, description text, icon text, color text,
  domain text NOT NULL DEFAULT 'general',
  is_builtin boolean NOT NULL DEFAULT false,
  recipe jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sentence_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View builtin or own paths" ON public.sentence_paths FOR SELECT TO authenticated
  USING (is_builtin = true OR user_id = auth.uid());
CREATE POLICY "Insert own paths" ON public.sentence_paths FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_builtin = false);
CREATE POLICY "Update own paths" ON public.sentence_paths FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_builtin = false);
CREATE POLICY "Delete own paths" ON public.sentence_paths FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_builtin = false);
CREATE TRIGGER sentence_paths_set_updated_at BEFORE UPDATE ON public.sentence_paths FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sentence_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sentence_id text NOT NULL,
  color text NOT NULL DEFAULT 'red',
  label text, note text,
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
CREATE TRIGGER trg_sentence_flags_updated BEFORE UPDATE ON public.sentence_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.scenario_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_slug TEXT,
  sub_slugs TEXT[] NOT NULL DEFAULT '{}',
  category_label TEXT,
  scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_index INTEGER,
  user_role TEXT, ai_role TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  used_sentence_ids TEXT[] NOT NULL DEFAULT '{}',
  target_sentence_ids TEXT[] NOT NULL DEFAULT '{}',
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own scenario sessions" ON public.scenario_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scenario sessions" ON public.scenario_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scenario sessions" ON public.scenario_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own scenario sessions" ON public.scenario_sessions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_scenario_sessions_user_created ON public.scenario_sessions(user_id, created_at DESC);
CREATE TRIGGER trg_scenario_sessions_updated_at BEFORE UPDATE ON public.scenario_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.scenario_saved_sentences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.scenario_sessions(id) ON DELETE SET NULL,
  english TEXT NOT NULL, persian TEXT, source_role TEXT, note TEXT, grammar_correction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_saved_sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own saved sentences" ON public.scenario_saved_sentences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saved sentences" ON public.scenario_saved_sentences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own saved sentences" ON public.scenario_saved_sentences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own saved sentences" ON public.scenario_saved_sentences FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_scenario_saved_user ON public.scenario_saved_sentences(user_id, created_at DESC);

-- Gamification
CREATE TABLE public.user_gamification (
  user_id UUID PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  hearts INTEGER NOT NULL DEFAULT 5,
  hearts_refilled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gems INTEGER NOT NULL DEFAULT 0,
  combo_best INTEGER NOT NULL DEFAULT 0,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own gamification" ON public.user_gamification FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own gamification" ON public.user_gamification FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own gamification" ON public.user_gamification FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_gamification_updated BEFORE UPDATE ON public.user_gamification FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quest_key TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  target INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 10,
  completed BOOLEAN NOT NULL DEFAULT false,
  claimed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_daily_quests_user ON public.daily_quests(user_id, expires_at);
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own quests" ON public.daily_quests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own quests" ON public.daily_quests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own quests" ON public.daily_quests FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "delete own quests" ON public.daily_quests FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_daily_quests_updated BEFORE UPDATE ON public.daily_quests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own achievements" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own achievements" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Seed default categories
INSERT INTO public.sentence_categories (slug, name, description, icon, color, sort_order, is_default, domain) VALUES
  ('general', 'General English', 'Everyday phrases, greetings, small talk, fillers', 'MessageCircle', 'sky', 1, true, 'general'),
  ('pharmacy', 'Pharmacy', 'OTC advice, prescriptions, customer interactions', 'Pill', 'emerald', 2, true, 'pharmacy'),
  ('business', 'Business English', 'Meetings, emails, negotiations', 'Briefcase', 'slate', 6, true, 'general');
