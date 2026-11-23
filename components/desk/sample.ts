/* sample.ts: a desk's worth of made-up data for /lab/desk, so every screen can be seen without a backend. Berlin on
   10 December 2026; the clock times are moved by the lab's moment. Pure. */
import type { DeskCity, DeskEntry, DeskGuest, DeskOutbox, DeskPerson, DeskLog, DeskScene, DeskState, DeskEvent } from '@/lib/event/desk';
import { BUILDER_DAY, PRESETS, ranked, rankValue, publicVotes } from '@/lib/event/format';

const EV = 'sample-day-2026';

const DAY = Date.UTC(2026, 11, 10);
const at = (h: number, m: number, offset: number) => DAY + (h * 60 + m - offset) * 60000;

const CITIES: [string, string, number, string][] = [
  ['sydney', 'Sydney', 660, 'Australia/Sydney'], ['tokyo', 'Tokyo', 540, 'Asia/Tokyo'], ['singapore', 'Singapore', 480, 'Asia/Singapore'],
  ['bengaluru', 'Bengaluru', 330, 'Asia/Kolkata'], ['berlin', 'Berlin', 60, 'Europe/Berlin'], ['lagos', 'Lagos', 60, 'Africa/Lagos'],
  ['london', 'London', 0, 'Europe/London'], ['sao-paulo', 'São Paulo', -180, 'America/Sao_Paulo'], ['new-york', 'New York', -300, 'America/New_York'],
  ['san-francisco', 'San Francisco', -480, 'America/Los_Angeles'],
];
const CODES = ['K7QD', 'M4TX', 'R2WF', 'H9PC', 'B3RL', 'L6GZ', 'N8VJ', 'S5PU', 'Y4NK', 'F2SX'];

export type Moment = 'before' | 'build' | 'vote' | 'closed';
export const MOMENTS: { id: Moment; label: string }[] = [{ id: 'before', label: 'Before the start' }, { id: 'build', label: 'Building' }, { id: 'vote', label: 'Voting' }, { id: 'closed', label: 'Closed' }];

/* the city's times for a moment, and the time it is */
export function timesFor(c: DeskCity, m: Moment): { city: DeskCity; now: number } {
  const start = at(9, 0, c.offset);
  if (m === 'before') return { city: { ...c, buildStart: null, buildEnd: null, voteEnd: null }, now: at(8, 12, c.offset) };
  const live = { ...c, buildStart: start, buildEnd: start + c.buildMin * 60000, voteEnd: start + (c.buildMin + c.voteAfter) * 60000 };
  return { city: live, now: m === 'build' ? at(9, 52, c.offset) : m === 'vote' ? at(10, 41, c.offset) : at(11, 20, c.offset) };
}

const cities: DeskCity[] = CITIES.map(([id, name, offset, zone], i) => ({
  id, event: EV, prize: '', name, offset, zone, venue: id === 'berlin' ? 'Factory Görlitzer Park' : id === 'london' ? 'Shoreditch Works' : '', luma: id === 'berlin' ? 'https://lu.ma/hackday-berlin' : '', lumaEvent: id === 'berlin' ? 'evt-hackday-berlin' : '', editor: '',
  planned: at(9, 0, offset), buildMin: 90, voteAfter: 30, buildStart: null, buildEnd: null, voteEnd: null,
  roomCode: CODES[i], submissionsPaused: false, votingPaused: id === 'lagos',
}));

const N = ['Mara Kowalski', 'Tomasz Nowak', 'Femi Adeyemi', 'Hana Sato', 'Lena Vogel', 'Jonas Richter', 'Aylin Demir', 'Paul Weber', 'Ines Costa', 'Kofi Mensah', 'Sara Lindqvist', 'Omar Haddad'];
const guests: DeskGuest[] = N.map((name, i) => ({
  person: 'p' + i, email: name.toLowerCase().split(' ')[0] + (i === 4 ? '+hack' : '') + '@example.com', name: i === 6 ? '' : name,
  source: i >= 9 ? 'host' : 'luma', sent: i < 9 ? at(7, 30, 60) : null, opened: i < 7 ? at(8, 2 + i, 60) : null,
  signedIn: i < 8, inRoom: i < 7 || i === 10 ? at(8, 3 + Math.min(i, 8), 60) : null, inRoomHow: i === 10 ? 'host' : i < 7 ? 'room' : null, entry: i < 6,
  /* one place claimed from another email; the first five have their editor connected */
  listedAs: i === 3 ? 'hana.sato@work.example' : null, editor: i < 5 ? at(7, 40 + i, 60) : null,
}));

