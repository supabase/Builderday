// load.mjs: one city's hour against the local stack, through the site's own routes, and what broke.
//   node supabase/scripts/load.mjs [city] [--site http://localhost:4399] [--keep]
//   node supabase/scripts/load.mjs down --site http://localhost:4397 --proxy 4398
//   node supabase/scripts/load.mjs clean      (removes what a stopped run left)
// The run: 200 builders on the city's list (as a Luma sync puts them) check in with the room code from one address (as
// a room behind one venue connection does), 20 people not on the list try the code and must be refused (rule 7c),
// 160 of them submit, 2,000 voters confirm an email and vote five times each, and 40 visitors read the snapshots the
// whole time. Submissions and voting are each paused for a few seconds under load and resumed. It prints the slowest
// answers and every failure, checks the counts the pages show against the database, then removes everything it made
// (people under @load.test) unless --keep.
// "down": the database becomes unreachable under a running site. Start that site pointed at this script's proxy
// (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<proxy>, next start -p <port>); the script reads the pages, cuts the
// proxy, reads them again (they must answer with the last snapshot, not an error), and opens it again.
// Repositories are checked by the stand-in GitHub (HACKDAY_FAKE_GITHUB=1 on the site). Local stack only.
import net from 'node:net';
import { env, rest } from './env.mjs';

const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const e = env(), SITE = flag('site', 'http://localhost:4399'), KEEP = args.includes('--keep');
const mode = args[0] === 'down' ? 'down' : 'load', CITY = mode === 'load' && args[0] && !args[0].startsWith('--') ? args[0] : 'sao-paulo';
const N = { builders: +flag('builders', 200), submit: +flag('submit', 160), voters: +flag('voters', 2000), votes: 5, readers: 40 };
const DOMAIN = 'load.test', min = 60000;

