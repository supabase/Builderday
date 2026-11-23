-- The pick: Ant and Copple's one choice from the thirty finalists, entered on the desk by a super admin. One row.
create table public.pick (
  one boolean primary key default true check (one),
  entry uuid not null references public.entries (id) on delete cascade,
  set_by uuid references public.people (id) on delete set null,
  at timestamptz not null default now()
);
alter table public.pick enable row level security;
revoke all on public.pick from anon, authenticated;
grant select (entry, at) on public.pick to anon, authenticated;
create policy pick_read on public.pick for select using (true);
