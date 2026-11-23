-- The voting rules, on the server:
-- one public vote per project per confirmed email; not on your own entry; nothing before building starts, after
-- voting closes or while it is paused; a judge has a budget in total, may put several on one project, and is counted
-- apart; a tie goes to who reached the count first. Also: only a host starts or extends the clock, only for their city.
begin;
select plan(30);

-- a test city of our own, live: building started ten minutes ago
insert into public.cities (id, i, name, zone, offset_min, planned_start, build_start, build_end, vote_end)
values ('t-live', 100, 'Testville', 'UTC', 0, now() - interval '10 minutes', now() - interval '10 minutes', now() + interval '80 minutes', now() + interval '110 minutes'),
       ('t-done', 101, 'Doneville', 'UTC', 0, now() - interval '3 hours', now() - interval '3 hours', now() - interval '90 minutes', now() - interval '60 minutes'),
       ('t-next', 102, 'Nextville', 'UTC', 0, now() + interval '1 hour', null, null, null);

-- people with Supabase Auth users (the trigger makes the people rows)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'builder.a@t.test'),
  ('00000000-0000-0000-0000-00000000000b', 'builder.b@t.test'),
  ('00000000-0000-0000-0000-00000000000c', 'voter.c@t.test'),
  ('00000000-0000-0000-0000-00000000000d', 'judge.d@t.test'),
  ('00000000-0000-0000-0000-00000000000e', 'judge.e@t.test'),
  ('00000000-0000-0000-0000-00000000000f', 'host.f@t.test');
select is((select count(*)::int from public.people where email::text like '%@t.test' and auth_user is not null), 6, 'every confirmed email is a person');

insert into public.entries (id, city, owner, slug, name, url) values
  ('10000000-0000-0000-0000-00000000000a', 't-live', (select id from public.people where email = 'builder.a@t.test'), 'a', 'Entry A', 'https://a.test'),
  ('10000000-0000-0000-0000-00000000000b', 't-live', (select id from public.people where email = 'builder.b@t.test'), 'b', 'Entry B', 'https://b.test');
insert into public.people (email) values ('owner.done@t.test'), ('owner.next@t.test');
insert into public.entries (id, city, owner, slug, name, url) values
  ('10000000-0000-0000-0000-0000000000d0', 't-done', (select id from public.people where email = 'owner.done@t.test'), 'd', 'Entry D', 'https://d.test'),
  ('10000000-0000-0000-0000-0000000000e0', 't-next', (select id from public.people where email = 'owner.next@t.test'), 'n', 'Entry N', 'https://n.test');
insert into public.roles (person, role, city) values
  ((select id from public.people where email = 'judge.d@t.test'), 'judge', 't-live'),
  ((select id from public.people where email = 'judge.e@t.test'), 'judge', 't-done'),
  ((select id from public.people where email = 'host.f@t.test'), 'host', 't-live');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.votes_of(e text) returns int language sql as $$ select votes from public.tally where entry = e::uuid $$;
grant execute on function pg_temp.as_user(text), pg_temp.votes_of(text) to public;

-- a voter
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select lives_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000a') $$, 'a confirmed email can vote while building');
select is(pg_temp.votes_of('10000000-0000-0000-0000-00000000000a'), 1, 'the vote is in the tally');
select lives_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000a') $$, 'voting twice does not fail');
select is(pg_temp.votes_of('10000000-0000-0000-0000-00000000000a'), 1, 'but counts once: one public vote per project per email');
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-0000000000d0') $$, 'P0001', 'Voting in Doneville has closed.', 'nothing after voting closes');
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-0000000000e0') $$, 'P0001', 'Voting in Nextville opens when building starts.', 'nothing before building starts');
select lives_ok($$ select public.take_back_vote('10000000-0000-0000-0000-00000000000a') $$, 'a vote can be taken back while voting is open');
select is(pg_temp.votes_of('10000000-0000-0000-0000-00000000000a'), 0, 'and leaves the tally');
select throws_ok($$ insert into public.votes (entry, person, kind) values ('10000000-0000-0000-0000-00000000000a', public.me(), 'public') $$, '42501', null, 'votes cannot be written around the function');
reset role;

