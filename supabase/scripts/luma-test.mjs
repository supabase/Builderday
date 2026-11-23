// luma-test.mjs: the Luma path against a stand-in Luma on this machine. Start the site with
//   LUMA_API_KEY=test LUMA_API_URL=http://127.0.0.1:4395/v1
// then: node supabase/scripts/luma-test.mjs [--site http://localhost:4399]
// It gives Berlin a Luma event, syncs its approved guests from the desk, signs in by room code as an approved guest
// (on the list with Luma's name, and checked in), and as a waitlisted email, an unknown email and with Luma down (each
// refused in words, with no place made: rule 7c, no walk-ins), then puts everything back.
import http from 'node:http';
import { env, rest } from './env.mjs';

const e = env(), args = process.argv.slice(2), SITE = args[args.indexOf('--site') + 1] && args.includes('--site') ? args[args.indexOf('--site') + 1] : 'http://localhost:4399';
const EVENT = 'evt-test-berlin', D = 'luma.test';
const GUESTS = [
  { user_email: 'ada@' + D, user_name: 'Ada Lovelace', approval_status: 'approved' },
  { user_email: 'grace@' + D, user_name: 'Grace Hopper', approval_status: 'approved' },
  { user_email: 'GRACE@' + D, user_name: 'Grace Hopper', approval_status: 'approved' },
  { user_email: 'wait@' + D, user_name: 'Wai Ting', approval_status: 'waitlist' },
];
let up = true, keySeen = '';
const luma = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); keySeen = req.headers['x-luma-api-key'] || '';
  if (!up) { res.writeHead(500); return res.end(); }
  if (u.searchParams.get('event_api_id') !== EVENT) { res.writeHead(404); return res.end('{}'); }
  res.setHeader('content-type', 'application/json');
  if (u.pathname === '/v1/event/get-guests') {
    const all = GUESTS.filter((g) => !u.searchParams.get('approval_status') || g.approval_status === u.searchParams.get('approval_status'));
    const page = u.searchParams.get('cursor') ? all.slice(2) : all.slice(0, 2);   // two pages, to try the cursor
    return res.end(JSON.stringify({ entries: page.map((g, i) => ({ api_id: 'g' + i, guest: g })), has_more: !u.searchParams.get('cursor'), next_cursor: 'p2' }));
  }
  if (u.pathname === '/v1/event/get-guest') {
    const g = GUESTS.find((x) => x.user_email.toLowerCase() === (u.searchParams.get('id') || '').toLowerCase());
    if (!g) { res.writeHead(404); return res.end('{}'); }
    return res.end(JSON.stringify({ guest: g }));
  }
  res.writeHead(404); res.end('{}');
});
await new Promise((r) => luma.listen(4395, '127.0.0.1', r));

function jar() {
  const c = new Map();
  return { async go(p, body) {
    const r = await fetch(SITE + p, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: Array.from(c, ([k, v]) => k + '=' + v).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); c.set(kv.slice(0, i), kv.slice(i + 1)); });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } return { status: r.status, body: j };
  } };
}
async function byCode(email) {
  const j = jar(); let s = await j.go('/api/auth/code', { email });
  if (s.body?.wait) { await new Promise((r) => setTimeout(r, (s.body.wait + 1) * 1000)); s = await j.go('/api/auth/code', { email }); }
  const [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(email) + '&template=eq.code&order=created_at.desc&limit=1&select=data');
  await j.go('/api/auth/verify', { email, code: row.data.code }); return j;
}
let bad = 0; const check = (t, ok, extra = '') => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + t + (extra ? '  · ' + String(extra).slice(0, 160) : '')); };
const passOf = async (email) => (await rest(e, 'people?email=eq.' + encodeURIComponent(email) + '&select=name,passes!passes_person_fkey(source,city,checked_in_at)'))[0];
const noPlace = async (email) => { const p = await passOf(email); return !p || [].concat(p.passes || []).length === 0; };
const auth = (p, init = {}) => fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/' + p, { ...init, headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
const clean = async () => {
  await rest(e, 'people?email=like.*%40' + D, { method: 'DELETE' });
  const { users = [] } = await (await auth('users?per_page=1000')).json();
  for (const u of users.filter((x) => (x.email || '').endsWith('@' + D))) await auth('users/' + u.id, { method: 'DELETE' });
  await rest(e, 'cities?id=eq.berlin', { method: 'PATCH', body: JSON.stringify({ luma_event_id: null }) });
};

