// events-test.mjs: many events on one desk, against the real routes on the local stack. A super admin makes an event
// and a place; an event admin runs that event and nothing else; a judge of the whole event and a judge of one place
// score entries by the event's criteria; the format's rules hold (scores or votes, the criteria, 1 to 5); a place with
// an entry stays; then everything made here is removed. Needs the dev server (SITE, default http://localhost:4320).
//   node supabase/scripts/events-test.mjs
import { env, rest } from './env.mjs';

const e = env(), SITE = process.env.SITE || 'http://localhost:4320';
let bad = 0, n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function jar() {
  const c = new Map();
  return {
    async go(path, body) {
      const r = await fetch(SITE + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: Array.from(c, ([k, v]) => k + '=' + v).join('; ') } });
      (r.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(s) || v === '') c.delete(k); else c.set(k, v); });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, body: j };
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
function check(what, ok, more = '') { n++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok || !more ? '' : '  · ' + more)); }
async function act(who, body, want, what) {
  const r = await who.go('/api/desk', body);
  const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  check((what || body.action) + ' -> ' + r.status, ok, 'wanted ' + want + ' ' + JSON.stringify(r.body));
  return r;
}

const D = '@events.test';

/* the sign-ins made here go too, or a later run's person would have no login */
async function dropLogins() {
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', { headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
  const { users = [] } = await r.json();
  for (const u of users.filter((u) => (u.email || '').endsWith(D))) await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY } });
}
await rest(e, 'people?email=like.*' + encodeURIComponent(D), { method: 'DELETE' }); await dropLogins();
const sup = await byCode('owner@hackday.test');
const today = new Date().toISOString().slice(0, 10);
let ev = null, place = null, owner = null;
try {
  // 1. a super admin makes an event and its place
  const made = await act(sup, { action: 'event.create', name: 'Events Test Hack', short: 'Test Hack', day: today, preset: 'judged' }, 200, 'super: event.create (judged)');
  ev = made.body?.id;
  check('the event id is from the short name and the year', /^test-hack-\d{4}/.test(ev || ''), ev);
  const [row] = await rest(e, 'events?id=eq.' + ev + '&select=decide,judging,criteria,demo_required');
  check('the judged preset: judges decide by scores, with criteria', row.decide === 'judges' && row.judging === 'scores' && row.criteria.length >= 1, JSON.stringify(row));
  await act(sup, { action: 'event.create', name: 'x', day: today }, 400, 'super: event.create with a one-letter name');
  const start = new Date(Date.now() - 10 * 60000).toISOString();
  const pl = await act(sup, { action: 'place.add', event: ev, name: 'Events Test Lisbon', zone: 'Europe/Lisbon', start }, 200, 'super: place.add');
  place = pl.body?.id;
  const [prow] = await rest(e, 'cities?id=eq.' + place + '&select=event,offset_min,build_min,room_code,stage(scene),scenes(id)');
  check('the place is in the event, with its offset, room code, stage and deck', prow.event === ev && prow.offset_min === 0 && /^[A-Z0-9]{4}$/.test(prow.room_code || '') && prow.scenes.length > 3 && prow.stage, JSON.stringify({ ...prow, scenes: prow.scenes.length }));
  await act(sup, { action: 'place.add', event: ev, name: 'Nowhere', zone: 'Mars/Olympus', start }, 400, 'super: place.add with a made-up zone');

  // 2. roles: an event admin, a judge of the whole event, a judge of one place
  await act(sup, { action: 'role.add', event: ev, email: 'admin' + D, role: 'admin' }, 200, 'super: role.add admin');
  await act(sup, { action: 'role.add', event: ev, email: 'judge.all' + D, role: 'judge' }, 200, 'super: role.add judge (whole event)');
  await act(sup, { action: 'role.add', email: 'judge.one' + D, role: 'judge', roleCity: place }, 200, 'super: role.add judge (one place, event from the place)');
  await act(sup, { action: 'role.add', event: 'builder-day-2026', email: 'judge.x' + D, role: 'judge', roleCity: place }, 404, 'super: role.add with a place from another event');
  const adm = await byCode('admin' + D);
  const as = await adm.go('/api/desk/state');
  check('the event admin sees only their event, and runs it', as.body.events.length === 1 && as.body.events[0].id === ev && as.body.can.admin, JSON.stringify({ events: as.body.events?.map((x) => x.id), can: as.body.can }));
  const bd = await adm.go('/api/desk/state?event=builder-day-2026');
  check('the event admin asking for Builder Day gets their own event', bd.body.event === ev, bd.body.event);
  await act(adm, { action: 'event.update', event: 'builder-day-2026', name: 'Nope' }, 403, 'admin: event.update on another event');
  await act(adm, { action: 'switch', city: 'tokyo', votingPaused: true }, 403, 'admin: switch in another event\'s place');
  await act(adm, { action: 'event.create', name: 'Another', day: today }, 403, 'admin: event.create (super only)');
  await act(adm, { action: 'role.add', event: ev, email: 'boss' + D, role: 'super' }, 403, 'admin: role.add super (super only)');
  await act(adm, { action: 'gate.set', open: 'open' }, 403, 'admin: gate.set (super only)');
  await act(adm, { action: 'role.add', event: ev, email: 'host' + D, role: 'host', roleCity: place }, 200, 'admin: role.add host for their place');

  // 3. the format: a bad mix is refused, criteria are saved as ids
  await act(adm, { action: 'event.update', event: ev, f: { decide: 'votes', judging: 'scores' } }, 400, 'admin: scores with no judges');
  await act(adm, { action: 'event.update', event: ev, f: { criteria: [] } }, 400, 'admin: scores with no criteria');
  await act(adm, { action: 'event.update', event: ev, f: { criteria: [{ name: 'Idea' }, { name: 'Craft' }] } }, 200, 'admin: two criteria');
  const [crow] = await rest(e, 'events?id=eq.' + ev + '&select=criteria');
  check('criteria get ids from their names', crow.criteria.map((c) => c.id).join() === 'idea,craft', JSON.stringify(crow.criteria));

  // 4. scoring: the clock runs, one entry, two judges
  await act(adm, { action: 'clock.start', city: place }, 200, 'admin: start building');
  const [p] = await rest(e, 'people', { method: 'POST', body: JSON.stringify({ email: 'maker' + D, name: 'Maker' }) });
  owner = p.id;
  const [en] = await rest(e, 'entries', { method: 'POST', body: JSON.stringify({ city: place, owner, slug: 'thing', name: 'Thing', pitch: 'A thing', repo: 'https://github.com/supabase/supabase' }) });
  check('an entry gets its event from its place, and a demo link is optional', en.event === ev && en.url === null, JSON.stringify({ event: en.event, url: en.url }));
  const ja = await byCode('judge.all' + D), jo = await byCode('judge.one' + D);
  const js = await ja.go('/api/desk/state?event=' + ev + '&city=' + place);
  check('the judge of the whole event sees the place, its entries and the criteria', js.body.city === place && js.body.entries.length === 1 && !!js.body.judging?.scores, JSON.stringify({ city: js.body.city, n: js.body.entries?.length, judging: js.body.judging }));
  await act(ja, { action: 'judge.score', city: place, no: en.no, crit: 'idea', val: 4 }, 200, 'judge (event): score idea 4');
  await act(jo, { action: 'judge.score', city: place, no: en.no, crit: 'idea', val: 2 }, 200, 'judge (place): score idea 2');
  await act(jo, { action: 'judge.score', city: place, no: en.no, crit: 'craft', val: 6 }, 409, 'judge: a 6');
  await act(jo, { action: 'judge.score', city: place, no: en.no, crit: 'luck', val: 3 }, 409, 'judge: a criterion that is not one');
  await act(jo, { action: 'judge.vote', city: place, no: en.no, delta: 3 }, 409, 'judge: a vote where judges score');
  await act(jo, { action: 'judge.score', city: 'tokyo', no: 1, crit: 'idea', val: 3 }, 403, 'judge (place): in another event');
  const [t1] = await rest(e, 'tally?entry=eq.' + en.id + '&select=score_sum,score_n');
  check('the tally keeps the score sum and count', t1.score_sum === 6 && t1.score_n === 2, JSON.stringify(t1));
  await act(ja, { action: 'judge.score', city: place, no: en.no, crit: 'idea', val: null }, 200, 'judge (event): take a score back');
  const [t2] = await rest(e, 'tally?entry=eq.' + en.id + '&select=score_sum,score_n');
  check('taking a score back takes it off the tally', t2.score_sum === 2 && t2.score_n === 1, JSON.stringify(t2));

  // saves landing at the same moment still add up
  const par = await Promise.all([
    jo.go('/api/desk', { action: 'judge.score', city: place, no: en.no, crit: 'craft', val: 5 }),
    ja.go('/api/desk', { action: 'judge.score', city: place, no: en.no, crit: 'craft', val: 3 }),
    ja.go('/api/desk', { action: 'judge.score', city: place, no: en.no, crit: 'idea', val: 1 }),
  ]);
  const all = await rest(e, 'scores?entry=eq.' + en.id + '&select=score');
  const [t3] = await rest(e, 'tally?entry=eq.' + en.id + '&select=score_sum,score_n');
  check('three saves at once: the tally matches the scores', par.every((r) => r.status === 200) && t3.score_sum === all.reduce((a, x) => a + x.score, 0) && t3.score_n === 2, JSON.stringify({ t3, all: all.length, st: par.map((r) => r.status) }));

  // 5. switch the event to votes and judges with a budget
  await act(adm, { action: 'event.update', event: ev, f: { decide: 'both', judging: 'budget', judgeBudget: 10 } }, 200, 'admin: votes and judges, 10 votes each');
  await act(jo, { action: 'judge.vote', city: place, no: en.no, delta: 7 }, 200, 'judge: 7 votes');
  await act(jo, { action: 'judge.vote', city: place, no: en.no, delta: 7 }, 409, 'judge: 7 more, over the budget');
  await act(jo, { action: 'judge.score', city: place, no: en.no, crit: 'idea', val: 3 }, 409, 'judge: a score where judges vote');

  // 6. a place with an entry stays; archiving
  await act(adm, { action: 'place.remove', event: ev, place }, 400, 'admin: remove a place that has an entry');
  await act(adm, { action: 'event.archive', event: ev }, 403, 'admin: archive the event (super only)');
  await act(sup, { action: 'event.archive', event: ev }, 200, 'super: archive the event');
  const [arow] = await rest(e, 'events?id=eq.' + ev + '&select=archived_at');
  check('the event is archived', !!arow.archived_at);
} catch (x) { bad++; console.log('FAIL ' + (x instanceof Error ? x.stack : x)); }
finally {
  // everything made here goes
  try {
    if (place) {
      for (const t of ['scores', 'judge_votes', 'votes']) await rest(e, t + '?entry=in.(select)', { method: 'DELETE' }).catch(() => {});
      await rest(e, 'entries?city=eq.' + place, { method: 'DELETE' });
      await rest(e, 'passes?city=eq.' + place, { method: 'DELETE' });
    }
    if (ev) await rest(e, 'roles?event=eq.' + ev, { method: 'DELETE' });
    await rest(e, 'people?email=like.*' + encodeURIComponent(D), { method: 'DELETE' }); await dropLogins();
    if (place) { const r = await sup.go('/api/desk', { action: 'place.remove', event: ev, place }); check('super: remove the empty place -> ' + r.status, r.status === 200, JSON.stringify(r.body)); }
    if (ev) await rest(e, 'events?id=eq.' + ev, { method: 'DELETE' });
    const left = await rest(e, 'events?id=eq.' + ev + '&select=id');
    check('nothing made here is left', !left.length);
  } catch (x) { bad++; console.log('FAIL cleanup: ' + (x instanceof Error ? x.message : x)); }
}
console.log(bad ? bad + ' of ' + n + ' failed.' : 'All ' + n + ' passed.');
process.exit(bad ? 1 : 0);
