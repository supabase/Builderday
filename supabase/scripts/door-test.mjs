// door-test.mjs: signing in before the day, against the local stack. Start the site with
//   HACKDAY_FAKE_GITHUB=1 LUMA_API_KEY=test LUMA_API_URL=http://127.0.0.1:4395/v1 LUMA_WEBHOOK_SECRET=whsec_localtest
//   (the editor server is the site's own /api/mcp unless NEXT_PUBLIC_HACKDAY_MCP_URL names another at build time)
// then: node supabase/scripts/door-test.mjs [--site http://localhost:4399]
// It runs Luma's webhook (signature, age, repeats, approved then declined, declined while checked in, an unknown
// event, two cities), the claim of a place from another email, the editor line (header, address, a wrong key,
// practice, the early refusals, the key found in a repository, the newer protocol revision) and the gate, then puts
// everything back. The stand-in Luma answers only the current paths, so the fallback is not what passes here.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { env, rest } from './env.mjs';

const e = env(), args = process.argv.slice(2), SITE = args.includes('--site') ? args[args.indexOf('--site') + 1] : 'http://localhost:4399';
const SECRET = process.env.LUMA_WEBHOOK_SECRET || 'whsec_localtest', D = 'door.test', min = 60000;
const EV = { berlin: 'evt-door-berlin', london: 'evt-door-london', tokyo: 'evt-door-tokyo' };
const em = (n) => n + '@' + D;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* a stand-in Luma with the current paths only */
const GUESTS = { 'evt-door-berlin': [{ id: 'gst-1', user_email: em('sync'), user_name: 'Sync Person', approval_status: 'approved', registered_at: '2026-11-01T10:00:00Z' }] };
const luma = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'application/json');
  const list = GUESTS[u.searchParams.get('event_id')];
  if (u.pathname === '/v1/events/guests/list' && list) return res.end(JSON.stringify({ entries: list, has_more: false }));
  if (u.pathname === '/v1/events/guests/get' && list) { const g = list.find((x) => x.user_email === u.searchParams.get('id')); if (g) return res.end(JSON.stringify(g)); }
  res.writeHead(404); res.end('{}');
});
await new Promise((r) => luma.listen(4395, '127.0.0.1', r));

function jar() {
  const c = new Map(), cookie = () => Array.from(c, ([k, v]) => k + '=' + v).join('; ');
  const done = async (r) => {
    (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); c.set(kv.slice(0, i), kv.slice(i + 1)); });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } return { status: r.status, body: j, location: r.headers.get('location') };
  };
  return {
    go: async (p, body, method) => done(await fetch(SITE + p, { method: method || (body ? 'POST' : 'GET'), redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: cookie() }, body: body ? JSON.stringify(body) : undefined })),
    form: async (p, f) => done(await fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie() }, body: f })),
  };
}
const RUN = Date.now(), SINCE = new Date(RUN - 1000).toISOString();
/* this run's mail only: the outbox and the log keep earlier runs' rows */
const outbox = async (to, template) => (await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(to) + '&template=eq.' + template + '&created_at=gte.' + encodeURIComponent(SINCE) + '&order=created_at.desc&select=data,created_at'));
async function byCode(email) {
  const j = jar(); let s = await j.go('/api/auth/code', { email });
  if (s.body?.wait) { await sleep((s.body.wait + 1) * 1000); s = await j.go('/api/auth/code', { email }); }
  const [row] = await outbox(email, 'code');
  await j.go('/api/auth/verify', { email, code: row.data.code }); return j;
}
let bad = 0; const check = (t, ok, extra = '') => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + t + (extra && !ok ? '  · ' + String(extra).slice(0, 240) : '')); };
const placeOf = async (listEmail) => (await rest(e, 'passes?list_email=eq.' + encodeURIComponent(listEmail) + '&select=id,person,city,source,checked_in_at,claimed_at,editor_version,editor_seen_at,key_version,sent_at'))[0] || null;
const personOf = async (email) => (await rest(e, 'people?email=eq.' + encodeURIComponent(email) + '&select=id,email'))[0] || null;
const auth = (p, init = {}) => fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/' + p, { ...init, headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
const keyFor = (pass) => { const b = (x) => x.toString('base64url'); return b(Buffer.from(pass.id.replace(/-/g, ''), 'hex')) + b(createHmac('sha256', e.HACKDAY_KEY_SECRET).update('mcp:' + pass.id + ':' + pass.editor_version).digest().subarray(0, 18)); };

