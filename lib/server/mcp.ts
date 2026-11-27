/* mcp.ts: the editor server, for checking a builder's setup before the day and submitting on it. Streamable HTTP,
   stateless: every POST carries one JSON-RPC message (or, in the older revisions, a batch) and gets JSON back; there is no session and no stream.
   Who is calling: the personal key, sent as "Authorization: Bearer <key>" by every editor that can send a header,
   and in the address (/api/mcp/<key>) only for an editor that cannot. It is the pass's editor key (editor_version),
   so replacing it ends no sign-in. It says who, nothing more: Submit still needs a host's check-in at the door.
   Every call with a good key sets editor_seen_at ("editor connected").
   Both protocol eras (modelcontextprotocol.io/specification, read 2026-11-18): 2026-07-28 has no handshake (each
   request names its version in _meta or the MCP-Protocol-Version header, and server/discover says what we serve);
   2025-11-25 and earlier open with initialize. A dual-era server may serve both, which this one does.
   Four tools: whoami, practice, submit, status. Before the day pages open only whoami and practice do anything;
   submit says when it opens. submit runs lib/server/entries.ts, the same submit as the form,
   so a refusal reads the same either way. */
import { publicCity } from './snapshot';
import { openKey, type Pass, type Person } from './people';
import { entryOf } from './me';
import { repoFacts, submitEntry } from './entries';
import { admin } from './supabase';
import { siteUrl } from './env';
import { rankOrder } from '@/lib/event/snapshot';
import { CHECKS, RULES, SERVER } from '@/lib/hackday-server';
import { EVENT } from '@/lib/day-data';

const EVENT_NAME = EVENT.name;
import { nameOfCity } from './room';
import { eventById, eventOfCity } from './events';
import { HOW_TO_SUBMIT } from '@/lib/event/rule';
import { dayGate } from './gate';
import { guardKey } from './repo-key';
import { whenLocal } from './time';

const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INFO = { name: SERVER.name, title: EVENT_NAME, version: '1.1.0' };
const HOW = 'Checks this builder’s setup before the day, and submits the project in the current folder to ' + EVENT_NAME + ' on the day. Call whoami first. '
  + 'Before the day, practice runs the whole path and enters nothing. ' + HOW_TO_SUBMIT + ' If whoami says you are not checked in, ask a host at the door to check you in. '
  + 'Then submit with the project’s name, a one-line pitch, its public GitHub repository made today, and a demo link if there is one. The rules: ' + RULES.join(' ');

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Out = Record<string, unknown> | null;
type Who = { pass: Pass; person: Person };

