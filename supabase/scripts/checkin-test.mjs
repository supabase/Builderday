// checkin-test.mjs: who may submit, through the site's own routes and the editor server.
//   node supabase/scripts/checkin-test.mjs [--site http://localhost:4399]
// The site must run on the local stack with HACKDAY_FAKE_GITHUB=1 (so submits do not ask GitHub) and
// HACKDAY_FAKE_SUPABASE=1 (a stand-in supabase.com account: the token "fake.<email>"). It uses Tokyo (as the city
// building now), makes people under @checkin.test, and puts everything back.
// What it checks: signing in with a Supabase account; the email sign-in and the room code are gone; a listed person
// can vote but not submit until a host checks them in at the desk; the host's check-in and its undo, both logged; a
// Supabase account that adds the Luma email by a code takes over that place; the editor server's whoami, submit and
// status, and that it has no check_in; delete is gated the same way; and after building closes, submit reads "closed".
import { createHmac } from 'node:crypto';
import { env, rest } from './env.mjs';

const e = env(), args = process.argv.slice(2), SITE = args.includes('--site') ? args[args.indexOf('--site') + 1] : 'http://localhost:4399';
const A = 'tokyo', D = 'checkin.test', min = 60000;
const em = (n) => n + '@' + D;

function jar() {
  const c = new Map(), cookie = () => Array.from(c, ([k, v]) => k + '=' + v).join('; ');
  const done = async (r) => {
    (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); c.set(kv.slice(0, i), kv.slice(i + 1)); });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } return { status: r.status, body: j };
  };
  return {
    go: async (p, body, method) => done(await fetch(SITE + p, { method: method || (body ? 'POST' : 'GET'), redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: cookie() }, body: body ? JSON.stringify(body) : undefined })),
    form: async (p, f) => done(await fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie() }, body: f })),
  };
}
/* sign in with the stand-in Supabase account for this email */
async function bySupabase(email) {
  const j = jar(); const r = await j.go('/api/auth/supabase', { token: 'fake.' + email });
  if (r.status !== 200) throw new Error('Supabase sign-in failed for ' + email + ': ' + JSON.stringify(r) + ' (is HACKDAY_FAKE_SUPABASE=1 set on the site?)');
  return j;
}
/* a submit through the web form's route (multipart, as the page sends it) */
function formSubmit(j, name) {
  const f = new FormData(); f.set('name', name); f.set('pitch', 'A test entry'); f.set('repo', 'https://github.com/checkin-test/' + name.toLowerCase().replace(/\W+/g, '-')); f.set('by', 'Tester');
  return j.form('/api/entry', f);
}
let bad = 0; const check = (t, ok, extra = '') => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + t + (extra && !ok ? '  · ' + String(extra).slice(0, 200) : '')); };
/* a person has one place per event; the embed comes back as a list, so take the one */
const passOf = async (email) => { const p = (await rest(e, 'people?email=eq.' + encodeURIComponent(email) + '&select=id,passes!passes_person_fkey(id,city,list_email,checked_in_at,checked_in_how,key_version,editor_version)'))[0]; return p ? { ...p, passes: [].concat(p.passes || [])[0] || null } : p; };
const auth = (p, init = {}) => fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/' + p, { ...init, headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
const keyFor = (pass) => { const b = (x) => x.toString('base64url'); return b(Buffer.from(pass.id.replace(/-/g, ''), 'hex')) + b(createHmac('sha256', e.HACKDAY_KEY_SECRET).update('mcp:' + pass.id + ':' + pass.editor_version).digest().subarray(0, 18)); };
async function rpc(key, method, params) {
  const r = await fetch(SITE + '/api/mcp/' + key, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
}
async function tool(key, name, a = {}) {
  const j = await rpc(key, 'tools/call', { name, arguments: a }); const res = j.result || {};
  return { error: !!res.isError, text: (res.content || []).map((c) => c.text).join(' ') || j.error?.message || '' };
}
const clean = async () => {
  await rest(e, 'outbox?to_email=like.*%40' + D, { method: 'DELETE' });
  await rest(e, 'people?email=like.*%40' + D, { method: 'DELETE' });
  const { users = [] } = await (await auth('users?per_page=1000')).json();
  for (const u of users.filter((x) => (x.email || '').endsWith('@' + D))) await auth('users/' + u.id, { method: 'DELETE' });
};

const [cityA] = await rest(e, 'cities?id=eq.' + A + '&select=event,build_start,build_end,vote_end,build_min,vote_after,submissions_paused,voting_paused');
const was = { build_start: cityA.build_start, build_end: cityA.build_end, vote_end: cityA.vote_end, submissions_paused: cityA.submissions_paused, voting_paused: cityA.voting_paused };
/* 50 minutes into building: voting is open (from minute 45), submitting still is */
const t0 = Date.now() - 50 * min;
/* the editor's submit waits for the day pages to open: open them for this run, put them back after */
const [ev0] = await rest(e, 'events?id=eq.' + cityA.event + '&select=id,open');
await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: 'open' }) });
try {
  await clean();
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ build_start: new Date(t0).toISOString(), build_end: new Date(t0 + cityA.build_min * min).toISOString(), vote_end: new Date(t0 + cityA.build_min * min).toISOString(), submissions_paused: false, voting_paused: false }) });
  /* on Tokyo's list (as a Luma sync puts them): l1 to l4 and luma5; nobody else */
  const ppl = await rest(e, 'people', { method: 'POST', body: JSON.stringify(['l1', 'l2', 'l3', 'l4', 'luma5'].map((n) => ({ email: em(n), name: 'Listed ' + n }))) });
  await rest(e, 'passes', { method: 'POST', body: JSON.stringify(ppl.map((p) => ({ person: p.id, city: A, source: 'luma' }))) });

  // 1. the old ways in are closed
  const code0 = await jar().go('/api/auth/code', { email: em('l1') });
  check('the email sign-in is off: refused, says to use a Supabase account', code0.status === 403 && /Supabase account/.test(code0.body?.error || ''), JSON.stringify(code0));
  const room0 = await jar().go('/api/auth/room', { email: em('l1'), code: 'ABCD', city: A });
  check('the room code route is gone', room0.status === 404 || room0.status === 405, JSON.stringify(room0.status));
  const ci0 = await jar().go('/api/checkin', { code: 'ABCD' });
  check('the self check-in route is gone', ci0.status === 404 || ci0.status === 405, JSON.stringify(ci0.status));
  const junk = await jar().go('/api/auth/supabase', { token: 'not-a-real-token-at-all-1234567890' });
  check('a token supabase.com does not know: refused, nothing signed in', junk.status === 401 || junk.status === 502, JSON.stringify(junk));

  // 2. listed, signed in with Supabase, not checked in
  const l1 = await bySupabase(em('l1'));
  const me1 = await l1.go('/api/me');
  check('a Supabase account signs in a listed person, not checked in', me1.status === 200 && me1.body?.pass?.city === A && me1.body?.pass?.checkedIn === false, JSON.stringify(me1.body?.pass));
  const s1 = await formSubmit(l1, 'Gate One');
  check('listed but not checked in: submit refused, says to ask a host at the door', s1.status === 403 && s1.body?.field === 'room' && /host at the door/.test(s1.body?.error || ''), JSON.stringify(s1));

  // 3. the host checks people in at the desk, and can take it back; both logged
  const host = await bySupabase('owner@hackday.test');
  const p1 = await passOf(em('l1'));
  const h1 = await host.go('/api/desk', { action: 'guest.in', city: A, person: p1.id });
  check('the desk checks a listed guest in', h1.status === 200 && (await passOf(em('l1'))).passes.checked_in_how === 'host', JSON.stringify(h1));
  const me1b = await l1.go('/api/me');
  check('the guest\'s account now says checked in', me1b.body?.pass?.checkedIn === true, JSON.stringify(me1b.body?.pass));
  const s2 = await formSubmit(l1, 'Gate One');
  check('checked in: submit goes through', s2.status === 200 && s2.body?.entry?.name === 'Gate One', JSON.stringify(s2));
  const p3 = await passOf(em('l3'));
  await host.go('/api/desk', { action: 'guest.in', city: A, person: p3.id });
  const h2 = await host.go('/api/desk', { action: 'guest.out', city: A, person: p3.id });
  const logs = await rest(e, 'log?target=eq.' + p3.id + '&select=what&order=at');
  check('undo takes the check-in back; both written to the log', h2.status === 200 && !(await passOf(em('l3'))).passes.checked_in_at && logs.map((x) => x.what).join('|') === 'marked in the room|not in the room', JSON.stringify(logs));
  const guest = await bySupabase(em('l2')), g1 = await guest.go('/api/desk', { action: 'guest.in', city: A, person: (await passOf(em('l2'))).id });
  check('a builder cannot check anyone in', g1.status === 401 || g1.status === 403, JSON.stringify(g1));

  // 4. voting: anyone signed in with Supabase
  const { no: entryNo } = (await rest(e, 'entries?select=no&owner=eq.' + p1.id))[0];
  const u = await bySupabase(em('voter'));
  const v1 = await u.go('/api/vote', { city: A, entry: entryNo, on: true });
  check('a person on no list votes once signed in', v1.status === 200, JSON.stringify(v1));
  const s4 = await formSubmit(u, 'Not Listed');
  check('a person on no list: submit refused, says how to get on the list', s4.status === 403 && s4.body?.field === 'list' && /Add it in your account/.test(s4.body?.error || ''), JSON.stringify(s4));

  // 5. a Supabase account on another email adds the Luma email by a code and takes the place
  const w = await bySupabase(em('work5'));
  const cl1 = await w.go('/api/auth/claim', { email: em('luma5') });
  const [crow] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(em('luma5')) + '&template=eq.claim&order=created_at.desc&limit=1&select=data');
  const cl2 = await w.go('/api/auth/claim/verify', { email: em('luma5'), code: crow?.data?.code });
  const meW = await w.go('/api/me');
  check('adding the Luma email by its code moves the place to the Supabase account', cl1.status === 200 && cl2.status === 200 && meW.body?.pass?.city === A && (await passOf(em('work5')))?.passes?.list_email === em('luma5'), JSON.stringify(cl2) + JSON.stringify(meW.body?.pass));
  const sentOnHook = await rest(e, 'outbox?to_email=like.*%40' + D + '&template=neq.claim&select=template');
  check('no other email went to anyone in this run (no place links, no codes)', sentOnHook.length === 0, JSON.stringify(sentOnHook));

  // 6. the editor server
  const l4 = await passOf(em('l4')), key = keyFor(l4.passes);
  const tl = await rpc(key, 'tools/list', {});
  const names = (tl.result?.tools || []).map((t) => t.name).sort().join(',');
  check('editor: the tools are practice, status, submit and whoami (no check_in)', names === 'practice,status,submit,whoami', names);
  const m1 = await tool(key, 'whoami');
  check('editor: whoami says not checked in and to ask a host', !m1.error && /Not checked in yet: a host checks you in at the door/.test(m1.text), m1.text);
  const m2 = await tool(key, 'submit', { name: 'From The Editor', pitch: 'Sent by the editor', repo: 'https://github.com/checkin-test/from-the-editor' });
  check('editor: submit before check-in is refused, with how to fix it', m2.error && /host at the door/.test(m2.text), m2.text);
  await host.go('/api/desk', { action: 'guest.in', city: A, person: l4.id });
  const m5 = await tool(key, 'whoami');
  check('editor: whoami says checked in by a host', /Checked in by a host/.test(m5.text), m5.text);
  const m6 = await tool(key, 'submit', { name: 'From The Editor', pitch: 'Sent by the editor', repo: 'https://github.com/checkin-test/from-the-editor' });
  check('editor: submit after check-in goes through', !m6.error && /You are in/.test(m6.text), m6.text);
  const m7 = await tool(key, 'status');
  check('editor: status answers, with no check-in note once checked in', !m7.error && !/Not checked in/.test(m7.text), m7.text);

  // 7. delete is gated the same way: a guest whose check-in was taken back cannot delete
  const l3j = await bySupabase(em('l3'));
  await host.go('/api/desk', { action: 'guest.in', city: A, person: p3.id });
  const s5 = await formSubmit(l3j, 'Marked By Host');
  await host.go('/api/desk', { action: 'guest.out', city: A, person: p3.id });
  const d1 = await l3j.go('/api/entry', null, 'DELETE');
  check('checked in: submit goes through; check-in taken back: delete refused, says to ask a host', s5.status === 200 && d1.status === 403 && /host at the door/.test(d1.body?.error || ''), JSON.stringify(s5.status) + JSON.stringify(d1));
  const d2 = await l1.go('/api/entry', null, 'DELETE');
  check('checked in: delete goes through', d2.status === 200, JSON.stringify(d2));

  // 8. after building closes
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ build_end: new Date(Date.now() - min).toISOString() }) });
  const c2 = await formSubmit(l1, 'Too Late');
  check('after building closes: a checked-in guest is told it closed', c2.status === 409 && c2.body?.field === 'closed', JSON.stringify(c2));
  const c3 = await formSubmit(l3j, 'Too Late Too');
  check('after building closes: a guest not checked in is told it closed, not sent to the door', c3.status === 409 && c3.body?.field === 'closed', JSON.stringify(c3));
  const c4 = await formSubmit(u, 'Not Listed Late');
  check('after building closes: a person on no list is still told how to get on a list', c4.status === 403 && c4.body?.field === 'list', JSON.stringify(c4));
} finally {
  await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: ev0.open }) });
  await clean();
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify(was) });
}
console.log(bad ? bad + ' failed' : 'All passed.');
process.exit(bad ? 1 : 0);
