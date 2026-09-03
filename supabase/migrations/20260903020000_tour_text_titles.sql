-- Allow administrators to edit the visitor-facing hotspot title as well as its paragraph.
-- Run after 20260903010000_tour_texts.sql.

grant update (title, text) on public.tour_texts to authenticated;

create or replace function private.audit_tour_text_change()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), new.id, 'CREATE', pg_catalog.to_jsonb(new)::text);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.title is not distinct from old.title and new.text is not distinct from old.text then return new; end if;
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), new.id, 'UPDATE', pg_catalog.jsonb_build_object('before', pg_catalog.jsonb_build_object('title', old.title, 'text', old.text), 'after', pg_catalog.jsonb_build_object('title', new.title, 'text', new.text))::text);
    return new;
  else
    insert into public.content_updates (admin_id, content_id, action, changed_text)
    values ((select auth.uid()), old.id, 'DELETE', old.text);
    return old;
  end if;
end;
$function$;