/* ---------- measuring ---------- */
const stats = new Map();
function note(kind, ms, ok, why) {
  const s = stats.get(kind) || { ms: [], ok: 0, bad: 0, why: new Map() };
  s.ms.push(ms); if (ok) s.ok++; else { s.bad++; s.why.set(why, (s.why.get(why) || 0) + 1); }
  stats.set(kind, s);
}
const pct = (a, p) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
function report() {
  const rows = [['what', 'n', 'ok', 'failed', 'p50 ms', 'p95 ms', 'max ms']];
  for (const [k, s] of stats) rows.push([k, s.ms.length, s.ok, s.bad, Math.round(pct(s.ms, 0.5)), Math.round(pct(s.ms, 0.95)), Math.round(Math.max(...s.ms))]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  rows.forEach((r) => console.log(r.map((c, i) => (i ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ')));
  for (const [k, s] of stats) for (const [why, n] of s.why) console.log('  ' + k + ' failed ×' + n + ': ' + why);
}

/* ---------- a browser: cookies, one fetch ---------- */
function visitor() {
  const jar = new Map();
  return async function go(kind, path, init = {}, okWhen = (st) => st < 400) {
    const t = performance.now();
    let status = 0, body = null;
    try {
      const r = await fetch(SITE + path, { ...init, redirect: 'manual', headers: { ...(init.json ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), 'x-forwarded-for': '203.0.113.7' }, body: init.json ? JSON.stringify(init.json) : init.body });
      (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
      status = r.status; const txt = await r.text(); try { body = JSON.parse(txt); } catch { body = null; }
    } catch (err) { status = -1; body = { error: String(err.cause?.code || err.message) }; }
    const ok = okWhen(status, body);
    if (kind) note(kind, performance.now() - t, ok, status + ' ' + (body?.error || '').slice(0, 90));
    return { status, body, ok };
  };
}
/* a row count without reading the rows (the API returns 1,000 at most) */
async function count(pathname) {
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + pathname + '&limit=1', { headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'count=exact' } });
  return +(r.headers.get('content-range') || '/0').split('/')[1];
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const form = (o) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.append(k, v)); return f; };

/* ---------- readers: visitors with the page open, polling as the pages do ---------- */
function readers(n) {
  let on = true;
  const done = Promise.all(Array.from({ length: n }, async (_, i) => {
    const go = visitor();
    await wait(i * 50);
    while (on) {
      await go('read city snapshot', '/api/city/' + CITY + '/snapshot');
      await go('read day snapshot', '/api/day/snapshot');
      if (i % 10 === 0) await go('load city page', '/city/' + CITY);
      await wait(4000);
    }
  }));
  return { stop: async () => { on = false; await done; } };
}

async function cleanup() {
  let gone = 0;
  for (;;) {   /* the API answers 1,000 rows at most, so round by round */
    const people = await rest(e, 'people?email=like.*%40' + DOMAIN + '&select=id&limit=100');
    if (!people.length) break;
    await rest(e, 'people?id=in.(' + people.map((p) => p.id).join(',') + ')', { method: 'DELETE' });
    gone += people.length;
  }
  /* their sign-ins, by address (some may have no person row if a run stopped half-way) */
  const H = { apikey: e.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY };
  for (;;) {
    const r = await (await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?page=1&per_page=1000', { headers: H })).json();
    const ours = (r.users || []).filter((u) => (u.email || '').endsWith('@' + DOMAIN));
    if (!ours.length) break;
    await pool(ours, 20, (u) => fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: H }));
  }
  await rest(e, 'outbox?to_email=like.*%40' + DOMAIN, { method: 'DELETE' });
  return gone;
}

async function load() {
  const [c] = await rest(e, 'cities?id=eq.' + CITY + '&select=id,name,room_code,build_min,vote_after,build_start,build_end,vote_end');
  if (!c) throw new Error('no city ' + CITY);
  const was = { build_start: c.build_start, build_end: c.build_end, vote_end: c.vote_end };
  const now = Date.now(), start = now - 2 * min;
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ build_start: new Date(start).toISOString(), build_end: new Date(start + c.build_min * min).toISOString(), vote_end: new Date(start + (c.build_min + c.vote_after) * min).toISOString(), submissions_paused: false, voting_paused: false }) });
  console.log(c.name + ': building for ' + c.build_min + ' min from 2 min ago. Site ' + SITE + '. Room code ' + (c.room_code ? 'set' : 'missing') + '.\n');
  const t0 = performance.now(), R = readers(N.readers);
  try {

  /* 1. the builders are on the list (as a Luma sync puts them); the room checks in at once with the code on the screen,
     all from one address, while people not on the list try the same code and are refused, with no place made */
  const builders = Array.from({ length: N.builders }, (_, i) => ({ email: 'builder' + i + '@' + DOMAIN, go: visitor() }));
  const listed = await rest(e, 'people', { method: 'POST', body: JSON.stringify(builders.map((b, i) => ({ email: b.email, name: 'Builder ' + i }))) });
  await rest(e, 'passes', { method: 'POST', body: JSON.stringify(listed.map((p) => ({ person: p.id, city: CITY, source: 'luma' }))) });
  const strangers = Array.from({ length: 20 }, (_, i) => ({ email: 'stranger' + i + '@' + DOMAIN, go: visitor() }));
  await pool(builders.map((b) => ({ ...b, kind: 'in' })).concat(strangers.map((x) => ({ ...x, kind: 'out' }))), 50, (b) => b.kind === 'in'
    ? b.go('room code check-in', '/api/auth/room', { method: 'POST', json: { email: b.email, code: c.room_code, city: CITY } })
    : b.go('room code, not on the list: refused', '/api/auth/room', { method: 'POST', json: { email: b.email, code: c.room_code, city: CITY } }, (st) => st === 403));
  const inRoom = await count('passes?city=eq.' + CITY + '&checked_in_at=not.is.null&person=in.(' + listed.map((p) => p.id).join(',') + ')&select=id');
  const strayPasses = await count('passes?select=id,people!inner(email)&people.email=like.stranger*%40' + DOMAIN);
  const tIn = performance.now();

  /* 2. most of them submit; submissions are paused for 3 s in the middle and resumed */
  let paused = 0, refusedWhilePaused = 0;
  const sub = builders.slice(0, N.submit);
  const toggler = (async () => {
    await wait(1500);
    await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ submissions_paused: true }) }); paused = 1;
    await wait(3000);
    await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ submissions_paused: false }) }); paused = 2;
  })();
  const again = [];
  await pool(sub, 40, async (b, i) => {
    const t = performance.now(), r = await b.go(null, '/api/entry', { method: 'POST', body: form({ name: 'Load ' + i, pitch: 'A project made under load.', repo: 'https://github.com/load-test/project-' + i, by: 'Builder ' + i }) });
    if (r.status === 409 && /paus/i.test(r.body?.error || '')) { refusedWhilePaused++; again.push(b); return; }
    note('submit', performance.now() - t, r.ok, r.status + ' ' + (r.body?.error || ''));
  });
  await toggler;
  /* the ones refused while paused send it again, as a person would */
  await pool(again, 20, (b, i) => b.go('submit (again after the pause)', '/api/entry', { method: 'POST', body: form({ name: 'Load again ' + i, pitch: 'Sent again after the pause.', repo: 'https://github.com/load-test/again-' + i, by: 'Builder' }) }));
  const tSub = performance.now();
  const entries = (await (await fetch(SITE + '/api/city/' + CITY + '/snapshot')).json()).entries.map((x) => x.no);

  /* 3. voters: confirm an email with the six-digit code, then vote five times; voting is paused for 3 s mid-way */
  const voters = Array.from({ length: N.voters }, (_, i) => ({ email: 'voter' + i + '@' + DOMAIN, go: visitor() }));
  await pool(voters, 50, async (v) => {
    const s = await v.go('voter: ask for a code', '/api/auth/code', { method: 'POST', json: { email: v.email } });
    if (!s.ok) return;
    /* the code from the outbox (this script's own read, retried: it is not what a voter does) */
    let row = null;
    for (let k = 0; k < 5 && !row; k++) { try { [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(v.email) + '&template=eq.code&order=created_at.desc&limit=1&select=data'); } catch { await wait(400 * (k + 1)); } }
    if (!row) { note('voter: enter the code', 0, false, 'the script could not read the code'); return; }
    await v.go('voter: enter the code', '/api/auth/verify', { method: 'POST', json: { email: v.email, code: row?.data?.code } });
  });
  const tVoters = performance.now();
  let vPaused = 0, vRefused = 0, counted = 0;
  const vToggler = (async () => {
    await wait(4000);
    await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ voting_paused: true }) }); vPaused = 1;
    await wait(3000);
    await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ voting_paused: false }) }); vPaused = 2;
  })();
  const presses = voters.flatMap((v, i) => Array.from({ length: N.votes }, (_, k) => ({ v, no: entries[(i * 7 + k * 13) % entries.length] })));
  await pool(presses, 100, async (p) => {
    const t = performance.now(), r = await p.v.go(null, '/api/vote', { method: 'POST', json: { city: CITY, entry: p.no, on: true } });
    if (r.status === 409 && /paus/i.test(r.body?.error || '')) { vRefused++; return; }
    note('vote', performance.now() - t, r.ok, r.status + ' ' + (r.body?.error || ''));
    if (r.ok) counted++;
  });
  await vToggler;
  const tVote = performance.now();
  await R.stop();

  /* 4. do the pages agree with the database? */
  const ids = (await rest(e, 'entries?city=eq.' + CITY + '&select=id')).map((x) => x.id);
  let inDb = 0;
  for (let i = 0; i < ids.length; i += 50) inDb += await count('votes?entry=in.(' + ids.slice(i, i + 50).join(',') + ')&kind=eq.public&select=id');
  await wait(2500);
  const snap = await (await fetch(SITE + '/api/city/' + CITY + '/snapshot')).json();
  const onPage = snap.entries.reduce((a, x) => a + x.votes - x.judge, 0);

  console.log('Phases: sign-in ' + ((tIn - t0) / 1000).toFixed(1) + ' s, submitting ' + ((tSub - tIn) / 1000).toFixed(1) + ' s, voters confirming ' + ((tVoters - tSub) / 1000).toFixed(1) + ' s, voting ' + ((tVote - tVoters) / 1000).toFixed(1) + ' s.\n');
  report();
  console.log('\nSwitches: submissions paused ' + (paused === 2 ? 'and resumed' : '(not resumed!)') + '; ' + refusedWhilePaused + ' submits refused while paused, then sent again. Voting paused ' + (vPaused === 2 ? 'and resumed' : '(not resumed!)') + '; ' + vRefused + ' votes refused while paused.');
  console.log('Room: ' + inRoom + ' of ' + N.builders + ' builders checked in; ' + strayPasses + ' places made for the 20 people not on the list' + (strayPasses ? ' (WRONG).' : ' (none, as it should be).'));
  console.log('Counts: ' + snap.entries.length + ' entries on the page; ' + counted + ' votes answered ok, ' + inDb + ' public votes in the database, ' + onPage + ' on the page' + (counted === inDb && inDb === onPage ? ' (all agree).' : ' (DISAGREE).'));

  } catch (err) {
    await R.stop();
    console.log('The run stopped early: ' + err.message + '\n'); report();
  } finally {
    await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ ...was, submissions_paused: false, voting_paused: false }) });
    if (!KEEP) console.log('Removed ' + (await cleanup()) + ' people made by the run, and their entries, votes and emails.');
  }
}

