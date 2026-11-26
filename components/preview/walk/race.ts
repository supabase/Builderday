/* One city's 90 minutes as a seeded sample, for How it works: who arrives when, each public vote, each judge vote
   (worth 5). "Your project" arrives at a set minute and ends at a set place. Pure: the same numbers give the same
   race, so a saved config draws the same race again. */
import { mulberry32 } from '@/lib/day-data';

export const OPEN = 45, SHOW = 60, END = 90, WEIGHT = 5, JUDGE_VOTES = 10;
export type Ev = { t: number; n: number; judge: boolean };
export type Proj = { name: string; arrive: number; ev: Ev[]; you: boolean };
export type RaceCfg = { seed: number; projects: number; youArrive: number; youPlace: number; judges: number };

const POOL = ['Field notes', 'Sound map', 'Switchyard', 'Open atlas', 'Tidepool', 'Night shift', 'Kopi run', 'Daybreak', 'Relay', 'Soft signal', 'Offcut', 'Sidecar', 'Paper trail', 'Wayfinder', 'Beacon', 'Crosswalk', 'Canopy', 'Pocket map', 'Lantern', 'Ferry', 'Larder', 'Quay', 'Hearth', 'Signal box', 'Orchard', 'Tram stop', 'Driftwood', 'Low tide', 'Postcard', 'Weathervane', 'Rooftop', 'Courtyard', 'Overpass', 'Kiln', 'Skylight'];

function spread(R: () => number, lo: number, n: number, skew: number): Ev[] {
  const ev: Ev[] = [];
  for (let k = 0; k < n; k++) ev.push({ t: lo + (END - lo) * Math.pow(R(), skew) * 0.995, n: 1, judge: false });
  return ev;
}

export function makeRace(c: RaceCfg): Proj[] {
  const R = mulberry32(c.seed), pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  /* the others: an arrival in the first 70 minutes, a public count, a skew (late surge or early lead) */
  const rows = pool.slice(0, c.projects - 1).map((name) => ({ name, arrive: Math.round(4 + R() * 62), pub: Math.round(6 + Math.pow(R(), 0.8) * 36), skew: 0.6 + R() * 0.8, judge: [] as number[] }));
  /* the judges' votes, after 60, to the stronger projects more often; yours take three of them */
  const youJudge = Math.min(3, c.judges * JUDGE_VOTES), rest = c.judges * JUDGE_VOTES - youJudge, weight = rows.map((r) => r.pub + 4), sum = weight.reduce((a, b) => a + b, 0);
  for (let j = 0; j < rest; j++) {
    let x = R() * sum, k = 0; while (k < rows.length - 1 && x > weight[k]) { x -= weight[k]; k++; }
    rows[k].judge.push(SHOW + R() * (END - SHOW - 0.5));
  }
  const final = rows.map((r) => r.pub + r.judge.length * WEIGHT).sort((a, b) => b - a);
  /* yours lands at youPlace: one above the next one down, below the one above (the one above is lifted if they tie) */
  const place = Math.max(1, Math.min(c.youPlace, rows.length + 1));
  let total = place === 1 ? final[0] + 3 : (final[place - 1] ?? 0) + 2;
  if (place > 1 && total >= final[place - 2]) {
    const above = rows.find((r) => r.pub + r.judge.length * WEIGHT === final[place - 2]);
    if (above) above.pub += total - final[place - 2] + 2;
  }
  const youJudgeT = Array.from({ length: youJudge }, () => SHOW + 4 + R() * (END - SHOW - 6)).sort((a, b) => a - b);
  let youPub = total - youJudge * WEIGHT;
  if (youPub < 4) { total += 4 - youPub; youPub = 4; }
  const projs: Proj[] = rows.map((r) => {
    const ev = [...spread(R, Math.max(OPEN, r.arrive), r.pub, r.skew), ...r.judge.map((t) => ({ t, n: WEIGHT, judge: true }))].sort((a, b) => a.t - b.t);
    return { name: r.name, arrive: r.arrive, ev, you: false };
  });
  const you: Proj = { name: 'Your project', arrive: c.youArrive, you: true, ev: [...spread(R, Math.max(OPEN, c.youArrive), youPub, 0.75), ...youJudgeT.map((t) => ({ t, n: WEIGHT, judge: true }))].sort((a, b) => a.t - b.t) };
  return [you, ...projs];
}

/* the count at a minute: everything cast before it */
export const countAt = (p: Proj, m: number) => p.ev.reduce((a, e) => (e.t < m ? a + e.n : a), 0);
export const judgeAt = (p: Proj, m: number) => p.ev.reduce((a, e) => (e.judge && e.t < m ? a + e.n : a), 0);
/* the highest count anyone reaches: the one scale the drawing keeps from start to end */
export const topOf = (race: Proj[]) => Math.max(...race.map((p) => countAt(p, END + 1)));

/* What the public sees at a minute, with the reveal at 60 run as far as `reveal` (0 to 1, lowest first, leader last):
   counts (null while hidden), the order (arrival order while hidden), the cut (3rd place's count). */
export type Row = { p: Proj; i: number; shown: number | null; judge: number; rank: number };
export type Standing = { rows: Row[]; hidden: boolean; inHidden: number; cut: number | null; closed: boolean };
export function standing(race: Proj[], min: number, reveal: number): Standing {
  const here = race.map((p, i) => ({ p, i })).filter((x) => x.p.arrive <= min);
  const inHidden = race.reduce((a, p) => a + p.ev.filter((e) => e.t >= OPEN && e.t < Math.min(min, SHOW)).length, 0);
  if (min < SHOW || reveal <= 0) {
    const rows = here.sort((a, b) => a.p.arrive - b.p.arrive).map((x, k) => ({ ...x, shown: null, judge: 0, rank: k + 1 }));
    return { rows, hidden: true, inHidden, cut: null, closed: false };
  }
  const at60 = here.map((x) => ({ ...x, c: countAt(x.p, SHOW) })).sort((a, b) => a.c - b.c || b.p.arrive - a.p.arrive);
  const done = new Set(at60.slice(0, Math.floor(reveal * (at60.length + 0.999))).map((x) => x.i));
  /* like a results board: the ones not shown yet keep their places at the top in arrival order, and each count
     shown lands in its place from the bottom up, so one row moves at a time and the leader lands last */
  const rows = here.map((x) => { const on = reveal >= 1 || done.has(x.i); return { ...x, shown: on ? countAt(x.p, min) : null, judge: on ? judgeAt(x.p, min) : 0 }; })
    .sort((a, b) => (a.shown === null) !== (b.shown === null) ? (a.shown === null ? -1 : 1) : a.shown === null ? a.p.arrive - b.p.arrive : (b.shown as number) - (a.shown as number) || a.p.arrive - b.p.arrive)
    .map((x, k) => ({ ...x, rank: k + 1 }));
  return { rows, hidden: reveal < 1, inHidden, cut: reveal >= 1 ? (rows[2]?.shown ?? null) : null, closed: min >= END && reveal >= 1 };
}

/* the other cities' finalists for the final, seeded; the visitor's city carries its own top 3 */
export function finalists(ids: string[], mine: string, mineTop: string[], seed: number): Record<string, string[]> {
  const R = mulberry32(seed * 7 + 911), pool = POOL.filter((n) => !mineTop.includes(n));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out: Record<string, string[]> = {};
  let k = 0;
  ids.forEach((id) => { if (id === mine) out[id] = mineTop; else { out[id] = [0, 1, 2].map(() => pool[k++ % pool.length]); } });
  return out;
}
