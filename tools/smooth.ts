/* smooth.ts: does the How it works drawing move cleanly? It draws one whole loop of a direction through the beam pen,
   frame by frame at a display rate, with the afterglow off, compares each frame with the one before, and prints one
   table. It fails (exit 1) if any "must be" line is not met.

   Run from the repo root:
     JITI_ALIAS='{"@":"'$PWD'"}' node_modules/.bin/jiti tools/smooth.ts [direction] [--hz 60,120] [--set key=value ...]
   direction: line (default), globe, rack, plans, board. --set changes one knob of the saved config (repeatable), so
   every knob can be tried at both ends of its range. --small draws the small tube (with --set smallLayout=stacked, the
   stacked one). --press adds a press on every step at five moments of the loop
   (line only) and measures the turn through each. --quiet prints only the verdict line. */

import saved from '../saved/explain.config.json';
import motionSaved from '../saved/motion.config.json';
import { beamFrame, clampScope, type Facts, type ScopeCfg } from '../components/day/scope';
import { REC } from '../components/day/pen';
import { poseAt } from '../components/day/acts';
import { lineAngle, lineScore, lineDefaults } from '../components/day/line';
import { LinePlay } from '../components/day/line-clock';
import { dayFacts } from '../components/day/explain-facts';
import { CITIES, EVENT } from '../lib/day-data';
import { PRIZES } from '../lib/prizes';
import { CODE } from '../lib/places';
import { clampMotion, type MotionCfg } from '../lib/motion';
import type { X } from '../components/day/draw';

const argv = process.argv.slice(2);
const dir = (argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--set') && !argv[argv.indexOf(a) - 1]?.startsWith('--hz')) ?? 'line') as ScopeCfg['dir'];
const hzArg = argv.indexOf('--hz'), HZ = hzArg >= 0 ? argv[hzArg + 1].split(',').map(Number) : [60, 120];
const sets: Record<string, string> = {};
argv.forEach((a, i) => { if (a === '--set') { const [k, v] = argv[i + 1].split('='); sets[k] = v; } });
const quiet = argv.includes('--quiet'), withPress = argv.includes('--press'), small = argv.includes('--small');

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : v);
const motion: MotionCfg = clampMotion({ ...(motionSaved as Partial<MotionCfg>), ...Object.fromEntries(Object.entries(sets).filter(([k]) => k in motionSaved || ['tourTurn', 'tourHold', 'pickHold', 'durFlight', 'durCross'].includes(k)).map(([k, v]) => [k, num(v)])) });
const cfg: ScopeCfg = clampScope({ ...(saved as Partial<ScopeCfg>), ...(dir === 'line' ? lineDefaults : {}), ...Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, num(v)])), dir });
const df = dayFacts();
const F: Facts = { buildMin: 90, voteAfter: 30, startHour: 9, codes: CITIES.map((c) => CODE[c.id]), top: EVENT.finalists, cities: df.cities, seedPick: df.seedPick, pickAt: df.pickAt, pickers: EVENT.pickers, prize: PRIZES.global.what ?? undefined, cityPrize: PRIZES.city.what ?? undefined };
const off = { ...cfg, after: 0 };

/* the loop's length in seconds: today's directions play three steps of max(tourStep, loop) each; line has its score */
const loopSec = dir === 'line' ? lineScore(cfg, F, motion, small).loop : 3 * Math.max(motion.tourStep / 1000, cfg.loop);

type Frame = { len: number; time: number; want: number; light: number; pieces: number; words: string; nums: Map<string, string>; angle: [number, number] };
function measure(ph: number, press?: ReturnType<LinePlay['read']>['press']): Frame {
  const fr = beamFrame('day', ph, off, F, 1, undefined, small, press, motion);
  const want = dir === 'line' ? fr.time : beamFrame('day', ph, { ...off, budget: 1e9 }, F, 1, undefined, small, undefined, motion).len;
  let light = 0, pieces = 0;
  for (let i = 0; i < fr.segs.length; i += REC) {
    const L = Math.hypot(fr.segs[i + 2] - fr.segs[i], fr.segs[i + 3] - fr.segs[i + 1]), lum = (fr.segs[i + 4] + fr.segs[i + 5] + fr.segs[i + 6]) / 3;
    light += (L * fr.segs[i + 7] + fr.segs[i + 8] + fr.segs[i + 9]) * lum; pieces++;
  }
  for (let i = 0; i < fr.tris.length; i += 15) {
    const ax = fr.tris[i], ay = fr.tris[i + 1], bx = fr.tris[i + 5], by = fr.tris[i + 6], cx = fr.tris[i + 10], cy = fr.tris[i + 11];
    light += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5 * ((fr.tris[i + 2] + fr.tris[i + 3] + fr.tris[i + 4]) / 3) * 0.5;
  }
  const ws = fr.words.filter((w) => w.a > 0.004);
  const nums = new Map<string, string>();
  for (const w of ws) if (/\d/.test(w.s)) nums.set(w.k ?? Math.round(w.x) + '|' + Math.round(w.y) + '|' + w.size, w.s);
  let angle: [number, number] = [0, 0];
  if (dir === 'globe') { const x = { pen: null, cfg: off, f: F, boost: 1, frame: 0, ph } as unknown as X; const p = poseAt(x, ph * 3); angle = [p.lon, p.lat]; }
  else if (dir === 'line') angle = [lineAngle(cfg, F, motion, ph * loopSec, press, small), 0];
  return { len: fr.len, time: fr.time, want, light, pieces, words: ws.map((w) => w.s + (w.clip ? '' : '')).sort().join('\u0001'), nums, angle };
}
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

