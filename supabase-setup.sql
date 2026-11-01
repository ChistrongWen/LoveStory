-- Run once in your own Supabase project's SQL Editor.
-- No public signup / anonymous access is needed. Create two users in Auth first.
begin;
create table if not exists public.love_journals (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的小日子'
);
create table if not exists public.love_members (
  journal_id uuid not null references public.love_journals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (journal_id, user_id)
);
create table if not exists public.love_memories (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.love_journals(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 50),
  date date not null,
  category text not null check (category in ('日常','游玩','美食')),
  location text not null default '' check (char_length(location) <= 40),
  text text not null check (char_length(text) between 1 and 1000),
  photo_path text,
  legacy_key text,
  created_at timestamptz not null default now(),
  unique(journal_id, legacy_key),
  check (photo_path is null or photo_path = journal_id::text || '/' || id::text || '.jpg')
);
alter table public.love_journals enable row level security;
alter table public.love_members enable row level security;
alter table public.love_memories enable row level security;
revoke all on public.love_journals, public.love_members, public.love_memories from anon, authenticated;
grant select on public.love_journals, public.love_members to authenticated;
grant select, insert, delete on public.love_memories to authenticated;
-- Users cannot add members, choose another journal, or change membership themselves.
drop policy if exists love_own_membership on public.love_members;
create policy love_own_membership on public.love_members for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists love_journal_read on public.love_journals;
create policy love_journal_read on public.love_journals for select to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id = id and m.user_id = (select auth.uid()))
);
drop policy if exists love_memory_read on public.love_memories;
create policy love_memory_read on public.love_memories for select to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id = love_memories.journal_id and m.user_id = (select auth.uid()))
);
drop policy if exists love_memory_add on public.love_memories;
create policy love_memory_add on public.love_memories for insert to authenticated with check (
  created_by = (select auth.uid()) and exists(select 1 from public.love_members m where m.journal_id = love_memories.journal_id and m.user_id = (select auth.uid()))
);
drop policy if exists love_memory_delete on public.love_memories;
create policy love_memory_delete on public.love_memories for delete to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id = love_memories.journal_id and m.user_id = (select auth.uid()))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('love-photos','love-photos',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'];
drop policy if exists love_photo_read on storage.objects;
create policy love_photo_read on storage.objects for select to authenticated using (
  bucket_id = 'love-photos' and exists(select 1 from public.love_members m where m.journal_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()))
);
drop policy if exists love_photo_add on storage.objects;
create policy love_photo_add on storage.objects for insert to authenticated with check (
  bucket_id = 'love-photos' and exists(select 1 from public.love_members m where m.journal_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()))
);
drop policy if exists love_photo_delete on storage.objects;
create policy love_photo_delete on storage.objects for delete to authenticated using (
  bucket_id = 'love-photos' and exists(select 1 from public.love_members m where m.journal_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()))
);
commit;
-- Create one journal only if not already present; keep the returned UUID.
insert into public.love_journals(name)
select '我们的小日子' where not exists(select 1 from public.love_journals)
returning id;
select id, name from public.love_journals;
-- NEXT: edit and execute the following separately, with real UUIDs, no quotes removed:
-- insert into public.love_members(journal_id,user_id) values
-- ('JOURNAL_UUID','FIRST_AUTH_USER_UUID'),
-- ('JOURNAL_UUID','SECOND_AUTH_USER_UUID') on conflict do nothing;
