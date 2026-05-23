-- Remove OET and IELTS categories entirely, plus the empty daily_life category
DELETE FROM public.sentence_lab WHERE category IN ('oet','ielts','daily_life');
DELETE FROM public.sentence_categories
  WHERE parent_id IN (SELECT id FROM public.sentence_categories WHERE slug IN ('oet','ielts','daily_life'));
DELETE FROM public.sentence_categories WHERE slug IN ('oet','ielts','daily_life');