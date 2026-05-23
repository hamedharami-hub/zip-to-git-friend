ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS news_articles_user_saved_idx
  ON public.news_articles (user_id, is_saved)
  WHERE is_saved = true;

ALTER TABLE public.news_digests DROP CONSTRAINT IF EXISTS news_digests_length_check;
ALTER TABLE public.news_digests
  ADD CONSTRAINT news_digests_length_check
  CHECK (length = ANY (ARRAY['long'::text, 'max'::text, 'short'::text]));