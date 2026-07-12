-- Add a voice/persona column to news_digests and widen the length check
-- to match the RewriteLength values used by the app.

ALTER TABLE public.news_digests
  ADD COLUMN IF NOT EXISTS voice TEXT DEFAULT 'auto';

UPDATE public.news_digests
  SET voice = 'auto'
  WHERE voice IS NULL;

ALTER TABLE public.news_digests
  ALTER COLUMN voice SET NOT NULL;

ALTER TABLE public.news_digests
  DROP CONSTRAINT IF EXISTS news_digests_length_check;

ALTER TABLE public.news_digests
  ADD CONSTRAINT news_digests_length_check
  CHECK (length = ANY (ARRAY['short','long','max','auto-max','simple']));