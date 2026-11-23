/* The stage's look: the direction, the wall's screen, its sizes and every stage-only timing. Tuned at /lab/stage and
   saved to saved/stage.config.json; the wall and the remote read the same file. Durations that the whole site shares
   (a press, a slide, a flash) stay in saved/motion.config.json; these are the ones only a wall needs, because a wall is
   read from the back of a room and its moves travel further than a page's. Pure. */

export type StageDir = 'tube' | 'board' | 'plain';
export const STAGE_DIRS: [StageDir, string][] = [['tube', 'Tube'], ['board', 'Board'], ['plain', 'Plain']];

export type StageCfg = {
  dir: StageDir;
  /* the wall's screen: line darkness and pitch (px at 1080), the red and blue step on type (px at 1080), grain */
  lines: number; pitch: number; fringe: number; grain: number;
  /* the safe margin on every side, as a share of the wall */
  safe: number;
  /* the second ink, as OKLCH lightness on the wall's ground (7:1 or better from 0.72 up) */
  ink2: number;
  /* the beam on the wall: its spot (px at 1080) and how bright a line is */
  beam: number; bright: number;
  /* stage-only timings, ms: a step landing, a beam line drawing on, the seven folding into one, the line from
     Prototype to Petabyte, a row overtaking another, the tombola's spin */
  enterMs: number; drawMs: number; foldMs: number; lineMs: number; glideMs: number; spinMs: number;
  /* the ranking re-sorts on a board tick, seconds; the talk timer of the top 3, minutes */
  tick: number; talkMin: number;
  /* how many entries arriving show on Building, and how many rows the ranking has */
  arrivals: number; rows: number;
  /* the tombola: a click per name (a step you can feel); off by default, a room has its own sound */
  sound: number;
};

export const STAGE_DEF: StageCfg = {
  dir: 'tube',
  lines: 0.26, pitch: 3, fringe: 1.6, grain: 0.035,
  safe: 0.05, ink2: 0.76,
  beam: 1.7, bright: 1,
  enterMs: 420, drawMs: 640, foldMs: 1100, lineMs: 1400, glideMs: 700, spinMs: 15000,
  tick: 10, talkMin: 2,
  arrivals: 5, rows: 10,
  sound: 0,
};

export const STAGE_BOUNDS: Record<string, [number, number, number]> = {
  lines: [0, 0.5, 0.01], pitch: [2, 6, 1], fringe: [0, 3, 0.1], grain: [0, 0.1, 0.005],
  safe: [0.03, 0.08, 0.005], ink2: [0.7, 0.86, 0.01],
  beam: [0.6, 4, 0.1], bright: [0.3, 2, 0.05],
  enterMs: [0, 900, 10], drawMs: [0, 1600, 20], foldMs: [0, 2400, 20], lineMs: [0, 3000, 20], glideMs: [0, 1400, 20], spinMs: [5000, 25000, 500],
  tick: [2, 60, 1], talkMin: [1, 5, 0.5],
  arrivals: [3, 8, 1], rows: [8, 12, 1],
};
const TOGGLES = ['sound'];

export function clampStage(c: Partial<StageCfg> | Record<string, unknown> | null | undefined): StageCfg {
  const o = { ...STAGE_DEF } as Record<string, unknown>, src = (c || {}) as Record<string, unknown>;
  for (const k of Object.keys(STAGE_DEF)) {
    const v = src[k];
    if (v === undefined) continue;
    if (k === 'dir') { if (STAGE_DIRS.some(([d]) => d === v)) o.dir = v; continue; }
    if (TOGGLES.includes(k)) { o[k] = v ? 1 : 0; continue; }
    const b = STAGE_BOUNDS[k], n = Number(v);
    if (b && Number.isFinite(n)) o[k] = Math.min(b[1], Math.max(b[0], n));
  }
  for (const k of ['pitch', 'tick', 'arrivals', 'rows']) o[k] = Math.round(o[k] as number);
  return o as StageCfg;
}

/* the wall's custom properties. Under reduced motion every stage timing is 0 (the stylesheet says so too), so each
   step lands without moving. */
export function stageVars(c: StageCfg): Record<string, string> {
  return {
    '--st-lines': String(c.lines), '--st-pitch': String(c.pitch), '--st-fringe': String(c.fringe), '--st-grain': String(c.grain),
    '--st-safe': String(c.safe), '--st-ink2': `oklch(${c.ink2} 0.004 100)`,
    '--st-enter': c.enterMs + 'ms', '--st-draw': c.drawMs + 'ms', '--st-fold': c.foldMs + 'ms', '--st-line': c.lineMs + 'ms', '--st-glide': c.glideMs + 'ms',
  } as Record<string, string>;
}

/* the reduced-motion question, asked once where it is needed (the drawings and the spin read it each frame) */
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
