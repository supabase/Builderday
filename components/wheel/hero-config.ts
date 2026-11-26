/* The first screen's left side in the column layout: the page's words, then the city's row on the active name's line
   (its time, its state and the Luma box whose name is the wheel's own). Every taste value is here, tuned at
   /lab/hero and saved in saved/hero.config.json, which the preview reads. Pure.

   Modes (what the row is):
   - row: three boxes side by side, time, state, then "Register for <city>" (the first cut of this layout).
   - ticket: one object, a stub and a body cut apart by a perforation. The stub carries the city's code, its time and
     its state; the body is the Luma link. The whole ticket is the press.
   - spoke: the Luma box alone on the line, the facts set small above it as one line of type (the wheel's own dotted
     line runs on from the box's end to the globe). */

export const HERO_MODES = ['row', 'ticket', 'spoke'] as const;
export type HeroMode = (typeof HERO_MODES)[number];

export type HeroCfg = {
  mode: HeroMode;
  /* the page's words: the headline and host, then the date (stack: two groups; tight: the date under the host line) */
  words: 'stack' | 'tight';
  /* the date line says the weekday; the RSVP line (the state cell already says it) */
  weekday: boolean; rsvp: boolean;
  /* how the city's name gets into the box: fade (the wheel's name fades in as it comes to rest), roll (the new name
     comes round the turn's way; a fast spin finishes its roll, then makes one quick roll to the latest), none */
  hand: 'fade' | 'roll' | 'none';
  /* the box's width: hug (it follows the name, easing between widths) or fixed (as wide as the longest name) */
  width: 'hug' | 'fixed';
  /* how the row meets the wheel: row (the wheel's names come in to start where the box's name starts) or wheel (the
     names stay where the wheel puts them: the ticket's body stretches to them, the spoke's box moves out to them) */
  reach: 'row' | 'wheel';
  /* the row when there is no room for the words beside the wheel (a phone, a tall tablet; the words then sit under the
     header): line (the row stays on the active name's line and takes the wheel's name, as on a wide screen, with a
     slimmer stub) or foot (docked at the foot of the first screen, apart from the wheel) */
  dock: 'line' | 'foot';
  /* line: the slim stub's width and the box's name size (the wheel's names take it), px */
  stubPhone: number; namePhone: number;
  /* where the screen's lines and colour fringe fall in the hero (the screen kit marks all big type): wheel (only the
     wheel, which is the screen; the words and the ticket are print), words (the headline too), all (the ticket too) */
  screen: 'wheel' | 'words' | 'all';
  /* the state: a filled cell (block) or ink on the ground (ink) */
  state: 'block' | 'ink';
  /* the time: with the zone (UTC-5) or the word "local" */
  zone: 'utc' | 'local';
  /* every size is the wheel's name size times one of these (the box's words are the name size itself), so the side
     grows and shrinks with the wheel: the headline, the body, the row's height, the stub's width, the gap between the
     headline group and the date, and from the words to the row */
  titleK: number; bodyK: number; cellK: number; stubK: number; gapK: number; liftK: number;
  /* the room: the smallest name size the row may come down to before it docks at the foot of the screen (px), and how
     far over the wheel's own name size it may grow to fill a wide screen (past that the names come out to the row) */
  min: number; grow: number;
  /* ...and never past this share of the window's height, so on a short laptop the row stays a step under the headline */
  tall: number;
  /* the box's width easing, ms (hug) */
  widthMs: number;
  /* ticket: the perforation's dot gap, the notches' radius, px */
  perf: number; notch: number;
  /* the stub's serial */
  seed: number;
};

export const HERO_DEF: HeroCfg = {
  mode: 'ticket', words: 'tight', weekday: true, rsvp: false, hand: 'roll', width: 'fixed', reach: 'row', dock: 'foot', screen: 'wheel', state: 'ink', zone: 'local',
  titleK: 1.55, bodyK: 0.5, cellK: 2.1, stubK: 5, gapK: 0.6, liftK: 1.2,
  min: 24, grow: 1.15, tall: 0.05,
  stubPhone: 100, namePhone: 20,
  widthMs: 220,
  perf: 6, notch: 10,
  seed: 4217,
};

export const HERO_BOUNDS: Record<string, [number, number, number]> = {
  titleK: [1, 2, 0.05], bodyK: [0.35, 0.7, 0.01], cellK: [1.6, 2.8, 0.05], stubK: [4, 7, 0.1], gapK: [0.2, 1.4, 0.05], liftK: [0.5, 2.2, 0.05],
  min: [18, 34, 1], grow: [1, 1.4, 0.01], tall: [0.04, 0.08, 0.002],
  stubPhone: [80, 140, 1], namePhone: [15, 26, 0.5],
  widthMs: [0, 400, 10],
  perf: [4, 12, 1], notch: [0, 16, 1],
  seed: [1, 99999, 1],
};

export const HERO_CHOICES: Record<string, readonly string[]> = {
  mode: HERO_MODES, words: ['stack', 'tight'], hand: ['fade', 'roll', 'none'], width: ['hug', 'fixed'], reach: ['row', 'wheel'], dock: ['line', 'foot'], screen: ['wheel', 'words', 'all'], state: ['block', 'ink'], zone: ['utc', 'local'],
};

export function clampHero(v: Partial<HeroCfg> | null | undefined): HeroCfg {
  const c = { ...HERO_DEF, ...(v || {}) } as Record<string, unknown>;
  for (const [k, [lo, hi]] of Object.entries(HERO_BOUNDS)) { const n = Number(c[k]); c[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : HERO_DEF[k as keyof HeroCfg]; }
  for (const [k, list] of Object.entries(HERO_CHOICES)) if (!list.includes(String(c[k]))) c[k] = HERO_DEF[k as keyof HeroCfg];
  for (const k of ['weekday', 'rsvp'] as const) c[k] = typeof c[k] === 'boolean' ? c[k] : c[k] === 0 || c[k] === 1 ? !!c[k] : HERO_DEF[k];
  c.seed = Math.round(c.seed as number);
  for (const k of Object.keys(c)) if (!(k in HERO_DEF)) delete c[k];
  return c as HeroCfg;
}

/* mulberry32: the stub's serial comes from the seed and the city, so a saved look prints the same ticket again */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* the stub's serial: four digits, the ticket's number for this city */
export function serialOf(seed: number, city: string): string {
  return String(Math.floor(rng(seed ^ hash(city))() * 9000) + 1000);
}

/* the body's hatch: the room a stretched ticket's body has before its words, printed in the text globe's characters
   (:, | and a gap now and then), from the seed and the city */
export function hatchOf(seed: number, city: string, n = 96): string {
  const r = rng(seed * 31 + hash(city));
  let s = '';
  for (let i = 0; i < n; i++) { const x = r(); s += x < 0.55 ? ':' : x < 0.85 ? '|' : ' '; }
  return s;
}
