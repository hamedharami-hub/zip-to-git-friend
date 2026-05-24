
REVOKE ALL ON FUNCTION public.grant_achievement(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gamif_ensure_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gamif_record_grade(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gamif_claim_quest(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gamif_level_from_xp(int) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.grant_achievement(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_ensure_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_record_grade(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_claim_quest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gamif_level_from_xp(int) TO authenticated;
