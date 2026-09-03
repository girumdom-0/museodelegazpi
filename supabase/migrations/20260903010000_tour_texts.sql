-- Replace artifact records with the text entries used by tour.xml Javascript actions.
-- Run after 20260903000000_museo_admin.sql.

drop table if exists public.artifacts cascade;
drop table if exists public.content_updates cascade;

drop function if exists private.prevent_artifact_routing_change() cascade;
drop function if exists private.set_artifact_updated_at() cascade;
drop function if exists private.audit_artifact_change() cascade;

create table public.tour_texts (
  id uuid primary key default gen_random_uuid(),
  action_name text not null unique,
  title text not null,
  text text not null default '',
  scene_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_texts_action_name_format check (action_name ~ '^[a-z0-9_]+$'),
  constraint tour_texts_title_not_blank check (char_length(btrim(title)) between 1 and 300),
  constraint tour_texts_text_size check (char_length(text) <= 30000)
);

create table public.content_updates (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  content_id uuid not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  changed_text text not null,
  "timestamp" timestamptz not null default now()
);

create or replace function private.set_tour_text_updated_at()
returns trigger language plpgsql set search_path = '' as $function$
begin new.updated_at = now(); return new; end;
$function$;

create or replace function private.audit_tour_text_change()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), new.id, 'CREATE', pg_catalog.to_jsonb(new)::text);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.text is not distinct from old.text then return new; end if;
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), new.id, 'UPDATE', pg_catalog.jsonb_build_object('before', old.text, 'after', new.text)::text);
    return new;
  else
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), old.id, 'DELETE', old.text);
    return old;
  end if;
end;
$function$;

drop trigger if exists tour_texts_set_updated_at on public.tour_texts;
create trigger tour_texts_set_updated_at before update on public.tour_texts for each row execute function private.set_tour_text_updated_at();
drop trigger if exists tour_texts_audit_change on public.tour_texts;
create trigger tour_texts_audit_change after insert or update or delete on public.tour_texts for each row execute function private.audit_tour_text_change();

alter table public.tour_texts enable row level security;
alter table public.content_updates enable row level security;
revoke all on table public.tour_texts, public.content_updates from anon, authenticated;
grant select on public.tour_texts to anon, authenticated;
grant update (title, text) on public.tour_texts to authenticated;
grant select on public.content_updates to authenticated;

create policy "public can read tour text" on public.tour_texts for select to anon, authenticated using (true);
create policy "admins can update tour text" on public.tour_texts for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins can read tour audit" on public.content_updates for select to authenticated using ((select private.is_admin()));

insert into public.tour_texts (action_name, title, scene_id) values
('show_sister_city_info', 'SISTER-CITY RELATIONSHIP BETWEEN THE CITY OF LEGAZPI AND AYUNTAMIENTO ZUMARRAGA', 'scene_6'),
('show_miguel_legazpi_panel', 'THE CITY NAMED AFTER MIGUEL LOPEZ DE LEGAZPI', 'scene_6'),
('show_sawangan_panel', 'THE SETTLEMENT CALLED SAWANGAN', 'scene_7'),
('show_spanish_era_panel', 'SPANISH ERA', 'scene_7'),
('show_albay_viejo_panel', 'THE LEGEND OF ALBAY VIEJO & ALBAY', 'scene_8'),
('show_the_becerra_law_panel', 'THE BECERRA LAW', 'scene_8'),
('show_two_churches_panel', 'A TALE OF TWO CHURCHES', 'scene_8'),
('show_perils_panel', 'PERILS FROM THE SEA', 'scene_9'),
('show_the_battle_panel', 'THE BATTLE OF LEGAZPI USHERED IN THE AMERICAN REGIME', 'scene_9'),
('show_economic_trans_panel', 'ECONOMIC TRANSFORMATIONS UNDER THE AMERICAN REGIME', 'scene_9'),
('show_transport_panel', 'ECONOMIC TRANSFORMATIONS UNDER THE AMERICAN REGIME', 'scene_10'),
('show_japanese_panel', 'JAPANESE OCCUPATION', 'scene_10'),
('show_regime_panel', 'ECONOMIC TRANSFORMATIONS UNDER THE AMERICAN REGIME', 'scene_10'),
('show_republic_panel', 'REPUBLIC PERIOD FROM VILLAGE CITY', 'scene_11'),
('show_progress_panel', 'LEGAZPI CITY TOWARDS PROGRESS AND DEVELOPMENT', 'scene_11');

alter table public.tour_texts replica identity full;
do $do$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tour_texts') then
    execute 'alter publication supabase_realtime add table public.tour_texts';
  end if;
end;
$do$;