/* Luma's webhook, signed the way help.luma.com/p/webhooks says: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>"> */
let hookN = 0;
async function hook(type, guest, event, o = {}) {
  const body = JSON.stringify({ type, data: { ...guest, event: { id: event, name: 'Door test' } } });
  const t = o.t ?? Math.floor(Date.now() / 1000), sig = createHmac('sha256', o.secret || SECRET).update(t + '.' + body).digest('hex');
  const r = await fetch(SITE + '/api/luma/hook', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-signature': 't=' + t + ',v1=' + sig, 'webhook-id': o.id || 'wh_' + (++hookN) + '_' + Date.now(), 'webhook-timestamp': String(t) }, body });
  return r.status;
}
const g = (n, status, at) => ({ id: 'gst-' + n, user_email: em(n), user_name: 'Person ' + n, approval_status: status, registered_at: at || new Date().toISOString() });

/* the editor server: header or address, one era or the other */
async function mcp(key, method, params, o = {}) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(o.header !== false && key ? { authorization: 'Bearer ' + key } : {}), ...(o.version ? { 'mcp-protocol-version': o.version } : {}) };
  const r = await fetch(SITE + '/api/mcp' + (o.inAddress ? '/' + key : ''), { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { status: r.status, j: await r.json().catch(() => null) };
}
const tool = async (key, name, a = {}, o = {}) => { const { j } = await mcp(key, 'tools/call', { name, arguments: a }, o); const res = j?.result || {}; return { error: !!res.isError, text: (res.content || []).map((c) => c.text).join(' ') || j?.error?.message || '' }; };

const setGate = async (open) => { await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open }) }); await sleep(5200); };
const clean = async () => {
  await rest(e, 'people?email=like.*%40' + D, { method: 'DELETE' });
  const { users = [] } = await (await auth('users?per_page=1000')).json();
  for (const u of users.filter((x) => (x.email || '').endsWith('@' + D))) await auth('users/' + u.id, { method: 'DELETE' });
  await rest(e, 'cities?id=in.(berlin,london,tokyo)', { method: 'PATCH', body: JSON.stringify({ luma_event_id: null }) });
};

