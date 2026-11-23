-- The event: cities, people and their places on a list, roles, entries, votes and their tally, the deck and what is on
-- the wall, the outbox, reminders and the log.
--
-- Rules this file keeps:
--   * Emails live in people (and outbox, reminders) only, and nothing the public can read returns one. Every table
--     starts with no privileges for anon and authenticated; each grant below is by column.
--   * Writes go through the functions at the end (security definer, each checking the role) or the site's server
--     with the service role. The public can read cities, visible entries, the tally, scenes and the stage.
--   * Times are end times (build_end, vote_end), set by the host when the clock starts; planned_start is what the
--     pages show before that.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.cities (
  id text primary key,
  i int not null unique,                       -- east to west, as the site orders them
  name text not null,
  zone text not null,                          -- IANA zone, for the city's own clock
  offset_min int not null,                     -- December offset from UTC, minutes
  venue text,
  luma_url text,
  editor_name text,                            -- the tool named on the wall; null says "your editor"
  planned_start timestamptz not null,
  build_min int not null default 90 check (build_min between 15 and 600),
  vote_after int not null default 30 check (vote_after between 0 and 240),
  build_start timestamptz,
  build_end timestamptz,
  vote_end timestamptz,
  room_code text,
  room_code_prev text,
  room_code_at timestamptz,
  submissions_paused boolean not null default false,
  voting_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique check (email::text = lower(email::text) and position('@' in email::text) > 1),
  name text check (char_length(name) <= 60),   -- the public name: from Luma, or typed on first submit; never from the email
  auth_user uuid unique references auth.users (id) on delete set null,
  first_ip inet,
  created_at timestamptz not null default now()
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  person uuid not null unique references public.people (id) on delete cascade,   -- one place per person
  city text not null references public.cities (id),
  source text not null check (source in ('luma', 'host', 'door')),
  key_version int not null default 1,          -- the personal key is derived from id and this; bump it to revoke
  added_by uuid references public.people (id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index passes_city on public.passes (city);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.people (id) on delete cascade,
  role text not null check (role in ('super', 'host', 'judge')),
  city text references public.cities (id),     -- null: every city
  budget int not null default 50 check (budget between 0 and 1000),   -- a judge's votes, in total
  added_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  check (role <> 'super' or city is null)
);
create unique index roles_one on public.roles (person, role, coalesce(city, '*'));

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  no bigint generated always as identity unique,   -- the number the pages use as a project's id
  city text not null references public.cities (id),
  owner uuid not null unique references public.people (id) on delete cascade,   -- one entry per person
  slug text not null,
  name text not null check (char_length(name) between 1 and 40),
  pitch text not null default '' check (char_length(pitch) <= 140),
  url text not null check (url ~* '^https?://'),
  repo text check (repo is null or repo ~* '^https://(www\.)?github\.com/'),
  video text check (video is null or video ~* '^https?://'),
  with_names text check (char_length(with_names) <= 120),
  picture text,
  picture_from text check (picture_from in ('share', 'shot', 'upload')),
  via text not null default 'web' check (via in ('editor', 'web')),
  flags text[] not null default '{}',
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, slug)
);
create index entries_city on public.entries (city) where hidden_at is null;

create table public.votes (
  id bigint generated always as identity primary key,
  entry uuid not null references public.entries (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('public', 'judge')),
  n int not null default 1,                    -- 1 for public; a judge's press may be several, or negative to take back
  ip inet,
  created_at timestamptz not null default now(),
  check (kind = 'judge' or n = 1)
);
create unique index votes_one_public on public.votes (entry, person) where kind = 'public';
create index votes_entry on public.votes (entry, created_at);
create index votes_person on public.votes (person, kind);

-- kept by the trigger on votes; the snapshot reads this, never count(*)
create table public.tally (
  entry uuid primary key references public.entries (id) on delete cascade,
  city text not null references public.cities (id),
  votes int not null default 0,                -- everything, judges included
  judge_votes int not null default 0,
  reached_at timestamptz not null default now(),  -- when the entry reached its count: the tie-break
  hidden boolean not null default false           -- mirrors entries.hidden_at, so the public's rule needs no other table
);
create index tally_city on public.tally (city, votes desc, reached_at);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  city text not null references public.cities (id) on delete cascade,
  position int not null,
  kind text not null,
  title text not null default '',
  data jsonb not null default '{}',
  notes text not null default '',
  hidden boolean not null default false,
  event boolean not null default false,        -- one of the deck's own scenes: can be hidden, not deleted
  created_at timestamptz not null default now()
);
create index scenes_city on public.scenes (city, position);

