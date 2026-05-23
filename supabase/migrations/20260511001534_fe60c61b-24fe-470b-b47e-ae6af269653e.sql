ALTER TABLE public.leitner_cards
  ADD COLUMN IF NOT EXISTS synonyms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS antonyms text[] NOT NULL DEFAULT '{}';