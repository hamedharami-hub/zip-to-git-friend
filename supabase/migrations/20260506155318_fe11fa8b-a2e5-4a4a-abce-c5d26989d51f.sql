-- Add domain to sentence_categories
ALTER TABLE public.sentence_categories
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'general';

UPDATE public.sentence_categories SET domain = 'pharmacy' WHERE slug = 'pharmacy';
UPDATE public.sentence_categories SET domain = 'medical'  WHERE slug = 'gp_clinic';
UPDATE public.sentence_categories SET domain = 'general'
  WHERE slug IN ('general','business','aussie_life','professional','grammar');

-- Sentence Paths (built-in + user custom)
CREATE TABLE IF NOT EXISTS public.sentence_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  domain text NOT NULL DEFAULT 'general',
  is_builtin boolean NOT NULL DEFAULT false,
  recipe jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sentence_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View builtin or own paths" ON public.sentence_paths;
CREATE POLICY "View builtin or own paths" ON public.sentence_paths
  FOR SELECT TO authenticated
  USING (is_builtin = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "Insert own paths" ON public.sentence_paths;
CREATE POLICY "Insert own paths" ON public.sentence_paths
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_builtin = false);

DROP POLICY IF EXISTS "Update own paths" ON public.sentence_paths;
CREATE POLICY "Update own paths" ON public.sentence_paths
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_builtin = false);

DROP POLICY IF EXISTS "Delete own paths" ON public.sentence_paths;
CREATE POLICY "Delete own paths" ON public.sentence_paths
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_builtin = false);

CREATE TRIGGER sentence_paths_set_updated_at
  BEFORE UPDATE ON public.sentence_paths
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed 4 built-in paths
INSERT INTO public.sentence_paths (name, description, icon, color, domain, is_builtin, sort_order, recipe) VALUES
('Beginner Survival', 'پایه‌ترین جمله‌ها برای زندگی روزمره', 'Sprout', 'emerald', 'general', true, 1,
  '[{"category":"aussie_life","subcategory":"food","count":8},{"category":"aussie_life","subcategory":"transport","count":6},{"category":"aussie_life","subcategory":"shopping","count":6},{"category":"general","subcategory":"greetings","count":5},{"category":"general","subcategory":"politeness","count":5}]'::jsonb),
('Workplace Ready', 'برای محیط کار و همکاران', 'Briefcase', 'amber', 'general', true, 2,
  '[{"category":"aussie_life","subcategory":"workplace","count":10},{"category":"professional","subcategory":"meetings","count":8},{"category":"grammar","subcategory":"reported_speech","count":5},{"category":"grammar","subcategory":"modals_should","count":5}]'::jsonb),
('Social Fluency', 'مکالمات اجتماعی و دوستانه', 'MessageCircle', 'rose', 'general', true, 3,
  '[{"category":"aussie_life","subcategory":"social","count":8},{"category":"aussie_life","subcategory":"idioms","count":8},{"category":"general","subcategory":"small_talk","count":6},{"category":"grammar","subcategory":"conditional_unless","count":5}]'::jsonb),
('Advanced Native-like', 'پیشرفته و طبیعی مثل بومی', 'Sparkles', 'violet', 'general', true, 4,
  '[{"category":"grammar","subcategory":"passive","count":6},{"category":"grammar","subcategory":"persian_errors","count":10},{"category":"aussie_life","subcategory":"idioms","count":8},{"category":"grammar","subcategory":"conditional_inversion","count":5}]'::jsonb)
ON CONFLICT DO NOTHING;