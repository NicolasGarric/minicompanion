-- More interface and event languages: French, Spanish, German, Italian, Brazilian Portuguese,
-- Simplified Chinese and Korean, on top of English and Japanese.
-- 'both' keeps its meaning for events (Japanese and English).

alter type public.app_lang add value if not exists 'fr';
alter type public.app_lang add value if not exists 'es';
alter type public.app_lang add value if not exists 'de';
alter type public.app_lang add value if not exists 'it';
alter type public.app_lang add value if not exists 'pt';
alter type public.app_lang add value if not exists 'zh';
alter type public.app_lang add value if not exists 'ko';

alter type public.event_language add value if not exists 'fr';
alter type public.event_language add value if not exists 'es';
alter type public.event_language add value if not exists 'de';
alter type public.event_language add value if not exists 'it';
alter type public.event_language add value if not exists 'pt';
alter type public.event_language add value if not exists 'zh';
alter type public.event_language add value if not exists 'ko';

-- New accounts keep the language chosen in the app; anything unknown falls back to English.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
  wanted text := new.raw_user_meta_data ->> 'preferred_lang';
begin
  if char_length(base) < 3 then
    base := 'player';
  end if;
  insert into public.profiles (id, handle, display_name, preferred_lang)
  values (
    new.id,
    left(base, 18) || '_' || substr(replace(new.id::text, '-', ''), 1, 5),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  nullif(new.raw_user_meta_data ->> 'full_name', ''),
                  split_part(new.email, '@', 1)), 40),
    case when wanted in ('en', 'ja', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ko') then wanted else 'en' end::public.app_lang
  );
  return new;
end;
$$;
