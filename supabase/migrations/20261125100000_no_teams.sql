-- Builders enter on their own: teams are gone (decided 2026-11-25). This undoes 20261123120000_teams.sql.
--   * is_maker keeps its signature (cast_vote, judge_vote and judge_score call it) and means the entry's owner again.
--   * entries.with_names stays (it was there before teams); the names the team triggers wrote are cleared.
--   * events.teams and events.team_max go with the desk's Teams switch.
-- Order on the cloud project: deploy the code without teams first, then push this, since older code reads the tables.

create or replace function public.is_maker(who uuid, e public.entries) returns boolean
language sql stable security definer set search_path = '' as $$
  select e.owner = who
$$;

drop trigger if exists passes_team on public.passes;
drop trigger if exists people_team_names on public.people;
drop trigger if exists entries_team_names on public.entries;
drop trigger if exists team_members_names on public.team_members;

drop function if exists public.pass_team();
drop function if exists public.people_team_names();
drop function if exists public.entry_team_names();
drop function if exists public.team_members_names();
drop function if exists public.team_join(uuid, text, text);
drop function if exists public.team_make(uuid, text);
drop function if exists public.team_leave(uuid, text, boolean);
drop function if exists public.team_code();
drop function if exists public.team_set(text);
drop function if exists public.team_names_sync(uuid);
drop function if exists public.team_names(uuid);

update public.entries set with_names = null where team is not null;
alter table public.entries drop column team;
drop table public.team_members;
drop table public.teams;

alter table public.events drop column team_max, drop column teams;
