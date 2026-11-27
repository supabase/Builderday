-- One block of building and voting per place (decided 2026-11-25): there is no voting after building any more.
--   * Building and submitting run the whole time (build_min, 90). Voting closes with building: vote_after is 0.
--   * events.public_at: minutes after a place starts when voting opens, for everyone alike (45). The builders' head
--     start is gone, and is_peer with it.
--   * events.judge_at (new): minutes after the start when judges may vote (60); null: with everyone else.
--   * events.show_at (new): counts are hidden from the start until this minute, then shown live (60); null: never
--     hidden. It replaces hide_at, which hid the last stretch until the close.
-- The tally's public read, cast_vote and judge_vote keep their shape; only the windows change.

alter table public.events
  add column judge_at int default null check (judge_at is null or judge_at between 0 and 600),
  add column show_at int default null check (show_at is null or show_at between 0 and 600),
  alter column vote_after set default 0;
alter table public.cities alter column vote_after set default 0;

update public.events set vote_after = 0, public_at = 45, judge_at = 60, show_at = 60, pickers = 'the Supabase team',
  prize = 'A MacBook Pro', place_prize = 'A Meta Quest 3S'
  where id = 'builder-day-2026';
update public.cities set vote_after = 0, vote_end = case when build_end is null then vote_end else build_end end
  where event = 'builder-day-2026' and (build_end is null or now() < build_end or vote_end is null);

-- ---------------------------------------------------------------- windows

-- hidden from the start until show_at, and never after voting has closed
create or replace function public.counts_hidden(c text, at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select ev.show_at is not null and x.build_start is not null
      and at >= x.build_start and at < x.build_start + make_interval(mins => ev.show_at)
      and (x.vote_end is null or at < x.vote_end)
    from public.cities x join public.events ev on ev.id = x.event where x.id = c), false)
$$;

alter table public.events drop column hide_at;

create function public.judge_from(c public.cities) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when c.build_start is null then null
    else c.build_start + make_interval(mins => coalesce((select coalesce(ev.judge_at, ev.public_at) from public.events ev where ev.id = c.event), 0)) end
$$;

-- the clock time of a moment in the place's own zone, for refusals
create function public.local_hhmm(c public.cities, t timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char((t at time zone 'UTC') + make_interval(mins => c.offset_min), 'HH24:MI')
$$;

-- ---------------------------------------------------------------- votes

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
  if c.build_start is null then
    raise exception 'Voting in % opens % minutes into building.', c.name, coalesce(ev.public_at, 0) using errcode = 'P0001';
  end if;
  if not public.voting_open(c) then
    raise exception '%', case when c.voting_paused then 'Voting is paused in ' || c.name || '.'
      else 'Voting in ' || c.name || ' has closed.' end using errcode = 'P0001';
  end if;
  if now() < public.public_from(c) then
    raise exception 'Voting in % opens at %.', c.name, public.local_hhmm(c, public.public_from(c)) using errcode = 'P0001';
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
  if c.build_start is null then
    raise exception 'Judges in % vote from % minutes into building.', c.name, coalesce(ev.judge_at, ev.public_at, 0) using errcode = 'P0001';
  end if;
  if not public.voting_open(c) then raise exception 'Voting in % has closed.', c.name using errcode = 'P0001'; end if;
  if now() < public.judge_from(c) then
    raise exception 'Judges in % vote from %.', c.name, public.local_hhmm(c, public.judge_from(c)) using errcode = 'P0001';
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

drop function if exists public.is_peer(uuid, text);

revoke execute on function public.judge_from(public.cities), public.local_hhmm(public.cities, timestamptz) from public, anon, authenticated;