type Row = { name: string; today?: string; got: string; must: string; ok: boolean | null };
const rows: Row[] = [];
let fail = false;
function line(name: string, got: string, must: string, ok: boolean | null) { rows.push({ name, got, must, ok }); if (ok === false) fail = true; }

for (const hz of HZ) {
  const N = Math.round(loopSec * hz), budget = cfg.budget;
  let maxLen = 0;
  let over = 0, maxWant = 0, jumps = 0, maxTurn = 0, lightJumps = 0, maxLight = 0, lightAt = 0, pieceChanges = 0, pops = 0, wordChanges = 0, minNum = Infinity;
  let prev: Frame | null = null, prevSpeed = -1; const lastChange = new Map<string, number>(), lastVal = new Map<string, string>();
  let minSpeed = Infinity, maxSpeed = 0;
  const frames: Frame[] = [];
  /* every frame of the loop, then the first again: the seam is compared like any other pair */
  for (let i = 0; i <= N; i++) {
    const ph = (i % N) / N, fr = i < N ? measure(ph) : frames[0]; if (i < N) frames.push(fr);
    if (i < N && fr.want > budget) over++;
    maxWant = Math.max(maxWant, fr.want); maxLen = Math.max(maxLen, fr.len);
    if (prev) {
      const d = Math.hypot(wrap(fr.angle[0] - prev.angle[0]), fr.angle[1] - prev.angle[1]);
      { maxTurn = Math.max(maxTurn, d); minSpeed = Math.min(minSpeed, d); maxSpeed = Math.max(maxSpeed, d); }
      const sp = Math.max(d, 0.05);
      if (prevSpeed > 0 && Math.max(sp / prevSpeed, prevSpeed / sp) > 1.5) jumps++;
      prevSpeed = sp;
      const dl = Math.abs(fr.light - prev.light) / Math.max(fr.light, prev.light, 1e-6);
      if (dl > maxLight) { maxLight = dl; lightAt = i / hz; } if (dl > 0.04) lightJumps++;
      if (fr.pieces !== prev.pieces) { pieceChanges++; if (Math.abs(fr.pieces - prev.pieces) >= 8) pops++; }
      if (fr.words !== prev.words) wordChanges++;
      /* against the last value the number showed, so a number that fades out and back in changed too */
      for (const [k, s] of fr.nums) {
        const was = lastVal.get(k);
        if (was !== undefined && was !== s) { const t = i / hz, l = lastChange.get(k); if (l !== undefined) minNum = Math.min(minNum, t - l); lastChange.set(k, t); }
        lastVal.set(k, s);
      }
    }
    prev = fr;
  }
  /* a random move of a corner: the same moment drawn as two different frames (the frame rate knob changes the frame
     number, which is all the wobble reads) */
  const a = beamFrame('day', 0.37, { ...off, fps: 24 }, F, 1, undefined, false, undefined, motion).segs, b = beamFrame('day', 0.37, { ...off, fps: 25 }, F, 1, undefined, false, undefined, motion).segs;
  let wob = 0; if (a.length === b.length) for (let i = 0; i < a.length; i += REC) for (let j = 0; j < 4; j++) wob = Math.max(wob, Math.abs(a[i + j] - b[i + j]));
  const rate = dir === 'line' ? 360 / (motion.tourTurn / 1000) / hz : 0;
  const tag = ' @' + hz;
  line('Frames' + tag, String(N), '', null);
  line('Frames over the line budget (' + budget + ')' + tag, over + ' of ' + N, '0', over === 0);
  if (dir === 'line') line('Highest plain line length (not the budget: see beam time)' + tag, String(Math.round(maxLen)), '', null);
  line((dir === 'line' ? 'Highest beam time (length x brightness)' : 'Highest line length') + tag, Math.round(maxWant) + ' (' + Math.round((100 * maxWant) / budget) + '% of budget)', '< 85% of budget', maxWant < budget * 0.85);
  /* the stepped turn rests and turns by design (the wheel's motion), so its speed is reported, not judged */
  const steady = !(dir === 'line' && cfg.turnMode === 'stepped');
  line('Speed changes over 1.5x in one frame' + tag, String(jumps), steady ? '0' : '', steady ? jumps === 0 : null);
  line('Largest turn in one frame' + tag, maxTurn.toFixed(3) + '°' + (dir === 'line' ? ' (rate/hz ' + rate.toFixed(3) + '°, slowest ' + minSpeed.toFixed(3) + '°)' : ''), dir === 'line' && steady ? 'rate/hz every frame' : '', dir === 'line' && steady ? Math.abs(maxSpeed - rate) < 1e-6 && Math.abs(minSpeed - rate) < 1e-6 : null);
  line('Frames where total light changes > 4%' + tag, lightJumps + ' (largest ' + (maxLight * 100).toFixed(1) + '% at ' + lightAt.toFixed(2) + ' s)', '0', lightJumps === 0);
  line('Frames where the piece count changes (8+ at once)' + tag, pieceChanges + ' (' + pops + ')', '', null);
  line('Frames where the set of words changes' + tag, String(wordChanges), '< 60', wordChanges < 60);
  line('Shortest time between two changes of one number' + tag, Number.isFinite(minNum) ? (minNum * 1000).toFixed(0) + ' ms' : 'none', '>= 700 ms', !Number.isFinite(minNum) || minNum >= 0.7 - 1e-9);
  line('Largest random move of a corner' + tag, wob.toFixed(3), '0', wob === 0);

  if (withPress && dir === 'line') {
    /* a press on every step from five moments of the loop. The turn may go either way (the shortest), so the speed is
       signed: it must match the steady rate on the frames where the press starts and ends, and never change in one
       frame by more than a share of the press's own top speed (no jolt) */
    let worstStep = 0, ends = 0, pressLight = 0, maxDeg = 0, maxT = 0; const S = lineScore(cfg, F, motion, small), rate = -360 / (motion.tourTurn / 1000);
    for (const at of [0.1, 0.3, 0.5, 0.7, 0.93]) for (let to = 0; to < 3; to++) {
      const play = new LinePlay(); play.tune(S, motion, cfg); play.scrubTo(at * S.loop);
      if (play.act === to) continue;
      let now = 1000; play.read(now); play.press(to, now);
      const p0 = play.read(now).press; if (!p0) continue;
      maxDeg = Math.max(maxDeg, Math.abs(p0.dLon)); maxT = Math.max(maxT, p0.T);
      const vs: number[] = []; let pa = lineAngle(cfg, F, motion, play.sec, p0, small), pl = -1;
      const steps = Math.ceil((p0.T + 0.3) * hz);
      for (let k = 0; k < steps; k++) {
        now += 1000 / hz; const r = play.read(now), ang = lineAngle(cfg, F, motion, r.sec, r.press, small), fr = measure(r.ph, r.press);
        vs.push(wrap(ang - pa) * hz); pa = ang;
        if (pl >= 0) pressLight = Math.max(pressLight, Math.abs(fr.light - pl) / Math.max(fr.light, pl, 1e-6));
        pl = fr.light;
      }
      const top = Math.max(...vs.map(Math.abs));
      for (let k = 1; k < vs.length; k++) worstStep = Math.max(worstStep, Math.abs(vs[k] - vs[k - 1]) / top);
      ends = Math.max(ends, Math.abs(vs[0] - rate) / Math.abs(rate), Math.abs(vs[vs.length - 1] - rate) / Math.abs(rate));
    }
    line('Press: longest turn' + tag, maxDeg.toFixed(1) + '° in ' + (maxT * 1000).toFixed(0) + ' ms', '', null);
    line('Press: speed at its first and last frame against the steady speed' + tag, (ends * 100).toFixed(1) + '% off', '< 5%', ends < 0.05);
    /* the bars are the plan's own shortest moves: a 400 ms smootherstep turn, and a 150 ms fade of everything */
    const joltBar = 3.08 / (0.4 * hz) + 0.01, lightBar = 1.875 / (0.15 * hz);
    line('Press: largest speed change in one frame (share of its top speed)' + tag, (worstStep * 100).toFixed(1) + '%', '< ' + (joltBar * 100).toFixed(1) + '% (a 400 ms turn)', worstStep < joltBar);
    line('Press: largest change of total light in one frame' + tag, (pressLight * 100).toFixed(1) + '%', '< ' + (lightBar * 100).toFixed(1) + '% (a 150 ms fade)', pressLight < lightBar);
  }
}

if (!quiet) {
  const w = Math.max(...rows.map((r) => r.name.length)), g = Math.max(...rows.map((r) => r.got.length));
  console.log('Direction ' + dir + (Object.keys(sets).length ? ' with ' + JSON.stringify(sets) : '') + ', loop ' + loopSec.toFixed(2) + ' s, afterglow off\n');
  for (const r of rows) console.log((r.ok === null ? '   ' : r.ok ? 'ok ' : 'NO ') + r.name.padEnd(w) + '  ' + r.got.padEnd(g) + (r.must ? '  must be ' + r.must : ''));
}
console.log((fail ? 'FAIL' : 'PASS') + ' ' + dir + (Object.keys(sets).length ? ' ' + JSON.stringify(sets) : ''));
process.exit(fail ? 1 : 0);
