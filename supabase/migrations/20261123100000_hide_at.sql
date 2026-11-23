-- Votes are hidden from a minute of the day until voting closes. hide_at on the event: minutes after a place starts
-- building when its counts and order freeze for the public, until its voting closes; null never hides. Builder Day
-- hides from minute 70.
--
--   * counts_hidden(city): whether a place's counts are hidden now.
--   * tally is read by the public only while its place's counts show; a host, an admin or a judge of the place (and a
--     super admin) still reads it. The server's public answers freeze the counts themselves (lib/event/snapshot.ts).
--   * a public vote, or taking one back, answers with the counts left out while they are hidden.

alter table public.events add column hide_at int default 70 check (hide_at is null or hide_at between 0 and 600);
update public.events set hide_at = 70 where id = 'builder-day-2026';

create function public.counts_hidden(c text, at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select ev.hide_at is not null and x.build_start is not null and x.vote_end is not null
      and at >= x.build_start + make_interval(mins => ev.hide_at) and at < x.vote_end
    from public.cities x join public.events ev on ev.id = x.event where x.id = c), false)
$$;
grant execute on function public.counts_hidden(text, timestamptz) to anon, authenticated;

drop policy tally_read on public.tally;
create policy tally_read on public.tally for select using (
  not hidden and (not public.counts_hidden(city) or public.is_host(city) or public.is_judge(city))
);

-- the vote functions as before, with the counts left out of the answer while they are hidden
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
  if public.counts_hidden(c.id) then t.votes := null; t.judge_votes := null; t.reached_at := null; t.score_sum := null; t.score_n := null; end if;
  return t;
end $$;

create or replace function public.take_back_vote(entry_id uuid) returns public.tally
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
  if public.counts_hidden(c.id) then t.votes := null; t.judge_votes := null; t.reached_at := null; t.score_sum := null; t.score_n := null; end if;
  return t;
end $$;
