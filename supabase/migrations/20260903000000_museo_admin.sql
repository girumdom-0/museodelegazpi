-- Museo de Legazpi: text-only artifact administration
--
-- Run through the Supabase CLI/migrations system or the SQL editor as the
-- project owner. The browser must use only the publishable (or legacy anon)
-- key; never expose a service-role key.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- A user becomes an administrator only when a project owner adds their
-- auth.users UUID here. There is deliberately no client write policy.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  -- Stable slug used by the public tour/hotspot code, not the database UUID.
  artifact_id text not null,
  title text not null,
  category text not null,
  description text not null default '',
  historical_info text not null default '',
  -- This maps to the existing Krpano scene identifier, for example scene_6.
  area_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifacts_artifact_id_format
    check (artifact_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint artifacts_title_not_blank
    check (char_length(btrim(title)) between 1 and 300),
  constraint artifacts_category_not_blank
    check (char_length(btrim(category)) between 1 and 100),
  constraint artifacts_area_id_not_blank
    check (char_length(btrim(area_id)) between 1 and 120),
  constraint artifacts_description_size
    check (char_length(description) <= 20000),
  constraint artifacts_historical_info_size
    check (char_length(historical_info) <= 30000)
);

-- An audit entry intentionally has no foreign keys. It must outlive a deleted
-- artifact or an off-boarded auth user. changed_text stores JSON text so it
-- remains compatible with the requested text column while retaining before/
-- after snapshots.
create table if not exists public.content_updates (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  artifact_id uuid not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  changed_text text not null,
  "timestamp" timestamptz not null default now()
);

create unique index if not exists artifacts_artifact_id_key
  on public.artifacts (artifact_id);
create index if not exists artifacts_area_id_idx
  on public.artifacts (area_id);
create index if not exists artifacts_title_ci_idx
  on public.artifacts (lower(title));
create index if not exists content_updates_artifact_timestamp_idx
  on public.content_updates (artifact_id, "timestamp" desc);
create index if not exists content_updates_admin_timestamp_idx
  on public.content_updates (admin_id, "timestamp" desc);

-- The function lives outside exposed schemas and avoids recursive RLS when a
-- policy needs to check administrator membership.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_users as admin_user
    where admin_user.user_id = (select auth.uid())
  );
$function$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- artifact_id and area_id are routing identifiers for the tour. Staff can
-- create them, but subsequent CRUD is intentionally limited to text fields.
create or replace function private.prevent_artifact_routing_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.artifact_id is distinct from old.artifact_id
     or new.area_id is distinct from old.area_id then
    raise exception 'artifact_id and area_id cannot be changed after creation'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

create or replace function private.set_artifact_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- This database trigger is the sole author of audit rows. A client therefore
-- cannot omit, forge, edit, or delete an audit entry.
create or replace function private.audit_artifact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  audit_payload jsonb;
begin
  if tg_op = 'INSERT' then
    audit_payload := pg_catalog.jsonb_build_object(
      'after', pg_catalog.to_jsonb(new)
    );

    insert into public.content_updates (admin_id, artifact_id, action, changed_text)
    values ((select auth.uid()), new.id, 'CREATE', audit_payload::text);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Do not record a second entry when an unchanged form submission only
    -- advances updated_at.
    if new.title is not distinct from old.title
       and new.category is not distinct from old.category
       and new.description is not distinct from old.description
       and new.historical_info is not distinct from old.historical_info then
      return new;
    end if;

    audit_payload := pg_catalog.jsonb_build_object(
      'before', pg_catalog.to_jsonb(old),
      'after', pg_catalog.to_jsonb(new)
    );

    insert into public.content_updates (admin_id, artifact_id, action, changed_text)
    values ((select auth.uid()), new.id, 'UPDATE', audit_payload::text);
    return new;
  end if;

  -- DELETE: retain the original UUID and the full artifact snapshot even
  -- though the live artifact row no longer exists.
  audit_payload := pg_catalog.jsonb_build_object(
    'before', pg_catalog.to_jsonb(old)
  );

  insert into public.content_updates (admin_id, artifact_id, action, changed_text)
  values ((select auth.uid()), old.id, 'DELETE', audit_payload::text);
  return old;
end;
$function$;

revoke all on function private.prevent_artifact_routing_change() from public;
revoke all on function private.set_artifact_updated_at() from public;
revoke all on function private.audit_artifact_change() from public;
grant execute on function private.prevent_artifact_routing_change() to authenticated;
grant execute on function private.set_artifact_updated_at() to authenticated;
grant execute on function private.audit_artifact_change() to authenticated;

drop trigger if exists artifacts_10_prevent_routing_change on public.artifacts;
create trigger artifacts_10_prevent_routing_change
before update on public.artifacts
for each row execute function private.prevent_artifact_routing_change();

drop trigger if exists artifacts_20_set_updated_at on public.artifacts;
create trigger artifacts_20_set_updated_at
before update on public.artifacts
for each row execute function private.set_artifact_updated_at();

drop trigger if exists artifacts_90_audit_change on public.artifacts;
create trigger artifacts_90_audit_change
after insert or update or delete on public.artifacts
for each row execute function private.audit_artifact_change();

alter table public.admin_users enable row level security;
alter table public.artifacts enable row level security;
alter table public.content_updates enable row level security;

-- Start from least privilege. Grants decide whether a request can reach a
-- table; RLS policies below decide which rows and operations it can use.
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.artifacts from anon, authenticated;
revoke all on table public.content_updates from anon, authenticated;

-- A signed-in user may only check their own membership. This supports a
-- server-side /admin guard without exposing the list of administrators.
grant select (user_id) on table public.admin_users to authenticated;

-- Public tour visitors read safe, text-only artifact data. All writes are
-- limited to approved administrators and only allowed text columns can change.
grant select on table public.artifacts to anon, authenticated;
grant insert (artifact_id, title, category, description, historical_info, area_id)
  on table public.artifacts to authenticated;
grant update (title, category, description, historical_info)
  on table public.artifacts to authenticated;
grant delete on table public.artifacts to authenticated;

-- Audit records are visible to administrators but cannot be mutated from the
-- client. The trigger above inserts them with the acting auth.uid().
grant select on table public.content_updates to authenticated;

drop policy if exists "users can check own admin membership" on public.admin_users;
create policy "users can check own admin membership"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "public can read artifacts" on public.artifacts;
create policy "public can read artifacts"
on public.artifacts
for select
to anon, authenticated
using (true);

drop policy if exists "admins can create artifacts" on public.artifacts;
create policy "admins can create artifacts"
on public.artifacts
for insert
to authenticated
with check ((select private.is_admin()));

drop policy if exists "admins can update artifacts" on public.artifacts;
create policy "admins can update artifacts"
on public.artifacts
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins can delete artifacts" on public.artifacts;
create policy "admins can delete artifacts"
on public.artifacts
for delete
to authenticated
using ((select private.is_admin()));

drop policy if exists "admins can read audit log" on public.content_updates;
create policy "admins can read audit log"
on public.content_updates
for select
to authenticated
using ((select private.is_admin()));

-- Realtime is opt-in. The public read policy above is also evaluated for
-- subscribers, while content_updates deliberately stays out of the publication.
alter table public.artifacts replica identity full;

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'artifacts'
  ) then
    execute 'alter publication supabase_realtime add table public.artifacts';
  end if;
end;
$do$;

-- Bootstrap an account only after creating/inviting it in Supabase Auth:
-- insert into public.admin_users (user_id) values ('AUTH-USER-UUID-HERE');
