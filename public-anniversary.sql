-- Run once in project bpsuersynkgyndbzkeip. Only the anniversary is public.
begin;
insert into public.love_settings(journal_id,key,value,version)
values ('92c09416-9922-4eae-b381-ca27dc3e6217','anniversary','"2023-08-22"'::jsonb,1)
on conflict(journal_id,key) do update
set value=excluded.value,version=public.love_settings.version+1;

create or replace function public.love_public_anniversary()
returns text language sql stable security definer set search_path=''
as $$
  select case when jsonb_typeof(s.value)='string'
    and (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    then s.value #>> '{}' else null end
  from public.love_settings s
  where s.journal_id='92c09416-9922-4eae-b381-ca27dc3e6217'::uuid
    and s.key='anniversary';
$$;
revoke all on function public.love_public_anniversary() from public;
grant execute on function public.love_public_anniversary() to anon,authenticated;
commit;

select public.love_public_anniversary() as public_anniversary;
