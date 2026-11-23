-- Teams (owner, 2026-11-23: "make it possible that for builder day we can form teams ... in account"). Builders on one
-- place's list build one entry together.
--   * teams: one per group, in one place (city) of one event, found by a code of three letters and three digits
--     (no I, L, O, 0 or 1, so it can be said across a room and typed from a phone). Anyone on that place's list who
--     has the code may join, up to events.team_max people (4 unless set).
--   * team_members: one team per person per event. A place that moves to another city, or goes, leaves the team.
--   * entries.team: a team has one entry, which any member may edit or delete. Whoever submitted it is its owner;
--     when the owner leaves, the longest-standing member who stays becomes the owner. entries.with_names holds the
--     members' public names ("Ana, Bo and Chi"), kept by the triggers below, so the pages read it with no new grant.
--   * Teams are set once building ends in their place: no joining or leaving after, so votes go to a known team.
--   * Nobody votes for, or judges, their own team's entry (is_maker).
-- Nothing is granted to anon or authenticated: the server reads and writes teams with the service role, and the
-- functions that change them take the person from the server. Refusals are plain sentences the pages show as said.

alter table public.events add column team_max int not null default 4 check (team_max between 2 and 10);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event text not null references public.events (id) on delete cascade,
  city text not null references public.cities (id) on delete cascade,
  code text not null check (code ~ '^[A-HJKMNP-Z]{3}[2-9]{3}$'),
  made_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event, code)
);
create index teams_city on public.teams (city);

create table public.team_members (
  team uuid not null references public.teams (id) on delete cascade,
  person uuid not null references public.people (id) on delete cascade,
  event text not null references public.events (id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (team, person),
  unique (person, event)
);

alter table public.entries add column team uuid unique references public.teams (id) on delete set null;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- ---------------------------------------------------------------- names

-- the members' public names in the order they joined, "Ana, Bo and Chi"; null for a team of one (the owner's name
-- stands alone then). A member with no name yet shows as "a builder".
create function public.team_names(t uuid) returns text
language sql stable security definer set search_path = '' as $$
  with n as (
    select coalesce(nullif(trim(p.name), ''), 'a builder') as nm, row_number() over (order by m.joined_at, m.person) as i, count(*) over () as k
    from public.team_members m join public.people p on p.id = m.person where m.team = t
  )
  select case when max(k) < 2 then null else left(string_agg(case when i = 1 then nm when i = k then ' and ' || nm else ', ' || nm end, '' order by i), 120) end from n
$$;

create function public.team_names_sync(t uuid) returns void
language sql security definer set search_path = '' as $$
  update public.entries set with_names = public.team_names(t) where team = t
$$;

create function public.team_members_names() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_names_sync(coalesce(new.team, old.team));
  return null;
end $$;
create trigger team_members_names after insert or delete on public.team_members for each row execute function public.team_members_names();

create function public.entry_team_names() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.with_names := case when new.team is null then null else public.team_names(new.team) end;
  return new;
end $$;
create trigger entries_team_names before insert or update of team on public.entries for each row execute function public.entry_team_names();

create function public.people_team_names() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.team_names_sync(m.team) from public.team_members m where m.person = new.id;
  return null;
end $$;
create trigger people_team_names after update of name on public.people for each row execute function public.people_team_names();

-- ---------------------------------------------------------------- who built it

create function public.is_maker(who uuid, e public.entries) returns boolean
language sql stable security definer set search_path = '' as $$
  select e.owner = who or (e.team is not null and exists (select 1 from public.team_members m where m.team = e.team and m.person = who))
$$;

-- ---------------------------------------------------------------- making, joining, leaving

-- building has ended in the team's place: the team is set
create function public.team_set(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select x.build_end is not null and now() >= x.build_end from public.cities x where x.id = c), false)
$$;

create function public.team_code() returns text
language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ'; d text := '23456789'; s text := ''; k int;
begin
  for k in 1..3 loop s := s || substr(a, 1 + floor(random() * 23)::int, 1); end loop;
  for k in 1..3 loop s := s || substr(d, 1 + floor(random() * 8)::int, 1); end loop;
  return s;
end $$;

-- leave the team in this event. force: the place moved or went (the trigger below), which holds even once the team
-- is set. The owner of the team's entry hands it to the member who joined first among those who stay; the last
-- member out closes the team, and the entry stays theirs, on its own.
create function public.team_leave(who uuid, ev text, force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.team_members; t public.teams; e public.entries; heir uuid;
begin
  select * into m from public.team_members where person = who and event = ev;
  if m.team is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('team:' || m.team::text));
  select * into t from public.teams where id = m.team;
  if not force and public.team_set(t.city) then
    raise exception 'Teams are set once building ends.' using errcode = 'P0001';
  end if;
  delete from public.team_members where team = t.id and person = who;
  select * into e from public.entries where team = t.id;
  select person into heir from public.team_members where team = t.id order by joined_at, person limit 1;
  if heir is null then
    delete from public.teams where id = t.id;
  elsif e.id is not null and e.owner = who then
    update public.entries set owner = heir, updated_at = now() where id = e.id;
  end if;
  insert into public.log (who, what, city, target) values (who, 'left a team', t.city, t.code);
