-- Tighten SECURITY DEFINER function exposure
-- 1) Trigger-only functions: revoke execute from public/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 2) Pure helper doesn't need definer rights
ALTER FUNCTION public.gamif_level_from_xp(integer) SECURITY INVOKER;

-- 3) RPCs intentionally callable by signed-in users (they enforce auth.uid() internally).
-- Lock them down to authenticated only (no anon).
REVOKE EXECUTE ON FUNCTION public.grant_achievement(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gamif_ensure_state() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gamif_claim_quest(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gamif_record_grade(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_achievement(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_ensure_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_claim_quest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_record_grade(text, integer) TO authenticated;