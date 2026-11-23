// agree.mjs: the home and a city page read one model, so they must agree. For three cities at three moments of each
// city's page, the home's row (lib/home.ts) and the city page (lib/city.ts) must name the same top 3, in the same order,
// with the same vote counts and the same judge votes. Run with no arguments; it exits 1 on the first disagreement.
//   node tools/agree.mjs
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/* lib/ imports its neighbours without an extension, as the bundler allows; Node needs the .ts */
registerHooks({
  resolve(spec, ctx, next) {
    let r;
    if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec)) { try { r = next(spec + '.ts', ctx); } catch { /* not a .ts file */ } }
    r = r || next(spec, ctx);
    return /\.ts$/.test(r.url) ? { ...r, format: 'module-typescript' } : r;
  },
});
const lib = (f) => import(pathToFileURL(path.resolve(import.meta.dirname, '../lib', f)).href);
const { DEF: HD, world: homeWorld } = await lib('home.ts');
const { DEF: CD, world: cityWorld, moments: cityMoments, win } = await lib('city.ts');
const { SCHED } = await lib('day-data.ts');
const { wire } = await lib('wire.ts');

const CITIES = ['seoul', 'london', 'san-francisco'], MOMENTS = ['build', 'vote', 'last', 'closed'];
let bad = 0, n = 0;
for (const seed of [17, 4242]) {
  for (const id of CITIES) {
    for (const mid of MOMENTS) {
      const cc = { ...CD, ...SCHED, seed, city: id };
      const t = cityMoments(cc).find((m) => m[0] === mid)[2], Wn = win(cc), now = Wn.w0 + t * (Wn.w1 - Wn.w0);
      const C = cityWorld({ ...cc, now }, {}), H = homeWorld({ ...HD, ...SCHED, seed, now });
      const row = H.cs[C.i];
      const fromHome = row.top.map((r) => [r.p.name, r.v, r.j]);
      const fromCity = C.ranked.slice(0, 3).map((o) => [o.p.name, o.v, o.j]);
      const same = JSON.stringify(fromHome) === JSON.stringify(fromCity);
      const lead = !row.lead || !C.lead || (row.lead.p.id === C.lead.p.id && row.lead.v === C.lead.v);
      n++;
      /* while the counts are hidden both say so, and both name the leader at the freeze */
      const hid = !!row.hidden === C.hidden && (!C.hidden || C.rows.every((o) => o.votes === null));
      if (!same || !lead || !hid || row.state !== C.state) {
        bad++;
        console.log('DISAGREE', { seed, id, mid, state: [row.state, C.state], hidden: [row.hidden, C.hidden], home: fromHome, city: fromCity });
      } else console.log('ok', seed, id.padEnd(13), mid.padEnd(6), row.state.padEnd(5), C.hidden ? 'hidden' : '      ', fromHome.map((r) => r[0] + ' ' + r[1] + (r[2] ? ' (' + r[2] + ' j)' : '')).join(' / '));
      /* the wire never runs ahead of the page */
      if (wire(H, 50).some((e) => e.m > H.now)) { bad++; console.log('WIRE AHEAD', seed, id, mid); }
      /* the wire says no lead change and no vote total while a city's counts are hidden */
      const x = H.S.cs[C.i];
      if (wire(H, 500, C.i).some((e) => (e.kind === 'lead' || e.kind === 'votes') && x.hide != null && e.m >= x.hide && e.m < x.end)) { bad++; console.log('WIRE LEAKS', seed, id, mid); }
    }
  }
}
console.log(bad ? bad + ' of ' + n + ' disagree.' : 'All ' + n + ' agree.');
process.exit(bad ? 1 : 0);