const [ev0] = await rest(e, 'events?select=id,open,opens_at');
const [tokyo0] = await rest(e, 'cities?id=eq.tokyo&select=build_start,build_end,vote_end,room_code,build_min,vote_after');
try {
  await clean();
  for (const [c, id] of Object.entries(EV)) await rest(e, 'cities?id=eq.' + c, { method: 'PATCH', body: JSON.stringify({ luma_event_id: id }) });

  // 1. the webhook
  check('webhook: a bad signature is refused', (await hook('guest.registered', g('ana', 'approved'), EV.berlin, { secret: 'whsec_wrong' })) === 401 && !(await placeOf(em('ana'))));
  check('webhook: an old timestamp is refused', (await hook('guest.registered', g('ana', 'approved'), EV.berlin, { t: Math.floor(Date.now() / 1000) - 600 })) === 401 && !(await placeOf(em('ana'))));
  check('webhook: a good signature makes the place', (await hook('guest.registered', g('ana', 'approved'), EV.berlin, { id: 'wh_same_' + RUN })) === 200 && (await placeOf(em('ana')))?.city === 'berlin');
  check('webhook: the same delivery twice is answered and not applied again', (await hook('guest.registered', g('ana', 'approved'), EV.berlin, { id: 'wh_same_' + RUN })) === 200);
  check('webhook: registered and updated for one guest: one place', (await hook('guest.updated', g('ana', 'approved'), EV.berlin)) === 200 && (await rest(e, 'passes?list_email=eq.' + em('ana') + '&select=id')).length === 1);
  await sleep(600);
  const anaMail = await outbox(em('ana'), 'link');
  check('webhook: "Your place" is sent once', anaMail.length === 1 && /\/in\//.test(anaMail[0]?.data?.link || ''), JSON.stringify(anaMail));

  await hook('guest.registered', g('bo', 'approved'), EV.berlin);
  check('webhook: approved then declined: the place goes, the account stays', (await hook('guest.updated', g('bo', 'declined'), EV.berlin)) === 200 && !(await placeOf(em('bo'))) && !!(await personOf(em('bo'))));
  await hook('guest.registered', g('cy', 'approved'), EV.berlin);
  await rest(e, 'passes?list_email=eq.' + em('cy'), { method: 'PATCH', body: JSON.stringify({ checked_in_at: new Date().toISOString(), checked_in_how: 'room' }) });
  check('webhook: declined while checked in: the place stays', (await hook('guest.updated', g('cy', 'declined'), EV.berlin)) === 200 && !!(await placeOf(em('cy'))));
  check('webhook: pending makes no place', (await hook('guest.registered', g('dee', 'pending_approval'), EV.berlin)) === 200 && !(await placeOf(em('dee'))));
  const logs0 = (await rest(e, 'log?what=eq.luma%20hook&order=at.desc&limit=1&select=data'))[0];
  check('webhook: an event that is not ours: 200, logged, nothing made', (await hook('guest.registered', g('eve', 'approved'), 'evt-someone-else')) === 200 && !(await placeOf(em('eve'))) && (await rest(e, 'log?what=eq.luma%20hook&order=at.desc&limit=1&select=data'))[0]?.data?.known === false, JSON.stringify(logs0));
  await hook('guest.registered', g('fay', 'approved', '2026-11-10T10:00:00Z'), EV.berlin);
  await hook('guest.registered', g('fay', 'approved', '2026-11-12T10:00:00Z'), EV.london);
  const fayL = await placeOf(em('fay'));
  await hook('guest.registered', g('fay', 'approved', '2026-11-11T10:00:00Z'), EV.tokyo);
  check('webhook: two cities, the later registration wins', fayL?.city === 'london' && (await placeOf(em('fay')))?.city === 'london', JSON.stringify(fayL));

  // 2. the claim: a place listed under one address, claimed by an account signed in with another
  await hook('guest.registered', g('gus', 'approved'), EV.berlin);
  await rest(e, 'passes?list_email=eq.' + em('gus'), { method: 'PATCH', body: JSON.stringify({ checked_in_at: new Date().toISOString(), checked_in_how: 'host' }) });
  const gusPlace = await placeOf(em('gus'));
  const work = await byCode(em('gus.work'));
  const me0 = await work.go('/api/me');
  check('claim: signed in with another email, there is no place yet', me0.body?.signedIn === true && me0.body?.pass === null, JSON.stringify(me0.body?.pass));
  const c1 = await work.go('/api/auth/claim', { email: em('gus') });
  const c2 = await work.go('/api/auth/claim', { email: em('nobody') });
  check('claim: the same answer for a listed and an unlisted address', c1.status === c2.status && JSON.stringify(Object.keys(c1.body || {}).sort()) === JSON.stringify(Object.keys(c2.body || {}).sort()) && c1.body?.sent === true, JSON.stringify([c1, c2]));
  check('claim: a code goes only to the listed address', (await outbox(em('gus'), 'claim')).length === 1 && (await outbox(em('nobody'), 'claim')).length === 0);
  const code = (await outbox(em('gus'), 'claim'))[0].data.code;
  const v = await work.go('/api/auth/claim/verify', { email: em('gus'), code });
  const moved = await placeOf(em('gus')), workP = await personOf(em('gus.work'));
  check('claim: the right code moves the place, keeps its listed address and its check-in', v.status === 200 && v.body?.city === 'berlin' && moved?.person === workP?.id && moved?.id === gusPlace.id && !!moved?.claimed_at && !!moved?.checked_in_at, JSON.stringify([v.body, moved]));
  const me1 = await work.go('/api/me');
  check('claim: /api/me shows the place and the address it is listed under', me1.body?.pass?.city === 'berlin' && me1.body?.pass?.listedAs === em('gus'), JSON.stringify(me1.body?.pass));
  await hook('guest.updated', g('gus', 'approved'), EV.berlin);
  check('claim: the next Luma event for the old address does not make the place again', (await rest(e, 'passes?list_email=eq.' + em('gus') + '&select=id,person')).length === 1 && (await placeOf(em('gus')))?.person === workP?.id);
  const host = await byCode('host.berlin@hackday.test');
  GUESTS[EV.berlin].push({ id: 'gst-gus', user_email: em('gus'), user_name: 'Person gus', approval_status: 'approved', registered_at: new Date().toISOString() });
  const pv = await host.go('/api/desk', { action: 'import.preview', city: 'berlin', from: 'luma' });
  check('claim: the desk\'s Sync from Luma counts the claimed place as already listed', pv.body?.preview?.already >= 1 && pv.body?.preview?.fresh === 1, JSON.stringify(pv.body));
  const guests = (await host.go('/api/desk/state?city=berlin')).body?.guests || [];
  check('claim: the desk\'s Guests row says listed as one address, signed in as the other', guests.some((x) => x.email === em('gus.work') && x.listedAs === em('gus')), JSON.stringify(guests.filter((x) => x.email.endsWith(D))));

  await hook('guest.registered', g('hal', 'approved'), EV.berlin);
  const hal = await byCode(em('hal.work'));
  await hal.go('/api/auth/claim', { email: em('hal') });
  let last;
  for (let k = 0; k < 5; k++) last = await hal.go('/api/auth/claim/verify', { email: em('hal'), code: '000000' === (await outbox(em('hal'), 'claim'))[0].data.code ? '111111' : '000000' });
  const right = (await outbox(em('hal'), 'claim'))[0].data.code;
  const after5 = await hal.go('/api/auth/claim/verify', { email: em('hal'), code: right });
  check('claim: five wrong codes, then even the right one is refused', /fifth/.test(last.body?.error || '') && after5.status === 429 && (await placeOf(em('hal')))?.person !== (await personOf(em('hal.work')))?.id, JSON.stringify([last.body, after5.body]));

  await hook('guest.registered', g('ivy', 'approved'), EV.berlin);
  const ivyP = await personOf(em('ivy'));
  await rest(e, 'entries', { method: 'POST', body: JSON.stringify({ city: 'berlin', owner: ivyP.id, slug: 'door-test-ivy', name: 'Ivy entry', url: 'https://example.com', repo: 'https://github.com/door-test/ivy' }) });
  const ivy = await byCode(em('ivy.work'));
  await ivy.go('/api/auth/claim', { email: em('ivy') });
  const iv = await ivy.go('/api/auth/claim/verify', { email: em('ivy'), code: (await outbox(em('ivy'), 'claim'))[0].data.code });
  check('claim: a place already in use is refused', iv.status === 409 && /already in use/.test(iv.body?.error || '') && (await placeOf(em('ivy')))?.person === ivyP.id, JSON.stringify(iv.body));

  // 3. the editor line
  await rest(e, 'cities?id=eq.tokyo', { method: 'PATCH', body: JSON.stringify({ build_start: null, build_end: null, vote_end: null }) });
  await hook('guest.registered', g('jo', 'approved'), EV.tokyo);
  let jo = await placeOf(em('jo')), key = keyFor(jo);
  check('editor: not connected before its first call', !jo.editor_seen_at);
  await setGate('closed');
  const w1 = await tool(key, 'whoami');
  check('editor: the key in the Authorization header works', !w1.error && /signed in for Tokyo/.test(w1.text), w1.text);
  const w2 = await tool(key, 'whoami', {}, { inAddress: true, header: false });
  check('editor: the key in the address still works', !w2.error && /signed in for Tokyo/.test(w2.text), w2.text);
  const w3 = await tool(key.slice(0, -4) + 'AAAA', 'whoami');
  check('editor: a wrong key is refused in words', w3.error && /no longer works|not one of ours/.test(w3.text), w3.text);
  const w4 = await tool('', 'whoami', {}, { header: false });
  check('editor: no key at all is refused in words', w4.error && /has no key/.test(w4.text), w4.text);
  const entries0 = (await rest(e, 'entries?select=id&city=eq.tokyo')).length;
  const pr = await tool(key, 'practice', { repo: 'https://github.com/door-test/practice-app' });
  check('editor: practice enters nothing and says what the day holds', !pr.error && /nothing is entered/i.test(pr.text) && /Tokyo/.test(pr.text) && (await rest(e, 'entries?select=id&city=eq.tokyo')).length === entries0, pr.text);
  check('editor: a call with a good key marks the editor connected', !!(await placeOf(em('jo')))?.editor_seen_at);
  const me2 = await (await byCode(em('jo'))).go('/api/me');
  check('editor: /api/me carries "connected" and a line with the key', !!me2.body?.pass?.editorSeen && /\/api\/mcp\/[\w-]{46}$/.test(me2.body?.editor?.url || ''), JSON.stringify([me2.body?.pass, me2.body?.editor ? 'line' : null]));
  const e1 = await tool(key, 'check_in', { code: tokyo0.room_code }), e2 = await tool(key, 'submit', { name: 'Early', pitch: 'x', repo: 'https://github.com/door-test/early' });
  check('editor: check_in and submit refuse before the day, with the start time', e1.error && e2.error && /opens on the day/.test(e1.text) && /09:00 on 10 December/.test(e2.text) && !(await placeOf(em('jo'))).checked_in_at, e1.text + ' | ' + e2.text);

  await setGate('open');
  const t0 = Date.now() - 2 * min;
  await rest(e, 'cities?id=eq.tokyo', { method: 'PATCH', body: JSON.stringify({ build_start: new Date(t0).toISOString(), build_end: new Date(t0 + 90 * min).toISOString(), vote_end: new Date(t0 + 120 * min).toISOString() }) });
  const ci = await tool(key, 'check_in', { code: tokyo0.room_code });
  check('editor: on the day, check_in with the room code', !ci.error && /Checked in for Tokyo/.test(ci.text), ci.text);
  const before = await placeOf(em('jo'));
  const lk = await tool(key, 'submit', { name: 'Leaky App', pitch: 'Carries its key', repo: 'https://github.com/door-test/leak-app', by: 'Jo' });
  const afterLeak = await placeOf(em('jo')), ent = (await rest(e, 'entries?owner=eq.' + before.person + '&select=flags'))[0];
  check('editor: the key found in the repository is replaced, the entry kept, the hosts flagged, the builder told', !lk.error && /You are in/.test(lk.text) && /we replaced it/i.test(lk.text) && afterLeak.editor_version === before.editor_version + 1 && afterLeak.key_version === before.key_version && (ent?.flags || []).includes('key'), lk.text + JSON.stringify(ent));
  const old = await tool(key, 'whoami');
  check('editor: the old line stops; the new one works', old.error && !(await tool(keyFor(afterLeak), 'whoami')).error, old.text);
  key = keyFor(afterLeak);

  const bad1 = await tool(key, 'submit', { name: 'Missing', pitch: 'x', repo: 'https://github.com/door-test/not-found' });
  const jw = await byCode(em('jo'));
  const f = new FormData(); f.set('name', 'Missing'); f.set('pitch', 'x'); f.set('repo', 'https://github.com/door-test/not-found'); f.set('by', 'Jo');
  const bad2 = await jw.form('/api/entry', f);
  check('editor: the form and the tool refuse the same bad entry with the same words', bad1.error && bad1.text.startsWith(bad2.body?.error || '§'), bad1.text + ' | ' + bad2.body?.error);

  const tok = await byCode('owner@hackday.test');
  const end = await tok.go('/api/desk', { action: 'guest.editor', city: 'tokyo', person: before.person });
  check('editor: a host ends one person\'s editor line; their link stays', end.status === 200 && (await placeOf(em('jo'))).editor_version === afterLeak.editor_version + 1 && (await placeOf(em('jo'))).key_version === before.key_version, JSON.stringify(end.body));
  key = keyFor(await placeOf(em('jo')));

  // 4. the gate: the day pages before they open
  const inKey = (pass) => { const b = (x) => x.toString('base64url'); return b(Buffer.from(pass.id.replace(/-/g, ''), 'hex')) + b(createHmac('sha256', e.HACKDAY_KEY_SECRET).update('in:' + pass.id + ':' + pass.key_version).digest().subarray(0, 18)); };
  const setEvent = async (o) => { await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify(o) }); await sleep(5200); };
  const page = async (p, j) => { const r = j ? await j.go(p) : await (async () => { const x = await fetch(SITE + p, { redirect: 'manual' }); await x.text(); return { status: x.status, location: x.headers.get('location') }; })(); return r; };
  const later = new Date(Date.now() + 864e5).toISOString(), earlier = new Date(Date.now() - 864e5).toISOString();
  const berlinI = 4;
  await setEvent({ open: 'closed', opens_at: earlier });
  const h0 = await page('/'), c0 = await page('/city/berlin'), p0 = await page('/city/berlin/p/anything');
  check('gate: closed, the home goes to the preview page, temporarily', h0.status === 307 && /\/preview$/.test(h0.location || ''), JSON.stringify(h0));
  check('gate: closed, a city page goes to the preview page on that city', c0.status === 307 && /\/preview\?city=\d$/.test(c0.location || '') && p0.status === 307, JSON.stringify([c0, p0]));
  check('gate: the preview page, the desk, /in and the API stay open', (await page('/preview')).status === 200 && (await page('/desk')).status === 200 && (await page('/api/me')).status !== 307);
  check('gate: a super admin passes', (await page('/', tok)).status === 200 && (await page('/city/berlin', tok)).status === 200);
  const ana = await placeOf(em('ana'));
  const l0 = await page('/in/' + inKey(ana));
  check('gate: closed, the emailed link lands on the preview page on the person\'s city', l0.status === 303 && new RegExp('/preview\\?city=' + berlinI + '$').test(l0.location || ''), JSON.stringify(l0));
  await setEvent({ open: 'auto', opens_at: later });
  check('gate: by the time, before the opening: closed', (await page('/')).status === 307);
  await setEvent({ open: 'auto', opens_at: earlier });
  const h1 = await page('/'), l1 = await page('/in/' + inKey(ana));
  check('gate: by the time, after the opening: open, and the link lands on the city page', h1.status === 200 && (await page('/city/berlin')).status === 200 && /\/city\/berlin$/.test(l1.location || ''), JSON.stringify([h1.status, l1]));
  await setEvent({ open: 'open', opens_at: later });
  check('gate: the desk opens it before the time', (await page('/')).status === 200);
  await setEvent({ open: 'closed', opens_at: earlier });
  check('gate: the desk closes it after the time', (await page('/')).status === 307);
  const sw = await tok.go('/api/desk', { action: 'gate.set', open: 'open' });
  await sleep(5200);
  check('gate: the desk\'s switch opens it', sw.status === 200 && (await page('/')).status === 200, JSON.stringify(sw.body));
  await setEvent({ open: ev0.open, opens_at: ev0.opens_at });

  // the newer protocol revision: no handshake, server/discover, a version we do not speak
  const disc = await mcp(key, 'server/discover', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } }, { version: '2026-07-28' });
  check('protocol: server/discover names both eras and the server', disc.status === 200 && disc.j?.result?.supportedVersions?.[0] === '2026-07-28' && disc.j?.result?.supportedVersions?.includes('2025-06-18') && disc.j?.result?.resultType === 'complete' && !!disc.j?.result?._meta?.['io.modelcontextprotocol/serverInfo'], JSON.stringify(disc.j));
  const tl = await mcp(key, 'tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } }, { version: '2026-07-28' });
  check('protocol: tools/list in the newer revision has five tools and its cache fields', tl.j?.result?.tools?.length === 5 && tl.j?.result?.ttlMs > 0 && !!tl.j?.result?.cacheScope, JSON.stringify(tl.j?.result && { n: tl.j.result.tools?.length, ttl: tl.j.result.ttlMs }));
  const un = await mcp(key, 'tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } });
  check('protocol: a version we do not speak: 400 with the supported list', un.status === 400 && un.j?.error?.code === -32022 && Array.isArray(un.j?.error?.data?.supported), JSON.stringify(un.j));
  const init = await mcp(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  check('protocol: the older handshake still answers', init.j?.result?.protocolVersion === '2025-06-18' && init.j?.result?.serverInfo?.name === 'builder-day', JSON.stringify(init.j?.result?.serverInfo));
} finally {
  await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: ev0.open, opens_at: ev0.opens_at }) });
  await rest(e, 'cities?id=eq.tokyo', { method: 'PATCH', body: JSON.stringify({ build_start: tokyo0.build_start, build_end: tokyo0.build_end, vote_end: tokyo0.vote_end }) });
  await rest(e, 'entries?slug=eq.door-test-ivy', { method: 'DELETE' }).catch(() => {});
  await clean();
  luma.close();
}
console.log(bad ? bad + ' failed.' : 'All passed.');
process.exit(bad ? 1 : 0);