-- a builder, on their own entry
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000a') $$, 'P0001', 'You can’t vote for your own project.', 'not on your own entry');
select lives_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000b') $$, 'a builder can vote for someone else');
reset role;

-- paused
update public.cities set voting_paused = true where id = 't-live';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000b') $$, 'P0001', 'Voting is paused in Testville.', 'nothing while voting is paused');
reset role;
update public.cities set voting_paused = false where id = 't-live';

-- a hidden entry takes no votes
update public.entries set hidden_at = now() where id = '10000000-0000-0000-0000-00000000000b';
set local role authenticated;
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000b') $$, 'P0002', null, 'a hidden entry takes no votes');
reset role;
update public.entries set hidden_at = null where id = '10000000-0000-0000-0000-00000000000b';

-- anyone not signed in
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select public.cast_vote('10000000-0000-0000-0000-00000000000a') $$, '42501', null, 'the public cannot vote without an email');
reset role;

-- a judge: 50 in total, several on one project, counted apart
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
set local role authenticated;
select lives_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000a', 30) $$, 'a judge can put several votes on one project');
select lives_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000b', 20) $$, 'and spread the rest');
select throws_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000b', 1) $$, 'P0001', 'You have 0 of your 50 votes left.', 'no more than 50 in total');
select lives_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000a', -10) $$, 'a judge can take some back');
select throws_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000b', -21) $$, 'P0001', 'You have 20 on this project.', 'never below none on a project');
select is((select used from public.my_judging('t-live')), 40, 'a judge sees what they used');
reset role;
select is((select array[votes, judge_votes] from public.tally where entry = '10000000-0000-0000-0000-00000000000a'), array[20, 20], 'judge votes add to the tally and are counted apart');

-- a judge for another city
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
set local role authenticated;
select throws_ok($$ select public.judge_vote('10000000-0000-0000-0000-00000000000a', 1) $$, '42501', 'Only a judge for Testville can do that.', 'a judge votes only in their city');
reset role;

-- a tie goes to who reached the count first: B reached 21 after A reached 20; A then reaches 21 later
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select public.cast_vote('10000000-0000-0000-0000-00000000000b');
reset role;
update public.tally set reached_at = now() - interval '5 minutes' where entry = '10000000-0000-0000-0000-00000000000b';
insert into public.votes (entry, person, kind, n) values ('10000000-0000-0000-0000-00000000000a', (select id from public.people where email = 'host.f@t.test'), 'public', 1);
select is((select array_agg(e.slug order by t.votes desc, t.reached_at) from public.tally t join public.entries e on e.id = t.entry where t.city = 't-live'),
  array['b', 'a'], 'a tie goes to who reached that count first');

-- the clock: only a host, only for their city
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
set local role authenticated;
select throws_ok($$ select public.start_building('t-next') $$, '42501', null, 'a host cannot start another city');
select throws_ok($$ select public.start_building('t-live') $$, 'P0001', 'The clock in this city has already started.', 'the clock starts once');
select lives_ok($$ select public.add_minutes('t-live', 'build', 5) $$, 'a host adds minutes to their city');
select throws_ok($$ select public.end_early('t-live', 'vote') $$, '42501', null, 'only a super admin ends voting early');
reset role;

-- deleting an entry that has votes takes its votes and tally with it; deleting a person takes their entry too
select lives_ok($$ delete from public.entries where id = '10000000-0000-0000-0000-00000000000b' $$, 'an entry with votes can be deleted');
select lives_ok($$ delete from public.people where email = 'builder.a@t.test' $$, 'a person whose entry has votes can be removed');

select * from finish();
rollback;
