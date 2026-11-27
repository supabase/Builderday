// desk-roles.mjs: every desk role against the real routes on the local stack. A host cannot touch another city, a
// judge cannot act as a host, a builder has no desk and cannot check anyone in, and only a super admin does super
// things. Signs in with the stand-in Supabase account (the site runs with HACKDAY_FAKE_SUPABASE=1). Needs the dev server (SITE, default http://localhost:4320) and the seed.
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
/* sign in with the stand-in Supabase account for this email (the site runs with HACKDAY_FAKE_SUPABASE=1) */
async function signIn(email) {
  const j = jar(), r = await j.go('/api/auth/supabase', { method: 'POST', body: JSON.stringify({ token: 'fake.' + email }) });
  if (r.status !== 200) throw new Error('Supabase sign-in for ' + email + ': ' + JSON.stringify(r.body) + ' (is HACKDAY_FAKE_SUPABASE=1 set on the site?)');
  return j;
}
async function expect(who, j, action, want) {
  const r = await j.go('/api/desk', { method: 'POST', body: JSON.stringify(action) });
  n++; const okay = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  if (!okay) bad++;
  console.log((okay ? 'ok   ' : 'FAIL ') + who.padEnd(14) + (action.action + ' ' + (action.city || '')).padEnd(26) + ' -> ' + r.status + (okay ? '' : ' (wanted ' + want + ') ' + JSON.stringify(r.body)));
  return r;
}

const host = await signIn('host.berlin@hackday.test');
const judge = await signIn('judge.berlin@hackday.test');
const sup = await signIn('owner@hackday.test');
const builder = await signIn('mara@builder.test');
const hostL = await signIn('host.london@hackday.test');

// state: each sees only what their role allows
const hs = await host.go('/api/desk/state?city=london'); n++;
if (hs.body.city !== 'berlin' || hs.body.cities.length !== 1) { bad++; console.log('FAIL host state opened ' + hs.body.city); } else console.log('ok   host.berlin    state ?city=london         -> shows berlin only');
const js = await judge.go('/api/desk/state?city=berlin'); n++;
if (js.body.guests.length || js.body.entries.some((x) => x.byEmail)) { bad++; console.log('FAIL judge sees guest emails'); } else console.log('ok   judge.berlin   state                      -> no guest list, no emails');

await expect('host.berlin', host, { action: 'guest.add', city: 'london', email: 'x1@t.test' }, 403);
await expect('host.berlin', host, { action: 'entry.hide', city: 'london', no: 9 }, 403);
await expect('host.berlin', host, { action: 'guest.out', city: 'london', person: '00000000-0000-0000-0000-000000000000' }, 403);
await expect('host.berlin', host, { action: 'clock.add', city: 'london', what: 'build', mins: 5 }, 403);
await expect('host.berlin', host, { action: 'scene.add', city: 'london', kind: 'words', title: 'x' }, 403);
await expect('host.berlin', host, { action: 'switch', city: 'berlin', votingPaused: true }, 403);
await expect('host.berlin', host, { action: 'clock.end', city: 'berlin', what: 'vote' }, 403);
await expect('host.berlin', host, { action: 'role.add', email: 'x2@t.test', role: 'judge', roleCity: 'berlin' }, 403);
await expect('host.berlin', host, { action: 'guest.add', city: 'berlin', email: 'guest.one@t.test', name: 'Guest One' }, 200);
await expect('host.berlin', host, { action: 'import.preview', city: 'berlin', text: 'guest.one@t.test, new.a@t.test\nnope' }, 200);
await expect('judge.berlin', judge, { action: 'entry.hide', city: 'berlin', no: 1 }, 403);
await expect('judge.berlin', judge, { action: 'guest.add', city: 'berlin', email: 'x3@t.test' }, 403);
const [femi] = await rest(e, 'people?email=eq.femi%40builder.test&select=id');
await expect('judge.berlin', judge, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('mara (builder)', builder, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('host.london', hostL, { action: 'guest.in', city: 'berlin', person: femi.id }, 403);
await expect('host.berlin', host, { action: 'guest.in', city: 'berlin', person: femi.id }, 200);
await expect('host.berlin', host, { action: 'guest.out', city: 'berlin', person: femi.id }, 200);
await expect('mara (builder)', builder, { action: 'entry.hide', city: 'berlin', no: 2 }, 403);
await expect('owner (super)', sup, { action: 'guest.in', city: 'berlin', person: femi.id }, 200);
await expect('owner (super)', sup, { action: 'guest.out', city: 'berlin', person: femi.id }, 200);
await expect('owner (super)', sup, { action: 'switch', city: 'london', votingPaused: false }, 200);
await expect('owner (super)', sup, { action: 'role.add', email: 'judge.new@t.test', role: 'judge', roleCity: 'london', budget: 50 }, [200, 400]);

console.log(bad ? bad + ' of ' + n + ' failed.' : 'All ' + n + ' passed.');
process.exit(bad ? 1 : 0);
