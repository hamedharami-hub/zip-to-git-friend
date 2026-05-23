CREATE TABLE public.sentence_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  parent_id UUID REFERENCES public.sentence_categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);

CREATE INDEX idx_sentence_categories_parent ON public.sentence_categories(parent_id);
CREATE INDEX idx_sentence_categories_created_by ON public.sentence_categories(created_by);

ALTER TABLE public.sentence_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View default or own categories"
  ON public.sentence_categories FOR SELECT TO authenticated
  USING (is_default = true OR created_by = auth.uid());

CREATE POLICY "Insert own categories"
  ON public.sentence_categories FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own categories"
  ON public.sentence_categories FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Delete own categories"
  ON public.sentence_categories FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER update_sentence_categories_updated_at
  BEFORE UPDATE ON public.sentence_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sentence_categories (slug, name, description, icon, color, sort_order, is_default) VALUES
  ('general', 'General English', 'Everyday phrases, greetings, small talk, fillers', 'MessageCircle', 'sky', 1, true),
  ('pharmacy', 'Pharmacy', 'OTC advice, prescriptions, customer interactions', 'Pill', 'emerald', 2, true),
  ('oet', 'OET Roleplay', 'Healthcare professional exam scenarios', 'Stethoscope', 'rose', 3, true),
  ('ielts', 'IELTS Speaking', 'Part 1, 2, 3 speaking practice', 'GraduationCap', 'violet', 4, true),
  ('daily_life', 'Daily Life', 'Shopping, restaurants, travel, banking', 'ShoppingBag', 'amber', 5, true),
  ('business', 'Business English', 'Meetings, emails, negotiations', 'Briefcase', 'slate', 6, true);

INSERT INTO public.sentence_categories (slug, name, description, icon, color, parent_id, sort_order, is_default)
SELECT subs.slug, subs.name, subs.description, subs.icon, subs.color, g.id, subs.sort_order, true
FROM (VALUES
  ('greetings', 'Greetings', 'Hello, hi, good morning…', 'Hand', 'sky', 1),
  ('farewells', 'Farewells', 'Goodbye, see you later…', 'Hand', 'sky', 2),
  ('politeness', 'Politeness', 'Please, thank you, you''re welcome', 'Heart', 'sky', 3),
  ('apologies', 'Apologies', 'Sorry, excuse me, my bad', 'Heart', 'sky', 4),
  ('small_talk', 'Small Talk', 'Weather, weekend, how-are-you', 'MessageCircle', 'sky', 5),
  ('questions', 'Questions', 'Asking for info, where, when, how', 'HelpCircle', 'sky', 6),
  ('clarification', 'Clarification', 'Could you repeat? What do you mean?', 'HelpCircle', 'sky', 7),
  ('reactions', 'Reactions', 'Wow, really?, no way!', 'Sparkles', 'sky', 8),
  ('fillers', 'Fillers', 'Um, well, you know, like…', 'Mic', 'sky', 9),
  ('connectors', 'Connectors', 'However, therefore, on the other hand', 'GitBranch', 'sky', 10),
  ('numbers_dates', 'Numbers & Dates', 'Telling the date, prices, time', 'Calendar', 'sky', 11),
  ('time_expressions', 'Time Expressions', 'Yesterday, in two weeks, by Friday', 'Clock', 'sky', 12)
) AS subs(slug, name, description, icon, color, sort_order)
CROSS JOIN (SELECT id FROM public.sentence_categories WHERE slug = 'general' AND parent_id IS NULL) g;