const str = { type: 'string' } as const;
const TOOLS = [
  {
    name: 'whoami', title: 'Who am I',
    description: 'Says who this editor is signed in as, which city they are in, whether a host has checked them in at the door, and whether they already have an entry. Call it first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'practice', title: 'Practice run',
    description: 'A dry run of the day, safe to call any time: says who you are, your city and when building starts there, whether building is open and whether a host has checked you in. With repo, it runs the checks the real submit runs and says what would be refused on the day. Nothing is entered.',
    inputSchema: { type: 'object', properties: {
      repo: { ...str, description: 'Optional: a public GitHub repository to try the checks on, https://github.com/owner/name' },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'submit', title: 'Submit the project',
    description: 'Enters the project, or edits the entry if there is one already (one entry per person, editable until building ends). Answers with the project’s link, or says in words what was refused.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { ...str, maxLength: 40, description: 'The project’s name, up to 40 characters' },
        pitch: { ...str, maxLength: 140, description: 'One line on what it does, up to 140 characters' },
        repo: { ...str, description: 'The public GitHub repository, made today: https://github.com/owner/name' },
        link: { ...str, description: 'Where it runs (a deployed demo), if there is one' },
        video: { ...str, description: 'A short video of it, if there is one' },
        by: { ...str, maxLength: 60, description: 'Your name as it should show beside the project; only asked once, when the city’s list has no name for you' },
      },
      required: ['name', 'pitch', 'repo'], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'status', title: 'Place and votes',
    description: 'The entry’s place in its city, its votes, and how long building and voting have left.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

/* the answer is words only: editors show structured content in place of the text when both are sent, and the words
   (above all a refusal's) are what the builder must read. data is kept for the tests' sake, never sent. */
const text = (t: string, error = false, _data?: Record<string, unknown>) => { void _data; return { content: [{ type: 'text', text: t }], ...(error ? { isError: true } : {}) }; };
const left = (at: number | null, now: number) => {
  if (!at) return null;
  const m = Math.round((at - now) / 60000);
  return m > 0 ? (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min') : null;
};

async function call(who: Who, name: string, a: Record<string, unknown>, req: Request) {
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  const site = siteUrl(req);
  /* the event of the person's key: Builder Day's day gate holds only there */
  const ev = await eventOfCity(who.pass.city), isDay = ev === EVENT.id, evRec = await eventById(ev);
  if (name === 'whoami') {
    const e = await entryOf(who.person.id, ev);
    const city = await nameOfCity(who.pass.city), inRoom = !!who.pass.checked_in_at;
    return text((who.person.name ? who.person.name + ', you are' : 'You are') + ' signed in for ' + city + '. '
      + (inRoom ? 'Checked in by a host. ' : 'Not checked in yet: a host checks you in at the door before you can submit. ')
      + (e ? 'You have an entry: ' + e.name + ', ' + site + '/city/' + e.city + '/p/' + e.slug + '. Submitting again edits it.' : 'No entry yet.')
      + (who.person.name ? '' : ' Your city’s list has no name for you: pass by with your name when you submit.'),
    false, { city: who.pass.city, cityName: city, name: who.person.name, checkedIn: inRoom, entry: e ? { name: e.name, url: site + '/city/' + e.city + '/p/' + e.slug } : null });
  }
  if (name === 'practice') return practice(who, s('repo'), site);
  if (name === 'submit' && isDay && !(await dayGate()).open) {
    const c = await cityRow(who.pass.city);
    return text('Submitting opens on the day, in the room: building in ' + c.name + ' starts at ' + whenLocal(c.planned_start, c.offset_min) + ', local time. Until then, call practice to try the whole path; nothing is entered.', true, { early: true });
  }
  if (name === 'submit') {
    const r = await submitEntry(who.person, { name: s('name'), pitch: s('pitch'), repo: s('repo'), demo: s('link'), video: s('video'), by: s('by') }, { via: 'editor', keepPicture: true, event: ev });
    if (!r.ok) return text(r.error + (r.field === 'room' ? ' Once a host has checked you in, submit again.' : ''), true, { refused: true, field: r.field || null });
    const url = site + '/city/' + r.entry.city + '/p/' + r.entry.slug;
    const notes = [r.verdict.replaces ? 'Your entry is updated.' : 'You are in.', 'Your project: ' + url];
    if (r.entry.handle && r.entry.handle !== who.person.name) notes.push('Built by ' + r.entry.handle + '.');
    if (r.keyFound) notes.push(r.keyFound);
    if (!r.entry.picture) notes.push('Add a picture there, so it can be told apart on the ranking.');
    if (r.verdict.later.length) notes.push('GitHub did not answer, so the repository is checked again later.');
    notes.push('You can edit it until building ends; submit again to change it.');
    return text(notes.join(' '), false, { url, name: r.entry.name, replaced: r.verdict.replaces });
  }
  if (name === 'status') {
    const e = await entryOf(who.person.id, ev), snap = await publicCity(e?.city || who.pass.city), now = Date.now();
    if (!snap) return text('The ranking cannot be read right now. Try again in a minute.', true);
    const build = left(snap.city.buildEnd, now), vote = left(snap.city.voteEnd, now);
    const clock = !snap.city.buildStart ? 'Building has not started in ' + snap.city.name + '.' : build ? 'Building ends in ' + build + '.' : vote ? 'Building has ended; voting closes in ' + vote + '.' : 'Voting has closed in ' + snap.city.name + '.';
    const inRoom = who.pass.checked_in_at ? '' : ' Not checked in yet: a host checks you in at the door before you can submit.';
    if (!e) return text('No entry yet. ' + clock + inRoom, false, { checkedIn: !inRoom });
    const order = snap.entries.slice().sort(rankOrder), i = order.findIndex((x) => x.no === e.no), me = order[i];
    if (!me) return text('Your entry, ' + e.name + ', is hidden from the ranking for now: the hosts are looking at it. ' + clock, false, { place: null });
    /* while the counts are hidden the editor knows no more than the page: the entry is in, nothing about its count */
    if (snap.hidden) return text(e.name + ' is in the list in ' + snap.city.name + '. Votes are hidden until ' + (snap.city.showAt ?? 0) + ' minutes in; then every count appears and stays live. ' + clock, false, { place: null, of: order.length, votes: null, hidden: true });
    return text(e.name + ' is ' + ord(i + 1) + ' of ' + order.length + ' in ' + snap.city.name + ' with ' + me.votes + (me.votes === 1 ? ' vote' : ' votes') + '.' + (evRec?.f.finalOn === false ? ' ' : ' The top ' + (evRec?.f.finalists ?? 3) + ' go to the final. ') + clock,
      false, { place: i + 1, of: order.length, votes: me.votes });
  }
  return null;
}
type CityRow = { name: string; planned_start: string; offset_min: number; build_start: string | null; build_end: string | null };
async function cityRow(id: string): Promise<CityRow> {
  const { data } = await admin().from('cities').select('name, planned_start, offset_min, build_start, build_end').eq('id', id).single();
  return data as CityRow;
}

/* the dry run: who, where, when, the check-in, and with a repository the checks the real submit
   runs, said as what would happen on the day. The made-today rule does not block here; it is said as advice. */
async function practice(who: Who, repo: string, site: string) {
  const c = await cityRow(who.pass.city), now = Date.now();
  const open = !!c.build_start && now >= Date.parse(c.build_start) && (!c.build_end || now < Date.parse(c.build_end));
  const lines = [
    'Practice run: nothing is entered.',
    (who.person.name ? who.person.name + ', you' : 'You') + ' are on the list for ' + c.name + '. Building starts at ' + whenLocal(c.planned_start, c.offset_min) + ', local time.',
    open ? 'Building is open in ' + c.name + ' now.' : c.build_end && now >= Date.parse(c.build_end) ? 'Building has ended in ' + c.name + '.' : 'Building is not open yet.',
    who.pass.checked_in_at ? 'A host has checked you in.' : 'On the day: a host checks you in at the door, then you can submit.',
  ];
  if (repo) {
    const leak = await guardKey(who.pass, repo);
    if (leak) return text(lines.concat(leak.say).join(' '), true, { keyFound: leak.found });
    const f = await repoFacts(repo, null);
    const say = (id: string, v: Record<string, string>) => CHECKS.find((x) => x.id === id)!.say!(v);
    if (!f) lines.push('GitHub did not answer, so the repository was not checked. Try again in a minute.');
    else if (!f.readable) lines.push('On the day this would be refused: ' + say('repo', { repo }));
    else {
      const made = f.createdAt ? f.createdAt.slice(0, 10) : null;
      lines.push(repo + ' can be read.' + (made ? ' It was made on ' + made + '; on the day, start a new repository: one made before building starts is refused.' : ' On the day, start a new repository.') + (f.fork ? ' It is a fork, which the hosts would see.' : ''));
    }
  } else lines.push('Pass repo to try the repository checks too.');
  lines.push('On the day, say: Submit my project to ' + EVENT_NAME + '.');
  void site;
  return text(lines.join(' '), false, { city: who.pass.city, open, checkedIn: !!who.pass.checked_in_at });
}

const ord = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

type Era = { modern: boolean; version: string };
const metaVersion = (m: Rpc) => { const meta = (m.params?._meta || {}) as Record<string, unknown>; const v = meta['io.modelcontextprotocol/protocolVersion']; return typeof v === 'string' ? v : ''; };

/* which era a message speaks: initialize is always the older one; otherwise the version it names (in _meta, then the
   header). A message naming no version is served as 2025-03-26, as the transport allows for older clients. */
function eraOf(m: Rpc, header: string): Era | { unsupported: string } {
  if (m.method === 'initialize') return { modern: false, version: '' };
  const v = metaVersion(m) || header;
  if (!v) return { modern: false, version: '2025-03-26' };
  if (v === MODERN) return { modern: true, version: v };
  if (LEGACY.includes(v)) return { modern: false, version: v };
  return { unsupported: v };
}

type Answer = { out: Out; status?: number };
async function one(m: Rpc, req: Request, who: () => Promise<Who | { error: string }>): Promise<Answer> {
  const id = m.id ?? null, err = (code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { out: err(-32600, 'Not a JSON-RPC 2.0 request.'), status: 400 };
  const era = eraOf(m, req.headers.get('mcp-protocol-version') || '');
  if ('unsupported' in era) return { out: err(-32022, 'Unsupported protocol version', { supported: [MODERN, ...LEGACY], requested: era.unsupported }), status: 400 };
  /* the newer revision wants resultType on every result */
  const res = (result: Record<string, unknown>) => ({ jsonrpc: '2.0', id, result: era.modern ? { resultType: 'complete', ...result } : result });
  const note = m.id === undefined;
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion || ''), v = LEGACY.includes(asked) ? asked : LEGACY[0];
      const w = await who();
      return { out: res({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: INFO,
        instructions: 'error' in w ? 'This editor line does not work: ' + w.error : HOW }) };
    }
    case 'server/discover': {
      const w = await who();
      return { out: res({ supportedVersions: [MODERN, ...LEGACY], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': INFO },
        instructions: 'error' in w ? 'This editor line does not work: ' + w.error : HOW, ttlMs: 3600000, cacheScope: 'private' }) };
    }
    case 'ping': return { out: res({}) };
    case 'tools/list': return { out: res(era.modern ? { tools: TOOLS, ttlMs: 3600000, cacheScope: 'public' } : { tools: TOOLS }) };
    case 'tools/call': {
      const w = await who();
      if ('error' in w) return { out: res(text(w.error, true)) };
      const name = String(m.params?.name || ''), a = (m.params?.arguments || {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return { out: err(-32602, 'No tool called ' + name + '.') };
      try { return { out: res(await call(w, name, a, req) as Record<string, unknown>) }; } catch { return { out: res(text('Something went wrong on our side. Try again in a minute.', true)) }; }
    }
    default:
      if (note || m.method.startsWith('notifications/')) return { out: null };
      return { out: err(-32601, 'Method not found: ' + m.method), status: era.modern ? 404 : undefined };
  }
}

/* the key: the Authorization header first, then the address; never written to a log */
export function keyOf(req: Request, fromPath?: string): string {
  const h = req.headers.get('authorization') || '', b = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return b ? b[1] : (fromPath || '');
}
const NO_KEY = 'This editor line has no key. Copy your own line from your account on the site and add it to your editor again.';

/* One POST: a message, or (older revisions) a batch. Notifications and responses get 202 with no body. */
export async function handleMcp(req: Request, fromPath?: string): Promise<Response> {
  let msg: unknown;
  try { msg = await req.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The body is not JSON.' } }, { status: 400 }); }
  const key = keyOf(req, fromPath);
  let cached: Promise<Who | { error: string }> | null = null;
  const who = () => (cached ||= (async () => {
    if (!key) return { error: NO_KEY };
    const w = await openKey('mcp', key);
    /* "editor connected": every call that a good key opens */
    if (!('error' in w)) await admin().from('passes').update({ editor_seen_at: new Date().toISOString() }).eq('id', w.pass.id);
    return w;
  })());
  const list = Array.isArray(msg) ? (msg as Rpc[]) : [msg as Rpc];
  const answers = await Promise.all(list.map((m) => one(m || {}, req, who)));
  const outs = answers.map((a) => a.out).filter((o): o is NonNullable<Out> => !!o);
  if (!outs.length) return new Response(null, { status: 202 });
  const status = !Array.isArray(msg) && answers[0].status ? answers[0].status : 200;
  return Response.json(Array.isArray(msg) ? outs : outs[0], { status, headers: { 'cache-control': 'no-store' } });
}
