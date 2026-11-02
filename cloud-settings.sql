-- Run after supabase-setup.sql and supabase-todos.sql.
begin;
create table if not exists public.love_settings (
  journal_id uuid not null references public.love_journals(id) on delete cascade,
  key text not null check (key in ('anniversary','notes','places','music')),
  value jsonb not null check (octet_length(value::text)<=500000),
  version integer not null default 1 check (version>0),
  primary key(journal_id,key)
);
alter table public.love_settings enable row level security;
revoke all on public.love_settings from public,anon,authenticated;
grant select,insert on public.love_settings to authenticated;
grant update(value,version) on public.love_settings to authenticated;
create policy settings_read on public.love_settings for select to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_settings.journal_id and m.user_id=(select auth.uid())));
create policy settings_add on public.love_settings for insert to authenticated with check (
  version=1 and exists(select 1 from public.love_members m where m.journal_id=love_settings.journal_id and m.user_id=(select auth.uid())));
create policy settings_update on public.love_settings for update to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_settings.journal_id and m.user_id=(select auth.uid()))) with check (
  exists(select 1 from public.love_members m where m.journal_id=love_settings.journal_id and m.user_id=(select auth.uid())));
alter table public.love_memories add column if not exists version integer not null default 1;
grant update(title,date,category,location,text,version) on public.love_memories to authenticated;
create policy memory_edit on public.love_memories for update to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_memories.journal_id and m.user_id=(select auth.uid()))) with check (
  exists(select 1 from public.love_members m where m.journal_id=love_memories.journal_id and m.user_id=(select auth.uid())));
grant update(title) on public.love_todos to authenticated;
grant delete on public.love_todos to authenticated;
create policy todo_delete on public.love_todos for delete to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_todos.journal_id and m.user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('love-media','love-media',false,20971520,array['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/ogg','audio/webm'])
on conflict(id) do nothing;
create policy media_read on storage.objects for select to authenticated using (
  bucket_id='love-media' and exists(select 1 from public.love_members m where m.journal_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())));
create policy media_add on storage.objects for insert to authenticated with check (
  bucket_id='love-media' and exists(select 1 from public.love_members m where m.journal_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())));
create policy media_remove on storage.objects for delete to authenticated using (
  bucket_id='love-media' and exists(select 1 from public.love_members m where m.journal_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())));
commit;
