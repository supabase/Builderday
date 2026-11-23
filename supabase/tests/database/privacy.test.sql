-- The public can never read an email. Checked three ways: what the public may select, by
-- column, across the whole schema; what each private table answers to the public and to another signed-in person;
-- and which functions the public may call.
begin;
select plan(17);

-- 1. no column holding an email (or an owner, or a flag) can be selected by the public, in any table or view
select is((select count(*)::int from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'PUBLIC') and privilege_type = 'SELECT'
    and (column_name ilike '%email%' or column_name in ('owner', 'flags', 'person', 'first_ip', 'ip', 'auth_user', 'room_code', 'room_code_prev', 'added_by'))),
  0, 'the public can select no email, owner, flag or person column anywhere');
select is((select array_agg(table_name || '.' || column_name order by table_name) from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT' and column_name ilike '%email%'),
  array['people.email'], 'a signed-in person can select one email column: people.email (and row security limits it to their own)');
select is((select count(*)::int from information_schema.views where table_schema = 'public'), 0, 'no views that could carry an email around the rules');

-- 2. the private tables, as the public
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok('select * from public.people', '42501', null, 'the public cannot read people');
select throws_ok('select * from public.passes', '42501', null, 'the public cannot read passes');
select throws_ok('select * from public.outbox', '42501', null, 'the public cannot read the outbox');
select throws_ok('select * from public.reminders', '42501', null, 'the public cannot read reminders');
select throws_ok('select * from public.log', '42501', null, 'the public cannot read the log');
select throws_ok('select * from public.votes', '42501', null, 'the public cannot read who voted');
select throws_ok('select owner from public.entries', '42501', null, 'the public cannot read an entry''s owner');
select lives_ok('select id, name, pitch, url from public.entries', 'the public can read the entries themselves');
select lives_ok('select * from public.tally', 'and the tally');
reset role;

-- 3. as another signed-in person: only their own row
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'someone@t.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select is((select array_agg(email::text) from public.people), array['someone@t.test'], 'a signed-in person reads their own email and no one else''s');
select is((select count(*)::int from public.votes), 0, 'and none of anyone else''s votes');
select throws_ok('select * from public.outbox', '42501', null, 'and not the outbox');
reset role;

-- 4. the functions the public may call: exactly these, and none returns a person
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
  where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  array['is_host', 'is_judge', 'is_super', 'me', 'phase', 'voting_open'], 'the public can call only the role checks and the clock');
select is((select count(*)::int from pg_proc p
  where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
    and pg_get_function_result(p.oid) ilike any (array['%people%', '%email%', '%passes%', '%outbox%'])),
  0, 'no function a signed-in person can call returns people, passes or the outbox');

select * from finish();
rollback;
