revoke execute on function public.vertice_climax_get_state(text) from authenticated;
revoke execute on function public.vertice_climax_put_state(text, jsonb) from authenticated;
grant execute on function public.vertice_climax_get_state(text) to anon;
grant execute on function public.vertice_climax_put_state(text, jsonb) to anon;
