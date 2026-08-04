create extension if not exists pgcrypto;

create table if not exists public.build_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  week integer not null check (week between 1 and 53),
  day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  status text not null default 'Planned' check (status in ('Planned','Complete','Blocked')),
  notes text not null default '',
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.build_items enable row level security;

create policy "Anyone can view build schedule"
on public.build_items for select
to anon, authenticated
using (true);

create policy "Authenticated admins can add builds"
on public.build_items for insert
to authenticated
with check (true);

create policy "Authenticated admins can edit builds"
on public.build_items for update
to authenticated
using (true)
with check (true);

create policy "Authenticated admins can remove builds"
on public.build_items for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists build_items_set_updated_at on public.build_items;
create trigger build_items_set_updated_at
before update on public.build_items
for each row execute function public.set_updated_at();