end $$;

create function public.team_make(who uuid, ev text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare s public.passes; v public.events; t public.teams; c text; k int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('team-person:' || who::text));
  select * into v from public.events where id = ev;
  if v.id is null or not v.teams then raise exception 'Teams are off for this event.' using errcode = 'P0001'; end if;
  select * into s from public.passes where person = who and event = ev;
  if s.id is null then raise exception 'Only builders on a city’s list can make a team.' using errcode = '42501'; end if;
  if exists (select 1 from public.team_members where person = who and event = ev) then
    raise exception 'You are already in a team.' using errcode = 'P0001';
  end if;
  if public.team_set(s.city) then raise exception 'Teams are set once building ends.' using errcode = 'P0001'; end if;
  loop
    c := public.team_code(); k := k + 1;
    begin
      insert into public.teams (event, city, code, made_by) values (ev, s.city, c, who) returning * into t;
      exit;
    exception when unique_violation then
      if k > 20 then raise; end if;
    end;
  end loop;
  insert into public.team_members (team, person, event) values (t.id, who, ev);
  -- an entry already in is the team's from now on
  update public.entries set team = t.id where owner = who and event = ev and team is null;
  insert into public.log (who, what, city, target) values (who, 'made a team', s.city, t.code);
  return t;
end $$;

create function public.team_join(who uuid, ev text, typed text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare
  want text := upper(regexp_replace(coalesce(typed, ''), '[^A-Za-z0-9]', '', 'g'));
  s public.passes; v public.events; t public.teams; old public.team_members; mine public.entries; theirs public.entries;
  n int; cn text; tn text;
begin
  perform pg_advisory_xact_lock(hashtext('team-person:' || who::text));
  select * into v from public.events where id = ev;
  if v.id is null or not v.teams then raise exception 'Teams are off for this event.' using errcode = 'P0001'; end if;
  if want !~ '^[A-Z]{3}[0-9]{3}$' then raise exception 'A team code is three letters and three numbers, like KTR-482.' using errcode = '22023'; end if;
  select * into t from public.teams where event = ev and teams.code = want;
  if t.id is null then raise exception 'No team has that code. Check it with whoever made the team.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('team:' || t.id::text));
  select * into s from public.passes where person = who and event = ev;
  if s.id is null then raise exception 'Only builders on a city’s list can join a team.' using errcode = '42501'; end if;
  if s.city <> t.city then
    select name into tn from public.cities where id = t.city;
    select name into cn from public.cities where id = s.city;
    raise exception 'That team builds in %, and your place is in %. Join a team in your own city.', tn, cn using errcode = 'P0001';
  end if;
  select * into old from public.team_members where person = who and event = ev;
  if old.team = t.id then return t; end if;
  if public.team_set(t.city) then raise exception 'Teams are set once building ends.' using errcode = 'P0001'; end if;
  select count(*) into n from public.team_members where team = t.id;
  if n >= v.team_max then raise exception 'That team is full: % people already.', v.team_max using errcode = 'P0001'; end if;
  -- in a team of their own, with nobody else in it: they move, and their team closes
  if old.team is not null then
    if exists (select 1 from public.team_members where team = old.team and person <> who) then
      raise exception 'You are in another team. Leave it first, then join this one.' using errcode = 'P0001';
    end if;
  end if;
  select * into mine from public.entries where owner = who and event = ev;
  select * into theirs from public.entries where team = t.id;
  if mine.id is not null and theirs.id is not null and mine.id <> theirs.id then
    raise exception 'You have an entry, %, and this team has %. A team has one entry: delete yours first, or keep building on your own.', mine.name, theirs.name using errcode = 'P0001';
  end if;
  if old.team is not null then perform public.team_leave(who, ev); end if;
  insert into public.team_members (team, person, event) values (t.id, who, ev);
  if mine.id is not null then update public.entries set team = t.id where id = mine.id; end if;
  insert into public.log (who, what, city, target) values (who, 'joined a team', t.city, t.code);
  return t;
end $$;

-- a place that moves to another city, goes to another account or goes: its holder leaves their team there
create function public.pass_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people where id = old.person) then return null; end if;
  if tg_op = 'DELETE' or new.city is distinct from old.city or new.person is distinct from old.person then
    perform public.team_leave(old.person, old.event, true);
  end if;
  return null;
end $$;
create trigger passes_team after update of city, person or delete on public.passes for each row execute function public.pass_team();

-- ---------------------------------------------------------------- votes: never for your own team

