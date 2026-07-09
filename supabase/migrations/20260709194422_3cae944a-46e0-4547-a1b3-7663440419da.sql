revoke execute on function public.grant_achievement(text) from public;
revoke execute on function public.gamif_ensure_state() from public;
revoke execute on function public.gamif_record_grade(text, integer) from public;
revoke execute on function public.gamif_claim_quest(uuid) from public;

grant execute on function public.grant_achievement(text) to authenticated;
grant execute on function public.gamif_ensure_state() to authenticated;
grant execute on function public.gamif_record_grade(text, integer) to authenticated;
grant execute on function public.gamif_claim_quest(uuid) to authenticated;