const ENTRIES: [string, string, number, number, string[]][] = [
  ['Rowboat', 'A queue you can row through: tasks drift downstream as the team works.', 31, 0, []],
  ['Pulse Table', 'Live heartbeat of every table in your database, as sound.', 24, 6, []],
  ['Keyring', 'One link to hand out every API key a hackathon needs, then take them back.', 22, 6, ['one-address', 'plus-copies']],
  ['Shelf', 'A bookshelf that knows which books your friends finished.', 17, 0, []],
  ['Night Ledger', 'Split the bill after the venue closes, by photo.', 12, 0, ['fork']],
  ['Pocket Atlas', 'Offline maps of the venue, with where the coffee is now.', 9, 0, []],
];
const entries: DeskEntry[] = ENTRIES.map(([name, pitch, votes, judge, flags], i) => ({
  no: i + 1, slug: name.toLowerCase().replace(/\s+/g, '-'), name, pitch, url: 'https://' + name.toLowerCase().replace(/\s+/g, '') + '.example.com', repo: 'https://github.com/example/' + name.toLowerCase().replace(/\s+/g, '-'),
  picture: null, pictureFrom: null, via: i % 2 ? 'web' : 'editor', by: N[i], byEmail: guests[i].email, flags, hidden: false, created: at(9, 30 + i * 7, 60), votes, judge,
  scoreSum: 0, scoreN: 0, reached: at(9, 30 + i * 7, 60), city: 'berlin',
}));

const DECK: [string, string][] = [['doors', 'Doors'], ['welcome', 'Welcome'], ['question', 'Who has built with Supabase?'], ['needs', 'What you need'], ['tour', 'The tour'], ['say', 'A word from the host'], ['line', 'The line'], ['deadline', 'The deadline'], ['rules', 'The rules'], ['prizes', 'Prizes'], ['submit', 'How to submit'], ['questions', 'Questions'], ['building', 'Building'], ['voting', 'Voting'], ['top3', 'The top 3'], ['tombola', 'Tombola'], ['final', 'The final']];
const scenes: DeskScene[] = DECK.map(([kind, title], i) => ({ id: 's' + i, position: i + 1, kind, title, data: {}, notes: '', hidden: kind === 'tombola', event: true }))
  .concat([{ id: 'sp1', position: 18, kind: 'speaker', title: 'Ines Costa', data: { name: 'Ines Costa', role: 'Engineer, Supabase', line: 'Realtime at the edge' }, notes: '', hidden: false, event: false }]);

const people: DeskPerson[] = [
  { role: 'r0', kind: 'super', city: null, budget: 50, event: null, scored: 0, person: 'a0', email: 'owner@example.com', name: 'Ana Ruiz', signedIn: true, used: 0 },
  { role: 'r1', kind: 'host', city: 'berlin', budget: 50, event: EV, scored: 0, person: 'a1', email: 'host.berlin@example.com', name: 'Lea Hartmann', signedIn: true, used: 0 },
  { role: 'r2', kind: 'host', city: 'london', budget: 50, event: EV, scored: 0, person: 'a2', email: 'host.london@example.com', name: '', signedIn: false, used: 0 },
  { role: 'r3', kind: 'judge', city: 'berlin', budget: 50, event: EV, scored: 0, person: 'a3', email: 'judge.berlin@example.com', name: 'Niko Brandt', signedIn: true, used: 12 },
  { role: 'r4', kind: 'judge', city: null, budget: 50, event: EV, scored: 0, person: 'a4', email: 'judge.all@example.com', name: 'Copple', signedIn: false, used: 0 },
];
const outbox: DeskOutbox[] = [
  { id: 'o1', to: 'omar@example.com', template: 'link', city: 'berlin', status: 'not_sent', error: '', at: at(8, 40, 60), link: 'http://localhost:4320/in/sample-link-omar', code: '' },
  { id: 'o2', to: 'host.berlin@example.com', template: 'code', city: null, status: 'not_sent', error: '', at: at(8, 35, 60), link: '', code: '482913' },
  { id: 'o3', to: 'judge.all@example.com', template: 'role', city: null, status: 'failed', error: 'The address bounced', at: at(7, 50, 60), link: 'http://localhost:4320/', code: '' },
];
const log: DeskLog[] = [
  { id: 3, what: 'import guests', city: 'berlin', target: '', at: at(7, 30, 60), who: 'Lea Hartmann' },
  { id: 2, what: 'add judge', city: 'berlin', target: '', at: at(7, 10, 60), who: 'Ana Ruiz' },
  { id: 1, what: 'add host', city: 'berlin', target: '', at: at(7, 0, 60), who: 'Ana Ruiz' },
];

