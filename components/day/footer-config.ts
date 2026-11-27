/* footer-config.ts: the footer's look as one config (footer.tsx draws it), saved in
   saved/footer.config.json. Directions, switches and knobs, with the bounds each knob was tried at. Pure. */

export type FootDir = 'horizon' | 'index' | 'closedown' | 'endboard';
export type FootCfg = {
  dir: FootDir; phone: 'index' | 'same';
  /* switches: the white dot, the last line, local times, the tail leader, turning the globe by hand, the credit */
  dot: number; last: number; clocks: number; tail: number; spin: number; credit: number;
  /* knobs: the globe's width (px), how much of it rises (share of its width), the names' distance from it (px),
     how open the ring is (the least angle between two neighbours is a twentieth of it, in degrees; names otherwise sit as close as their boxes allow), how much the names lean with the arc (0 upright, 1 along it), the names' size,
     the cells' height */
  size: number; rise: number; gap: number; spread: number; tilt: number; nameSize: number; cellH: number;
};
export const FOOT_DEF: FootCfg = { dir: 'horizon', phone: 'index', dot: 1, last: 1, clocks: 1, tail: 1, spin: 0, credit: 0, size: 560, rise: 0.5, gap: 96, spread: 150, tilt: 0.45, nameSize: 24, cellH: 48 };
export const FOOT_BOUNDS: Record<string, [number, number, number]> = {
  size: [320, 720, 10], rise: [0.3, 0.6, 0.02], gap: [80, 160, 2], spread: [110, 170, 2], tilt: [0, 1, 0.05], nameSize: [18, 36, 1], cellH: [44, 64, 2],
};
export const FOOT_CHOICES: Record<string, string[]> = { dir: ['horizon', 'index', 'closedown', 'endboard'], phone: ['index', 'same'] };
export const FOOT_LABELS: Record<string, string> = { horizon: 'The horizon', index: 'The index', closedown: 'Closedown', endboard: 'The end board and the mark', same: 'The same on a phone' };
const TOGGLES = ['dot', 'last', 'clocks', 'tail', 'spin', 'credit'] as const;
export function clampFoot(c: Partial<FootCfg>): FootCfg {
  const o = { ...FOOT_DEF, ...c } as FootCfg;
  if (!FOOT_CHOICES.dir.includes(o.dir)) o.dir = FOOT_DEF.dir;
  if (!FOOT_CHOICES.phone.includes(o.phone)) o.phone = FOOT_DEF.phone;
  TOGGLES.forEach((k) => { o[k] = o[k] ? 1 : 0; });
  const nums = o as unknown as Record<string, number>, def = FOOT_DEF as unknown as Record<string, number>;
  Object.entries(FOOT_BOUNDS).forEach(([k, [lo, hi]]) => { const v = Number(nums[k]); nums[k] = isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def[k]; });
  return o;
}

