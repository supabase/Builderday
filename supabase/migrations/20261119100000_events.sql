-- Many events on one desk. Builder Day becomes the first row of events with today's rules written out, and every
-- other event chooses its own.
--
--   * events: the name, the day and the format. decide says who decides a place's ranking: 'votes' (anyone with an
--     email), 'judges', 'both' (judges' votes count in the same tally, as Builder Day does) or 'apart' (a people's
--     choice and a judges' ranking, each its own). judging says how judges judge: a budget of votes, or scores of 1 to 5
--     on each criterion. Scores only where judges decide alone or apart: in one tally a score has no place.
--     final_on, finalists and final_by: the final across places (the top N of each, decided by the named pickers or by
--     the event's judges). The rules for an entry are switches; the prizes are words.
--   * cities are the places. A place keeps its global id; a new event's place takes a longer one when the short one is
--     taken (the desk makes it).
--   * roles: a role is in one event, except super. admin is new: everything in one event.
--   * entries: one per person per event (event is copied from the place). url may be empty where the event allows.
--   * scores: one judge's score on one criterion of one entry; the tally keeps their sum and how many judges scored.
--   * pick: one per event.

-- ---------------------------------------------------------------- events

alter table public.events
  add column name text not null default 'Supabase Builder Day' check (char_length(name) between 2 and 60),
  add column short text not null default 'Builder Day' check (char_length(short) between 2 and 30),
  add column day date not null default '2026-12-10',
  add column archived_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column decide text not null default 'both' check (decide in ('votes', 'judges', 'both', 'apart')),
  add column judging text not null default 'budget' check (judging in ('budget', 'scores')),
  add column judge_budget int not null default 50 check (judge_budget between 1 and 1000),
  add column criteria jsonb not null default '[{"id":"idea","name":"Idea"},{"id":"build","name":"Execution"},{"id":"supabase","name":"Use of Supabase"}]',
  add column final_on boolean not null default true,
  add column finalists int not null default 3 check (finalists between 1 and 20),
  add column final_by text not null default 'pickers' check (final_by in ('pickers', 'judges')),
  add column pickers text not null default 'Ant and Copple' check (char_length(pickers) <= 80),
  add column build_min int not null default 90 check (build_min between 15 and 600),
  add column vote_after int not null default 30 check (vote_after between 0 and 240),
  add column room_code boolean not null default true,
  add column repo_required boolean not null default true,
  add column repo_new boolean not null default true,
  add column teams boolean not null default true,
  add column demo_required boolean not null default false,
  add column prize text not null default '$10,000' check (char_length(prize) <= 120),
  add column place_prize text not null default 'A MacBook Neo' check (char_length(place_prize) <= 120),
  add constraint events_scores_alone check (judging = 'budget' or decide in ('judges', 'apart')),
  add constraint events_criteria check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) between 1 and 6);
alter table public.events alter column day drop default;

-- the place's own prize, when it differs from the event's
alter table public.cities add column prize text check (char_length(prize) <= 120);
alter table public.cities alter column event drop default;
create index cities_event on public.cities (event, i);

-- ---------------------------------------------------------------- roles

alter table public.roles add column event text references public.events (id) on delete cascade;
update public.roles r set event = coalesce((select c.event from public.cities c where c.id = r.city), 'builder-day-2026') where r.role <> 'super';
alter table public.roles drop constraint roles_role_check;
alter table public.roles add constraint roles_role_check check (role in ('super', 'admin', 'host', 'judge'));
alter table public.roles add constraint roles_event check ((role = 'super') = (event is null));
alter table public.roles add constraint roles_admin_event check (role <> 'admin' or city is null);
drop index public.roles_one;
create unique index roles_one on public.roles (person, role, coalesce(event, '*'), coalesce(city, '*'));
-- a place's role must be for a place in the same event
create function public.role_place() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.city is not null and not exists (select 1 from public.cities where id = new.city and event = new.event) then
    raise exception 'That place is not in this event.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger roles_place before insert or update on public.roles for each row execute function public.role_place();

-- ---------------------------------------------------------------- entries

alter table public.entries add column event text references public.events (id);
update public.entries e set event = c.event from public.cities c where c.id = e.city;
alter table public.entries alter column event set not null;
alter table public.entries drop constraint entries_owner_key;
alter table public.entries add constraint entries_owner_event unique (owner, event);
alter table public.entries alter column url drop not null;
create function public.entry_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select event into new.event from public.cities where id = new.city;
  return new;
end $$;
create trigger entries_event before insert or update of city on public.entries for each row execute function public.entry_event();
grant select (event) on public.entries to anon, authenticated;

-- ---------------------------------------------------------------- scores

alter table public.tally add column score_sum int not null default 0, add column score_n int not null default 0;

create table public.scores (
  entry uuid not null references public.entries (id) on delete cascade,
  judge uuid not null references public.people (id) on delete cascade,
  criterion text not null check (criterion ~ '^[a-z0-9-]{1,30}$'),
  score int not null check (score between 1 and 5),
  at timestamptz not null default now(),
  primary key (entry, judge, criterion)
);
create index scores_judge on public.scores (judge);
alter table public.scores enable row level security;
grant select (entry, judge, criterion, score) on public.scores to authenticated;
create policy scores_self on public.scores for select to authenticated using (judge = public.me());

