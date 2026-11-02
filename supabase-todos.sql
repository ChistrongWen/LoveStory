-- Run in the existing LoveStory Supabase project's SQL Editor.
-- Adds a shared checklist; existing memories and members are unchanged.
begin;
create table if not exists public.love_todos (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.love_journals(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  done boolean not null default false,
  legacy_key text,
  created_at timestamptz not null default now(),
  unique(journal_id, created_by, legacy_key)
);
alter table public.love_todos enable row level security;
revoke all on public.love_todos from public, anon, authenticated;
grant select, insert on public.love_todos to authenticated;
grant update(done) on public.love_todos to authenticated;
drop policy if exists love_todo_read on public.love_todos;
create policy love_todo_read on public.love_todos for select to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_todos.journal_id and m.user_id=(select auth.uid()))
);
drop policy if exists love_todo_add on public.love_todos;
create policy love_todo_add on public.love_todos for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(select 1 from public.love_members m where m.journal_id=love_todos.journal_id and m.user_id=(select auth.uid()))
);
drop policy if exists love_todo_check on public.love_todos;
create policy love_todo_check on public.love_todos for update to authenticated using (
  exists(select 1 from public.love_members m where m.journal_id=love_todos.journal_id and m.user_id=(select auth.uid()))
) with check (
  exists(select 1 from public.love_members m where m.journal_id=love_todos.journal_id and m.user_id=(select auth.uid()))
);
commit;
notify pgrst, 'reload schema';
