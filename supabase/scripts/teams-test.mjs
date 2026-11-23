// teams-test.mjs: teams, against the real routes on the local stack. Builders on London's list make a team, join it by
// its code (typed loosely), are refused from another city, without a place, with a wrong code and when it is full;
// an entry already in becomes the team's, a teammate cannot vote for it, the pages name the whole team, the owner
// leaving hands the entry on, a place moved to another city leaves the team, and the team is set once building ends.
// Then London is put back and everything made here is removed. Needs the dev server on the local stack with
// HACKDAY_FAKE_GITHUB=1, so a teammate's submit does not ask GitHub (SITE, default http://localhost:4320).
//   node supabase/scripts/teams-test.mjs
import { env, rest } from './env.mjs';

const e = env(), SITE = process.env.SITE || 'http://localhost:4320', CITY = 'london', EV = 'builder-day-2026', D = '@teams.test';
let bad = 0, n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000, iso = (ms) => new Date(ms).toISOString();
function check(what, ok, more = '') { n++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok || !more ? '' : '  · ' + more)); }

function jar() {
  const c = new Map();
  return {
    async go(path, body, method) {
      const r = await fetch(SITE + path, { method: method || (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: Array.from(c, ([k, v]) => k + '=' + v).join('; ') } });
      (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(s) || v === '') c.delete(k); else c.set(k, v); });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, body: j, text: t, headers: r.headers };
    },
    cookies: () => Array.from(c, ([k, v]) => k + '=' + v).join('; '),
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

async function dropAll() {
  const ppl = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  if (ppl.length) {
    const ids = ppl.map((p) => p.id).join(',');
    await rest(e, 'votes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'entries?owner=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'team_members?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'teams?made_by=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'passes?person=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'log?who=in.(' + ids + ')', { method: 'DELETE' });
    await rest(e, 'people?id=in.(' + ids + ')', { method: 'DELETE' });
  }
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', { headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
  const users = (await r.json()).users || [];
  for (const u of users.filter((u) => (u.email || '').endsWith(D))) await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
}

const [city0] = await rest(e, 'cities?id=eq.' + CITY + '&select=build_start,build_end,vote_end,voting_paused,submissions_paused,room_code,room_code_prev,room_code_at');
const [ev0] = await rest(e, 'events?id=eq.' + EV + '&select=open,hide_at,teams,team_max');
const [other] = await rest(e, 'cities?id=neq.' + CITY + '&event=eq.' + EV + '&select=id,name&order=i&limit=1');
const OTHER = other?.id, OTHER_NAME = other?.name;
if (!city0 || !ev0 || !other) { console.error('London, a second city or Builder Day is not in the local database.'); process.exit(2); }
check('Builder Day has teams, at most 4 people', ev0.teams === true && ev0.team_max === 4, JSON.stringify(ev0));
await dropAll();

async function clock(ago) {
  const s = Date.now() - ago * MIN;
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ build_start: iso(s), build_end: iso(s + 90 * MIN), vote_end: iso(s + 120 * MIN), voting_paused: false, submissions_paused: false }) });
  await sleep(2300);
}
const team = (j, action, code) => j.go('/api/team', { action, code });

