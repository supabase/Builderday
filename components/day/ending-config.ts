/* The ending's config: tuned at /lab/ending, saved in saved/ending.config.json, read by the
   preview page. The modes' first values in END_CHOICES are listed plain-first only where the plan names a plain one;
   END_DEF holds the plan's picks and END_PLAIN today's ending, one press apart in the lab. */

export type EndEnd = 'flat' | 'ident' | 'cities' | 'board';
export type EndOpen = 'none' | 'print' | 'unroll';
export type EndMark = 'none' | 'small' | 'big';
export type EndSign = 'line' | 'telex';
export type EndLight = 'none' | 'morning';

export type EndCfg = {
  /* flat: the world opened flat; ident: the text globe as a test card's circle, the cells round it; cities: the names
     at display size; board: today's end board */
  end: EndEnd;
  /* how the map comes, once, the first time it is in view */
  open: EndOpen;
  /* the mark: none, small (beside the name in the imprint line), big (today's, across the top) */
  mark: EndMark;
  /* line: the last line and the imprint; telex: also the teleprinter's start and end marks round the block */
  signoff: EndSign;
  /* the night side's thinner hatch on the map, for now */
  light: EndLight;
  /* the map: its rows, and the latitudes it is cut at (north, south) */
  rows: number; north: number; south: number;
  /* the cells' height (px), how much wider the Register cell is than one other cell, the codes' size in cells */
  cell: number; reg: number; tag: number;
  /* the print: its length (ms), and the seed of its small irregularities */
  rate: number; seed: number;
  /* the imprint line on or off */
  imprint: number;
};

export const END_DEF: EndCfg = {
  end: 'flat', open: 'print', mark: 'small', signoff: 'line', light: 'none',
  rows: 16, north: 66, south: -50, cell: 64, reg: 2, tag: 1, rate: 600, seed: 7, imprint: 1,
};
/* today's ending: the end board, nothing printed, the big mark */
export const END_PLAIN: Pick<EndCfg, 'end' | 'open' | 'mark' | 'signoff' | 'light'> = { end: 'board', open: 'none', mark: 'big', signoff: 'line', light: 'none' };
export const END_MODES = Object.keys(END_PLAIN) as (keyof typeof END_PLAIN)[];

export const END_CHOICES: Record<string, string[]> = {
  end: ['flat', 'ident', 'cities', 'board'], open: ['none', 'print', 'unroll'], mark: ['none', 'small', 'big'], signoff: ['line', 'telex'], light: ['none', 'morning'],
};
/* [min, max, step]; every value in between was looked at in the lab */
export const END_BOUNDS: Record<string, [number, number, number]> = {
  rows: [11, 24, 1], north: [50, 80, 1], south: [-66, -30, 1], cell: [48, 96, 2], reg: [1, 3, 0.25], tag: [0.8, 1.6, 0.05], rate: [200, 700, 20], seed: [1, 9999, 1], imprint: [0, 1, 1],
};
export const END_LABELS: Record<string, string> = {
  'end:flat': 'The world opened flat', 'end:ident': 'Test card', 'end:cities': 'City names', 'end:board': 'End board (today)',
  'open:none': 'Simply there', 'open:print': 'Prints once', 'open:unroll': 'The globe unrolls',
  'mark:none': 'None', 'mark:small': 'Small, in the imprint', 'mark:big': 'Big (today)',
  'signoff:line': 'Last line and imprint', 'signoff:telex': 'Telex (ZCZC … NNNN)',
  'light:none': 'None', 'light:morning': 'Night side thinner',
};

export function clampEnd(v: Partial<EndCfg> | Record<string, unknown> | null | undefined): EndCfg {
  const o = { ...END_DEF } as Record<string, unknown>, src = (v ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(END_DEF)) {
    const x = src[k];
    if (END_CHOICES[k]) { if (typeof x === 'string' && END_CHOICES[k].includes(x)) o[k] = x; continue; }
    const b = END_BOUNDS[k], n = Number(x);
    if (x !== undefined && x !== null && x !== '' && isFinite(n)) o[k] = Math.min(b[1], Math.max(b[0], Math.round(n / b[2]) * b[2]));
  }
  /* a crop always keeps the equator and a few rows on each side of it */
  const c = o as EndCfg;
  c.rows = Math.round(c.rows); c.seed = Math.round(c.seed); c.reg = +c.reg.toFixed(2); c.tag = +c.tag.toFixed(2);
  return c;
}
