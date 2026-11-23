-- Who may submit: the check-in lives on the pass, a place on a list comes from Luma or a
-- host only (no walk-ins), and nobody but the person themself reads their own check-in.
begin;
select plan(8);

select has_column('public', 'passes', 'checked_in_at', 'a pass keeps when its person checked in');
select has_column('public', 'passes', 'checked_in_how', 'and how: the room code or a host');
select is((select count(*)::int from public.passes where source not in ('luma', 'host')), 0, 'no place on a list came from the door');

insert into public.people (id, email) values ('00000000-0000-0000-0000-00000000c001', 'gate@checkin.test');
select throws_ok($$insert into public.passes (person, city, source) values ('00000000-0000-0000-0000-00000000c001', 'tokyo', 'door')$$,
  '23514', null, 'a walk-in place cannot be made');
select throws_ok($$insert into public.passes (person, city, source, checked_in_at) values ('00000000-0000-0000-0000-00000000c001', 'tokyo', 'luma', now())$$,
  '23514', null, 'a check-in says how it was made');
select lives_ok($$insert into public.passes (person, city, source, checked_in_at, checked_in_how) values ('00000000-0000-0000-0000-00000000c001', 'tokyo', 'luma', now(), 'room')$$,
  'a listed place checked in by the room code');
select throws_ok($$update public.passes set checked_in_how = 'door' where person = '00000000-0000-0000-0000-00000000c001'$$,
  '23514', null, 'only the room code or a host checks someone in');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok('select checked_in_at from public.passes', '42501', null, 'the public cannot read who is in the room');
reset role;

select * from finish();
rollback;
