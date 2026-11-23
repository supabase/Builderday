// desk-roles.mjs: every desk role against the real routes on the local stack. A host cannot touch another city, a
// judge cannot act as a host, a builder has no desk, a session from the room code cannot open the desk, and only a
// super admin does super things. Needs the dev server (SITE, default http://localhost:4320) and the seed.
//   node supabase/scripts/desk-roles.mjs
import { env, rest } from './env.mjs';

const e = env(), SITE = process.env.SITE || 'http://localhost:4320';
let bad = 0, n = 0;
function jar() {
  const c = new Map();
  return {
    async go(path, init = {}) {
      const r = await fetch(SITE + path, { ...init, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Cookie: Array.from(c, ([k, v]) => k + '=' + v).join('; ') } });
      (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(s) || v === '') c.delete(k); else c.set(k, v); });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, body: j };
    },
  };
}
async function byCode(email) {
  const j = jar();
  let s = await j.go('/api/auth/code', { method: 'POST', body: JSON.stringify({ email }) });
  /* a code went to this address under 30 s ago (another test): wait for the next one */
  if (s.status === 429 && s.body?.wait) { await new Promise((r) => setTimeout(r, (s.body.wait + 1) * 1000)); s = await j.go('/api/auth/code', { method: 'POST', body: JSON.stringify({ email }) }); }
  if (s.status !== 200) throw new Error('code for ' + email + ': ' + JSON.stringify(s.body));
  const [row] = await rest(e, 'outbox?to_email=eq.' + encodeURIComponent(email) + '&template=eq.code&order=created_at.desc&limit=1&select=data');
  const v = await j.go('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code: row.data.code }) });
  if (v.status !== 200) throw new Error('verify for ' + email + ': ' + JSON.stringify(v.body));
  return j;
}
async function expect(who, j, action, want) {
  const r = await j.go('/api/desk', { method: 'POST', body: JSON.stringify(action) });
  n++; const okay = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  if (!okay) bad++;
  console.log((okay ? 'ok   ' : 'FAIL ') + who.padEnd(14) + (action.action + ' ' + (action.city || '')).padEnd(26) + ' -> ' + r.status + (okay ? '' : ' (wanted ' + want + ') ' + JSON.stringify(r.body)));
  return r;
}

const host = await byCode('host.berlin@hackday.test');
const judge = await byCode('judge.berlin@hackday.test');
const sup = await byCode('owner@hackday.test');
const builder = await byCode('mara@builder.test');
const hostL = await byCode('host.london@hackday.test');
/* a host on London's list who signs in with the room code gets a session, but no desk: only the six-digit code opens it */
const [hl] = await rest(e, 'people?email=eq.host.london%40hackday.test&select=id,passes!passes_person_fkey(id)');
const hadPass = [].concat(hl.passes || []).length > 0;
if (!hadPass) await rest(e, 'passes', { method: 'POST', body: JSON.stringify({ person: hl.id, city: 'london', source: 'host' }) });
const [{ room_code: londonCode }] = await rest(e, 'cities?id=eq.london&select=room_code');
const room = jar(); const roomIn = await room.go('/api/auth/room', { method: 'POST', body: JSON.stringify({ email: 'host.london@hackday.test', code: londonCode, city: 'london' }) });
n++; if (roomIn.status !== 200) { bad++; console.log('FAIL room code sign-in for a listed host -> ' + roomIn.status); } else console.log('ok   host.london    room code sign-in (listed) -> 200');

// state: each sees only what their role allows
const hs = await host.go('/api/desk/state?city=london'); n++;
if (hs.body.city !== 'berlin' || hs.body.cities.length !== 1) { bad++; console.log('FAIL host state opened ' + hs.body.city); } else console.log('ok   host.berlin    state ?city=london         -> shows berlin only');
const js = await judge.go('/api/desk/state?city=berlin'); n++;
if (js.body.guests.length || js.body.entries.some((x) => x.byEmail)) { bad++; console.log('FAIL judge sees guest emails'); } else console.log('ok   judge.berlin   state                      -> no guest list, no emails');

await expect('host.berlin', host, { action: 'guest.add', city: 'london', email: 'x1@t.test', send: false }, 403);
await expect('host.berlin', host, { action: 'entry.hide', city: 'london', no: 9 }, 403);
await expect('host.berlin', host, { action: 'door.code', city: 'london' }, 403);
await expect('host.berlin', host, { action: 'clock.add', city: 'london', what: 'build', mins: 5 }, 403);
await expect('host.berlin', host, { action: 'scene.add', city: 'london', kind: 'words', title: 'x' }, 403);
await expect('host.berlin', host, { action: 'switch', city: 'berlin', votingPaused: true }, 403);
await expect('host.berlin', host, { action: 'clock.end', city: 'berlin', what: 'vote' }, 403);
await expect('host.berlin', host, { action: 'role.add', email: 'x2@t.test', role: 'judge', roleCity: 'berlin' }, 403);
await expect('host.berlin', host, { action: 'guest.add', city: 'berlin', email: 'guest.one@t.test', name: 'Guest One' }, 200);
await expect('host.berlin', host, { action: 'import.preview', city: 'berlin', text: 'guest.one@t.test, new.a@t.test\nnope' }, 200);
await expect('host.berlin', host, { action: 'door.code', city: 'berlin' }, 200);
await expect('judge.berlin', judge, { action: 'entry.hide', city: 'berlin', no: 1 }, 403);
await expect('judge.berlin', judge, { action: 'guest.link', city: 'berlin', person: '00000000-0000-0000-0000-000000000000' }, 403);
const [femi] = await rest(e, 'people?email=eq.femi%40builder.test&select=id');
await expect('judge.berlin', judge, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('mara (builder)', builder, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('host.london', hostL, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('host.berlin', host, { action: 'guest.in', city: 'berlin', person: femi.id }, 200);
await expect('host.berlin', host, { action: 'guest.out', city: 'berlin', person: femi.id }, 200);
await expect('mara (builder)', builder, { action: 'entry.hide', city: 'berlin', no: 2 }, 403);
await expect('room session', room, { action: 'door.code', city: 'london' }, 401);
await expect('owner (super)', sup, { action: 'door.code', city: 'london' }, 200);
await expect('owner (super)', sup, { action: 'switch', city: 'london', votingPaused: false }, 200);
await expect('owner (super)', sup, { action: 'role.add', email: 'judge.new@t.test', role: 'judge', roleCity: 'london', budget: 50 }, [200, 400]);

if (!hadPass) await rest(e, 'passes?person=eq.' + hl.id, { method: 'DELETE' });
console.log(bad ? bad + ' of ' + n + ' failed.' : 'All ' + n + ' passed.');
process.exit(bad ? 1 : 0);
