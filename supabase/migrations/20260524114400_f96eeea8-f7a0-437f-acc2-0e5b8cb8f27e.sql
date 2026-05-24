
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitner topic restricted to owner" ON realtime.messages;
CREATE POLICY "leitner topic restricted to owner" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'leitner-%'
        THEN realtime.topic() = 'leitner-' || (SELECT auth.uid())::text
      ELSE true
    END
  );

DROP POLICY IF EXISTS "Authenticated users can upload sentence audio" ON storage.objects;
CREATE POLICY "Users upload own sentence audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sentence-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

UPDATE storage.buckets SET public = false WHERE id = 'leitner-images';

DROP POLICY IF EXISTS "Public can view leitner images" ON storage.objects;
CREATE POLICY "Owner can view leitner images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'leitner-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "insert own achievements" ON public.user_achievements;

DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_user_key_uniq') THEN
    ALTER TABLE public.user_achievements
      ADD CONSTRAINT user_achievements_user_key_uniq UNIQUE (user_id, achievement_key);
  END IF;
END $mig$;

CREATE OR REPLACE FUNCTION public.grant_achievement(_key text)
RETURNS public.user_achievements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _row public.user_achievements;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _key IS NULL OR length(_key) = 0 OR length(_key) > 100 THEN
    RAISE EXCEPTION 'invalid achievement key';
  END IF;
  INSERT INTO public.user_achievements (user_id, achievement_key)
  VALUES (_uid, _key)
  ON CONFLICT (user_id, achievement_key) DO NOTHING
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    SELECT * INTO _row FROM public.user_achievements
      WHERE user_id = _uid AND achievement_key = _key;
  END IF;
  RETURN _row;
END;
$fn$;

DROP POLICY IF EXISTS "update own gamification" ON public.user_gamification;

CREATE OR REPLACE FUNCTION public.gamif_level_from_xp(_xp int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT max(L)::int FROM generate_series(1, 500) L
       WHERE round(50.0 * L * (L - 1) / 2 + 50 * (L - 1)) <= _xp),
    1
  );
$fn$;

CREATE OR REPLACE FUNCTION public.gamif_ensure_state()
RETURNS public.user_gamification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _row public.user_gamification;
  _refills int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _row FROM public.user_gamification WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.user_gamification (user_id) VALUES (_uid)
      RETURNING * INTO _row;
  END IF;
  IF _row.hearts < 5 THEN
    _refills := floor(EXTRACT(EPOCH FROM (now() - _row.hearts_refilled_at)) / 1800);
    IF _refills > 0 THEN
      UPDATE public.user_gamification
        SET hearts = LEAST(5, _row.hearts + _refills),
            hearts_refilled_at = now(),
            updated_at = now()
        WHERE user_id = _uid
        RETURNING * INTO _row;
    END IF;
  END IF;
  RETURN _row;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.gamif_record_grade(_grade text, _combo int)
RETURNS public.user_gamification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _row public.user_gamification;
  _base int;
  _mult int;
  _xp_earned int;
  _new_xp int;
  _new_level int;
  _today date := current_date;
  _next_streak int;
  _hearts int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _grade NOT IN ('again','hard','good','easy') THEN RAISE EXCEPTION 'invalid grade'; END IF;
  IF _combo IS NULL OR _combo < 0 OR _combo > 10000 THEN RAISE EXCEPTION 'invalid combo'; END IF;
  _row := public.gamif_ensure_state();
  _base := CASE _grade WHEN 'again' THEN 0 WHEN 'hard' THEN 3 WHEN 'good' THEN 8 WHEN 'easy' THEN 12 END;
  _mult := CASE WHEN _combo >= 10 THEN 3 WHEN _combo >= 5 THEN 2 ELSE 1 END;
  _xp_earned := _base * _mult;
  _new_xp := _row.xp + _xp_earned;
  _new_level := public.gamif_level_from_xp(_new_xp);
  IF _row.last_active_date = _today THEN
    _next_streak := _row.current_streak;
  ELSIF _row.last_active_date = _today - 1 THEN
    _next_streak := _row.current_streak + 1;
  ELSE
    _next_streak := 1;
  END IF;
  _hearts := _row.hearts;
  IF _grade = 'again' AND _hearts > 0 THEN _hearts := _hearts - 1; END IF;
  UPDATE public.user_gamification
    SET xp = _new_xp,
        level = _new_level,
        current_streak = _next_streak,
        longest_streak = GREATEST(longest_streak, _next_streak),
        last_active_date = _today,
        total_reviews = total_reviews + 1,
        combo_best = GREATEST(combo_best, _combo),
        hearts = _hearts,
        updated_at = now()
    WHERE user_id = _uid
    RETURNING * INTO _row;
  RETURN _row;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.gamif_claim_quest(_quest_id uuid)
RETURNS public.user_gamification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _q public.daily_quests;
  _row public.user_gamification;
  _new_xp int;
  _new_level int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _q FROM public.daily_quests WHERE id = _quest_id AND user_id = _uid;
  IF NOT FOUND OR NOT _q.completed OR _q.claimed THEN
    RETURN public.gamif_ensure_state();
  END IF;
  UPDATE public.daily_quests SET claimed = true WHERE id = _quest_id;
  _row := public.gamif_ensure_state();
  _new_xp := _row.xp + _q.reward_xp;
  _new_level := public.gamif_level_from_xp(_new_xp);
  UPDATE public.user_gamification
    SET xp = _new_xp, level = _new_level, updated_at = now()
    WHERE user_id = _uid
    RETURNING * INTO _row;
  RETURN _row;
END;
$fn$;
