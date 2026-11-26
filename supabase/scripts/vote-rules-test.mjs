// vote-rules-test.mjs: who may vote when, what a judge's vote counts, and ties at the top, against the real routes on
// the local stack. London's clock is set four ways: 30 minutes in (nobody votes yet, not even a builder on the list),
// 50 minutes in (everyone votes; judges not yet), 65 minutes in (the judges vote too; a judge's vote counts 5) and after
// the close at 90 (nobody votes; a host settles a tie for first). Then London and the event are put back and
// everything made here is removed. Needs the dev server on the local stack (SITE, default http://localhost:4320).
//   node supabase/scripts/vote-rules-test.mjs
import { env, rest } from './env.mjs';

const e = env(), SITE = process.env.SITE || 'http://localhost:4320', CITY = 'london', EV = 'builder-day-2026', D = '@rules.test';
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
/* sign in with the stand-in Supabase account for this email (the site runs with HACKDAY_FAKE_SUPABASE=1) */
async function signIn(email) {
  const j = jar(), r = await j.go('/api/auth/supabase', { token: 'fake.' + email });
  if (r.status !== 200) throw new Error('Supabase sign-in for ' + email + ': ' + JSON.stringify(r.body) + ' (is HACKDAY_FAKE_SUPABASE=1 set on the site?)');
  return j;
}

async function dropAll() {
  const ppl = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  if (ppl.length) {
    const ids = ppl.map((p) => p.id).join(',');
    await rest(e, 'votes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'entries?owner=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'roles?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'passes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'log?who=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'people?id=in.(' + ids + ')', { method: 'DELETE' });
  }
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', { headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
  const users = (await r.json()).users || [];
  for (const u of users.filter((u) => (u.email || '').endsWith(D))) await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
}

const [city0] = await rest(e, 'cities?id=eq.' + CITY + '&select=build_start,build_end,vote_end,voting_paused,submissions_paused');
const [ev0] = await rest(e, 'events?id=eq.' + EV + '&select=open,show_at,public_at,judge_at,judge_weight,judge_budget');
if (!city0 || !ev0) { console.error('London or Builder Day is not in the local database.'); process.exit(2); }
check('Builder Day: everyone from the start, judges from 60, counts shown from 60, a judge has 10 votes worth 5 each', ev0.public_at === 0 && ev0.judge_at === 60 && ev0.show_at === 60 && ev0.judge_weight === 5 && ev0.judge_budget === 10, JSON.stringify(ev0));
await dropAll();

/* the city's clock: building started `ago` minutes ago; building and voting both close at 90 */
async function clock(ago) {
  const s = Date.now() - ago * MIN;
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ build_start: iso(s), build_end: iso(s + 90 * MIN), vote_end: iso(s + 90 * MIN), voting_paused: false, submissions_paused: false }) });
  await sleep(2300);   /* the server keeps a snapshot two seconds */
}
const snap = async () => (await jar().go('/api/city/' + CITY + '/snapshot')).body;
const tallyOf = async (id) => (await rest(e, 'tally?entry=eq.' + id + '&select=votes,judge_votes'))[0];