create table public.stage (
  city text primary key references public.cities (id) on delete cascade,
  scene uuid references public.scenes (id) on delete set null,
  step int not null default 0,
  timer jsonb,                                 -- { ends_at, paused_left }
  chart_on boolean not null default false,
  blank boolean not null default false,
  qr boolean not null default false,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null
);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  to_email extensions.citext not null,
  template text not null check (template in ('link', 'code', 'role', 'reminder', 'again')),
  city text references public.cities (id),
  data jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'not_sent')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_recent on public.outbox (created_at desc);
create index outbox_to on public.outbox (to_email, template, created_at desc);

create table public.reminders (
  email extensions.citext not null,
  city text not null references public.cities (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (email, city)
);

create table public.log (
  id bigint generated always as identity primary key,
  who uuid references public.people (id) on delete set null,
  what text not null,
  city text references public.cities (id),
  target text,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index log_recent on public.log (at desc);

-- ---------------------------------------------------------------- privileges: nothing by default, then by column

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select (id, i, name, zone, offset_min, venue, luma_url, editor_name, planned_start, build_min, vote_after,
  build_start, build_end, vote_end, submissions_paused, voting_paused, updated_at) on public.cities to anon, authenticated;
grant select (id, no, city, slug, name, pitch, url, repo, video, with_names, picture, via, created_at, updated_at)
  on public.entries to anon, authenticated;
grant select on public.tally to anon, authenticated;
grant select on public.scenes to anon, authenticated;
grant select on public.stage to anon, authenticated;
-- a signed-in person reads their own row, place, roles and votes (rows limited by the policies below)
grant select (id, email, name, created_at) on public.people to authenticated;
grant select (id, person, city, source, created_at) on public.passes to authenticated;
grant select (id, person, role, city, budget) on public.roles to authenticated;
grant select (id, entry, person, kind, n, created_at) on public.votes to authenticated;
grant select (hidden_at, flags) on public.entries to authenticated;
-- hosts change the deck and the wall of their city (rows limited by the policies below)
grant insert (city, position, kind, title, data, notes, hidden), update (position, title, data, notes, hidden),
  delete on public.scenes to authenticated;
grant update (scene, step, timer, chart_on, blank, qr, data, updated_at, updated_by) on public.stage to authenticated;

alter table public.cities enable row level security;
alter table public.people enable row level security;
alter table public.passes enable row level security;
alter table public.roles enable row level security;
alter table public.entries enable row level security;
alter table public.votes enable row level security;
alter table public.tally enable row level security;
alter table public.scenes enable row level security;
alter table public.stage enable row level security;
alter table public.outbox enable row level security;
alter table public.reminders enable row level security;
alter table public.log enable row level security;

-- ---------------------------------------------------------------- who is asking

create function public.me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.people where auth_user = auth.uid()
$$;

create function public.is_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'super')
$$;

create function public.is_host(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super() or exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'host' and (r.city is null or r.city = c))
$$;

create function public.is_judge(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'judge' and (r.city is null or r.city = c))
$$;

-- ---------------------------------------------------------------- policies

create policy cities_read on public.cities for select using (true);
create policy entries_read on public.entries for select using (hidden_at is null or owner = public.me() or public.is_host(city));
create policy tally_read on public.tally for select using (not hidden);
create policy scenes_read on public.scenes for select using (not hidden or public.is_host(city));
create policy scenes_host_insert on public.scenes for insert to authenticated with check (public.is_host(city) and not event);
create policy scenes_host_update on public.scenes for update to authenticated using (public.is_host(city)) with check (public.is_host(city));
create policy scenes_host_delete on public.scenes for delete to authenticated using (public.is_host(city) and not event);
create policy stage_read on public.stage for select using (true);
create policy stage_host on public.stage for update to authenticated using (public.is_host(city)) with check (public.is_host(city));
create policy people_self on public.people for select to authenticated using (auth_user = auth.uid());
create policy passes_self on public.passes for select to authenticated using (person = public.me());
create policy roles_self on public.roles for select to authenticated using (person = public.me());
create policy votes_self on public.votes for select to authenticated using (person = public.me());
-- outbox, reminders, log: no policy, so only the server (service role) reads or writes them

-- ---------------------------------------------------------------- the tally

create function public.tally_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e uuid := coalesce(new.entry, old.entry);
  d int := coalesce(case when tg_op = 'DELETE' then 0 else new.n end, 0) - coalesce(case when tg_op = 'INSERT' then 0 else old.n end, 0);
  dj int := case when coalesce(new.kind, old.kind) = 'judge' then d else 0 end;
begin
  if d = 0 then return null; end if;
  update public.tally t set
    votes = t.votes + d,
    judge_votes = t.judge_votes + dj,
    -- reaching a higher count is a new time; dropping back keeps the time the remaining votes reached it
    reached_at = case when d > 0 then now()
      else coalesce((select max(v.created_at) from public.votes v where v.entry = e and v.n > 0), t.reached_at) end
  where t.entry = e;
  return null;
end $$;
create trigger votes_tally after insert or update of n or delete on public.votes for each row execute function public.tally_votes();

create function public.entry_tally() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tally (entry, city, reached_at) values (new.id, new.city, new.created_at) on conflict (entry) do nothing;
  return null;
end $$;
create trigger entries_tally after insert on public.entries for each row execute function public.entry_tally();

create function public.entry_hidden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tally set hidden = new.hidden_at is not null where entry = new.id;
  return null;
end $$;
create trigger entries_hidden after update of hidden_at on public.entries for each row execute function public.entry_hidden();

create function public.touch_city() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger cities_touch before update on public.cities for each row execute function public.touch_city();

-- a Supabase Auth user is the person with that email; anyone confirming an email becomes a person (a voter)
create function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then return new; end if;
  insert into public.people (email, auth_user) values (lower(new.email), new.id)
  on conflict (email) do update set auth_user = excluded.auth_user;
  return new;
end $$;
create trigger auth_user_person after insert or update of email on auth.users for each row execute function public.link_auth_user();

-- ---------------------------------------------------------------- the clock

-- a city's phase now: 'next', 'build', 'vote' or 'done'
create function public.phase(c public.cities, at timestamptz default now()) returns text
language sql stable set search_path = '' as $$
  select case
    when c.build_start is null or at < c.build_start then 'next'
    when at < c.build_end then 'build'
    when at < c.vote_end then 'vote'
    else 'done' end
$$;

create function public.voting_open(c public.cities, at timestamptz default now()) returns boolean
language sql stable set search_path = '' as $$
  select c.build_start is not null and at >= c.build_start and at < c.vote_end and not c.voting_paused
$$;

-- ---------------------------------------------------------------- votes

-- one public vote per project per confirmed email, never on your own entry, nothing after voting closes
create function public.cast_vote(entry_id uuid, from_ip inet default null) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; t public.tally;
begin
  if who is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null or e.hidden_at is not null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  if not public.voting_open(c) then
    raise exception '%', case when c.voting_paused then 'Voting is paused in ' || c.name || '.'
      when c.build_start is null or now() < c.build_start then 'Voting in ' || c.name || ' opens when building starts.'
      else 'Voting in ' || c.name || ' has closed.' end using errcode = 'P0001';
  end if;
  if e.owner = who then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n, ip) values (entry_id, who, 'public', 1, from_ip)
  on conflict (entry, person) where kind = 'public' do nothing;
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

