/* How it works as a walk through one city's 90 minutes: the look, tuned at /lab/walk and saved in
   saved/walk.config.json. Modes are the three ways the stage draws the race; every number is a knob with tested
   bounds. Pure. */

export const WALK_MODES = ['race', 'tower', 'ledger'] as const;
export const WALK_SIDES = ['left', 'right'] as const;
export type WalkMode = (typeof WALK_MODES)[number];

export type WalkCfg = {
  mode: WalkMode;
  /* the sample race */
  seed: number; projects: number; youArrive: number; youPlace: number; judges: number;
  /* scroll: a step's height (× the window's height, set in px), how far into a step the minute reaches its end, and
     the reading line where a step starts on a wide screen (× the window's height; on a phone a step starts when its
     card lands) */
  stepH: number; scrubTo: number; line: number;
  /* motion: a step's own change (rows sliding, the cut locking, the final), and the reveal at 60 */
  beatMs: number; revealMs: number;
  /* layout */
  side: (typeof WALK_SIDES)[number]; stageShare: number; rows: number; rowsPhone: number; chartH: number; chartHPhone: number;
};

export const WALK_DEFAULT: WalkCfg = {
  mode: 'race', seed: 4201, projects: 9, youArrive: 34, youPlace: 2, judges: 3,
  stepH: 0.9, scrubTo: 0.6, line: 0.5,
  beatMs: 240, revealMs: 1400,
  side: 'left', stageShare: 58, rows: 5, rowsPhone: 3, chartH: 230, chartHPhone: 150,
};

/* [min, max, step] */
export const WALK_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], projects: [5, 14, 1], youArrive: [5, 44, 1], youPlace: [1, 6, 1], judges: [1, 6, 1],
  stepH: [0.6, 1.4, 0.05], scrubTo: [0.3, 1, 0.05], line: [0.35, 0.7, 0.01],
  beatMs: [120, 300, 10], revealMs: [600, 2600, 50],
  stageShare: [48, 66, 1], rows: [3, 8, 1], rowsPhone: [3, 5, 1], chartH: [160, 320, 10], chartHPhone: [110, 220, 10],
};

export function clampWalk(c: Partial<WalkCfg> | undefined): WalkCfg {
  const o = { ...WALK_DEFAULT, ...(c || {}) } as WalkCfg & Record<string, unknown>;
  for (const k of Object.keys(WALK_BOUNDS)) {
    const [lo, hi, st] = WALK_BOUNDS[k], v = Number(o[k]);
    o[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v / st) * st)) : (WALK_DEFAULT as Record<string, unknown>)[k];
    if (st < 1) o[k] = Number((o[k] as number).toFixed(2));
  }
  if (!WALK_MODES.includes(o.mode)) o.mode = WALK_DEFAULT.mode;
  if (!WALK_SIDES.includes(o.side)) o.side = WALK_DEFAULT.side;
  for (const k of Object.keys(o)) if (!(k in WALK_DEFAULT)) delete o[k];
  o.youPlace = Math.min(o.youPlace, o.projects);
  return o;
}