create or replace function public.cast_vote(entry_id uuid, from_ip inet default null) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; ev public.events; t public.tally;
begin
  if who is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null or e.hidden_at is not null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  select * into ev from public.events where id = c.event;
  if ev.decide = 'judges' then raise exception 'In % the judges decide; there is no public vote.', ev.short using errcode = 'P0001'; end if;
  if not public.voting_open(c) then
    raise exception '%', case when c.voting_paused then 'Voting is paused in ' || c.name || '.'
      when c.build_start is null or now() < c.build_start then 'Voting in ' || c.name || ' opens when building starts.'
      else 'Voting in ' || c.name || ' has closed.' end using errcode = 'P0001';
  end if;
  if now() < public.public_from(c) and not public.is_peer(who, c.id) then
    raise exception 'Until % only the builders in % vote. Everyone can vote from then.',
      to_char((public.public_from(c) at time zone 'UTC') + make_interval(mins => c.offset_min), 'HH24:MI'), c.name using errcode = 'P0001';
  end if;
  if public.is_maker(who, e) then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n, ip) values (entry_id, who, 'public', 1, from_ip)
  on conflict (entry, person) where kind = 'public' do nothing;
  select * into t from public.tally where tally.entry = entry_id;
  if public.counts_hidden(c.id) then t.votes := null; t.judge_votes := null; t.reached_at := null; t.score_sum := null; t.score_n := null; end if;
  return t;
end $$;

create or replace function public.judge_vote(entry_id uuid, delta int) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; ev public.events; t public.tally; r public.roles;
  used int; here int;
begin
  if who is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  if delta = 0 or abs(delta) > 50 then raise exception 'A press moves between 1 and 50 votes.' using errcode = '22023'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null or e.hidden_at is not null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  select * into ev from public.events where id = c.event;
  r := public.judge_role(who, e.city);
  if r.id is null then raise exception 'Only a judge for % can do that.', c.name using errcode = '42501'; end if;
  if ev.decide = 'votes' then raise exception 'In % the votes decide; judges do not vote.', ev.short using errcode = 'P0001'; end if;
  if ev.judging = 'scores' then raise exception 'In % judges score each project instead.', ev.short using errcode = 'P0001'; end if;
  if not public.voting_open(c) then raise exception 'Voting in % has closed.', c.name using errcode = 'P0001'; end if;
  if now() < public.public_from(c) then
    raise exception 'Judges in % vote from %.', c.name, to_char((public.public_from(c) at time zone 'UTC') + make_interval(mins => c.offset_min), 'HH24:MI') using errcode = 'P0001';
  end if;
  if public.is_maker(who, e) then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('judge:' || who::text));
  select coalesce(sum(v.n), 0) into used from public.votes v join public.entries x on x.id = v.entry
    where v.person = who and v.kind = 'judge' and x.event = e.event and (r.city is null or x.city = r.city);
  select coalesce(sum(n), 0) into here from public.votes where person = who and kind = 'judge' and votes.entry = entry_id;
  if used + delta > r.budget then raise exception 'You have % of your % votes left.', r.budget - used, r.budget using errcode = 'P0001'; end if;
  if here + delta < 0 then raise exception 'You have % on this project.', here using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n) values (entry_id, who, 'judge', delta);
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

create or replace function public.judge_score(entry_id uuid, crit text, val int) returns public.tally
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := public.me();
  e public.entries; c public.cities; ev public.events; t public.tally; r public.roles;
begin
  if who is null then raise exception 'Sign in to judge.' using errcode = '28000'; end if;
  select * into e from public.entries where id = entry_id;
  if e.id is null or e.hidden_at is not null then raise exception 'That project is not in the list.' using errcode = 'P0002'; end if;
  select * into c from public.cities where id = e.city;
  select * into ev from public.events where id = c.event;
  r := public.judge_role(who, e.city);
  if r.id is null then raise exception 'Only a judge for % can do that.', c.name using errcode = '42501'; end if;
  if ev.judging <> 'scores' then raise exception 'In % judges vote instead of scoring.', ev.short using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(ev.criteria) x where x->>'id' = crit) then raise exception 'That is not one of the criteria.' using errcode = '22023'; end if;
  if val is not null and val not between 1 and 5 then raise exception 'A score is 1 to 5.' using errcode = '22023'; end if;
  if c.build_start is null or now() >= c.vote_end then raise exception 'Judging in % is not open.', c.name using errcode = 'P0001'; end if;
  if public.is_maker(who, e) then raise exception 'You can’t judge your own project.' using errcode = 'P0001'; end if;
  if val is null then delete from public.scores where entry = entry_id and judge = who and criterion = crit;
  else insert into public.scores (entry, judge, criterion, score) values (entry_id, who, crit, val)
    on conflict (entry, judge, criterion) do update set score = excluded.score, at = now(); end if;
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

revoke execute on function public.team_names(uuid), public.team_names_sync(uuid), public.is_maker(uuid, public.entries), public.team_set(text),
  public.team_code(), public.team_leave(uuid, text, boolean), public.team_make(uuid, text), public.team_join(uuid, text, text)
  from public, anon, authenticated;