create function public.tally_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e uuid := coalesce(new.entry, old.entry);
begin
  if not exists (select 1 from public.entries where id = e) then return null; end if;
  /* the row first, so two judges saving at once count each other: the update below then reads after the other one */
  perform 1 from public.tally where entry = e for update;
  update public.tally t set
    score_sum = coalesce((select sum(s.score) from public.scores s where s.entry = e), 0),
    score_n = (select count(distinct s.judge) from public.scores s where s.entry = e)
  where t.entry = e;
  return null;
end $$;
create trigger scores_tally after insert or update or delete on public.scores for each row execute function public.tally_scores();

-- ---------------------------------------------------------------- the pick: one per event

alter table public.pick add column event text references public.events (id) on delete cascade;
update public.pick set event = 'builder-day-2026';
alter table public.pick alter column event set not null;
alter table public.pick drop constraint pick_pkey;
alter table public.pick drop column one;
alter table public.pick add primary key (event);
grant select (event) on public.pick to anon, authenticated;

-- ---------------------------------------------------------------- who is asking, by event

create function public.event_of(c text) returns text
language sql stable security definer set search_path = '' as $$
  select event from public.cities where id = c
$$;

create function public.is_admin(ev text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super() or exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'admin' and r.event = ev)
$$;

create or replace function public.is_host(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(public.event_of(c)) or exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'host' and r.event = public.event_of(c) and (r.city is null or r.city = c))
$$;

create or replace function public.is_judge(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.roles r join public.people p on p.id = r.person
    where p.auth_user = auth.uid() and r.role = 'judge' and r.event = public.event_of(c) and (r.city is null or r.city = c))
$$;

-- ---------------------------------------------------------------- votes, by the event's format

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
  if e.owner = who then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n, ip) values (entry_id, who, 'public', 1, from_ip)
  on conflict (entry, person) where kind = 'public' do nothing;
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

-- the judge's role that counts for this place: one for the place itself first, then one for the whole event
create function public.judge_role(who uuid, c text) returns public.roles
language sql stable security definer set search_path = '' as $$
  select r.* from public.roles r where r.person = who and r.role = 'judge' and r.event = public.event_of(c) and (r.city is null or r.city = c)
  order by (r.city is null), r.budget desc limit 1
$$;

-- A judge's budget is for the role's own scope: one place, or the whole event. A press may put several on one project,
-- or take some back (never below none on that project).
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
  if e.owner = who then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
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

-- a judge's score of 1 to 5 on one criterion; null takes it back. While voting is open, as votes are.
create function public.judge_score(entry_id uuid, crit text, val int) returns public.tally
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
  if e.owner = who then raise exception 'You can’t judge your own project.' using errcode = 'P0001'; end if;
  if val is null then delete from public.scores where entry = entry_id and judge = who and criterion = crit;
  else insert into public.scores (entry, judge, criterion, score) values (entry_id, who, crit, val)
    on conflict (entry, judge, criterion) do update set score = excluded.score, at = now(); end if;
  select * into t from public.tally where tally.entry = entry_id;
  return t;
end $$;

-- a judge's own count in a place: budget, used (in the role's scope) and per project
create or replace function public.my_judging(c text) returns table (budget int, used int, per jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare r public.roles; ev text := public.event_of(c);
begin
  r := public.judge_role(public.me(), c);
  if r.id is null then return; end if;
  return query
  with mine as (select v.entry, sum(v.n)::int as n from public.votes v join public.entries x on x.id = v.entry
    where v.person = public.me() and v.kind = 'judge' and x.event = ev and (r.city is null or x.city = r.city) group by v.entry)
  select r.budget, coalesce((select sum(n) from mine), 0)::int,
    coalesce((select jsonb_object_agg(e.no::text, m.n) from mine m join public.entries e on e.id = m.entry where e.city = c and m.n > 0), '{}');
end $$;

revoke execute on function public.event_of(text), public.judge_role(uuid, text), public.judge_score(uuid, text, int), public.is_admin(text) from public, anon, authenticated;
grant execute on function public.event_of(text), public.is_admin(text) to anon, authenticated;
grant execute on function public.judge_score(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------- the log, by event; ending early, by an event's admin

alter table public.log add column event text references public.events (id) on delete cascade;
update public.log l set event = coalesce((select c.event from public.cities c where c.id = l.city), 'builder-day-2026');
create index log_event on public.log (event, at desc);

create or replace function public.end_early(c text, what text) returns public.cities
language plpgsql security definer set search_path = '' as $$
declare r public.cities;
begin
  if not public.is_admin(public.event_of(c)) then raise exception 'Only an admin of this event can end a session early.' using errcode = '42501'; end if;
  if what = 'build' then
    update public.cities set build_end = now(), vote_end = now() + make_interval(mins => vote_after)
    where id = c and build_start is not null and now() < build_end returning * into r;
  elsif what = 'vote' then
    update public.cities set vote_end = now(), build_end = least(build_end, now())
    where id = c and build_start is not null and now() < vote_end returning * into r;
  else raise exception 'End build or vote.' using errcode = '22023'; end if;
  if r.id is null then raise exception 'That part of the session is not running.' using errcode = 'P0001'; end if;
  insert into public.log (who, what, city, event, data) values (public.me(), 'end early', c, r.event, jsonb_build_object('what', what));
  return r;
end $$;

-- the clock's own log lines carry the event
create function public.log_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event is null and new.city is not null then select event into new.event from public.cities where id = new.city; end if;
  return new;
end $$;
create trigger log_event before insert on public.log for each row execute function public.log_event();
