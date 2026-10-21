create table if not exists public.vertice_climax_whatsapp_auth (
  id integer primary key check (id = 1),
  encrypted_payload text not null,
  updated_at timestamptz not null default now()
);
alter table public.vertice_climax_whatsapp_auth enable row level security;
revoke all on table public.vertice_climax_whatsapp_auth from public, anon, authenticated;

create or replace function public.vertice_climax_get_whatsapp_auth(p_secret text)
returns text language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare expected text; result text;
begin
  select secret_hash into expected from public.vertice_climax_config where id = 1;
  if expected is null or encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> expected then
    raise exception 'unauthorized';
  end if;
  select encrypted_payload into result from public.vertice_climax_whatsapp_auth where id = 1;
  return result;
end;
$function$;

create or replace function public.vertice_climax_put_whatsapp_auth(p_secret text, p_payload text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare expected text;
begin
  select secret_hash into expected from public.vertice_climax_config where id = 1;
  if expected is null or encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> expected then
    raise exception 'unauthorized';
  end if;
  if p_payload is null or length(p_payload) > 4000000 then raise exception 'invalid payload'; end if;
  insert into public.vertice_climax_whatsapp_auth(id, encrypted_payload, updated_at)
  values (1, p_payload, now())
  on conflict (id) do update set encrypted_payload = excluded.encrypted_payload, updated_at = now();
  return jsonb_build_object('ok', true, 'updatedAt', now());
end;
$function$;

revoke all on function public.vertice_climax_get_whatsapp_auth(text) from public, authenticated;
revoke all on function public.vertice_climax_put_whatsapp_auth(text, text) from public, authenticated;
grant execute on function public.vertice_climax_get_whatsapp_auth(text) to anon;
grant execute on function public.vertice_climax_put_whatsapp_auth(text, text) to anon;
