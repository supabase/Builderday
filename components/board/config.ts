/* The board's numbers: the parts the day pages are made of (the header row, the announcement line, the split-flap
   rows, the segment countdown, the state chips, the change flash, the test cards, the boarding pass, the bug). Saved
   in saved/parts.config.json. Every look value is here, so no
   page hardcodes one. */

export type Face = 'wheel' | 'geist' | 'pixel';
export type AnnounceMode = 'flipper' | 'crawl' | 'rail';
export type FlapMode = 'char' | 'word';
export type ChangeMark = 'flash' | 'delta' | 'both';
export type Lit = 'ink' | 'blue';
export type CardPalette = 'wheel' | 'broadcast' | 'mono';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Sound = 'off' | 'steps';

export type PartsCfg = {
  /* the character grid: one unit in px; rows and cells are whole numbers of it */
  grid: number;
  /* the face for labels and numbers: the wheel's mono, Geist Mono, or Departure Mono (pixel, 11px grid) */
  face: Face;
  /* the announcement line */
  announce: AnnounceMode; dwell: number; crawl: number;
  /* split-flap: ms a flap takes, flaps passed on the way to a character, ms between positions, char or whole word */
  flipMs: number; flaps: number; stagger: number; flap: FlapMode;
  /* the board re-ranks on a tick, in seconds */
  tick: number;
  /* a change: lit for hold ms, fading over fade ms; shown as a flash, a delta, or both */
  hold: number; fade: number; mark: ChangeMark; lit: Lit;
  /* the segment countdown: digit height and gap, px; whether it shows seconds */
  segH: number; segGap: number; segSecs: number;
  /* the test cards: how many bars, which colours, and each city's kept seed */
  cardBars: number; cardPalette: CardPalette; cards: Record<string, number>;
  /* the bug: its corner and its type size */
  bugCorner: Corner; bugSize: number;
  /* sound: off, or a click for a step (a flip, a vote) */
  sound: Sound;
  /* the Fastext row: four keys along the bottom */
  fastext: number;
};

export const PARTS_DEF: PartsCfg = {
  grid: 8, face: 'wheel',
  announce: 'flipper', dwell: 6, crawl: 60,
  flipMs: 60, flaps: 3, stagger: 22, flap: 'char',
  tick: 30,
  hold: 500, fade: 1000, mark: 'flash', lit: 'ink',
  segH: 56, segGap: 6, segSecs: 1,
  cardBars: 7, cardPalette: 'wheel', cards: {},
  bugCorner: 'tr', bugSize: 12,
  sound: 'steps',
  fastext: 0,
};
/* [min, max, step]; the ends are tested in the lab */
export const PARTS_BOUNDS: Record<string, [number, number, number]> = {
  grid: [6, 10, 1], dwell: [3, 12, 0.5], crawl: [30, 120, 5],
  flipMs: [30, 140, 5], flaps: [0, 8, 1], stagger: [0, 60, 2],
  tick: [5, 120, 5],
  hold: [0, 1500, 50], fade: [200, 3000, 100],
  segH: [32, 120, 4], segGap: [2, 16, 1],
  cardBars: [5, 9, 1],
  bugSize: [11, 16, 1],
};
export const PARTS_CHOICES: Record<string, string[]> = {
  face: ['wheel', 'geist', 'pixel'], announce: ['flipper', 'crawl', 'rail'], flap: ['char', 'word'], mark: ['flash', 'delta', 'both'], lit: ['ink', 'blue'],
  cardPalette: ['wheel', 'broadcast', 'mono'], bugCorner: ['tl', 'tr', 'bl', 'br'], sound: ['off', 'steps'],
};
const TOGGLES = ['segSecs', 'fastext'];

export function clampParts(c: Partial<PartsCfg> | Record<string, unknown>): PartsCfg {
  const o = { ...PARTS_DEF } as Record<string, unknown>, src = (c || {}) as Record<string, unknown>;
  for (const k of Object.keys(PARTS_DEF)) {
    const v = src[k], b = PARTS_BOUNDS[k], ch = PARTS_CHOICES[k];
    if (v === undefined) continue;
    if (ch) { if (ch.indexOf(String(v)) >= 0) o[k] = v; continue; }
    if (TOGGLES.indexOf(k) >= 0) { o[k] = v ? 1 : 0; continue; }
    if (k === 'cards') { if (v && typeof v === 'object' && !Array.isArray(v)) { const m: Record<string, number> = {}; Object.entries(v as Record<string, unknown>).forEach(([id, s]) => { if (typeof s === 'number' && isFinite(s)) m[id] = Math.round(s); }); o.cards = m; } continue; }
    if (typeof v === 'number' && isFinite(v) && b) o[k] = Math.min(b[1], Math.max(b[0], v));
  }
  return o as PartsCfg;
}

/* the faces, as stacks; the pixel face is for labels and numbers only, at 11px or 22px, where its pixels land whole */
export const FACE: Record<Face, string> = {
  wheel: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
  geist: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
  pixel: '"Departure Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

/* the values as custom properties, for the element that holds the parts */
export function partsVars(c: PartsCfg): Record<string, string> {
  return {
    '--bd-u': c.grid + 'px',
    '--bd-face': FACE[c.face],
    '--bd-label': c.face === 'pixel' ? '11px' : '12px',
    '--bd-num': c.face === 'pixel' ? '11px' : '13px',
    '--bd-hold': c.hold + 'ms', '--bd-fade': c.fade + 'ms',
    '--bd-lit': c.lit === 'blue' ? 'rgb(61 61 255 / 0.42)' : 'rgb(244 244 242 / 0.2)',
    '--bd-flip': c.flipMs + 'ms',
    '--bd-crawl': String(c.crawl),
    '--bd-seg-h': c.segH + 'px', '--bd-seg-gap': c.segGap + 'px',
    '--bd-bug': c.bugSize + 'px',
  };
}
