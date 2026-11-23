// hidden-test.mjs: votes are hidden from minute 70 of a city until its voting closes, against the real routes on the
// local stack. London's clock is set three ways (before minute 70, between 70 and the close, after the close) with
// three entries of our own: two from before the freeze, with votes on both sides of it, and one that came in after it.
// At each moment every public surface is read (the city's and the day's snapshot, a public read of the tally, a vote
// and taking it back, the editor server's status, a project page's description) and the desk's state as a super admin.
// While hidden: the counts and order are as they stood at minute 70, the late entry is under the others, nothing after
// the freeze is in the steps, the tally is not readable by the public and a vote answers without a count; the desk
// still sees every vote. Before 70 and after the close everything is real. Then London and the event are put back and
// everything made here is removed. Needs the dev server on the local stack (SITE, default http://localhost:4320).
//   node supabase/scripts/hidden-test.mjs
import { createHmac } from 'node:crypto';
import { env, rest } from './env.mjs';

const e = env(), SITE = process.env.SITE || 'http://localhost:4320', CITY = 'london', EV = 'builder-day-2026', D = '@hidden.test';
let bad = 0, n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000, iso = (ms) => new Date(ms).toISOString();
function check(what, ok, more = '') { n++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok || !more ? '' : '  · ' + more)); }

function jar() {
  const c = new Map();
  return {
    async go(path, body) {
      const r = await fetch(SITE + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: Array.from(c, ([k, v]) => k + '=' + v).join('; ') } });
      (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(s) || v === '') c.delete(k); else c.set(k, v); });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, body: j, text: t, headers: r.headers };
    },
  };
}
async function byCode(email) {
  const j = jar();
  let s = await j.go('/api/auth/code', { email });
  if (s.status === 429 && s.body?.wait) { await sleep((s.body.wait + 1) * 1000); s = await j.go('/api/auth/code', { email }); }
  if (s.status !== 200) throw new Error('code for ' + email + ': ' + JSON.stringify(s.body));
  const [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(email) + '&template=eq.code&order=created_at.desc&limit=1&select=data');
  const v = await j.go('/api/auth/verify', { email, code: row.data.code });
  if (v.status !== 200) throw new Error('verify for ' + email + ': ' + JSON.stringify(v.body));
  return j;
}
const keyFor = (pass) => { const b = (x) => x.toString('base64url'); return b(Buffer.from(pass.id.replace(/-/g, ''), 'hex')) + b(createHmac('sha256', e.HACKDAY_KEY_SECRET).update('mcp:' + pass.id + ':' + pass.editor_version).digest().subarray(0, 18)); };
async function status(key) {
  const r = await fetch(SITE + '/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + key }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'status', arguments: {} } }) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { const m = t.match(/data: (.*)/); if (m) j = JSON.parse(m[1]); }
  const res = j?.result || {};
  return { error: !!res.isError, text: (res.content || []).map((c) => c.text).join(' ') };
}
/* the public's own read of the tally, with the anon key the browser has */
const anonTally = async (ids) => {
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/tally?select=entry,votes&entry=in.(' + ids.join(',') + ')', { headers: { apikey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + e.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  return r.ok ? r.json() : null;
};

async function dropAll() {
  const ppl = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  if (ppl.length) {
    const ids = ppl.map((p) => p.id).join(',');
    await rest(e, 'votes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'entries?owner=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'passes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'people?id=in.(' + ids + ')', { method: 'DELETE' });
  }
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', { headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
  const users = (await r.json()).users || [];
  for (const u of users.filter((u) => (u.email || '').endsWith(D))) await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
}

const [city0] = await rest(e, 'cities?id=eq.' + CITY + '&select=build_start,build_end,vote_end,voting_paused,submissions_paused');
const [ev0] = await rest(e, 'events?id=eq.' + EV + '&select=open,hide_at,public_at');
if (!city0 || !ev0) { console.error('London or Builder Day is not in the local database.'); process.exit(2); }
check('the event hides from minute 70', ev0.hide_at === 70, JSON.stringify(ev0));
await dropAll();

/* the city's clock: building started `ago` minutes ago, 90 minutes of building, 30 more of voting */
const T = Date.now();
async function clock(ago, from = T) {
  const s = from - ago * MIN;
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ build_start: iso(s), build_end: iso(s + 90 * MIN), vote_end: iso(s + 120 * MIN), voting_paused: false, submissions_paused: false }) });
  await sleep(2300);   /* the server keeps a snapshot two seconds */
}

