/* Checks the globe's readouts that must be true, without a browser: where the sun stands at a city's opening (the
   morning line), the start "in your time" for five time zones, the nearest city, and the flat map's marks for 6, 10,
   14 and 16 cities (one cell each, codes clear of every mark).
   Run: JITI_ALIAS='{"@":"'$PWD'"}' node_modules/.bin/jiti tools/globe-readouts.ts */
import { subsolar, sunHeight } from '@/components/wheel/text-globe';
import { yourTime, atZone } from '@/components/day/ending-time';
import { placeMarks, mapCell } from '@/components/day/flat-map';
import { nearestCity, ourWheel } from '@/components/preview/facts';
import { ZONE } from '@/lib/places';

let bad = 0;
const ok = (c: boolean, s: string) => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + s); };
const ours = ourWheel(), cs = ours.cities;

/* 1. the sun: at each city's opening (09:00 local) the sun is up or just rising there, and the subsolar point is on the
   tropic-of-Capricorn side in December */
for (const c of cs) {
  const s = subsolar(c.opens), h = sunHeight(s, c.lat, c.lon);
  ok(s.lat < -22 && s.lat > -23.5, `${c.name}: the sun stands over ${s.lat.toFixed(1)}° in December`);
  ok(h > -0.2, `${c.name}: at ${atZone(c.opens, ZONE[c.id])} local the sun's height is ${h.toFixed(2)} (morning, not night)`);
}
/* a known moment: 12:00 UTC on the solstice the sun is over about 0°E, 23.4°S */
const sol = subsolar(Date.UTC(2026, 11, 21, 12));
ok(Math.abs(sol.lat + 23.44) < 0.2 && Math.abs(sol.lon) < 1, `solstice noon UTC: ${sol.lat.toFixed(2)}, ${sol.lon.toFixed(2)}`);

/* 2. "in your time" for UTC−8, UTC, UTC+1, UTC+5:30 and UTC+11 (zones without a December clock change but Sydney's,
   which is +11 in December) */
const lon = cs.find((c) => c.id === 'london')!, sel = cs[0];
const cases: [string, number, string, string][] = [
  ['America/Los_Angeles', lon.opens, 'Europe/London', '01:00 your time'],
  ['Etc/UTC', lon.opens, 'Europe/London', 'The same where you are'],
  ['Europe/Berlin', lon.opens, 'Europe/London', '10:00 your time'],
  ['Asia/Kolkata', lon.opens, 'Europe/London', '14:30 your time'],
  ['Australia/Sydney', lon.opens, 'Europe/London', '20:00 your time'],
  ['America/Los_Angeles', sel.opens, ZONE[sel.id], '16:00 on 9 Dec your time'],
];
for (const [tz, ms, zone, want] of cases) { const got = yourTime(ms, zone, tz); ok(got === want, `${tz}: "${got}" (want "${want}")`); }

/* 3. the nearest city by time zone offset (minutes east of UTC) */
/* two cities at one offset (London and Nouakchott at UTC) are a tie: the first in the day's order is taken */
for (const [off, want] of [[-480, ['san-francisco']], [0, ['london', 'nouakchott']], [540, ['seoul']], [300, ['peshawar']]] as [number, string[]][]) {
  const got = cs[nearestCity(cs, off)].id; ok(want.includes(got), `offset ${off}: nearest ${got} (want ${want.join(' or ')})`);
}
ok(cs[nearestCity(cs, 0, { lat: 48.85, lon: 2.35 })].id === 'london', 'Paris by place: London');

/* 4. the flat map's marks: every city its own mark, codes never on a mark, for 6, 10, 14 and 16 cities */
const extra = [{ lat: -33.87, lon: 151.21, code: 'SYD' }, { lat: 6.52, lon: 3.38, code: 'LOS' }];
const base = cs.map((c) => ({ lat: c.lat, lon: c.lon, code: c.code ?? '' }));
const some = (n: number) => Array.from({ length: n }, (_, i) => base[Math.round((i * (base.length - 1)) / (n - 1))]);
for (const list of [some(6), some(10), base, [...base, ...extra]]) {
  const g = { rows: 16, cols: 100, north: 66, south: -50 }, m = placeMarks(g, list);
  const marks = new Set(m.flatMap((x) => [-1, 0, 1].map((k) => x.r * 1000 + x.c + k)));
  const codes = m.flatMap((x) => Array.from({ length: x.code.n }, (_, k) => x.code.r * 1000 + x.code.c + k));
  const clash = codes.filter((k) => marks.has(k)).length, dup = codes.length - new Set(codes).size;
  const far = Math.max(...m.map((x) => Math.abs(x.r - mapCell(g, x.lat, x.lon)[0])));
  ok(clash === 0 && dup === 0 && m.every((x) => x.code.c >= 0 && x.code.c + x.code.n <= g.cols), `${list.length} cities: no code on a mark, no codes overlap (moved at most ${far} rows)`);
}

console.log(bad ? `${bad} failed` : 'all true');
process.exit(bad ? 1 : 0);
