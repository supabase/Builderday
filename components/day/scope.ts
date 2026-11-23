/* The tube: the how-it-works and prize drawings as a vector monitor draws them. A beam goes only where a line is, so
   every drawing is lines (a flap face, a lit screen and the pick's cell are the only fills); a line is drawn on from a
   hot head; a new thing flashes blue-white and fades; the clock and the prize are segment digits or flaps, which can
   only pass through the states their hardware allows. The scan lines and the dark corners are CSS on the tube.

   Two renderers draw every scene (pen.ts): the canvas pen (a blur for the glow; the fallback without WebGL) and the
   beam (beam.ts: the light worked out along each line, added in a high-range buffer, one WebGL context per page).

   Rules (fixed here; everything else is a knob in /lab/explain, saved to saved/explain.config.json):
   - one ground (#0e0f0f), a white beam; green for now, the leader, the cut, the pick and you; blue for what just
     arrived; orange only as light inside glass (the lab keeps an Accent switch to see the old orange);
   - lines only (fills only for a flap face, a lit screen, the pick's cell); text only as segment digits, flaps or
     stroke letters;
   - the motion is the day's own mechanics (a clock running down, votes arriving, thirty becoming one), never decoration;
   - the drawing is a pure function of (scene, phase, config, facts): the seed makes every variation, the afterglow is
     worked out from earlier phases, and a still under reduced motion is the same drawing at one phase.

   Drawn in a 320 x 180 space; the canvas scales it. The directions (one object for the three steps) are in acts.ts. */

import { BeamPen, CanvasPen, type Fonts, type Pen, type Word } from './pen';
import {
  BLUE, DIM, FACE, FLASH, GREY, INK, LABEL, ORANGE, VH, VW,
  acc, digits, act, arc, cl, dot, drawOn, eio, eo, fill, finN, hash, hhmm, p7, pad, pickCell, pickOf, rect, segText, stroke, text,
  type Facts, type Poly, type Pt, type X,
} from './draw';
import { DIRS, dayStep, type Dir } from './acts';
import { lineAct, lineMo, lineScene, lineScore, viewH, isStack, VH_STACK, type LineMo, type Press } from './line';
export { viewH, isStack, VH_STACK };

export type { Facts } from './draw';
export { VW, VH } from './draw';

export type BuildMode = 'beam' | 'boot';
export type VoteMode = 'trace' | 'radar';
export type FinalMode = 'thirty' | 'lissajous';
export type CashMode = 'flap' | 'vector' | 'nixie';
/* how the prizes are shown: today's two tubes, under glass, the big flaps, nixie tubes, or the plain docket */
export type PrizeMode = 'tubes' | 'glass' | 'flaps' | 'nixie' | 'docket';
export type NeoMode = 'laptop' | 'ten' | 'glass' | 'drawn';
export type ScopeLayout = 'reel' | 'stacked' | 'side';
export type Renderer = 'beam' | 'canvas';
export type Accent = 'green' | 'orange';
/* what the one tube plays: the direction (one object for the three steps) or today's three scenes */
export type Story = 'acts' | 'scenes';
/* how a press on a step gets there: the picture moves (the globe turns, the readings clear), or it cuts */
export type Jump = 'move' | 'cut';
/* the words in a drawing: the site's mono (as the labels under the home's countdown), or the stroke letters the beam
   first wrote in; numbers are segment digits either way. The scan lines: the page's (saved/screen.config.json) or
   the tube's own (the scan knob). Both first-built looks stay here to compare. */
export type Letters = 'mono' | 'stroke';
export type Lines = 'page' | 'tube';
export type Scene = 'build' | 'vote' | 'final' | 'cash' | 'neo' | 'reel' | 'day';
/* the morning line (line.ts) beside today's four directions: how the globe turns (one speed, or the wheel's stepped
   turn), what the panel shows, what leaves an afterglow, and how the small tube is laid out */
export type DayDir = Dir | 'line';
export type TurnMode = 'steady' | 'stepped';
export type PanelMode = 'story' | 'list' | 'off';
export type Afterglow = 'events' | 'off' | 'all';
export type SmallLayout = 'side' | 'stacked';

