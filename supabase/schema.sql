-- My Tasks — schema del database.
-- Da eseguire una volta in Supabase > SQL Editor.

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  col text not null default 'today' check (col in ('later', 'month', 'week', 'today', 'done')),
  labels uuid[] not null default '{}',
  est int not null default 0,
  important boolean not null default false,
  recurring text not null default 'none' check (recurring in ('none', 'daily', 'weekly', 'monthly')),
  note text not null default '',
  due date,
  source text,
  prev_col text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  labels uuid[] not null default '{}',
  source text,
  sender text,
  subject text,
  reason text,
  confidence text,
  status text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  link text,
  source_key text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (user_id, source_key)
);

create index if not exists tasks_user_col on public.tasks (user_id, col);
create index if not exists proposals_user_status on public.proposals (user_id, status);

-- Ogni utente vede e modifica solo le proprie righe.
alter table public.labels enable row level security;
alter table public.tasks enable row level security;
alter table public.proposals enable row level security;

drop policy if exists "own labels" on public.labels;
create policy "own labels" on public.labels for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own proposals" on public.proposals;
create policy "own proposals" on public.proposals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permessi di accesso tramite Data API: nei progetti Supabase recenti le nuove tabelle
-- non sono esposte in automatico. Nessun permesso al ruolo anonimo.
grant select, insert, update, delete on public.labels, public.tasks, public.proposals to authenticated;
grant select, insert, update, delete on public.labels, public.tasks, public.proposals to service_role;
revoke all on public.labels, public.tasks, public.proposals from anon;

-- Aggiornamento in tempo reale tra PC e telefono.
do $$
begin
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.labels;
  alter publication supabase_realtime add table public.proposals;
exception when duplicate_object then null;
end $$;
