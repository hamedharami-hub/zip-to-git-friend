ALTER TABLE public.sentence_lab
  ADD COLUMN IF NOT EXISTS difficulty_score integer,
  ADD COLUMN IF NOT EXISTS variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cultural_note text;

ALTER TABLE public.sentence_lab ALTER COLUMN subcategory DROP NOT NULL;