create function public.take_back_vote(entry_id uuid) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; t public.tally;
begin
  if who is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  if not public.voting_open(c) then raise exception 'Voting in % has closed.', c.name using errcode = 'P0001'; end if;
  delete from public.votes where votes.entry = entry_id and person = who and kind = 'public';
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

-- a judge has a budget in total (50 unless set otherwise) and may put several on one project; delta may be negative
-- to take some back, never below none on that project
create function public.judge_vote(entry_id uuid, delta int) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; t public.tally;
  budget int; used int; here int;
begin
  if who is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  if delta = 0 or abs(delta) > 50 then raise exception 'A press moves between 1 and 50 votes.' using errcode = '22023'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null or e.hidden_at is not null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  select max(r.budget) into budget from public.roles r where r.person = who and r.role = 'judge' and (r.city is null or r.city = e.city);
  if budget is null then raise exception 'Only a judge for % can do that.', c.name using errcode = '42501'; end if;
  if not public.voting_open(c) then raise exception 'Voting in % has closed.', c.name using errcode = 'P0001'; end if;
  if e.owner = who then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  -- one judge at a time, so two presses cannot both spend the last votes
  perform pg_advisory_xact_lock(hashtext('judge:' || who::text));
  select coalesce(sum(n), 0) into used from public.votes where person = who and kind = 'judge';
  select coalesce(sum(n), 0) into here from public.votes where person = who and kind = 'judge' and votes.entry = entry_id;
  if used + delta > budget then raise exception 'You have % of your % votes left.', budget - used, budget using errcode = 'P0001'; end if;
  if here + delta < 0 then raise exception 'You have % on this project.', here using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n) values (entry_id, who, 'judge', delta);
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

