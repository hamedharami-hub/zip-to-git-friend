
-- News folders
CREATE TABLE public.news_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own folders" ON public.news_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own folders" ON public.news_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own folders" ON public.news_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own folders" ON public.news_folders FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_news_folders_updated BEFORE UPDATE ON public.news_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Folder reference on sources
ALTER TABLE public.news_sources ADD COLUMN folder_id uuid;
ALTER TABLE public.news_sources ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX idx_news_sources_folder ON public.news_sources(user_id, folder_id);

-- Blocked domains
CREATE TABLE public.news_blocked_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
ALTER TABLE public.news_blocked_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own blocked" ON public.news_blocked_domains FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own blocked" ON public.news_blocked_domains FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own blocked" ON public.news_blocked_domains FOR DELETE USING (auth.uid() = user_id);