const EVENTS: DeskEvent[] = [
  { id: EV, name: 'Sample Builder Day', short: 'Sample Day', day: '2026-12-10', archived: false, f: BUILDER_DAY, places: cities.length, listed: 1420, entries: entries.length, phase: 'next', first: at(9, 0, 660), mine: 'Super admin' },
  { id: 'sample-lisbon-2027', name: 'Supabase Hack Lisbon', short: 'Hack Lisbon', day: '2027-02-06', archived: false, f: { ...BUILDER_DAY, ...PRESETS[1].f }, places: 1, listed: 64, entries: 0, phase: 'next', first: Date.UTC(2027, 1, 6, 9), mine: 'Super admin' },
];

export type Role = 'host' | 'judge' | 'super';
export function sampleState(role: Role): DeskState {
  const host = role === 'host' || role === 'super', sup = role === 'super';
  const me = role === 'super' ? people[0] : role === 'host' ? people[1] : people[3];
  return {
    me: { email: me.email, name: me.name || null, super: sup, roles: sup ? [{ role: 'super', event: null, city: null, budget: 50 }] : [{ role, event: EV, city: 'berlin', budget: 50 }] },
    events: sup ? EVENTS : EVENTS.slice(0, 1), event: EV,
    city: 'berlin', cities: sup ? cities : cities.filter((c) => c.id === 'berlin'), can: { host, judge: role === 'judge', super: sup, admin: sup },
    overview: sup ? cities.map((c, i) => ({ id: c.id, listed: 90 + i * 7, inRoom: c.id === 'berlin' ? 88 : 0, editors: 40 + i, entries: c.id === 'berlin' ? entries.length : 0, votes: c.id === 'berlin' ? entries.reduce((a, e) => a + publicVotes(e), 0) : 0, leader: c.id === 'berlin' ? ranked(entries, BUILDER_DAY)[0].name : null })) : [],
    finalists: sup ? ranked(entries, BUILDER_DAY).slice(0, 3).map((e, i) => ({ no: e.no, name: e.name, city: 'berlin', by: e.by, value: rankValue(e, BUILDER_DAY), place: i + 1, picture: null, url: e.url })) : [],
    judging: role === 'judge' ? { budget: 50, used: 12, per: { '2': 6, '3': 6 } } : null,
    supers: sup ? [people[0]] : [],
    counts: { listed: 142, opened: 118, signedIn: 96, inRoom: 88, entries: entries.length, votes: entries.reduce((a, e) => a + e.votes, 0), editors: 61, unsent: 3 },
    guests: host ? guests : [], entries: entries.map((e) => (host ? e : { ...e, byEmail: '' })), scenes: host ? scenes : [],
    people: sup ? people : [], outbox: host ? (sup ? outbox : outbox.filter((o) => o.template !== 'code' && o.city === 'berlin')) : [], log: sup ? log : [],
    pick: null, mail: 'outbox', devCodes: true, luma: true, hook: true,
    /* the day pages: closed until three hours before Sydney's start, following the time */
    gate: sup ? { open: false, opensAt: Date.UTC(2026, 11, 9, 19, 0), override: 'auto', why: 'time' } : null,
  };
}
