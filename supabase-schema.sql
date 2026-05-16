create table if not exists public.rooms (
  id text primary key,
  data jsonb not null default '{"people":[],"expenses":[],"repayments":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "rooms are readable by room link" on public.rooms;
drop policy if exists "rooms can be created by room link" on public.rooms;
drop policy if exists "rooms can be updated by room link" on public.rooms;

create policy "rooms are readable by room link"
on public.rooms
for select
to anon
using (true);

create policy "rooms can be created by room link"
on public.rooms
for insert
to anon
with check (true);

create policy "rooms can be updated by room link"
on public.rooms
for update
to anon
using (true)
with check (true);