try {
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: 'open', hide_at: null }) });
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ build_start: null, build_end: null, vote_end: null }) });
  await sleep(5200);
  const mk = async (who, city) => {
    const [p] = await rest(e, 'people', { method: 'POST', body: JSON.stringify({ email: who + D, name: who[0].toUpperCase() + who.slice(1) }) });
    if (city) await rest(e, 'passes', { method: 'POST', body: JSON.stringify({ person: p.id, city, source: 'host', list_email: who + D }) });
    return p;
  };
  const amy = await mk('amy', CITY), ben = await mk('ben', CITY); await mk('cal', CITY); const dan = await mk('dan', CITY); const eve = await mk('eve', CITY);
  await mk('lis', OTHER); await mk('out', null);
  const entry = async (p, slug) => (await rest(e, 'entries', { method: 'POST', body: JSON.stringify({ city: CITY, owner: p.id, slug, name: 'Team ' + slug, pitch: 'A test entry', url: 'https://example.com/' + slug, repo: 'https://github.com/supabase/supabase' }) }))[0];
  const BEN = await entry(ben, 'tm-ben'), EVE = await entry(eve, 'tm-eve');
  const [A, B, C, Dn, E, L, O] = [await byCode('amy' + D), await byCode('ben' + D), await byCode('cal' + D), await byCode('dan' + D), await byCode('eve' + D), await byCode('lis' + D), await byCode('out' + D)];

  let r = await team(A, 'make');
  const code = r.body?.team?.code || '';
  check('Amy makes a team: a code like KTR-482, one member', r.status === 200 && /^[A-HJKMNP-Z]{3}-[2-9]{3}$/.test(code) && r.body.team.members.length === 1, JSON.stringify(r.body));
  check('the team’s link is /team/<code>', (r.body?.team?.link || '').endsWith('/team/' + code.replace('-', '')), r.body?.team?.link);
  r = await team(A, 'make');
  check('a second team for Amy is refused', r.status === 409 && /already in a team/.test(r.body?.error || ''), JSON.stringify(r.body));

  r = await team(B, 'join', '  ' + code.toLowerCase().replace('-', ' ') + ' ');
  check('Ben joins with the code typed loosely', r.status === 200 && r.body.team.members.length === 2, JSON.stringify(r.body));
  const [benE] = await rest(e, 'entries?id=eq.' + BEN.id + '&select=team,with_names,owner');
  check('Ben’s entry is the team’s now, named for both', !!benE.team && benE.with_names === 'Amy and Ben', JSON.stringify(benE));
  const meA = (await A.go('/api/me')).body;
  check('Amy’s account shows the team and its entry', meA.team?.code === code && meA.team.entry?.slug === 'tm-ben' && meA.entry?.slug === 'tm-ben' && meA.entry.handle === 'Amy and Ben', JSON.stringify({ team: meA.team, entry: meA.entry }));

  r = await team(L, 'join', code);
  check('someone on ' + OTHER_NAME + '’s list is refused, in words', r.status === 409 && /builds in London/.test(r.body?.error || ''), JSON.stringify(r.body));
  r = await team(O, 'join', code);
  check('someone with no place is refused', r.status === 403, JSON.stringify(r.body));
  r = await team(C, 'join', 'ZZZ-999');
  check('a code no team has is refused, on the field', r.status === 404 && r.body?.field === 'code', JSON.stringify(r.body));
  r = await team(C, 'join', 'hello');
  check('a code of the wrong shape says the shape', r.status === 400 && /three letters/.test(r.body?.error || ''), JSON.stringify(r.body));

  r = await team(E, 'join', code);
  check('Eve, with her own entry, cannot bring it into a team with one', r.status === 409 && /A team has one entry/.test(r.body?.error || ''), JSON.stringify(r.body));
  r = await team(C, 'join', code); r = await team(Dn, 'join', code);
  check('Cal and Dan join: four', r.status === 200 && r.body.team.members.length === 4, JSON.stringify(r.body));
  await rest(e, 'entries?id=eq.' + EVE.id, { method: 'DELETE' });
  r = await team(E, 'join', code);
  check('a fifth is refused: the team is full', r.status === 409 && /full/.test(r.body?.error || ''), JSON.stringify(r.body));

  /* votes: 65 minutes in, everyone votes, but no one on the team for its entry */
  await clock(65);
  const snap = (await jar().go('/api/city/' + CITY + '/snapshot')).body, row = snap.entries.find((x) => x.slug === 'tm-ben');
  check('the ranking names the whole team', row?.by === 'Amy, Ben, Cal and Dan', JSON.stringify(row));
  r = await A.go('/api/vote', { city: CITY, entry: row.no, on: true });
  check('a teammate who did not submit cannot vote for the team’s entry', r.status >= 400 && /own project/.test(r.body?.error || ''), JSON.stringify(r.body));
  r = await E.go('/api/vote', { city: CITY, entry: row.no, on: true });
  check('someone else can', r.status === 200, JSON.stringify(r.body));

  /* a teammate edits the team's entry through the real submit: in the room, then the form */
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify({ room_code: 'TQ7K', room_code_prev: null }) });
  r = await C.go('/api/checkin', { code: 'TQ7K' });
  check('Cal checks in with the room code', r.status === 200, JSON.stringify(r.body));
  const f = new FormData(); f.append('name', 'Team edit'); f.append('pitch', 'Edited by a teammate'); f.append('repo', 'https://github.com/teams-test/team-edit'); f.append('keep', '1');
  const sub = await fetch(SITE + '/api/entry', { method: 'POST', body: f, headers: { Cookie: C.cookies() } });
  const sj = await sub.json().catch(() => ({}));
  const mine = await rest(e, 'entries?team=eq.' + benE.team + '&select=id,name,owner');
  check('Cal’s submit edits the team’s one entry; Ben still owns it', sub.status === 200 && mine.length === 1 && mine[0].id === BEN.id && mine[0].name === 'Team edit' && mine[0].owner === ben.id, JSON.stringify({ status: sub.status, sj, mine }));

  /* the owner leaves: the entry stays with the team, its owner the first who joined */
  r = await team(B, 'leave');
  const [after] = await rest(e, 'entries?id=eq.' + BEN.id + '&select=team,with_names,owner');
  check('Ben leaves; the entry stays with the team and Amy owns it', r.status === 200 && r.body.team === null && after.team === benE.team && after.owner === amy.id && after.with_names === 'Amy, Cal and Dan', JSON.stringify(after));
  const meB = (await B.go('/api/me')).body;
  check('Ben has no team and no entry now', meB.team === null && meB.entry === null, JSON.stringify({ team: meB.team, entry: meB.entry }));

  /* a place moved to another city leaves the team there */
  await rest(e, 'passes?person=eq.' + dan.id, { method: 'PATCH', body: JSON.stringify({ city: OTHER }) });
  const left = await rest(e, 'team_members?person=eq.' + dan.id + '&select=team');
  const [named] = await rest(e, 'entries?id=eq.' + BEN.id + '&select=with_names');
  check('Dan’s place moved to ' + OTHER_NAME + ': he is out of the team', left.length === 0 && named.with_names === 'Amy and Cal', JSON.stringify({ left, named }));

  /* the link */
  r = await jar().go('/team/' + code.replace('-', ''));
  check('the team link opens a page with the code ready', r.status === 303 && (r.headers.get('location') || '').includes('team=' + code.replace('-', '')), r.headers.get('location'));

  /* building over: the team is set */
  await clock(95);
  r = await team(C, 'leave');
  check('after building ends nobody leaves', r.status === 409 && /set once building ends/.test(r.body?.error || ''), JSON.stringify(r.body));
  r = await team(E, 'make');
  check('and nobody makes a team', r.status === 409, JSON.stringify(r.body));
} catch (err) {
  bad++; console.error('FAIL ' + (err?.stack || err));
} finally {
  await rest(e, 'cities?id=eq.' + CITY, { method: 'PATCH', body: JSON.stringify(city0) });
  await rest(e, 'events?id=eq.' + EV, { method: 'PATCH', body: JSON.stringify({ open: ev0.open, hide_at: ev0.hide_at }) });
  await dropAll();
  const left = await rest(e, 'people?email=like.*' + encodeURIComponent(D) + '&select=id');
  check('cleaned up', left.length === 0);
}
console.log('\n' + (n - bad) + '/' + n + (bad ? ' · ' + bad + ' failed' : ' passed'));
process.exit(bad ? 1 : 0);
