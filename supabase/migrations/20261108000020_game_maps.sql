-- Table maps on games (2026-10-28): the host attaches a table built or rolled in the table page.
-- The map is stored as the same short code as the share links (see src/play/lib/tableCodec.ts):
-- letters, digits, "-" and "_" only, at most 6,000 characters. Games are public, so is their map.

alter table public.games add column if not exists table_map text
  check (table_map is null or (char_length(table_map) <= 6000 and table_map ~ '^[jz][A-Za-z0-9_-]+$'));

-- Host only, while the game is not cancelled; null removes the map.
create or replace function public.set_game_map(p_game uuid, p_map text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  if not exists (select 1 from public.games where id = p_game and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  if exists (select 1 from public.games where id = p_game and status = 'cancelled') then
    raise exception 'game_cancelled';
  end if;
  update public.games set table_map = nullif(btrim(p_map), '') where id = p_game;
end;
$$;
revoke execute on function public.set_game_map(uuid, text) from public, anon;
grant execute on function public.set_game_map(uuid, text) to authenticated;
