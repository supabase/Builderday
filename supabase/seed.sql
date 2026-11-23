-- Local seed: the ten cities as lib/day-data.ts has them (east to west, 09:00 local on 10 December 2026, 90 minutes
-- building, voting 30 minutes after), each city's default deck and its stage row, a few people with roles, and sample
-- entries with votes in Berlin and London. Every person and entry here is made up; addresses end in .test.

insert into public.cities (id, i, name, zone, offset_min, planned_start, room_code) values
  ('sydney',        0, 'Sydney',        'Australia/Sydney',    660, '2026-12-10 09:00+11', 'K7QD'),
  ('tokyo',         1, 'Tokyo',         'Asia/Tokyo',          540, '2026-12-10 09:00+09', 'M4TX'),
  ('singapore',     2, 'Singapore',     'Asia/Singapore',      480, '2026-12-10 09:00+08', 'R2WF'),
  ('bengaluru',     3, 'Bengaluru',     'Asia/Kolkata',        330, '2026-12-10 09:00+05:30', 'H9PC'),
  ('berlin',        4, 'Berlin',        'Europe/Berlin',        60, '2026-12-10 09:00+01', 'B3RL'),
  ('lagos',         5, 'Lagos',         'Africa/Lagos',         60, '2026-12-10 09:00+01', 'L6GZ'),
  ('london',        6, 'London',        'Europe/London',         0, '2026-12-10 09:00+00', 'N8VJ'),
  ('sao-paulo',     7, 'São Paulo',     'America/Sao_Paulo',  -180, '2026-12-10 09:00-03', 'S5PU'),
  ('new-york',      8, 'New York',      'America/New_York',   -300, '2026-12-10 09:00-05', 'Y4NK'),
  ('san-francisco', 9, 'San Francisco', 'America/Los_Angeles',-480, '2026-12-10 09:00-08', 'F2SX');
update public.cities set room_code_at = now();

-- the default deck, as lib/stage/deck.ts writes it (no sample slides); the event's scenes can be hidden, not deleted
do $$
declare c record; k int; s record; sid uuid; first uuid;
begin
  for c in select id from public.cities order by i loop
    k := 0; first := null;
    for s in select * from (values
      ('doors', 'Doors', 'On while people arrive. Builders sign in with the email they gave Luma and the room code on the wall; that unlocks Submit. Someone not on the list cannot submit with the code: send them to the host at the desk to be added. Anyone can still vote with an email.', false),
      ('welcome', 'Welcome', 'Say who you are and who is helping tonight.', false),
      ('question', 'What is a backend?', 'Most of the room may never have coded. Ask, then let it sit.', false),
      ('needs', 'A handful of things', 'One press per need. The last press folds them into one project.', false),
      ('tour', 'Platform tour', 'Optional. Open the tour in the next tab; come back here and press Next.', false),
      ('say', 'Say what you want', 'Nobody needs to know how it works.', false),
      ('line', 'Prototype to Petabyte', 'Tonight is the prototype. The same backend goes all the way.', false),
      ('deadline', 'The deadline', 'The second press turns the wall to the deadline. Nobody has been told yet.', false),
      ('rules', 'The rules', 'One rule per press. The last press sets the two apart: submitting needs the Luma email and the room code; voting is open to anyone with an email.', false),
      ('prizes', 'The prizes', 'First the city prize, then the pick.', false),
      ('submit', 'How to submit', 'Your editor first, then the web. Both need the email from Luma and the room code before Submit works. Not on the list: the host at the desk adds them; they can vote meanwhile.', false),
      ('questions', 'Questions?', 'Then go to Building and start the clock.', false),
      ('building', 'Building', 'Start the clock from here. Add minutes if the room needs them. Show the ranking when the room is ready for it.', false),
      ('voting', 'Voting', 'Voting runs from the start of building. Anyone can vote with an email, confirmed once. Read the top out now and then.', false),
      ('top3', 'The top 3', 'One press per place, third first. Start the talk timer as each one presents.', false),
      ('tombola', 'Tombola', 'Off by default. A draw among everyone outside the top 3. Ask for a drum roll.', true),
      ('final', 'The final', 'Where to watch the final. The ten cities fill in as they finish.', false)
    ) as t(kind, title, notes, hidden) loop
      k := k + 1;
      insert into public.scenes (city, position, kind, title, notes, hidden, event)
      values (c.id, k, s.kind, s.title, s.notes, s.hidden, true)
      returning id into sid;
      if k = 1 then first := sid; end if;
    end loop;
    insert into public.stage (city, scene) values (c.id, first);
  end loop;
end $$;

-- people: a super admin, two hosts, two judges, builders and voters
insert into public.people (email, name) values
  ('owner@hackday.test', 'Owner'),
  ('host.berlin@hackday.test', 'Lena Vogel'),
  ('host.london@hackday.test', 'Sam Okafor'),
  ('judge.berlin@hackday.test', 'Ines Duarte'),
  ('judge.all@hackday.test', 'Kofi Mensah');
