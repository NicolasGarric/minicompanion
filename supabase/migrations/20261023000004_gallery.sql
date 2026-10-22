-- =============================================================================================
-- Gallery: painted renders a player saves from PAINT to their profile ("exports").
-- Private: only the owner sees their items and files (RLS on the table and on Storage).
-- =============================================================================================

create table public.gallery_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  -- "<owner id>/<file id>.jpg|png" in the private "gallery" bucket
  image_path text not null unique check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
  -- Paints of the scheme, as shown in the app (name, brand, hex): text only, no images.
  paints     jsonb not null default '[]'::jsonb
             check (jsonb_typeof(paints) = 'array' and jsonb_array_length(paints) <= 40),
  created_at timestamptz not null default now(),
  check (split_part(image_path, '/', 1) = owner_id::text)
);

create index gallery_items_owner_idx on public.gallery_items (owner_id, created_at desc);

-- Only the title can be edited after saving.
revoke update on public.gallery_items from anon, authenticated;
grant update (title) on public.gallery_items to authenticated;

alter table public.gallery_items enable row level security;

create policy "owners read their gallery" on public.gallery_items
  for select using (owner_id = auth.uid());
create policy "owners add to their gallery" on public.gallery_items
  for insert with check (owner_id = auth.uid());
create policy "owners rename their gallery items" on public.gallery_items
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete their gallery items" on public.gallery_items
  for delete using (owner_id = auth.uid());

-- At most 200 items per player (keeps storage use bounded on the free tier).
create or replace function public.gallery_items_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.gallery_items where owner_id = new.owner_id) >= 200 then
    raise exception 'gallery_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.gallery_items_cap() from public, anon, authenticated;

create trigger gallery_items_cap
  before insert on public.gallery_items
  for each row execute function public.gallery_items_cap();

-- ---------------------------------------------------------------------------------------------
-- Storage: private bucket, images only, 5 MB per file, one folder per player.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "gallery files: owners read" on storage.objects
  for select to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gallery files: owners upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gallery files: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
