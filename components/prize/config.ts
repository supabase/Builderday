/* The prize drawings' look, tuned at /lab/prize-art and saved in saved/prize-art.config.json. The look is the
   renderer's (ascii.ts); the rest is how a drawing sits on the page: its grid, the turn it rests at, and whether a
   visitor may drag it round. `show` is the lab's own: which prize it draws large. Pure. */
import { ASCII_BOUNDS, ASCII_DEFAULT, OBJECTS, RAMPS, type AsciiLook, type Obj } from './ascii';

export type PrizeArtCfg = AsciiLook & {
  /* the grid, in characters */
  cols: number; rows: number;
  /* the turn each drawing rests at (radians), and how far a drag of the whole width turns it */
  yaw: number; dragTurn: number;
  /* a drag turns the drawing; on release it coasts and stops */
  drag: boolean; coast: boolean;
  /* the lab's: the prize drawn large */
  show: Obj;
};

export const PRIZE_ART_DEFAULT: PrizeArtCfg = { ...ASCII_DEFAULT, cols: 72, rows: 28, yaw: -0.55, dragTurn: 3.2, drag: true, coast: true, show: 'pro' };

export const PRIZE_ART_BOUNDS: Record<string, [number, number, number]> = {
  ...ASCII_BOUNDS, cols: [40, 110, 1], rows: [16, 44, 1], yaw: [-3.14, 3.14, 0.01], dragTurn: [1, 8, 0.1],
};

export function clampArt(c: Partial<PrizeArtCfg> | undefined): PrizeArtCfg {
  const o = { ...PRIZE_ART_DEFAULT, ...(c || {}) } as PrizeArtCfg & Record<string, unknown>;
  for (const k of Object.keys(PRIZE_ART_BOUNDS)) {
    const [lo, hi, st] = PRIZE_ART_BOUNDS[k], v = Number(o[k]);
    o[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v / st) * st)) : (PRIZE_ART_DEFAULT as Record<string, unknown>)[k];
    if (st < 1) o[k] = Number((o[k] as number).toFixed(2));
  }
  if (!(o.ramp in RAMPS)) o.ramp = PRIZE_ART_DEFAULT.ramp;
  if (!(OBJECTS as readonly string[]).includes(o.show)) o.show = PRIZE_ART_DEFAULT.show;
  for (const k of ['shadow', 'rim', 'edges', 'drag', 'coast'] as const) o[k] = !!o[k];
  for (const k of Object.keys(o)) if (!(k in PRIZE_ART_DEFAULT)) delete o[k];
  return o;
}
