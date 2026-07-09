-- Tighten EXECUTE privileges on SECURITY DEFINER RPC functions.
-- These are user-callable by design (achievements / gamification), but the linter
-- wants explicit REVOKE FROM PUBLIC + explicit GRANT TO authenticated.

REVOKE ALL ON FUNCTION public.grant_achievement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_achievement(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.gamif_ensure_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gamif_ensure_state() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.gamif_record_grade(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gamif_record_grade(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.gamif_claim_quest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gamif_claim_quest(uuid) TO authenticated, service_role;

-- Non-security-definer helper: keep locked to internal callers only.
REVOKE ALL ON FUNCTION public.gamif_level_from_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gamif_level_from_xp(integer) TO authenticated, service_role;