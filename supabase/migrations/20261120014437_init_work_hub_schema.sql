-- 已套用到 Supabase 專案 work-hub (ogghvvfumnnavfbpzdfa)，版本 20261120014437
-- 這份是存檔副本，方便版本控管；不要再手動執行一次。
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  description text,
  status text not null default '待辦' check (status in ('待辦','進行中','完成')),
  priority text not null default '中' check (priority in ('高','中','低')),
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  tags text[] not null default '{}',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  icon text,
  parent_id uuid references public.pages(id) on delete cascade,
  content jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bureau_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bureau text not null default '',
  topic text,
  period text,
  item text,
  value numeric,
  unit text,
  status text not null default '未繳' check (status in ('未繳','已繳','已彙整')),
  submitted_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default '其他' check (category in ('案由','致詞稿','其他')),
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  note text,
  related_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create index tasks_user_id_idx on public.tasks(user_id);
create index pages_user_id_idx on public.pages(user_id);
create index pages_parent_id_idx on public.pages(parent_id);
create index bureau_submissions_user_id_idx on public.bureau_submissions(user_id);
create index templates_user_id_idx on public.templates(user_id);
create index events_user_id_idx on public.events(user_id);
create index events_start_at_idx on public.events(user_id, start_at);
create index events_related_task_id_idx on public.events(related_task_id);

do $$
declare t text;
begin
  foreach t in array array['tasks','pages','bureau_submissions','templates','events'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner can select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