try {
  /* everyone votes from the start here (public_at off), so a visitor's vote at minute 30 counts; vote-rules-test.mjs
     covers who may vote when */
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: 'open', public_at: null }) });
  await sleep(5200);   /* the day's gate is kept five seconds */
  // the people: three makers, five voters (votes written as the database would, at chosen minutes)
  const mk = async (who) => (await rest(e, 'people', { method: 'POST', body: JSON.stringify({ email: who + D, name: who[0].toUpperCase() + who.slice(1) }) }))[0];
  const [amy, ben, cal] = [await mk('amy'), await mk('ben'), await mk('cal')];
  const voters = []; for (const v of ['v1', 'v2', 'v3', 'v4', 'v5']) voters.push(await mk(v));
  /* the timeline of the hidden moment: building started 75 minutes before T, so the freeze was 5 minutes before T */
  const S = T - 75 * MIN, F = S + 70 * MIN;
  const entry = async (p, slug, at) => (await rest(e, 'entries', { method: 'POST', body: JSON.stringify({ city: CITY, owner: p.id, slug, name: 'Hidden ' + slug, pitch: 'A test entry', url: 'https://example.com/' + slug, repo: 'https://github.com/supabase/supabase', created_at: iso(at) }) }))[0];
  const A = await entry(amy, 'hid-a', S + 10 * MIN), B = await entry(ben, 'hid-b', S + 12 * MIN), L = await entry(cal, 'hid-late', F + 2 * MIN);
  const vote = (en, p, at) => rest(e, 'votes', { method: 'POST', body: JSON.stringify({ entry: en.id, person: p.id, kind: 'public', n: 1, created_at: iso(at) }) });
  /* before the freeze B leads 3 to 2; after it A gets three more and leads 5 to 3, and the late entry gets one */
  await vote(A, voters[0], F - 10 * MIN); await vote(A, voters[1], F - 9 * MIN);
  for (const k of [0, 1, 2]) await vote(B, voters[k + 2], F - 8 * MIN + k * 1000);
  for (const k of [2, 3, 4]) await vote(A, voters[k], F + 1 * MIN + k * 1000);
  await vote(L, voters[0], F + 3 * MIN);
  const [pass] = await rest(e, 'passes', { method: 'POST', body: JSON.stringify({ person: amy.id, city: CITY, source: 'host', list_email: 'amy' + D }) });
  const key = keyFor(pass);
  const sup = await byCode('owner@hackday.test'), voter = await byCode('dee' + D);
  const ids = [A.id, B.id, L.id];

  async function surfaces(label, want) {
    const city = await jar().go('/api/city/' + CITY + '/snapshot'), day = await jar().go('/api/day/snapshot');
    const of = (snap, en) => snap?.entries?.find((x) => x.slug === en.slug);
    const cs = city.body, ds = day.body?.cities?.find((c) => c.city.id === CITY);
    const a = of(cs, A), b = of(cs, B), l = of(cs, L), da = of(ds, A), db = of(ds, B);
    const order = cs.entries.slice().sort((x, y) => y.votes - x.votes || x.reached - y.reached || x.created - y.created).map((x) => x.slug);
    const tally = await anonTally(ids);
    const on = await voter.go('/api/vote', { city: CITY, entry: b.no, on: true }), off = await voter.go('/api/vote', { city: CITY, entry: b.no, on: false });
    const st = await status(key);
    const page = await jar().go('/city/' + CITY + '/p/hid-a');
    const desc = (page.text.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const desk = await sup.go('/api/desk/state?event=' + EV + '&city=' + CITY);
    const dA = desk.body?.entries?.find((x) => x.slug === 'hid-a');
    check(label + ': the desk sees every vote (A has 5)', dA?.votes === 5, JSON.stringify(dA && { votes: dA.votes }) + ' ' + desk.status);
    if (want === 'hidden') {
      check(label + ': city snapshot is marked hidden, until the close', !!cs.hidden && cs.hidden.from === F && cs.hidden.until === S + 120 * MIN, JSON.stringify(cs.hidden));
      check(label + ': city snapshot counts are minute 70 (A 2, B 3, late 0)', a.votes === 2 && b.votes === 3 && l.votes === 0, [a.votes, b.votes, l.votes].join(' '));
      check(label + ': no step after the freeze', cs.steps.every((x) => x[1] < F) && !cs.steps.some((x) => x[0] === l.no), String(cs.steps.filter((x) => x[1] >= F).length));
      check(label + ': the frozen order: B over A, the late entry under every earlier one', order.indexOf('hid-b') < order.indexOf('hid-a') && cs.entries.filter((x) => x.created < F).every((x) => order.indexOf(x.slug) < order.indexOf('hid-late')), order.join(','));
      check(label + ': day snapshot has the same frozen counts and no steps', !!ds.hidden && da.votes === 2 && db.votes === 3 && ds.steps.length === 0, JSON.stringify([da.votes, db.votes, ds.steps.length]));
      check(label + ': the public cannot read the tally', Array.isArray(tally) && tally.length === 0, JSON.stringify(tally));
      check(label + ': a vote and taking it back still work, with no count in the answer', on.status === 200 && on.body?.votes === null && off.status === 200 && off.body?.votes === null, JSON.stringify([on.status, on.body, off.status, off.body]));
      check(label + ': the editor server says hidden, with no count', !st.error && /hidden/i.test(st.text) && !/\d+ votes?\b/.test(st.text) && !/\b\d+(st|nd|rd|th) of\b/.test(st.text), st.text);
      check(label + ': the project page names no place or count', page.status === 200 && /hidden/i.test(desc) && !/\d+ votes?\b/.test(desc), page.status + ' ' + desc);
    } else {
      check(label + ': city snapshot is not hidden', !cs.hidden, JSON.stringify(cs.hidden));
      check(label + ': city snapshot counts are real (A 5, B 3, late 1)', a.votes === 5 && b.votes === 3 && l.votes === 1, [a.votes, b.votes, l.votes].join(' '));
      check(label + ': every step is there', cs.steps.some((x) => x[1] >= F), String(cs.steps.length));
      check(label + ': the real order: A over B', order.indexOf('hid-a') < order.indexOf('hid-b'), order.join(','));
      check(label + ': day snapshot counts are real', !ds.hidden && da.votes === 5 && db.votes === 3, JSON.stringify([da.votes, db.votes]));
      check(label + ': the public reads the tally', Array.isArray(tally) && tally.length === 3, JSON.stringify(tally));
      if (want === 'open') check(label + ': a vote answers with the count', on.status === 200 && on.body?.votes === 4 && off.status === 200 && off.body?.votes === 3, JSON.stringify([on.body, off.body]));
      else check(label + ': voting has closed', on.status === 409 && off.status === 409, JSON.stringify([on.status, off.status]));
      check(label + ': the editor server gives the place and count', !st.error && /with \d+ votes?/.test(st.text), st.text);
      check(label + ': the project page says the place and count', page.status === 200 && /with \d+ votes?/.test(desc), page.status + ' ' + desc);
    }
  }

  // 1. before minute 70: building started 30 minutes ago (all the votes above are in the past, so all count)
  await clock(30);
  await surfaces('before 70', 'open');
  // 2. between 70 and the close: building started 75 minutes ago, the freeze was 5 minutes ago
  await clock(75);
  await surfaces('hidden', 'hidden');
  // 3. after the close: building started 130 minutes ago, voting closed 10 minutes ago
  await clock(130);
  await surfaces('after close', 'closed');
  // 4. no cache across a freeze: a freeze 15 seconds away is not cached; one far off is, briefly
  await clock(70 - 0.25, Date.now());
  const near = await jar().go('/api/city/' + CITY + '/snapshot'), nearDay = await jar().go('/api/day/snapshot');
  check('near the freeze: not cached', near.headers.get('cache-control') === 'no-store' && nearDay.headers.get('cache-control') === 'no-store', near.headers.get('cache-control') + ' / ' + nearDay.headers.get('cache-control'));
  await clock(30);
  const far = await jar().go('/api/city/' + CITY + '/snapshot');
  check('far from it: cached two seconds', /s-maxage=2/.test(far.headers.get('cache-control') || ''), far.headers.get('cache-control'));
} catch (err) {
  bad++; console.log('FAIL ' + (err && err.stack || err));
} finally {
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify(city0) });
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: ev0.open, public_at: ev0.public_at }) });
  await dropAll();
  const left = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  check('cleaned up (London, the event, our people)', left.length === 0);
}
console.log(bad ? bad + ' of ' + n + ' failed.' : 'All ' + n + ' pass.');
process.exit(bad ? 1 : 0);
