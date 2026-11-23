-- Who votes when, what a judge's vote is worth, and ties at the top. Builder Day (owner, 2026-11-23): builders on a
-- place's list vote from the start until voting closes; everyone else, and the judges, from minute 60; a judge has 10
-- votes and each is worth 5; a tie for a place in the top of a place is settled by its host.
--
--   * events.public_at: minutes after a place starts building when anyone may vote, and the judges; before it only
--     people with a place on that place's list. null: everyone from the start.
--   * events.judge_weight: what one judge's vote counts in the tally. tally.votes and tally.judge_votes are in counted
--     votes (a judge's press of 2 adds 10 at weight 5); a judge's budget and my_judging stay in the judge's own votes.
--   * entries.tie_rank: the host's order inside a tie, 1 first; read only where the counts are equal, set once voting
--     has closed (settle_tie).

alter table public.events
  add column public_at int default null check (public_at is null or public_at between 0 and 600),
  add column judge_weight int not null default 1 check (judge_weight between 1 and 20);
update public.events set public_at = 60, judge_weight = 5, judge_budget = 10 where id = 'builder-day-2026';
update public.roles set budget = 10 where event = 'builder-day-2026' and role = 'judge' and budget = 50;

alter table public.entries add column tie_rank int check (tie_rank is null or tie_rank between 1 and 1000);

-- the weight of one judge's vote on an entry
create function public.judge_weight_of(entry_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select ev.judge_weight from public.entries e join public.events ev on ev.id = e.event where e.id = entry_id), 1)
$$;

-- the tally, with a judge's vote at its weight
create or replace function public.tally_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e uuid := coalesce(new.entry, old.entry);
  w int := case when coalesce(new.kind, old.kind) = 'judge' then public.judge_weight_of(e) else 1 end;
  d int := w * (coalesce(case when tg_op = 'DELETE' then 0 else new.n end, 0) - coalesce(case when tg_op = 'INSERT' then 0 else old.n end, 0));
  dj int := case when coalesce(new.kind, old.kind) = 'judge' then d else 0 end;
begin
  if d = 0 then return null; end if;
  update public.tally t set
    votes = t.votes + d,
    judge_votes = t.judge_votes + dj,
    reached_at = case when d > 0 then now()
      else coalesce((select max(v.created_at) from public.votes v where v.entry = e and v.n > 0), t.reached_at) end
  where t.entry = e;
  return null;
end $$;

-- the judge votes already in, counted again at their event's weight
update public.tally t set votes = t.votes + j.extra, judge_votes = t.judge_votes + j.extra
from (select v.entry, sum(v.n) * (public.judge_weight_of(v.entry) - 1) as extra from public.votes v where v.kind = 'judge' group by v.entry) j
where j.entry = t.entry and j.extra <> 0;

-- whether anyone may vote in a place now, or only its builders (and when that changes)
create function public.public_from(c public.cities) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when c.build_start is null then null
    else c.build_start + make_interval(mins => coalesce((select ev.public_at from public.events ev where ev.id = c.event), 0)) end
$$;
create function public.is_peer(who uuid, c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.passes s where s.person = who and s.city = c)
$$;
revoke execute on function public.is_peer(uuid, text), public.judge_weight_of(uuid) from public, anon, authenticated;

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
  if e.owner = who then raise exception 'You can’t vote for your own project.' using errcode = 'P0001'; end if;
  insert into public.votes (entry, person, kind, n, ip) values (entry_id, who, 'public', 1, from_ip)
  on conflict (entry, person) where kind = 'public' do nothing;
  select * into t from public.tally where tally.entry = entry_id;
  if public.counts_hidden(c.id) then t.votes := null; t.judge_votes := null; t.reached_at := null; t.score_sum := null; t.score_n := null; end if;
  return t;
end $$;

-- a judge votes from the same minute as the public; the rest as before
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

-- The host's order for entries tied on votes, once voting has closed: entries in the order given get tie_rank 1, 2,
-- and so on. Every entry must be visible, in the place, and on the same count; null clears the place's ties.
create function public.settle_tie(c text, entry_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare x public.cities; n int; counts int;
begin
  if not public.is_host(c) and not public.is_admin(public.event_of(c)) then raise exception 'Only a host for this place can settle a tie.' using errcode = '42501'; end if;
  select * into x from public.cities where id = c;
  if x.vote_end is null or now() < x.vote_end then raise exception 'A tie is settled once voting in % has closed.', x.name using errcode = 'P0001'; end if;
  if entry_ids is null then update public.entries set tie_rank = null where city = c; return; end if;
  select count(*), count(distinct t.votes) into n, counts from public.entries e join public.tally t on t.entry = e.id
    where e.id = any(entry_ids) and e.city = c and e.hidden_at is null;
  if n <> cardinality(entry_ids) or n < 2 then raise exception 'Give two or more projects from this place.' using errcode = '22023'; end if;
  if counts <> 1 then raise exception 'Those projects are not tied.' using errcode = 'P0001'; end if;
  update public.entries e set tie_rank = k.i from unnest(entry_ids) with ordinality as k(id, i) where e.id = k.id;
  insert into public.log (who, city, what, data) values (public.me(), c, 'tie settled', jsonb_build_object('entries', entry_ids));
end $$;
grant execute on function public.settle_tie(text, uuid[]) to authenticated;
