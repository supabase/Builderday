-- The event record and places that keep their email: one place per account and one per
-- listed address in an event, the email a place was listed under is kept when someone else claims it, and nobody but
-- the server reads any of the new columns.
begin;
select plan(14);

select has_table('public', 'events', 'the event is a record');
select is((select count(*)::int from public.events), 1, 'one event per site');
select is((select count(*)::int from public.cities where event is null), 0, 'every city belongs to the event');

insert into public.people (id, email) values
  ('00000000-0000-0000-0000-00000000d001', 'ana@door.test'),
  ('00000000-0000-0000-0000-00000000d002', 'ana.work@door.test');
select lives_ok($$insert into public.passes (person, city, source) values ('00000000-0000-0000-0000-00000000d001', 'berlin', 'luma')$$,
  'a place made without naming its email');
select is((select list_email::text from public.passes where person = '00000000-0000-0000-0000-00000000d001'), 'ana@door.test',
  'is listed under its person''s email');
select throws_ok($$insert into public.passes (person, city, source, list_email) values ('00000000-0000-0000-0000-00000000d001', 'london', 'host', 'other@door.test')$$,
  '23505', null, 'an account holds one place in an event');
select throws_ok($$insert into public.passes (person, city, source, list_email) values ('00000000-0000-0000-0000-00000000d002', 'london', 'host', 'ANA@door.test')$$,
  '23505', null, 'an address is listed once in an event, whatever its case');
select lives_ok($$update public.passes set person = '00000000-0000-0000-0000-00000000d002', claimed_at = now() where list_email = 'ana@door.test'$$,
  'a place can be claimed by another account');
select is((select list_email::text from public.passes where person = '00000000-0000-0000-0000-00000000d002'), 'ana@door.test',
  'and keeps the address it was listed under');
select is((select editor_version from public.passes where list_email = 'ana@door.test'), 1, 'the editor key has its own version');

-- 3. nothing new can be read by the public or a signed-in person
select is((select count(*)::int from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'SELECT'
    and ((table_name = 'passes' and column_name in ('event', 'list_email', 'luma_guest_id', 'luma_status', 'luma_registered_at', 'claimed_at', 'editor_version', 'editor_seen_at'))
      or table_name in ('events', 'claims') or (table_name = 'cities' and column_name = 'event'))),
  0, 'no new column is granted to the public or a signed-in person');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok('select * from public.events', '42501', null, 'the public cannot read the event row');
select throws_ok('select * from public.claims', '42501', null, 'or the claims');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok('select list_email from public.passes', '42501', null, 'a signed-in person cannot read the listed email');
reset role;

select * from finish();
rollback;
