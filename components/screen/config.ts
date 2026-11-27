/* The screen kit's numbers and saved to saved/screen.config.json. Depth is the open question
   of the round: which text sits under the screen lines.
   - big: the lines, the grain and the dark corners are on the ground; only big type (city names, headlines) is under
     the lines too, with the red and blue edges. Rows, counts, times and buttons stay crisp, over the lines.
   - all: every piece of text sits under the lines with the coloured edges.
   - none: no lines on our pages; they borrow the cells, the mark and the globe on a clean ground. */

export type Depth = 'big' | 'all' | 'none';
export type Ground = 'wheel' | 'site';
export type ScreenCfg = {
  depth: Depth; ground: Ground;
  lineAlpha: number; linePitch: number; fringe: number; fringeAlpha: number;
  grain: number; grainCell: number; corners: number; bigFrom: number; globe: number; lift: number;
};
/* lift: the site's faint ink (axis labels, the dash for no value) measures 5.4:1 on the wheel's ground; lifted, it
   measures 7:1 or better on both grounds */

export const SCREEN_DEF: ScreenCfg = {
  depth: 'big', ground: 'wheel',
  lineAlpha: 0.34, linePitch: 3, fringe: 1.2, fringeAlpha: 0.5,
  grain: 0.045, grainCell: 1.5, corners: 0.45, bigFrom: 28, globe: 1, lift: 1,
};
export const SCREEN_BOUNDS: Record<string, [number, number, number]> = {
  lineAlpha: [0, 0.6, 0.01], linePitch: [2, 6, 1], fringe: [0, 3, 0.1], fringeAlpha: [0, 1, 0.05],
  grain: [0, 0.12, 0.005], grainCell: [1, 4, 0.5], corners: [0, 0.9, 0.01], bigFrom: [18, 64, 1],
};
export const SCREEN_CHOICES: Record<string, string[]> = { depth: ['big', 'all', 'none'], ground: ['wheel', 'site'] };

export function clampScreen(c: Partial<ScreenCfg> | Record<string, unknown>): ScreenCfg {
  const o = { ...SCREEN_DEF } as Record<string, unknown>, src = c as Record<string, unknown>;
  for (const k of Object.keys(SCREEN_DEF)) {
    const v = src[k], b = SCREEN_BOUNDS[k];
    if (SCREEN_CHOICES[k]) { if (SCREEN_CHOICES[k].indexOf(String(v)) >= 0) o[k] = v; continue; }
    if (k === 'globe' || k === 'lift') { if (v !== undefined) o[k] = v ? 1 : 0; continue; }
    if (typeof v === 'number' && isFinite(v)) o[k] = b ? Math.min(b[1], Math.max(b[0], v)) : v;
  }
  return o as ScreenCfg;
}

/* the values as custom properties, for <html> */
export function screenVars(c: ScreenCfg): Record<string, string> {
  const a = c.fringeAlpha;
  return {
    '--sk-line': String(c.lineAlpha), '--sk-pitch': c.linePitch + 'px', '--sk-corners': String(c.corners),
    '--sk-fringe': `${c.fringe}px 0 rgb(255 70 70 / ${a}), ${-c.fringe}px 0 rgb(70 130 255 / ${a})`,
    '--sk-grain-size': 64 * c.grainCell + 'px',
  };
}
