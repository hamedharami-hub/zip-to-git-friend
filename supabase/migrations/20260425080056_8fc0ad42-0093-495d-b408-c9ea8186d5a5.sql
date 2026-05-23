
-- News reader: sources (RSS or Firecrawl topic), articles (saved/cached), and digests (AI summaries).

CREATE TABLE public.news_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'topic', 'site')),
  name TEXT NOT NULL,
  -- For 'rss': the feed URL. For 'site': the homepage URL. For 'topic': empty.
  url TEXT,
  -- For 'topic' or 'site': a free-text query / topic label used for Firecrawl search.
  topic TEXT,
  language TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own news sources"
  ON public.news_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own news sources"
  ON public.news_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own news sources"
  ON public.news_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own news sources"
  ON public.news_sources FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.news_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_id UUID REFERENCES public.news_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  excerpt TEXT,
  -- Full article extracted as markdown by Firecrawl (or RSS content fallback).
  content_md TEXT,
  -- Cached HTML rendering of content_md so the reader UI can show it directly.
  content_html TEXT,
  image_url TEXT,
  site_name TEXT,
  language TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);

CREATE INDEX news_articles_user_published_idx
  ON public.news_articles (user_id, published_at DESC NULLS LAST);
CREATE INDEX news_articles_source_idx
  ON public.news_articles (source_id);

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own articles"
  ON public.news_articles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own articles"
  ON public.news_articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own articles"
  ON public.news_articles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own articles"
  ON public.news_articles FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER news_articles_updated_at
  BEFORE UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.news_digests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_id UUID REFERENCES public.news_sources(id) ON DELETE SET NULL,
  -- 'short' (~2-3 paragraphs) or 'long' (multi-section report).
  length TEXT NOT NULL CHECK (length IN ('short', 'long')),
  -- 'topic' or 'site' or 'source' (single RSS feed digest).
  scope TEXT NOT NULL,
  topic TEXT,
  -- Hours window: 1 / 6 / 24 / 168 etc.
  window_hours INTEGER NOT NULL DEFAULT 24,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  content_html TEXT NOT NULL,
  -- Articles included in this digest (URLs as JSON array of {title,url,source}).
  source_articles JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_count INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX news_digests_user_created_idx
  ON public.news_digests (user_id, created_at DESC);

ALTER TABLE public.news_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own digests"
  ON public.news_digests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own digests"
  ON public.news_digests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own digests"
  ON public.news_digests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own digests"
  ON public.news_digests FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER news_digests_updated_at
  BEFORE UPDATE ON public.news_digests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