/* ---------- the database out of reach ---------- */
async function down() {
  const port = +flag('proxy', 4398), target = new URL(e.NEXT_PUBLIC_SUPABASE_URL);
  const socks = new Set();
  const start = () => new Promise((ok) => {
    const srv = net.createServer((a) => {
      const b = net.connect(+target.port, target.hostname); socks.add(a); socks.add(b);
      a.pipe(b); b.pipe(a); const end = () => { a.destroy(); b.destroy(); socks.delete(a); socks.delete(b); };
      a.on('error', end); b.on('error', end); a.on('close', end); b.on('close', end);
    });
    srv.listen(port, '127.0.0.1', () => ok(srv));
  });
  let srv = await start();
  const go = visitor();
  const paths = ['/api/day/snapshot', '/api/city/berlin/snapshot', '/', '/city/berlin', '/api/me'];
  const look = async (label) => {
    for (const p of paths) {
      const r = await go(label + ' ' + p, p, {}, () => true);
      const what = r.body ? (r.body.stale ? 'stale snapshot' : r.body.at ? 'snapshot' : r.body.error ? 'error: ' + r.body.error : JSON.stringify(r.body).slice(0, 60)) : 'page';
      console.log(label.padEnd(9) + ' ' + p.padEnd(28) + ' ' + String(r.status).padEnd(4) + ' ' + what);
    }
  };
  await look('up');
  await wait(2500);   // past the 2 s cache, so the next reads go to the database
  srv.close(); socks.forEach((s) => s.destroy());
  await look('down');
  srv = await start();
  await wait(2500);
  await look('back up');
  srv.close(); socks.forEach((s) => s.destroy());
  console.log('');
  report();
}

if (args[0] === 'clean') console.log('Removed ' + (await cleanup()) + ' people under @' + DOMAIN + '.');
else await (mode === 'down' ? down() : load());
process.exit(0);