try {
  await clean();
  await rest(e, 'cities?id=eq.berlin', { method: 'PATCH', body: JSON.stringify({ luma_event_id: EVENT }) });
  const host = await byCode('host.berlin@hackday.test');
  const st = await host.go('/api/desk/state?city=berlin');
  check('desk state says Luma is connected and Berlin has its event', st.body?.luma === true && st.body?.cities?.find((c) => c.id === 'berlin')?.lumaEvent === EVENT);
  const pv = await host.go('/api/desk', { action: 'import.preview', city: 'berlin', from: 'luma' });
  check('preview from Luma: 2 new, 1 repeat, waitlist left out', pv.body?.preview?.fresh === 2 && pv.body.preview.repeats === 1, JSON.stringify(pv.body?.preview || pv.body));
  check('the key reached Luma in its header', keySeen === 'test');
  const cm = await host.go('/api/desk', { action: 'import.commit', city: 'berlin', from: 'luma', send: false });
  check('import from Luma added 2', cm.body?.added === 2, JSON.stringify(cm.body));
  const ada = await passOf('ada@' + D);
  check('an imported guest has Luma\'s name and a luma pass', ada?.name === 'Ada Lovelace' && [].concat(ada?.passes || [])[0]?.source === 'luma', JSON.stringify(ada));

  await rest(e, 'people?email=eq.' + encodeURIComponent('grace@' + D), { method: 'DELETE' });   // grace is on Luma but not on our list
  const [{ room_code: code }] = await rest(e, 'cities?id=eq.berlin&select=room_code');
  const g = await jar().go('/api/auth/room', { email: 'grace@' + D, code, city: 'berlin' });
  const gp = await passOf('grace@' + D);
  const gpass = [].concat(gp?.passes || [])[0];
  check('room code, approved on Luma: signed in and checked in, on the list from Luma with Luma\'s name', g.status === 200 && g.body?.checkedIn === true && gpass?.source === 'luma' && !!gpass?.checked_in_at && gp?.name === 'Grace Hopper', JSON.stringify(g.body) + ' ' + JSON.stringify(gp));
  const w = await jar().go('/api/auth/room', { email: 'wait@' + D, code, city: 'berlin' });
  check('room code, waitlisted on Luma: refused, no place made', w.status === 403 && /not on the list for Berlin/.test(w.body?.error || '') && await noPlace('wait@' + D), JSON.stringify(w.body));
  const n = await jar().go('/api/auth/room', { email: 'nobody@' + D, code, city: 'berlin' });
  check('room code, unknown to Luma: refused, no place made', n.status === 403 && /ask the host/i.test(n.body?.error || '') && await noPlace('nobody@' + D), JSON.stringify(n.body));
  up = false;
  const d = await jar().go('/api/auth/room', { email: 'down@' + D, code, city: 'berlin' });
  check('room code, Luma down: refused, no place made', d.status === 403 && await noPlace('down@' + D), JSON.stringify(d.body));
  const dv = await host.go('/api/desk', { action: 'import.preview', city: 'berlin', from: 'luma' });
  check('sync with Luma down: plain words, nothing saved', dv.status >= 400 && /Luma/.test(dv.body?.error || ''), dv.body?.error);
} finally {
  await clean(); luma.close();
}
console.log(bad ? bad + ' failed' : 'All passed.');
process.exit(bad ? 1 : 0);