-- a judge's own count: used of budget, and per project
create function public.my_judging(c text) returns table (budget int, used int, per jsonb)
language sql stable security definer set search_path = '' as $$
  with b as (select max(r.budget) as budget from public.roles r where r.person = public.me() and r.role = 'judge' and (r.city is null or r.city = c)),
  mine as (select v.entry, sum(v.n)::int as n from public.votes v where v.person = public.me() and v.kind = 'judge' group by v.entry)
  select b.budget, coalesce((select sum(n) from mine), 0)::int,
    coalesce((select jsonb_object_agg(e.no::text, m.n) from mine m join public.entries e on e.id = m.entry where e.city = c and m.n > 0), '{}')
  from b where b.budget is not null
$$;

-- ---------------------------------------------------------------- the host's clock (also what the remote calls)

create function public.start_building(c text) returns public.cities
language plpgsql security definer set search_path = '' as $$
declare r public.cities;
begin
  if not public.is_host(c) then raise exception 'Only a host for this city can start the clock.' using errcode = '42501'; end if;
  update public.cities set build_start = now(), build_end = now() + make_interval(mins => build_min),
    vote_end = now() + make_interval(mins => build_min + vote_after)
  where id = c and build_start is null returning * into r;
  if r.id is null then raise exception 'The clock in this city has already started.' using errcode = 'P0001'; end if;
  insert into public.log (who, what, city) values (public.me(), 'start building', c);
  return r;
end $$;

-- add minutes to building (which also moves the vote's end) or to voting alone
create function public.add_minutes(c text, what text, mins int) returns public.cities
language plpgsql security definer set search_path = '' as $$
declare r public.cities;
begin
  if not public.is_host(c) then raise exception 'Only a host for this city can add time.' using errcode = '42501'; end if;
  if mins not between 1 and 60 then raise exception 'Add between 1 and 60 minutes.' using errcode = '22023'; end if;
  if what = 'build' then
    update public.cities set build_end = build_end + make_interval(mins => mins), vote_end = vote_end + make_interval(mins => mins)
    where id = c and build_start is not null and now() < build_end returning * into r;
  elsif what = 'vote' then
    update public.cities set vote_end = vote_end + make_interval(mins => mins)
    where id = c and build_start is not null and now() < vote_end returning * into r;
  else raise exception 'Add time to build or vote.' using errcode = '22023'; end if;
  if r.id is null then raise exception 'That part of the session is not running.' using errcode = 'P0001'; end if;
  insert into public.log (who, what, city, data) values (public.me(), 'add minutes', c, jsonb_build_object('to', what, 'mins', mins));
  return r;
end $$;

-- only a super admin ends building or voting early
create function public.end_early(c text, what text) returns public.cities
language plpgsql security definer set search_path = '' as $$
declare r public.cities;
begin
  if not public.is_super() then raise exception 'Only a super admin can end a session early.' using errcode = '42501'; end if;
  if what = 'build' then
    update public.cities set build_end = now(), vote_end = now() + make_interval(mins => vote_after)
    where id = c and build_start is not null and now() < build_end returning * into r;
  elsif what = 'vote' then
    update public.cities set vote_end = now(), build_end = least(build_end, now())
    where id = c and build_start is not null and now() < vote_end returning * into r;
  else raise exception 'End build or vote.' using errcode = '22023'; end if;
  if r.id is null then raise exception 'That part of the session is not running.' using errcode = 'P0001'; end if;
  insert into public.log (who, what, city, data) values (public.me(), 'end early', c, jsonb_build_object('what', what));
  return r;
end $$;

-- Postgres lets everyone execute a new function; nothing here is callable until granted below
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

grant execute on function public.me(), public.is_super(), public.is_host(text), public.is_judge(text) to anon, authenticated;
grant execute on function public.phase(public.cities, timestamptz), public.voting_open(public.cities, timestamptz) to anon, authenticated;
grant execute on function public.cast_vote(uuid, inet), public.take_back_vote(uuid), public.judge_vote(uuid, int),
  public.my_judging(text), public.start_building(text), public.add_minutes(text, text, int), public.end_early(text, text) to authenticated;

-- the stage follows its row through Realtime
alter publication supabase_realtime add table public.stage;
alter publication supabase_realtime add table public.scenes;