insert into public.roles (person, role, city)
select p.id, r.role, r.city from (values
  ('owner@hackday.test', 'super', null),
  ('host.berlin@hackday.test', 'host', 'berlin'),
  ('host.london@hackday.test', 'host', 'london'),
  ('judge.berlin@hackday.test', 'judge', 'berlin'),
  ('judge.all@hackday.test', 'judge', null)
) as r(email, role, city) join public.people p on p.email = r.email;

-- builders on the lists, checked in with the room code, with their entries
with b(email, name, city, source, ename, pitch, url, repo) as (values
  ('mara@builder.test', 'Mara Lindqvist', 'berlin', 'luma', 'Rowboat', 'Natural-language migrations that diff and explain themselves', 'https://rowboat.example.com', 'https://github.com/mara/rowboat'),
  ('tomasz@builder.test', 'Tomasz K', 'berlin', 'luma', 'Pulse Table', 'A spreadsheet where every cell is a Realtime channel', 'https://pulse-table.example.com', 'https://github.com/tomasz/pulse-table'),
  ('ines@builder.test', 'Ines B', 'berlin', 'luma', 'Keyring', 'Passkey-only auth starter with recovery that does not suck', 'https://keyring.example.com', null),
  ('kofi@builder.test', 'Kofi A', 'berlin', 'host', 'Shelf', 'A bucket browser with versioned undo, in one file', 'https://shelf.example.com', 'https://github.com/kofi/shelf'),
  ('ana@builder.test', 'Ana Costa', 'berlin', 'luma', 'Night Ledger', 'Shift handovers for night nurses, synced live', 'https://night-ledger.example.com', 'https://github.com/ana/night-ledger'),
  ('jin@builder.test', 'Jin Park', 'berlin', 'host', 'Pocket Atlas', 'Offline maps for allotments with Storage tiles', 'https://pocket-atlas.example.com', null),
  ('wren@builder.test', 'Wren', 'berlin', 'luma', 'Copper Kettle', 'A corner-shop stock list that texts you when tea runs low', 'https://copper-kettle.example.com', null),
  ('oli@builder.test', 'Oli Hart', 'berlin', 'luma', 'Slow Relay', 'Pen pals for classrooms, one letter a day', 'https://slow-relay.example.com', null),
  ('sol@builder.test', 'Sol Rivera', 'london', 'luma', 'Glass Index', 'pgvector search over a choir''s sheet music', 'https://glass-index.example.com', 'https://github.com/sol/glass-index'),
  ('uma@builder.test', 'Uma S', 'london', 'luma', 'Field Notebook', 'Bird counts for running clubs, mapped as they come in', 'https://field-notebook.example.com', null),
  ('pia@builder.test', 'Pia N', 'london', 'host', 'Kind Inbox', 'One inbox for a food bank''s volunteers', 'https://kind-inbox.example.com', null)
), ppl as (
  insert into public.people (email, name) select email, name from b returning id, email
), pas as (
  insert into public.passes (person, city, source, sent_at, checked_in_at, checked_in_how) select ppl.id, b.city, b.source, now() - interval '3 days', now() - interval '2 hours', 'room' from ppl join b using (email) returning person
)
insert into public.entries (city, owner, slug, name, pitch, url, repo, via, created_at)
select b.city, ppl.id, lower(regexp_replace(b.ename, '[^a-zA-Z0-9]+', '-', 'g')), b.ename, b.pitch, b.url, b.repo,
  case when b.repo is null then 'web' else 'editor' end, now() - interval '1 hour'
from b join ppl using (email);

-- on the list, not checked in, no entry yet
insert into public.people (email, name) values ('femi@builder.test', 'Femi'), ('hana@builder.test', 'Hana');
insert into public.passes (person, city, source) select id, 'berlin', 'luma' from public.people where email in ('femi@builder.test', 'hana@builder.test');

-- voters, and a spread of votes (straight into the table: the seed is not bound by the clock)
insert into public.people (email) select 'voter' || g || '@voter.test' from generate_series(1, 60) g;
insert into public.votes (entry, person, kind, n, created_at)
select e.id, p.id, 'public', 1, now() - make_interval(mins => (abs(hashtext(e.slug || p.email)) % 50))
from public.entries e
join public.people p on p.email like 'voter%@voter.test'
where abs(hashtext(e.slug || p.email)) % 100 < (case e.slug when 'rowboat' then 70 when 'pulse-table' then 55 when 'keyring' then 50 when 'glass-index' then 60 else 25 end);
insert into public.votes (entry, person, kind, n, created_at)
select e.id, p.id, 'judge', 6, now() - interval '20 minutes'
from public.entries e, public.people p where e.slug = 'keyring' and p.email = 'judge.berlin@hackday.test';
