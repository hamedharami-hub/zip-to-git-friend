
-- Scope profiles policies to authenticated role only
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Tighten realtime.messages policy: deny non-leitner topics by default
DROP POLICY IF EXISTS "leitner topic restricted to owner" ON realtime.messages;

CREATE POLICY "leitner topic restricted to owner"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'leitner-%'
        THEN realtime.topic() = ('leitner-' || (SELECT auth.uid())::text)
      ELSE false
    END
  );