try {
  /* no hiding here (show_at off), so every count can be read; hidden-test.mjs covers that */
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: 'open', show_at: null }) });
  await sleep(5200);   /* the day's gate is kept five seconds */
  const mk = async (who) => (await rest(e, 'people', { method: 'POST', body: JSON.stringify({ email: who + D, name: who[0].toUpperCase() + who.slice(1) }) }))[0];
  const [amy, ben, cal, peer, judge, host] = [await mk('amy'), await mk('ben'), await mk('cal'), await mk('peer'), await mk('judge'), await mk('host')];
  const entry = async (p, slug) => (await rest(e, 'entries', { method: 'POST', body: JSON.stringify({ city: CITY, owner: p.id, slug, name: 'Rules ' + slug, pitch: 'A test entry', url: 'https://example.com/' + slug, repo: 'https://github.com/supabase/supabase', created_at: iso(Date.now() - 20 * MIN) }) }))[0];
  const A = await entry(amy, 'rul-a'), B = await entry(ben, 'rul-b'), C = await entry(cal, 'rul-c');
  await rest(e, 'passes', { method: 'POST', body: JSON.stringify({ person: peer.id, city: CITY, source: 'host', list_email: 'peer' + D }) });
  await rest(e, 'roles', { method: 'POST', body: JSON.stringify({ person: judge.id, role: 'judge', event: EV, city: CITY, budget: 10 }) });
  await rest(e, 'roles', { method: 'POST', body: JSON.stringify({ person: host.id, role: 'host', event: EV, city: CITY }) });
  const P = await signIn('peer' + D), V = await signIn('visitor' + D), J = await signIn('judge' + D), H = await signIn('host' + D);
  const s0 = await snap(), no = (en) => s0.entries.find((x) => x.slug === en.slug).no;
  check('the snapshot says when everyone and the judges vote, and what a judge counts', s0.city.publicAt === 0 && s0.city.judgeAt === 60 && s0.city.judgeWeight === 5, JSON.stringify({ publicAt: s0.city.publicAt, judgeAt: s0.city.judgeAt, judgeWeight: s0.city.judgeWeight }));

  // 1. 30 minutes in: nobody votes, not even a builder on London's list
  await clock(30);
  const p1 = await P.go('/api/vote', { city: CITY, entry: no(A), on: true });
  check('minute 30: a builder on the list is told when voting opens', p1.status === 409 && /voting in london opens at \d\d:\d\d/i.test(p1.body?.error || ''), JSON.stringify([p1.status, p1.body]));
  const v1 = await V.go('/api/vote', { city: CITY, entry: no(A), on: true });
  check('minute 30: a visitor is told when voting opens', v1.status === 409 && /opens at/i.test(v1.body?.error || ''), JSON.stringify([v1.status, v1.body]));
  const j1 = await J.go('/api/desk', { action: 'judge.vote', event: EV, city: CITY, no: no(A), delta: 1 });
  check('minute 30: a judge is told when judges vote', j1.status === 409 && /judges in london vote from \d\d:\d\d/i.test(j1.body?.error || ''), JSON.stringify([j1.status, j1.body]));

  // 2. 50 minutes in: everyone votes, builders and visitors alike; judges wait
  await clock(50);
  const p2 = await P.go('/api/vote', { city: CITY, entry: no(A), on: true });
  check('minute 50: a builder on the list votes', p2.status === 200 && p2.body?.votes === 1, JSON.stringify([p2.status, p2.body]));
  const v2 = await V.go('/api/vote', { city: CITY, entry: no(A), on: true });
  check('minute 50: a visitor votes', v2.status === 200 && v2.body?.votes === 2, JSON.stringify([v2.status, v2.body]));
  const own = await jar().go('/api/vote', { city: CITY, entry: no(A), on: true });
  check('minute 50: without signing in, no vote', own.status === 401, String(own.status));
  const j2a = await J.go('/api/desk', { action: 'judge.vote', event: EV, city: CITY, no: no(B), delta: 1 });
  check('minute 50: a judge still waits for 60', j2a.status === 409 && /judges in london vote from/i.test(j2a.body?.error || ''), JSON.stringify([j2a.status, j2a.body]));

  // 3. 65 minutes in: the judges too; a judge's vote counts 5
  await clock(65);
  const j2 = await J.go('/api/desk', { action: 'judge.vote', event: EV, city: CITY, no: no(B), delta: 2 });
  const tB = await tallyOf(B.id);
  check('minute 65: a judge\'s 2 votes count 10', j2.status === 200 && tB.votes === 10 && tB.judge_votes === 10, JSON.stringify([j2.status, j2.body, tB]));
  const j3 = await J.go('/api/desk', { action: 'judge.vote', event: EV, city: CITY, no: no(C), delta: 9 });
  check('minute 65: a judge cannot go past 10 votes', j3.status === 409 && /8 of your 10/.test(j3.body?.error || ''), JSON.stringify([j3.status, j3.body]));
  await sleep(2300);
  const s2 = await snap(), b2 = s2.entries.find((x) => x.slug === 'rul-b'), stepsB = s2.steps.filter((x) => x[0] === b2.no);
  check('the snapshot: B has 10, all from the judge, in one step of 10', b2.votes === 10 && b2.judge === 10 && stepsB.length === 1 && stepsB[0][2] === 10 && stepsB[0][3] === 1, JSON.stringify([b2, stepsB]));
  const t0 = await H.go('/api/desk', { action: 'tie.settle', event: EV, city: CITY, order: [no(A), no(C)] });
  check('a tie is not settled while voting is open', t0.status === 409 && /once voting/i.test(t0.body?.error || ''), JSON.stringify([t0.status, t0.body]));
  /* make A and C tie for second, under B: A has 2; C gets 2 */
  await P.go('/api/vote', { city: CITY, entry: no(C), on: true }); await V.go('/api/vote', { city: CITY, entry: no(C), on: true });

  // 4. after the close at 90: nobody votes; the host settles the tie
  await clock(95);
  const v4 = await V.go('/api/vote', { city: CITY, entry: no(B), on: true });
  check('minute 95: voting has closed for everyone', v4.status === 409 && /has closed/i.test(v4.body?.error || ''), JSON.stringify([v4.status, v4.body]));
  const j4 = await J.go('/api/desk', { action: 'judge.vote', event: EV, city: CITY, no: no(C), delta: 1 });
  check('minute 95: and for the judges', j4.status === 409 && /has closed/i.test(j4.body?.error || ''), JSON.stringify([j4.status, j4.body]));
  const s3 = await snap(), rank3 = s3.entries.slice().sort((x, y) => y.votes - x.votes || (x.tie == null ? (y.tie == null ? 0 : 1) : y.tie == null ? -1 : x.tie - y.tie) || x.reached - y.reached).map((x) => x.slug).filter((x) => x.startsWith('rul-'));
  check('closed: A and C tie on 2, not settled yet', s3.entries.filter((x) => x.slug === 'rul-a' || x.slug === 'rul-c').every((x) => x.votes === 2 && x.tie === null), JSON.stringify(s3.entries.filter((x) => x.slug.startsWith('rul-')).map((x) => [x.slug, x.votes, x.tie])));
  const notTied = await H.go('/api/desk', { action: 'tie.settle', event: EV, city: CITY, order: [no(B), no(C)] });
  check('projects that are not tied are refused', notTied.status === 409 && /not tied/i.test(notTied.body?.error || ''), JSON.stringify([notTied.status, notTied.body]));
  const byVisitor = await V.go('/api/desk', { action: 'tie.settle', event: EV, city: CITY, order: [no(C), no(A)] });
  check('only a host settles a tie', byVisitor.status >= 400, String(byVisitor.status));
  /* the host puts the one that reached 2 later first: C over A */
  const t1 = await H.go('/api/desk', { action: 'tie.settle', event: EV, city: CITY, order: [no(C), no(A)] });
  await sleep(2300);
  const s4 = await snap(), r4 = s4.entries.filter((x) => x.slug.startsWith('rul-')).sort((x, y) => y.votes - x.votes || (x.tie == null ? (y.tie == null ? 0 : 1) : y.tie == null ? -1 : x.tie - y.tie) || x.reached - y.reached).map((x) => x.slug);
  check('settled: C is over A, as the host put them', t1.status === 200 && r4.join(',') === 'rul-b,rul-c,rul-a', JSON.stringify([t1.status, t1.body, r4, rank3]));
  const desk = await H.go('/api/desk/state?event=' + EV + '&city=' + CITY);
  const dC = desk.body?.entries?.find((x) => x.slug === 'rul-c');
  check('the desk sees the host\'s order', dC?.tie === 1, JSON.stringify(dC && { tie: dC.tie }));
  const t2 = await H.go('/api/desk', { action: 'tie.clear', event: EV, city: CITY });
  await sleep(2300);
  const s5 = await snap();
  check('cleared: no order left', t2.status === 200 && s5.entries.filter((x) => x.slug.startsWith('rul-')).every((x) => x.tie === null), JSON.stringify([t2.status, t2.body]));
} catch (err) {
  bad++; console.log('FAIL ' + (err && err.stack || err));
} finally {
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify(city0) });
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: ev0.open, show_at: ev0.show_at }) });
  await dropAll();
  const left = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  check('cleaned up (London, the event, our people)', left.length === 0);
}
console.log(bad ? bad + ' of ' + n + ' failed.' : 'All ' + n + ' pass.');
process.exit(bad ? 1 : 0);
