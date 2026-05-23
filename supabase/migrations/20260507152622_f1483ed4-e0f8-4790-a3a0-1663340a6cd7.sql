
CREATE TABLE IF NOT EXISTS public.user_gamification (
  user_id UUID PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  hearts INTEGER NOT NULL DEFAULT 5,
  hearts_refilled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gems INTEGER NOT NULL DEFAULT 0,
  combo_best INTEGER NOT NULL DEFAULT 0,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "view own gamification" ON public.user_gamification FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "insert own gamification" ON public.user_gamification FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "update own gamification" ON public.user_gamification FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_user_gamification_updated ON public.user_gamification;
CREATE TRIGGER trg_user_gamification_updated BEFORE UPDATE ON public.user_gamification FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quest_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 10,
  completed BOOLEAN NOT NULL DEFAULT false,
  claimed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_quests_user ON public.daily_quests(user_id, expires_at);
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "view own quests" ON public.daily_quests FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "insert own quests" ON public.daily_quests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "update own quests" ON public.daily_quests FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "delete own quests" ON public.daily_quests FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_daily_quests_updated ON public.daily_quests;
CREATE TRIGGER trg_daily_quests_updated BEFORE UPDATE ON public.daily_quests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "view own achievements" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "insert own achievements" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.sentence_lab
SET subcategory = 'history_taking'
WHERE category = 'gp_clinic'
  AND subcategory LIKE 'hx_%';

DELETE FROM public.sentence_categories
WHERE slug LIKE 'hx_%';

DO $$
DECLARE
  v_parent UUID;
BEGIN
  SELECT c.id INTO v_parent FROM public.sentence_categories c WHERE c.slug = 'gp_clinic' AND c.parent_id IS NULL LIMIT 1;
  IF v_parent IS NOT NULL THEN
    INSERT INTO public.sentence_categories (slug, name, description, icon, color, parent_id, is_default, sort_order, domain)
    SELECT 'history_taking', 'History Taking', 'گرفتن شرح‌حال جامع از بیمار', 'ClipboardList', 'rose', v_parent, true, 1, 'medical'
    WHERE NOT EXISTS (SELECT 1 FROM public.sentence_categories WHERE slug = 'history_taking' AND parent_id = v_parent);
  END IF;
END $$;