export type LineGrid = 'wire' | 'template';
export type LineMarks = 'dots' | 'plus';
export type LineBanks = 'one' | 'two';
export type ScopeCfg = {
  seed: number; build: BuildMode; vote: VoteMode; final: FinalMode; cash: CashMode; neo: NeoMode; layout: ScopeLayout;
  renderer: Renderer; accent: Accent; dir: DayDir; prize: PrizeMode;
  /* the morning line: the modes, then the knobs. Globe size, tilt and where the 09:00 line sits (degrees from the
     centre); typing rate (letters a second), lines in the card, rows in the ranking, vote beats and their spacing
     (ms); spike height (of the radius), arc height, stagger within a city (ms), tail length (of the flight); the
     fade-in and fade-out floors (ms); far-side brightness and the width of its ramp (degrees); the others' light at
     the pick; the seam (ms); a click at the pick when sound is on */
  turnMode: TurnMode; panel: PanelMode; afterglow: Afterglow; smallLayout: SmallLayout;
  /* the text globe's signs: the grid as the wire (meridians every 30 degrees, five
     parallels) or the text globe's template (limb, equator, two parallels, the middle column, dotted); the cities as
     glowing dots or a + each (yours a green [+]); the Final's line-up in one column or, from nine cities, two banks */
  lGrid: LineGrid; lMarks: LineMarks; lBanks: LineBanks;
  /* the land as sparse dots turning with the globe (0: none), and their light */
  lLand: number; lLandA: number;
  gR: number; lTilt: number; lineAt: number; typeRate: number; cardLines: number; rankRows: number; beats: number; beatGap: number;
  spikeH: number; arcH: number; flyStagger: number; tailLen: number; fadeIn: number; fadeOut: number; farLevel: number; rampW: number;
  pickDim: number; seam: number; pickClick: number;
  /* smooth: draw on every display frame (the frame rate then only sets the afterglow's spacing and the beam's crackle) */
  loop: number; fps: number; smooth: number; hold: number; still: number;
  glow: number; lw: number; jitter: number; trail: number; decay: number; scan: number; blips: number; hover: number;
  /* the beam: spot size, halo size and share, dwell at points and ends, how much a long line dims, exposure, how hot
     cores go white, afterglow passes and their fade, the budget of beam length per frame, depth dimming and the gap
     a far line leaves where a near one crosses it */
  bw: number; halo: number; haloW: number; dwell: number; speed: number; expo: number; hot: number; after: number; fade: number;
  budget: number; depth: number; gap: number; tilt: number; turn: number;
  /* the prize under glass: how much the rim mirrors, how much shows through the core, the colour split, how fast the
     globe turns, the type's size, the row of ten small globes under the amount, and whether the globe sits on the last
     figure (its rim bends it) or stands clear past it */
  gMirror: number; gThrough: number; gFringe: number; gTurn: number; gSize: number; gRow: number; gOn: number; gBig: number; gTouch: number;
  /* the city prize under glass (neo: glass): lid height and deck depth (of the lid's width), screen light, rim light,
     the streak across the screen, the light from blue to white, the globe's size (of the screen's height) and place */
  nLid: number; nDeck: number; nScreen: number; nRim: number; nStreak: number; nWhite: number; nGlobe: number; nGx: number; nGy: number;
  /* the step-through: what it plays, the one-pass tour (and on a phone), the day bar, "Next: Vote" at the end of each
     step's words in the narrow sheet (next), and how a press gets there. Seconds per step and the jump are in motion */
  story: Story; tour: number; tourPhone: number; bar: number; next: number; jump: Jump;
  letters: Letters; lines: Lines;
};
export const SCOPE_DEF: ScopeCfg = {
  seed: 7, build: 'beam', vote: 'trace', final: 'thirty', cash: 'flap', neo: 'laptop', layout: 'reel',
  renderer: 'canvas', accent: 'green', dir: 'globe', prize: 'tubes',
  turnMode: 'steady', panel: 'story', afterglow: 'events', smallLayout: 'side', lGrid: 'template', lMarks: 'plus', lBanks: 'two', lLand: 1, lLandA: 0.62,
  gR: 64, lTilt: 20, lineAt: -30, typeRate: 18, cardLines: 4, rankRows: 5, beats: 6, beatGap: 900,
  spikeH: 0.35, arcH: 24, flyStagger: 60, tailLen: 0.35, fadeIn: 120, fadeOut: 100, farLevel: 0.22, rampW: 15,
  pickDim: 0.3, seam: 1200, pickClick: 0,
  loop: 9, fps: 24, smooth: 1, hold: 0.22, still: 0.9, glow: 6, lw: 1.3, jitter: 0.35, trail: 6, decay: 0.62, scan: 0.22, blips: 22, hover: 1,
  bw: 0.42, halo: 4.5, haloW: 0.16, dwell: 2.4, speed: 0.4, expo: 1.5, hot: 0.8, after: 4, fade: 0.5,
  budget: 3200, depth: 0.7, gap: 1.6, tilt: 30, turn: 1,
  gMirror: 0.9, gThrough: 0.55, gFringe: 0.8, gTurn: 1, gSize: 1, gRow: 1, gOn: 1, gBig: 0.6, gTouch: 0.15, nLid: 0.62, nDeck: 0.09, nScreen: 1, nRim: 1, nStreak: 0.6, nWhite: 0.25, nGlobe: 0.36, nGx: 0.5, nGy: 0.5,
  story: 'acts', tour: 1, tourPhone: 0, bar: 1, next: 1, jump: 'move',
  letters: 'mono', lines: 'page',
};
export const SCOPE_CHOICES: Record<string, string[]> = {
  build: ['beam', 'boot'], vote: ['trace', 'radar'], final: ['thirty', 'lissajous'], cash: ['flap', 'vector', 'nixie'], neo: ['laptop', 'ten', 'glass', 'drawn'], layout: ['reel', 'stacked', 'side'],
  renderer: ['beam', 'canvas'], accent: ['green', 'orange'], dir: ['line', 'globe', 'rack', 'plans', 'board'],
  turnMode: ['steady', 'stepped'], lGrid: ['wire', 'template'], lMarks: ['dots', 'plus'], lBanks: ['one', 'two'], panel: ['story', 'list', 'off'], afterglow: ['events', 'off', 'all'], smallLayout: ['side', 'stacked'],
  prize: ['tubes', 'glass', 'flaps', 'nixie', 'docket'], story: ['acts', 'scenes'], jump: ['move', 'cut'],
  letters: ['mono', 'stroke'], lines: ['page', 'tube'],
};
export const SCOPE_LABELS: Record<string, string> = {
  beam: 'Beam draws the app', boot: 'Terminal boot log', trace: 'Live step chart', radar: 'Radar sweep', thirty: 'Thirty into one', lissajous: 'Thirty figures lock',
  flap: 'Split-flap roll', vector: 'Beam-drawn figure', laptop: 'Wireframe laptop', ten: 'Ten laptops', reel: 'One tube plays the day', stacked: 'A tube per step', side: 'Small tube beside the words',
  canvas: 'Canvas with a blur (today)', green: 'Green (our rule)', orange: 'Orange (the first tubes)',
  nixie: 'Nixie tubes', tubes: 'Two tubes (today)', glass: 'Under glass', flaps: 'The big flaps', docket: 'The docket',
  acts: 'One object (the direction)', scenes: 'Three scenes (today)', move: 'The picture moves there', cut: 'Cut',
  mono: "The site's mono", stroke: 'Stroke letters (first built)', page: "The page's scan lines", tube: "The tube's own (first built)",
  globe: 'One globe, three acts', rack: 'The rack', plans: 'The plans', board: 'The board, small',
  wire: 'Wire (meridians every 30°)', template: 'The text globe’s template, dotted', dots: 'Glowing dots', plus: 'A + each, yours [+]', one: 'One column', two: 'Two banks from nine cities',
  line: 'The morning line', steady: 'Steady (one speed)', stepped: 'Stepped (the wheel turns to each city)',
  story: 'Story (card, ranking, line-up)', list: 'Only the line-up', off: 'Off', events: 'Flights and hits only', all: 'Everything (today)',
};
export const SCOPE_BOUNDS: Record<string, [number, number, number]> = {
  loop: [4, 20, 0.5], fps: [8, 60, 1], hold: [0, 0.5, 0.02], still: [0, 1, 0.01], glow: [0, 16, 0.5], lw: [0.75, 2.5, 0.05],
  jitter: [0, 1.5, 0.05], trail: [0, 14, 1], decay: [0.3, 0.9, 0.02], scan: [0, 0.5, 0.02], blips: [6, 48, 1], seed: [1, 99999, 1],
  bw: [0.2, 1.4, 0.02], halo: [2, 10, 0.25], haloW: [0, 0.6, 0.01], dwell: [0, 6, 0.1], speed: [0, 1, 0.05], expo: [0.4, 4, 0.05], hot: [0, 2, 0.05],
  after: [0, 10, 1], fade: [0.2, 0.9, 0.02], budget: [600, 6000, 100], depth: [0, 1, 0.05], gap: [0, 4, 0.1], tilt: [0, 60, 1], turn: [0.2, 2, 0.05],
  gMirror: [0, 2, 0.05], gThrough: [0, 1.5, 0.05], gFringe: [0, 4, 0.1], gTurn: [0, 3, 0.05], gSize: [0.6, 1.3, 0.01], gBig: [0.35, 0.8, 0.01], gTouch: [0, 0.6, 0.01],
  lLand: [0, 1, 1], lLandA: [0.15, 0.8, 0.01],
  gR: [48, 72, 1], lTilt: [0, 30, 1], lineAt: [-60, 0, 1], typeRate: [10, 40, 1], cardLines: [2, 4, 1], rankRows: [4, 7, 1], beats: [3, 7, 1], beatGap: [750, 1400, 50],
  spikeH: [0.1, 0.6, 0.01], arcH: [8, 40, 1], flyStagger: [60, 250, 10], tailLen: [0.15, 0.8, 0.01], fadeIn: [120, 300, 10], fadeOut: [100, 250, 10],
  farLevel: [0.08, 0.5, 0.01], rampW: [8, 30, 1], pickDim: [0.15, 0.6, 0.01], seam: [800, 2000, 50],
  nLid: [0.5, 0.75, 0.01], nDeck: [0.03, 0.18, 0.01], nScreen: [0.2, 1.6, 0.05], nRim: [0, 1.5, 0.05], nStreak: [0, 1.5, 0.05], nWhite: [0, 1, 0.05], nGlobe: [0.2, 0.55, 0.01], nGx: [0.3, 0.7, 0.01], nGy: [0.35, 0.65, 0.01],
};
const INTS = ['lLand', 'seed', 'fps', 'trail', 'blips', 'after', 'budget', 'tilt', 'gR', 'lTilt', 'lineAt', 'typeRate', 'cardLines', 'rankRows', 'beats', 'beatGap', 'arcH', 'flyStagger', 'fadeIn', 'fadeOut', 'rampW', 'seam'];
export function clampScope(s: Partial<ScopeCfg>): ScopeCfg {
  const c = { ...SCOPE_DEF, ...s } as ScopeCfg & Record<string, unknown>, o = { ...c } as Record<string, unknown>;
  for (const [k, list] of Object.entries(SCOPE_CHOICES)) if (!list.includes(String(c[k]))) o[k] = SCOPE_DEF[k as keyof ScopeCfg];
  for (const [k, [a, b]] of Object.entries(SCOPE_BOUNDS)) { const v = Number(c[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : SCOPE_DEF[k as keyof ScopeCfg]; }
  for (const k of INTS) o[k] = Math.round(o[k] as number);
  for (const k of ['hover', 'tour', 'tourPhone', 'bar', 'next', 'gRow', 'gOn', 'smooth', 'pickClick']) o[k] = c[k] ? 1 : 0;
  return o as ScopeCfg;
}

/* ===== Build ===== */
function clock(x: X, u: number, px: number, py: number, w: number, h: number, col = INK) {
  const left = Math.round(x.f.buildMin * 60 * (1 - u)), s = Math.floor(left / 3600) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(left % 60);
  digits(x, segText(s, px, py, w, h).polys, col, 0.95);
}
function timeline(x: X, u: number, y: number) {
  const f = x.f, all = f.buildMin + f.voteAfter, x0 = 18, x1 = 302, bx = x0 + ((x1 - x0) * f.buildMin) / all, start = f.startHour * 60;
  stroke(x, [[[x0, y], [x1, y]]], DIM, 1);
  stroke(x, [[[x0, y], [x0 + (bx - x0) * u, y]]], INK, 1, 1.6);
  stroke(x, [[[bx, y], [x1, y]]], BLUE, 0.55, 1.6);
  stroke(x, [[[bx, y - 4], [bx, y + 4]]], GREY, 1);
  text(x, hhmm(start), x0, y + 13, 7.5, GREY); text(x, hhmm(start + f.buildMin), bx, y + 13, 7.5, GREY, 1, 'center'); text(x, hhmm(start + all), x1, y + 13, 7.5, GREY, 1, 'right');
}
function appShape(): Poly[] {
  const p: Poly[] = [];
  p.push(arc(62, 92, 26, 6, 0, Math.PI * 2, 28), [[36, 92], [36, 132]], [[88, 92], [88, 132]], arc(62, 132, 26, 6, 0, Math.PI, 14), arc(62, 112, 26, 6, 0, Math.PI, 14));
  p.push([[90, 112], [150, 112]]);
  p.push(rect(150, 16, 302, 120), [[150, 30], [302, 30]], [[157, 23], [158, 23]], [[163, 23], [164, 23]], [[169, 23], [170, 23]], [[184, 30], [184, 120]]);
  p.push([[158, 42], [176, 42]], [[158, 52], [172, 52]], [[158, 62], [174, 62]]);
  p.push(rect(194, 40, 292, 110));
  for (let y = 54; y < 110; y += 14) p.push([[194, y], [292, y]]);
  p.push([[226, 40], [226, 110]], [[262, 40], [262, 110]]);
  return p;
}
function buildBeam(x: X) {
  const u = act(x), done = x.ph > 1 - x.cfg.hold, A = acc(x);
  clock(x, u, 18, 18, 10, 20);
  text(x, 'LEFT TO BUILD', 18, 54, 7.5, GREY);
  drawOn(x, appShape(), eio(u), done ? A : INK, done ? 0.95 : 0.9);
  if (done) { const k = (x.ph - (1 - x.cfg.hold)) / Math.max(0.01, x.cfg.hold); stroke(x, [rect(150, 16, 302, 120)], A, 1 - k * 0.5, 1.4, 2 - k); text(x, 'SUBMITTED', 302, 132, 7.5, A, 1, 'right'); }
  timeline(x, u, 158);
}
function buildBoot(x: X) {
  const u = act(x), code = pickOf(x, x.f.codes, 11), at = x.f.startHour * 60 + Math.round(x.f.buildMin * 0.93);
  const lines: [string, string, string][] = [
    ['~/hack $ supabase init', '', INK], ['~/hack $ supabase start', '', INK], ['  API ready on :54321', '', GREY],
    ['> create table entries', 'OK', INK], ['> alter publication realtime', 'OK', INK], ['> insert into entries', 'OK', INK],
    ['~/hack $ git push', 'OK', INK], ['submitted to ' + code + ' at ' + hhmm(at), '', acc(x)],
  ];
  const total = lines.reduce((s, l) => s + l[0].length + 4, 0); let left = Math.floor(total * eio(u)), y = 46, cx = 18, cy = 46;
  text(x, code + ' · BUILD', 18, 22, 7.5, GREY);
  clock(x, u, 226, 12, 6, 12);
  for (const [s, ok, col] of lines) {
    if (left <= 0) break; const n = Math.min(s.length, left); left -= s.length + 4;
    text(x, s.slice(0, n), 18, y, 8.5, col, col === GREY ? 1 : 0.92);
    if (ok && left > 0) text(x, '[ ' + ok + ' ]', 302, y, 8.5, BLUE, 1, 'right');
    cx = 18 + n * 5.15; cy = y; y += 14;
  }
  const sec = x.ph * x.cfg.loop;
  if (sec % 1 < 0.55) stroke(x, [rect(cx + 1, cy - 8, cx + 6, cy + 1)], INK, 0.9);
  timeline(x, u, 162);
}

/* ===== Vote ===== */
function series(x: X, n: number): number[][] {
  return [0, 1, 2].map((s) => {
    const base = 0.6 + hash(x.cfg.seed, 40, s) * 1.4, amp = 0.4 + hash(x.cfg.seed, 41, s) * 1.6, w = 0.6 + hash(x.cfg.seed, 42, s) * 2.2, ph = hash(x.cfg.seed, 43, s) * 6.28;
    const out = [0]; for (let i = 1; i <= n; i++) out.push(out[i - 1] + Math.max(0, Math.round(base + amp * Math.sin((i / n) * Math.PI * w + ph) + (hash(x.cfg.seed, 44, s, i) - 0.5) * 2.2)));
    return out;
  });
}
function voteTrace(x: X) {
  const u = act(x), N = 36, S = series(x, N), x0 = 18, x1 = 244, y0 = 22, y1 = 146, kf = u * N, k = Math.floor(kf);
  /* zoomed to the votes so far, the way the ranking's chart is zoomed to its ten */
  const vmax = Math.max(8, ...S.map((a) => a[k])) * 1.18;
  const X = (i: number) => x0 + ((x1 - x0) * i) / N, Y = (v: number) => y1 - ((y1 - y0) * v) / vmax;
  const closeAt = (N * x.f.buildMin) / (x.f.buildMin + x.f.voteAfter);
  for (const t of [0.33, 0.66]) stroke(x, [[[x0, y1 - (y1 - y0) * t], [x1, y1 - (y1 - y0) * t]]], DIM, 0.8, 0.7, 0);
  stroke(x, [[[x0, y1], [x1, y1]]], GREY, 0.8, 0.8, 0);
  const cxp = X(closeAt); for (let yy = y0; yy < y1; yy += 6) stroke(x, [[[cxp, yy], [cxp, yy + 3]]], GREY, 0.7, 0.7, 0);
  text(x, 'ENTRIES CLOSE', cxp - 4, y0 + 6, 7.5, GREY, 1, 'right');
  const now = S.map((a) => a[k]), lead = now.indexOf(Math.max(...now));
  const colOf = (s: number) => [BLUE, INK, LABEL][s] ?? INK;
  S.forEach((a, s) => {
    const p: Poly = [[X(0), Y(0)]]; for (let i = 1; i <= k; i++) { p.push([X(i), Y(a[i - 1])], [X(i), Y(a[i])]); } p.push([X(kf), Y(a[k])]);
    stroke(x, [p], colOf(s), s === lead ? 1 : 0.8, s === lead ? 1.8 : 0.9);
    for (let i = Math.max(1, k - 5); i <= k; i++) if (a[i] > a[i - 1]) { const [col, al] = p7(x, (kf - i) / 6); dot(x, [X(i), Y(a[i])], 1.7, col, al); }
    dot(x, [X(kf), Y(a[k])], s === lead ? 2.8 : 2.2, s === lead ? acc(x) : colOf(s), 1);
  });
  /* the places, re-sorted as the lines cross; the board changes at once, the way a results board does */
  const order = [0, 1, 2].sort((p, q) => now[q] - now[p] || p - q);
  order.forEach((s, r) => { const y = 34 + r * 16; text(x, String(r + 1), 256, y, 8, GREY); stroke(x, [[[266, y - 3], [276, y - 3]]], colOf(s), 1, 1.6); text(x, String(now[s]), 302, y, 8.5, INK, 1, 'right'); });
  text(x, 'TOTAL', 256, 112, 7.5, GREY);
  const tot = String(now.reduce((p, q) => p + q, 0)), tw = segText(tot, 0, 0, 7, 14).width;
  digits(x, segText(tot, 302 - tw, 118, 7, 14).polys, INK, 0.95);
  text(x, hhmm(x.f.startHour * 60), x0, 160, 7.5, GREY); text(x, hhmm(x.f.startHour * 60 + x.f.buildMin + x.f.voteAfter), x1, 160, 7.5, GREY, 1, 'right');
}
function voteRadar(x: X) {
  const cx = 92, cy = 90, R = 72, turns = 2, ang = x.ph * Math.PI * 2 * turns - Math.PI / 2, n = x.cfg.blips;
  for (const r of [R / 3, (2 * R) / 3, R]) stroke(x, [arc(cx, cy, r, r, 0, Math.PI * 2, 48)], INK, 0.22, 0.8, 0);
  stroke(x, [[[cx - R, cy], [cx + R, cy]], [[cx, cy - R], [cx, cy + R]]], INK, 0.14, 0.7, 0);
  /* the sweep and its afterglow wedge */
  for (let k = x.cfg.trail * 3; k >= 0; k--) { const a = ang - k * 0.03; stroke(x, [[[cx, cy], [cx + Math.cos(a) * R, cy + Math.sin(a) * R]]], k < 2 ? FLASH : BLUE, Math.pow(x.cfg.decay, k * 0.5) * 0.8, k < 2 ? 1.1 : 0.9, k < 2 ? 1 : 0); }
  let seen = 0; const recent: [number, string][] = [];
  for (let i = 0; i < n; i++) {
    const th = hash(x.cfg.seed, 60, i) * Math.PI * 2 - Math.PI, r = (0.18 + 0.78 * Math.sqrt(hash(x.cfg.seed, 61, i))) * R, arrive = hash(x.cfg.seed, 62, i) * 0.82;
    const d = (((ang - th) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2), last = x.ph - d / turns;
    if (last < arrive) continue;
    seen++; recent.push([last, pickOf(x, x.f.codes, 70 + i)]);
    const [col, al] = p7(x, d); dot(x, [cx + Math.cos(th) * r, cy + Math.sin(th) * r], 2.1, col, Math.max(al, 0.18));
  }
  text(x, 'VOTES', 190, 40, 7.5, GREY);
  digits(x, segText(String(seen), 190, 48, 14, 28).polys, INK, 0.95);
  if ((x.ph * x.cfg.loop) % 1 < 0.5) dot(x, [302, 37], 2.4, acc(x), 1); text(x, 'LIVE', 296, 40, 7.5, GREY, 1, 'right');
  recent.sort((p, q) => q[0] - p[0]).slice(0, 4).forEach(([, c], r) => text(x, c + '  +1', 190, 104 + r * 13, 8, r ? GREY : INK));
}

/* ===== Final ===== */
function finalThirty(x: X) {
  const u = act(x), cw = 15, g = 3, gx = 18, gy = 36, J: Pt = [292, 62], n = x.f.codes.length, top = x.f.top, A = acc(x);
  const pickI = pickCell(x);
  const cell = (i: number) => { const col = Math.floor(i / top), row = i % top; return [gx + col * (cw + g), gy + row * (cw + g)] as Pt; };
  text(x, finN(x.f) + ' FINALISTS', 18, 22, 7.5, GREY); text(x, 'ONE PICK', 302, 22, 7.5, GREY, 1, 'right');
  /* the codes fit their column: the stroke letters are wider than the page's mono, so they go under the usual floor */
  if (!x.pen.ghost) x.f.codes.forEach((c, i) => x.pen.text(c, gx + i * (cw + g) + cw / 2, gy + top * (cw + g) + 9, x.pen.kind === 'beam' && x.cfg.letters === 'stroke' ? 6.5 : 7.5, LABEL, 1, 'center', 'mono'));
  const scanT = cl((u - 0.62) / 0.24), landed = u >= 0.86, landK = cl((u - 0.86) / 0.14);
  const scanAt = scanT > 0 && !landed ? Math.floor(hash(x.cfg.seed, 81, Math.floor(Math.sqrt(scanT) * 16)) * n * top) : -1;
  for (let i = 0; i < n * top; i++) {
    const [px, py] = cell(i), city = Math.floor(i / top), litAt = (0.3 * city) / n + 0.01 * (i % top), age = (u - litAt) / 0.08;
    if (x.f.empty?.includes(i)) { for (let d = 0; d < cw; d += 5) stroke(x, [[[px + d, py + cw], [px + Math.min(cw, d + 2), py + cw]]], DIM, 1, 0.8, 0); continue; }
    if (age < 0) { stroke(x, [rect(px, py, px + cw, py + cw)], DIM, 1, 0.8, 0); continue; }
    const isPick = landed && i === pickI, isScan = i === scanAt;
    const col = isPick ? A : isScan ? BLUE : age < 1 ? FLASH : INK, al = landed && !isPick ? 0.35 : age < 1 ? 1 : 0.8;
    stroke(x, [rect(px, py, px + cw, py + cw)], col, al, isPick || isScan ? 1.3 : 0.9, isPick ? 2.2 - landK : 1);
    if (isPick) fill(x, rect(px + 3, py + 3, px + cw - 3, py + cw - 3), A, 0.85);
    /* each finalist's line to the join */
    const lt = cl((u - 0.3 - city * 0.012) / 0.24);
    if (lt > 0) {
      const from: Pt = [px + cw, py + cw / 2], mid: Pt = [252, from[1]], line: Poly[] = [[from, mid, J]];
      if (isPick) stroke(x, line, A, 1, 1.4, 1.6); else if (isScan) stroke(x, line, BLUE, 0.9, 1.1); else drawOn(x, line, lt, INK, landed ? 0.1 : 0.28);
    }
  }
  const jk = cl((u - 0.5) / 0.12);
  if (jk > 0) { stroke(x, [arc(J[0], J[1], 7, 7, 0, Math.PI * 2 * jk, 20)], landed ? A : INK, 0.9, 1.1); }
  if (landed) { text(x, '1', J[0], J[1] + 22, 14, A, 1, 'center'); text(x, 'THE PICK', 302, 118, 7.5, A, 1, 'right'); }
}
function finalLissajous(x: X) {
  const u = act(x), cx = 160, cy = 84, A0 = 92, B0 = 56, n = x.f.codes.length * x.f.top, m = eio(cl((u - 0.15) / 0.6)), locked = u >= 0.82, A = acc(x);
  const curve = (i: number, ph: number): Poly => {
    const a0 = 1 + Math.floor(hash(x.cfg.seed, 90, i) * 5), b0 = 1 + Math.floor(hash(x.cfg.seed, 91, i) * 4), d0 = hash(x.cfg.seed, 92, i) * 6.28, s = 0.3 + hash(x.cfg.seed, 93, i);
    const a = a0 + (3 - a0) * m, b = b0 + (2 - b0) * m, d = d0 + ph * 6.28 * s * (1 - m) + (Math.PI / 2 - d0) * m, p: Poly = [];
    for (let k = 0; k <= 140; k++) { const t = (k / 140) * Math.PI * 2; p.push([cx + A0 * Math.sin(a * t + d), cy + B0 * Math.sin(b * t)]); }
    return p;
  };
  if (!locked) {
    for (let k = Math.min(x.cfg.trail, 6); k >= 0; k--) {
      const ph = x.ph - k * 0.004, polys: Poly[] = []; for (let i = 0; i < n; i++) polys.push(curve(i, ph));
      stroke(x, polys, k ? BLUE : INK, (k ? Math.pow(x.cfg.decay, k) * 0.25 : 0.32) * (1 - m * 0.4), 0.6, k ? 0 : 0.6);
    }
  }
  if (m > 0.6) stroke(x, [curve(0, x.ph)], locked ? A : INK, locked ? 1 : (m - 0.6) * 2, locked ? 1.3 : 1, locked ? 1.8 : 1);
  text(x, finN(x.f) + ' FINALISTS', 18, 22, 7.5, GREY);
  if (locked) text(x, 'ONE PICK', 302, 22, 7.5, A, 1, 'right');
  text(x, finN(x.f) + ' → 1', 302, 168, 8, locked ? A : GREY, 1, 'right');
}

/* ===== The global prize ===== */
const DRUM = ' $0123456789,';
function cashFlap(x: X) {
  const u = act(x), s = '$10,000', cw = 36, ch = 60, g = 4, x0 = (VW - (s.length * cw + (s.length - 1) * g)) / 2, y0 = 42, L = DRUM.length, A = acc(x);
  const lastAt = 0.14 + (s.length - 1) * 0.075, lk = cl((u - lastAt) / 0.18);
  [...s].forEach((t, i) => {
    const px = x0 + i * (cw + g), at = 0.14 + i * 0.075, ti = DRUM.indexOf(t), rate = 70, left = (at - u) * rate, flips = Math.max(0, Math.ceil(left));
    const shown = u < 0.04 ? ' ' : DRUM[(((ti - flips) % L) + L) % L];
    fill(x, rect(px, y0, px + cw, y0 + ch), FACE, 1);
    stroke(x, [rect(px, y0, px + cw, y0 + ch)], DIM, 1, 0.8, 0);
    const col = lk > 0 ? (lk < 1 ? A : INK) : INK;
    if (x.pen.kind === 'beam') { if (shown.trim()) { const sw = segText(shown, 0, 0, 18, 34).width; digits(x, segText(shown, px + (cw - sw) / 2, y0 + 13, 18, 34).polys, col, 1, 1.2); } }
    else text(x, shown, px + cw / 2, y0 + ch / 2 + 15, 42, col, 1, 'center');
    stroke(x, [[[px, y0 + ch / 2], [px + cw, y0 + ch / 2]]], '#000000', 0.9, 1.2, 0);
    if (flips > 0 && u >= 0.04) { const f = left - Math.floor(left); stroke(x, [[[px + 1, y0 + ch * f], [px + cw - 1, y0 + ch * f]]], FLASH, 0.5, 0.8); }
  });
  if (lk > 0 && lk < 1) stroke(x, [rect(x0 - 6, y0 - 6, x0 + s.length * (cw + g) + 2, y0 + ch + 6)], A, 1 - lk, 1, 2.4 * (1 - lk));
  text(x, '1 of ' + finN(x.f) + ' finalists', 18, 132, 8, INK, 0.9);
  timeOdometer(x, u);
}
function timeOdometer(x: X, u: number) { stroke(x, [[[18, 164], [18 + 284 * eo(cl(u / 0.7)), 164]]], acc(x), 0.8, 1.2); stroke(x, [[[18, 164], [302, 164]]], DIM, 0.6, 1, 0); }
function cashVector(x: X) {
  const u = act(x), s = segText('$10,000', 26, 46, 26, 54), t = eio(cl(u / 0.62)), sweep = cl((u - 0.68) / 0.22), done = u >= 0.92;
  const dollar = s.polys.slice(0, 6), rest = s.polys.slice(6);
  drawOn(x, [...dollar, ...rest], t, INK, 0.95);
  if (done) stroke(x, dollar, acc(x), 1, 1.2, 1.6);
  if (sweep > 0 && sweep < 1) { const sx = 18 + sweep * 290; x.pen.save(); x.pen.clipRect(sx - 14, 0, sx + 14, VH); stroke(x, s.polys, FLASH, 0.95, 1.4, 2); x.pen.restore(); }
  text(x, '1 of ' + finN(x.f) + ' finalists', 18, 132, 8, INK, 0.9);
  timeOdometer(x, u);
}
/* nixie tubes: each figure a lit cathode inside glass, the other cathodes faint behind it; they spin, then settle
   left to right. Orange here is light inside glass, the one place the colour rule lets orange in. */
function cashNixie(x: X) {
  const u = act(x), s = '$10000', n = s.length, tw = 38, th = 86, g = 8, x0 = (VW - (n * tw + (n - 1) * g)) / 2, y0 = 26;
  [...s].forEach((t, i) => {
    const px = x0 + i * (tw + g), cx = px + tw / 2, at = 0.22 + i * 0.09, settled = u >= at, on = u >= 0.04;
    const top = arc(cx, y0 + 12, tw / 2, 12, Math.PI, Math.PI * 2, 12);
    stroke(x, [[[px, y0 + th], ...top, [px + tw, y0 + th]], [[px - 3, y0 + th + 3], [px + tw + 3, y0 + th + 3]]], INK, 0.4, 0.8, 0.3);
    for (let k = 1; k < 6; k++) stroke(x, [[[px + 5, y0 + 10 + k * 12], [px + tw - 5, y0 + 10 + k * 12]]], INK, 0.06, 0.5, 0);
    const base = y0 + th / 2 + 17;
    if (on) text(x, '8', cx, base, 42, ORANGE, 0.08, 'center');
    const ch = settled ? t : '0123456789'[Math.floor(hash(x.cfg.seed, 900, i, Math.floor(u * 50)) * 10)];
    if (on) text(x, ch, cx, base, 42, ORANGE, 1, 'center');
  });
  if (u >= 0.22 + 2 * 0.09) dot(x, [x0 + 2 * (tw + g) - g / 2, y0 + th - 8], 1.2, ORANGE, 0.9);
  text(x, '1 of ' + finN(x.f) + ' finalists', 18, 142, 8, INK, 0.9);
  timeOdometer(x, u);
}

/* ===== The city prize ===== */
type V3 = [number, number, number];
function neoLaptop(x: X) {
  const u = act(x), open = eio(cl((u - 0.04) / 0.38)), th = open * (Math.PI * 0.6), power = cl((u - 0.46) / 0.14), yaw = -0.55 + 0.32 * Math.sin(x.ph * Math.PI * 2), pitch = 0.42;
  const P = ([px, py, pz]: V3): Pt => {
    const x1 = px * Math.cos(yaw) - pz * Math.sin(yaw), z1 = px * Math.sin(yaw) + pz * Math.cos(yaw);
    const y2 = py * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = py * Math.sin(pitch) + z1 * Math.cos(pitch), d = 5, fl = 215;
    return [168 + (fl * x1) / (z2 + d), 128 - (fl * y2) / (z2 + d)];
  };
  const W = 1, D = 0.7, T = 0.07, Lh = 1.3;
  const lid = (sx: number, s: number): V3 => [sx, T + s * Math.sin(th), -D + s * Math.cos(th)];
  const poly = (pts: V3[]) => pts.map(P);
  const base: Poly[] = [
    poly([[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D], [-W, 0, -D]]), poly([[-W, T, -D], [W, T, -D], [W, T, D], [-W, T, D], [-W, T, -D]]),
    poly([[-W, 0, D], [-W, T, D]]), poly([[W, 0, D], [W, T, D]]), poly([[W, 0, -D], [W, T, -D]]), poly([[-W, 0, -D], [-W, T, -D]]),
    poly([[-0.32, T, 0.28], [0.32, T, 0.28], [0.32, T, 0.6], [-0.32, T, 0.6], [-0.32, T, 0.28]]),
  ];
  for (let r = 0; r < 4; r++) base.push(poly([[-0.82, T, -0.56 + r * 0.17], [0.82, T, -0.56 + r * 0.17]]));
  stroke(x, base, INK, 0.8, 0.9);
  const lidO = [lid(-W, 0), lid(W, 0), lid(W, Lh), lid(-W, Lh), lid(-W, 0)].map(P), lidI = [lid(-W + 0.08, 0.08), lid(W - 0.08, 0.08), lid(W - 0.08, Lh - 0.08), lid(-W + 0.08, Lh - 0.08), lid(-W + 0.08, 0.08)].map(P);
  stroke(x, [lidO], INK, 0.95, 1.1); stroke(x, [lidI], INK, 0.5, 0.8);
  if (power > 0) {
    fill(x, lidI.slice(0, 4), BLUE, 0.16 * power);
    if (power < 1) { const s = Lh - 0.08 - power * (Lh - 0.16); stroke(x, [[P(lid(-W + 0.08, s)), P(lid(W - 0.08, s))]], FLASH, 1, 1.2, 1.6); }
    else {
      const codes = x.f.codes, i = Math.min(codes.length - 1, Math.floor(cl((u - 0.6) / 0.4) * codes.length)), ctr = P(lid(0, Lh / 2));
      text(x, codes[i], ctr[0], ctr[1] + 6, 17, INK, 1, 'center');
    }
  }
}
function neoTen(x: X) {
  const u = act(x), codes = x.f.codes, per = Math.ceil(codes.length / 2);
  codes.forEach((code, i) => {
    const col = i % per, row = Math.floor(i / per), cx = 18 + 28 + col * 56.8, by = 78 + row * 74, at = 0.04 + i * 0.065, o = eo(cl((u - at) / 0.12)), lit = u - at > 0.14;
    const lh = 34 * Math.sin(o * Math.PI * 0.5), lw = 21;
    stroke(x, [[[cx - 26, by], [cx + 26, by], [cx + 22, by - 5], [cx - 22, by - 5], [cx - 26, by]]], INK, 0.75, 0.9);
    if (lh > 0.5) {
      stroke(x, [rect(cx - lw, by - 5 - lh, cx + lw, by - 5)], lit ? INK : GREY, lit ? 0.95 : 0.7, 1);
      if (lit) { fill(x, rect(cx - lw + 2, by - 3 - lh, cx + lw - 2, by - 7), BLUE, 0.18); text(x, code, cx, by - 5 - lh / 2 + 3, 8, INK, 1, 'center'); }
    } else stroke(x, [[[cx - lw, by - 6], [cx + lw, by - 6]]], GREY, 0.8);
    const age = (u - at - 0.14) / 0.3; if (age > 0 && age < 1) { const [cc, al] = p7(x, age); dot(x, [cx + lw - 4, by - 9 - lh + 4], 1.6, cc, al); }
  });
}

/* ===== One tube plays the day: build, vote, final, with a picture-tube switch between ===== */
const SCENES: Record<string, Record<string, (x: X) => void>> = {
  build: { beam: buildBeam, boot: buildBoot }, vote: { trace: voteTrace, radar: voteRadar }, final: { thirty: finalThirty, lissajous: finalLissajous },
  cash: { flap: cashFlap, vector: cashVector, nixie: cashNixie }, neo: { laptop: neoLaptop, ten: neoTen, glass: neoLaptop, drawn: neoLaptop },
};
export const reelStep = (ph: number) => Math.min(2, Math.floor(ph * 3));
/* which step a scene is on at a phase (the reel and the directions play three; the rest have none) */
export function stepOf(scene: Scene, ph: number, cfg?: ScopeCfg, f?: Facts, mo?: Partial<LineMo>) {
  if (scene === 'day' && cfg?.dir === 'line' && f) { const S = lineScore(cfg, f, lineMo(mo)); return lineAct(S, ph * S.loop); }
  return scene === 'reel' ? reelStep(ph) : scene === 'day' ? dayStep(ph) : -1;
}
/* how many loops a scene's phase spans */
export const spanOf = (scene: Scene) => (scene === 'reel' || scene === 'day' ? 3 : 1);

export function drawScene(pen: Pen, scene: Scene, ph: number, cfg: ScopeCfg, f: Facts, boost = 1, from?: number, small?: boolean, press?: Press, mo?: Partial<LineMo>) {
  const frame = Math.floor(ph * cfg.loop * cfg.fps * spanOf(scene));
  const x: X = { pen, cfg, f, boost, frame, ph, from, small, press, mo };
  if (scene === 'day' && cfg.dir === 'line') { lineScene(x, ph); return; }
  if (scene === 'day') { const later: (() => void)[] = []; DIRS[cfg.dir as Dir]({ ...x, later }, ph * 3); for (const d of later) d(); return; }
  if (scene !== 'reel') { SCENES[scene][cfg[scene] as string](x); return; }
  const step = reelStep(ph), sub = ph * 3 - step, name = (['build', 'vote', 'final'] as const)[step];
  /* the switch: the picture collapses to a line and opens again on the next one */
  const edge = 0.035, s = sub < edge ? sub / edge : sub > 1 - edge ? (1 - sub) / edge : 1;
  pen.save();
  if (s < 1) { pen.translate(0, VH / 2); pen.scale(1, Math.max(0.02, eo(s))); pen.translate(0, -VH / 2); }
  SCENES[name][cfg[name] as string]({ ...x, boost: boost * (s < 1 ? 1 + (1 - s) * 2 : 1), ph: sub });
  pen.restore();
  if (s < 1) stroke({ ...x, ph: sub }, [[[0, VH / 2], [VW, VH / 2]]], FLASH, 1 - s, 1.2, 2);
}

/* the canvas renderer: one frame on a 2D canvas */
export function renderCanvas(c: CanvasRenderingContext2D, scene: Scene, ph: number, cfg: ScopeCfg, f: Facts, fo: Fonts, k: number, boost = 1, from?: number, small?: boolean, press?: Press, mo?: Partial<LineMo>) {
  drawScene(new CanvasPen(c, k, cfg.lw, cfg.glow, fo), scene, ph, cfg, f, boost, from, small, press, mo);
}

/* The beam renderer's frame: this phase, plus the afterglow, worked out from earlier phases (one frame apart, each
   fainter by the fade), never kept from earlier frames, so a still at any phase is the same picture (rule 8).
   Returns the beam pieces, the fills and the beam length of the frame itself (for the budget meter). */
export function beamFrame(scene: Scene, ph: number, cfg: ScopeCfg, f: Facts, boost = 1, from?: number, small?: boolean, press?: Press, mo?: Partial<LineMo>): { segs: Float32Array; tris: Float32Array; len: number; time: number; words: Word[] } {
  const pen = new BeamPen({ dwell: cfg.dwell, speed: cfg.speed, gain: 1, view: [VW, scene === 'day' ? viewH(cfg, small) : VH], words: cfg.letters === 'mono' });
  /* the morning line: its afterglow (if on) is spaced a thirtieth of a second, whatever the fps knob says (E1), and
     never reaches back across an act's start or a press */
  const line = scene === 'day' && cfg.dir === 'line', S = line ? lineScore(cfg, f, lineMo(mo), small) : null;
  const dt = S ? 1 / 30 / S.loop : 1 / (cfg.fps * cfg.loop * spanOf(scene));
  const after = S ? (cfg.afterglow === 'off' || press ? 0 : cfg.after) : cfg.after;
  let len = 0, time = 0;
  for (let j = after; j >= 0; j--) {
    pen.gain = j ? Math.pow(cfg.fade, j) * 0.6 : 1;
    pen.len = 0; pen.time = 0;
    /* no afterglow from before the start: a still at the top of the day never shows the end of it behind */
    if (j && ph - j * dt < 0) continue;
    const pj = (((ph - j * dt) % 1) + 1) % 1;
    /* after a jump the act before was never on screen: no afterglow from it */
    if (j && from !== undefined && (S ? lineAct(S, pj * S.loop) !== lineAct(S, ph * S.loop) : Math.floor(pj * 3) !== Math.floor(ph * 3))) continue;
    drawScene(pen, scene, pj, cfg, f, boost, from, small, press, mo);
    if (!j) { len = pen.len; time = pen.time; }
  }
  return { segs: new Float32Array(pen.segs), tris: new Float32Array(pen.tris), len, time, words: pen.words };
}
