-- Who may submit: a place on the city's list, and a check-in with the room code typed with
-- that email (or a host marking the guest as in the room at the desk). The check-in is kept on the pass for the day:
-- changing the room code later does not undo it. Voting is unchanged.
-- No walk-ins: a place on a list comes from Luma or from a host, never from the room code.

alter table public.passes
  add column checked_in_at timestamptz,
  add column checked_in_how text check (checked_in_how in ('room', 'host')),
  add column checked_in_by uuid references public.people (id) on delete set null,   -- the host, when marked by hand
  add constraint passes_check_in check ((checked_in_at is null) = (checked_in_how is null));

update public.passes set source = 'host' where source = 'door';
alter table public.passes drop constraint passes_source_check;
alter table public.passes add constraint passes_source_check check (source in ('luma', 'host'));

-- a person reads their own check-in, as they read their own place
grant select (checked_in_at) on public.passes to authenticated;
