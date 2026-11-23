/* The live devices of the day pages, in the text globe's language. Each is a pure function of its input and its
   knobs, so the parts lab, the home and the city page draw the same thing.
   - D1 change is a glyph: ▲ ▼ = against the previous reading;
   - D2 a value has a fixed column: counts padded to their width, the placeholder the same width;
   - D4 a row that moved keeps a trail that decays | : . blank;
   - D5 the wire is typed, a character at a time;
   - D6 quantity is a hatch: a bar in the land's ::| with a lighter remainder;
   - the marks are states, and the start line crosses the flat world with the real clock. */

export type BarMode = 'hatch' | 'blocks' | 'none';
export type AirParts = {
  /* the vote bar: cells across, votes per cell (0: scaled to the leader) */
  barCells: number; barScale: number; bar: BarMode;
  /* the wire: characters a second, and the hold on a finished line, s */
  wireRate: number; wireHold: number;
  /* where the wire sits: in the header beside the mark (a strip under the bar on a narrow screen), always a strip
     under the bar, or on the page as a box; and its widest line in the header, in characters */
  wireAt: 'header' | 'strip' | 'page'; wireCh: number;
  /* the trail after a row moves, in ticks; the print rate of the final and the ranking (characters a second) */
  trail: number; printRate: number;
  /* the start line: its local hour, its character and its ink (0 to 1) */
  lineHour: number; lineChar: string; lineInk: number;
  /* the mark ink of a city not live, 0 to 1 */
  markDim: number;
};
export const AIR_DEF: AirParts = { barCells: 16, barScale: 0, bar: 'hatch', wireRate: 42, wireHold: 4, wireAt: 'header', wireCh: 64, trail: 1, printRate: 900, lineHour: 18, lineChar: '|', lineInk: 0.7, markDim: 0.55 };
export const AIR_BOUNDS: Record<string, [number, number, number]> = {
  barCells: [6, 32, 1], barScale: [0, 20, 1], wireRate: [12, 120, 1], wireHold: [1, 12, 0.5], wireCh: [32, 96, 2], trail: [0, 3, 1], printRate: [200, 3000, 50], lineHour: [0, 23, 1], lineInk: [0.2, 1, 0.05], markDim: [0.3, 1, 0.05],
};
export const AIR_CHOICES: Record<string, string[]> = { bar: ['hatch', 'blocks', 'none'], lineChar: ['|', ':', '¦'], wireAt: ['header', 'strip', 'page'] };
export function clampAir(s: Partial<AirParts> | undefined): AirParts {
  const o = { ...AIR_DEF, ...(s ?? {}) } as AirParts;
  for (const [k, [lo, hi]] of Object.entries(AIR_BOUNDS)) { const v = Number((o as Record<string, unknown>)[k]); (o as Record<string, unknown>)[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (AIR_DEF as Record<string, unknown>)[k]; }
  if (!AIR_CHOICES.bar.includes(o.bar)) o.bar = AIR_DEF.bar;
  if (!AIR_CHOICES.lineChar.includes(o.lineChar)) o.lineChar = AIR_DEF.lineChar;
  if (!AIR_CHOICES.wireAt.includes(o.wireAt)) o.wireAt = AIR_DEF.wireAt;
  return o;
}

/* ---------- D6: the bar ---------- */
/* on: the cells for the votes; off: the remainder. Hatch puts | where the column is a multiple of 3, as the land does.
   Blocks: eighths, the last cell partial. dim: the bar as it stood when the counts were hidden, in : and . */
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
export function bar(v: number, scale: number, cells: number, mode: BarMode, dim = false): { on: string; off: string } {
  if (mode === 'none' || cells <= 0) return { on: '', off: '' };
  const per = scale > 0 ? scale : 1, exact = Math.max(0, Math.min(cells, v / per)), n = Math.floor(exact);
  if (dim) {
    const on = Array.from({ length: Math.max(n, v > 0 ? 1 : 0) }, (_, c) => (c % 2 === 0 ? ':' : '.')).join('');
    return { on, off: ' '.repeat(cells - on.length) };
  }
  if (mode === 'blocks') {
    const part = EIGHTHS[Math.floor((exact - n) * 8)] ?? '', on = '█'.repeat(n) + part;
    return { on, off: ' '.repeat(Math.max(0, cells - n - (part ? 1 : 0))) };
  }
  const on = Array.from({ length: Math.max(n, v > 0 ? 1 : 0) }, (_, c) => (c % 3 === 0 ? '|' : ':')).join('');
  return { on, off: '.'.repeat(Math.max(0, cells - on.length)) };
}
/* votes a cell: the knob, or the leader's count spread over the cells (rounded up, so first place fits) */
export function barScaleFor(knob: number, top: number, cells: number): number { return knob > 0 ? knob : Math.max(1, Math.ceil(top / cells)); }

/* ---------- D1: the change glyph ---------- */
export type Change = { glyph: '▲' | '▼' | '='; n: number; text: string; said: string };
export function change(now: number, before: number | null | undefined): Change {
  if (before == null) return { glyph: '=', n: 0, text: '=', said: 'no change' };
  const d = now - before;
  if (d > 0) return { glyph: '▲', n: d, text: '▲' + d, said: 'up ' + d };
  if (d < 0) return { glyph: '▼', n: -d, text: '▼' + -d, said: 'down ' + -d };
  return { glyph: '=', n: 0, text: '=', said: 'no change' };
}

/* ---------- D2: fixed width ---------- */
export const pad = (s: string | number, w: number) => String(s).padStart(w, ' ');
/* the placeholder while counts are hidden: never blank, never a number; the column's width */
export const HIDDEN_MARK = '··';
export const hiddenCell = (w: number) => pad(HIDDEN_MARK, w);

/* ---------- D4: the trail ---------- */
/* the character a row leaves in the places it passed, after `age` ticks of `life` */
export function trailChar(age: number, life: number): string {
  if (life <= 0 || age >= life) return '';
  const f = age / life;
  return f < 1 / 3 ? '|' : f < 2 / 3 ? ':' : '.';
}

/* ---------- the marks: a city's state as a character ---------- */
export type MarkState = 'next' | 'build' | 'vote' | 'done' | 'final' | 'hidden';
/* + not open yet, [+] building, [:] last votes, [.] closed with nothing in, [3] finalists in; while its counts are
   hidden a city keeps its bracket with a dot in it */
export const MARK: Record<MarkState, string> = { next: '+', build: '[+]', vote: '[:]', done: '[.]', final: '[3]', hidden: '[·]' };
export const MARK_WORD: Record<MarkState, string> = { next: 'Not open yet', build: 'Building', vote: 'Last votes', done: 'Closed', final: 'Finalists in', hidden: 'Votes hidden' };
export function markOf(state: 'next' | 'build' | 'vote' | 'done', entries: number, hidden = false): MarkState {
  if (state === 'done') return entries > 0 ? 'final' : 'done';
  if (hidden && (state === 'build' || state === 'vote')) return 'hidden';
  return state;
}

/* ---------- the start line ---------- */
/* the longitude where it is `hour`:00 local (mean solar time) at UTC minute `m` of the day; it moves west, 15° an hour */
export function lineLon(minuteUTC: number, hour: number): number {
  const h = (((minuteUTC / 60) % 24) + 24) % 24, lon = (hour - h) * 15;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
/* its column on a map of `cols` columns from -180 */
export const lineCol = (lon: number, cols: number) => Math.min(cols - 1, Math.max(0, Math.floor(((lon + 180) / 360) * cols)));

/* ---------- D5: the typed line ---------- */
/* how much of `text` is printed `ms` after it started, at `rate` characters a second */
export const typedAt = (text: string, ms: number, rate: number) => text.slice(0, Math.max(0, Math.floor((ms / 1000) * rate)));
