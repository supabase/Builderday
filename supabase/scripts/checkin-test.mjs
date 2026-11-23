// checkin-test.mjs: who may submit, through the site's own routes and the editor server.
//   node supabase/scripts/checkin-test.mjs [--site http://localhost:4399]
// The site must run on the local stack with HACKDAY_FAKE_GITHUB=1 (so submits do not ask GitHub). It uses Tokyo (as
// the city building now) and Singapore (another city), makes people under @checkin.test, and puts everything back.
// What it checks: a room code with an email not on the list is refused with no place made; a person signed in by the
// six-digit code can vote but not submit unless listed and checked in; the room code checks in; a check-in outlasts a
// new room code; another city's code is refused; a host marks a guest in the room and takes it back, both logged; the
// editor server's check_in, submit, whoami and status; and after building closes, submit reads "closed".
import { createHmac } from 'node:crypto';
import { env, rest } from './env.mjs';

const e = env(), args = process.argv.slice(2), SITE = args.includes('--site') ? args[args.indexOf('--site') + 1] : 'http://localhost:4399';
const A = 'tokyo', B = 'singapore', D = 'checkin.test', min = 60000;
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
/* sign in by the six-digit code, read from the outbox (no email goes out locally) */
async function byCode(email) {
  const j = jar(); let s = await j.go('/api/auth/code', { email });
  if (s.body?.wait) { await new Promise((r) => setTimeout(r, (s.body.wait + 1) * 1000)); s = await j.go('/api/auth/code', { email }); }
  const [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(email) + '&template=eq.code&order=created_at.desc&limit=1&select=data');
  await j.go('/api/auth/verify', { email, code: row.data.code }); return j;
}
/* a submit through the web form's route (multipart, as the page sends it) */
function formSubmit(j, name) {
  const f = new FormData(); f.set('name', name); f.set('pitch', 'A test entry'); f.set('repo', 'https://github.com/checkin-test/' + name.toLowerCase().replace(/\W+/g, '-')); f.set('by', 'Tester');
  return j.form('/api/entry', f);
}
let bad = 0; const check = (t, ok, extra = '') => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + t + (extra && !ok ? '  · ' + String(extra).slice(0, 200) : '')); };
/* a person has one place per event; the embed comes back as a list, so take the one */
const passOf = async (email) => { const p = (await rest(e, 'people?email=eq.' + encodeURIComponent(email) + '&select=id,passes!passes_person_fkey(id,city,checked_in_at,checked_in_how,key_version,editor_version)'))[0]; return p ? { ...p, passes: [].concat(p.passes || [])[0] || null } : p; };
const auth = (p, init = {}) => fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/' + p, { ...init, headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
const keyFor = (pass) => { const b = (x) => x.toString('base64url'); return b(Buffer.from(pass.id.replace(/-/g, ''), 'hex')) + b(createHmac('sha256', e.HACKDAY_KEY_SECRET).update('mcp:' + pass.id + ':' + pass.editor_version).digest().subarray(0, 18)); };
async function tool(key, name, a = {}) {
  const r = await fetch(SITE + '/api/mcp/' + key, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: a } }) });
  const j = await r.json(); const res = j.result || {}; return { error: !!res.isError, text: (res.content || []).map((c) => c.text).join(' ') || j.error?.message || '' };
}
const clean = async () => {
  await rest(e, 'people?email=like.*%40' + D, { method: 'DELETE' });
  const { users = [] } = await (await auth('users?per_page=1000')).json();
  for (const u of users.filter((x) => (x.email || '').endsWith('@' + D))) await auth('users/' + u.id, { method: 'DELETE' });
};

