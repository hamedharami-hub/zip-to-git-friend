ALTER TABLE public.leitner_cards
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leitner_cards_starred
  ON public.leitner_cards (user_id) WHERE starred = true;