ALTER TABLE public.leitner_cards
  ADD COLUMN IF NOT EXISTS last_interval_ms bigint,
  ADD COLUMN IF NOT EXISTS lapse_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ease_factor real NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS review_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cefr text,
  ADD COLUMN IF NOT EXISTS part_of_speech text;