const [cityA] = await rest(e, 'cities?id=eq.' + A + '&select=build_start,build_end,vote_end,room_code,room_code_prev,room_code_at,build_min,vote_after,submissions_paused,voting_paused');
const [cityB] = await rest(e, 'cities?id=eq.' + B + '&select=room_code');
const was = { build_start: cityA.build_start, build_end: cityA.build_end, vote_end: cityA.vote_end, room_code: cityA.room_code, room_code_prev: cityA.room_code_prev, room_code_at: cityA.room_code_at, submissions_paused: cityA.submissions_paused, voting_paused: cityA.voting_paused };
const t0 = Date.now() - 2 * min;
/* the editor's check_in and submit wait for the day pages to open: open them for this run, put them back after */
const [ev0] = await rest(e, 'events?select=id,open');
await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: 'open' }) });
try {
  await clean();
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ build_start: new Date(t0).toISOString(), build_end: new Date(t0 + cityA.build_min * min).toISOString(), vote_end: new Date(t0 + (cityA.build_min + cityA.vote_after) * min).toISOString(), submissions_paused: false, voting_paused: false }) });
  /* on Tokyo's list (as a Luma sync puts them): l1 to l4; nobody else */
  const ppl = await rest(e, 'people', { method: 'POST', body: JSON.stringify(['l1', 'l2', 'l3', 'l4'].map((n) => ({ email: em(n), name: 'Listed ' + n }))) });
  await rest(e, 'passes', { method: 'POST', body: JSON.stringify(ppl.map((p) => ({ person: p.id, city: A, source: 'luma' }))) });
  const codeA = cityA.room_code, codeB = cityB.room_code;

  // 1. not on the list
  const u0 = await jar().go('/api/auth/room', { email: em('stranger'), code: codeA, city: A });
  check('room code with an email not on the list: refused in words, no place made', u0.status === 403 && /not on the list for Tokyo/.test(u0.body?.error || '') && /can still vote/.test(u0.body?.error || '') && !(await passOf(em('stranger'))), JSON.stringify(u0));

  // 2. listed, signed in by the six-digit code, not checked in
  const l1 = await byCode(em('l1'));
  const me1 = await l1.go('/api/me');
  check('the six-digit code signs in a listed person, not checked in', me1.status === 200 && me1.body?.pass?.city === A && me1.body?.pass?.checkedIn === false, JSON.stringify(me1.body?.pass));
  const s1 = await formSubmit(l1, 'Gate One');
  check('listed but not checked in: submit refused, says to type the code', s1.status === 403 && s1.body?.field === 'room' && /type the code on the screen/.test(s1.body?.error || ''), JSON.stringify(s1));

  // 3. the room code checks in (a wrong code and another city's code do not)
  const w1 = await l1.go('/api/checkin', { code: codeB });
  check('check-in with another city\'s code: refused', w1.status === 401 && /not the one on the screen in Tokyo/.test(w1.body?.error || ''), JSON.stringify(w1));
  const c1 = await l1.go('/api/checkin', { code: codeA.toLowerCase() });
  const p1 = await passOf(em('l1'));
  check('check-in with the room code: stored on the pass, by the room', c1.status === 200 && !!p1.passes.checked_in_at && p1.passes.checked_in_how === 'room', JSON.stringify(c1) + JSON.stringify(p1));
  const s2 = await formSubmit(l1, 'Gate One');
  check('checked in: submit goes through', s2.status === 200 && s2.body?.entry?.name === 'Gate One', JSON.stringify(s2));

  // 4. a new room code does not undo a check-in
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ room_code: 'ZZ9Q', room_code_prev: codeA, room_code_at: new Date(Date.now() - 60 * min).toISOString() }) });
  const s3 = await formSubmit(l1, 'Gate One Edited');
  check('checked in, then the host changed the room code: edit still goes through', s3.status === 200 && s3.body?.entry?.name === 'Gate One Edited', JSON.stringify(s3));
  const old = await jar().go('/api/auth/room', { email: em('l2'), code: codeA, city: A });
  check('the old code, past its grace minutes, no longer checks anyone in', old.status === 401, JSON.stringify(old));
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ room_code: codeA, room_code_prev: was.room_code_prev, room_code_at: was.room_code_at }) });

  // 5. voting: anyone after a six-digit code; a room-code check-in counts as confirmed
  const { no: entryNo } = (await rest(e, 'entries?select=no&owner=eq.' + p1.id))[0];
  const u = await byCode(em('voter'));
  const v1 = await u.go('/api/vote', { city: A, entry: entryNo, on: true });
  check('a person on no list votes after the six-digit code', v1.status === 200, JSON.stringify(v1));
  const s4 = await formSubmit(u, 'Not Listed');
  check('a person on no list: submit refused, says how to get on the list', s4.status === 403 && s4.body?.field === 'list' && /ask the host at the desk/.test(s4.body?.error || ''), JSON.stringify(s4));

  // 6. another city's code, and a place that is never moved by a code
  const l2 = jar();
  const o1 = await l2.go('/api/auth/room', { email: em('l2'), code: codeB, city: B });
  check('a Tokyo guest with Singapore\'s code on Singapore\'s page: refused, pointed to Tokyo', o1.status === 403 && /on the list for Tokyo, not Singapore/.test(o1.body?.error || ''), JSON.stringify(o1));
  const o2 = await l2.go('/api/auth/room', { email: em('l2'), code: codeB, city: A });
  check('a Tokyo guest with Singapore\'s code on Tokyo\'s page: refused', o2.status === 401, JSON.stringify(o2));
  check('neither moved the guest\'s place nor checked them in', (await passOf(em('l2'))).passes.city === A && !(await passOf(em('l2'))).passes.checked_in_at);
  const r2 = await l2.go('/api/auth/room', { email: em('l2'), code: codeA, city: A });
  const v2 = await l2.go('/api/vote', { city: A, entry: entryNo, on: true });
  check('room code with a listed email: signed in and checked in, and may vote at once', r2.status === 200 && r2.body?.checkedIn === true && !!(await passOf(em('l2'))).passes.checked_in_at && v2.status === 200, JSON.stringify(r2) + JSON.stringify(v2));

  // 6b. a listed guest who also judges: the room code proves the room, not the inbox, so it gives no session
  const [j1] = await rest(e, 'people', { method: 'POST', body: JSON.stringify({ email: em('j1'), name: 'Listed judge' }) });
  await rest(e, 'passes', { method: 'POST', body: JSON.stringify({ person: j1.id, city: A, source: 'luma' }) });
  const [{ event: evA }] = await rest(e, 'cities?id=eq.' + A + '&select=event');
  await rest(e, 'roles', { method: 'POST', body: JSON.stringify({ person: j1.id, role: 'judge', event: evA, city: A }) });
  const jr = jar(), j1r = await jr.go('/api/auth/room', { email: em('j1'), code: codeA, city: A }), j1me = await jr.go('/api/me');
  check('room code with a judge\'s email: refused, says to use the emailed code; no session, not checked in', j1r.status === 403 && /runs the desk/.test(j1r.body?.error || '') && j1me.body?.signedIn === false && !(await passOf(em('j1'))).passes.checked_in_at, JSON.stringify(j1r) + JSON.stringify(j1me.body));
  const jc = await byCode(em('j1')), j1c = await jc.go('/api/checkin', { code: codeA });
  check('the same judge signed in by the six-digit code: the room code checks them in', j1c.status === 200 && !!(await passOf(em('j1'))).passes.checked_in_at, JSON.stringify(j1c));

  // 7. the host marks a guest in the room by hand, and takes it back; both in the log
  const host = await byCode('owner@hackday.test');
  const l3 = await passOf(em('l3'));
  const h1 = await host.go('/api/desk', { action: 'guest.in', city: A, person: l3.id });
  const l3a = await passOf(em('l3'));
  check('the desk marks a listed guest in the room by hand', h1.status === 200 && l3a.passes.checked_in_how === 'host', JSON.stringify(h1));
  const h2 = await host.go('/api/desk', { action: 'guest.out', city: A, person: l3.id });
  const logs = await rest(e, 'log?target=eq.' + l3.id + '&select=what&order=at');
  check('and takes it back; both written to the log', h2.status === 200 && !(await passOf(em('l3'))).passes.checked_in_at && logs.map((x) => x.what).join('|') === 'marked in the room|not in the room', JSON.stringify(logs));
  const st = await host.go('/api/desk/state?city=' + A);
  check('the desk counts who is in the room (l1, l2 and the judge)', st.body?.counts?.inRoom === 3 && st.body?.guests?.filter((g) => g.inRoom).length === 3, JSON.stringify(st.body?.counts));

  // 8. the editor server
  const l4 = await passOf(em('l4')), key = keyFor(l4.passes);
  const m1 = await tool(key, 'whoami');
  check('editor: whoami says not checked in and what to do', !m1.error && /Not checked in yet: call check_in/.test(m1.text), m1.text);
  const m2 = await tool(key, 'submit', { name: 'From The Editor', pitch: 'Sent by the editor', repo: 'https://github.com/checkin-test/from-the-editor' });
  check('editor: submit before check-in is refused, with how to fix it', m2.error && /check_in/.test(m2.text) && /type the code on the screen/.test(m2.text), m2.text);
  const m3 = await tool(key, 'check_in', { code: 'NOPE' });
  check('editor: check_in with a wrong code is refused', m3.error && /not the one on the screen in Tokyo/.test(m3.text), m3.text);
  const m4 = await tool(key, 'check_in', { code: codeA });
  check('editor: check_in with the room code checks in', !m4.error && /Checked in for Tokyo/.test(m4.text) && (await passOf(em('l4'))).passes.checked_in_how === 'room', m4.text);
  const m5 = await tool(key, 'whoami');
  check('editor: whoami says checked in', /Checked in with the room code/.test(m5.text), m5.text);
  const m6 = await tool(key, 'submit', { name: 'From The Editor', pitch: 'Sent by the editor', repo: 'https://github.com/checkin-test/from-the-editor' });
  check('editor: submit after check-in goes through', !m6.error && /You are in/.test(m6.text), m6.text);
  const m7 = await tool(key, 'status');
  check('editor: status answers, with no check-in note once checked in', !m7.error && !/Not checked in/.test(m7.text), m7.text);

  // 9. delete is gated the same way: a guest whose mark was taken back cannot delete
  const l3j = await byCode(em('l3'));
  await host.go('/api/desk', { action: 'guest.in', city: A, person: l3.id });
  const s5 = await formSubmit(l3j, 'Marked By Host');
  await host.go('/api/desk', { action: 'guest.out', city: A, person: l3.id });
  const d1 = await l3j.go('/api/entry', null, 'DELETE');
  check('marked in by the host: submit goes through; mark taken back: delete refused, says to type the code', s5.status === 200 && d1.status === 403 && /type the code/.test(d1.body?.error || ''), JSON.stringify(s5.status) + JSON.stringify(d1));
  const d2 = await l1.go('/api/entry', null, 'DELETE');
  check('checked in: delete goes through', d2.status === 200, JSON.stringify(d2));

  // 10. after building closes
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ build_end: new Date(Date.now() - min).toISOString() }) });
  const c2 = await formSubmit(l2, 'Too Late');
  check('after building closes: a checked-in guest is told it closed', c2.status === 409 && c2.body?.field === 'closed', JSON.stringify(c2));
  const c3 = await formSubmit(l3j, 'Too Late Too');
  check('after building closes: a guest not checked in is told it closed, not asked for the code', c3.status === 409 && c3.body?.field === 'closed', JSON.stringify(c3));
  const c4 = await formSubmit(u, 'Not Listed Late');
  check('after building closes: a person on no list is still told how to get on a list', c4.status === 403 && c4.body?.field === 'list', JSON.stringify(c4));
} finally {
  await rest(e, 'events?id=eq.' + ev0.id, { method: 'PATCH', body: JSON.stringify({ open: ev0.open }) });
  await clean();
  await rest(e, 'cities?id=eq.' + A, { method: 'PATCH', body: JSON.stringify(was) });
}
console.log(bad ? bad + ' failed' : 'All passed.');
process.exit(bad ? 1 : 0);

