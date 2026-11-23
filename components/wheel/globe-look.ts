import type { WheelCfg } from './config';
import type { ClockCfg } from './globe-clock';
import { LOOK_DEF, type TextGlobeLook } from './text-globe';

/* The text globe's look and clock from the wheel's saved config, for every page that draws it (the wheel's hub, the
   header, the closing line, the prize) and for /lab/globe. */

export function globeLook(c: WheelCfg, font: string, green = LOOK_DEF.green, ground = LOOK_DEF.ground): TextGlobeLook {
  return {
    ink: c.ink, dim: c.dim, grid: c.globeGrid, markInk: c.globeMarkInk, green, ground, font,
    mid: c.globeMid, large: c.globeLarge, dots: c.globeDots, marks: c.globeMarks,
    leader: !!c.globeLeader, thin: !!c.globeThin, study: !!c.globeStudy, rim: c.globeRim === 'ticks',
    wake: c.globeTurn === 'wake' ? c.globeWake : 0, night: c.globeNight, tag: c.globeTag,
  };
}
export function globeClockCfg(c: WheelCfg, reduced: boolean): ClockCfg {
  return {
    fps: c.globeFps, arrive: c.globeArrive, sweep: c.globeSweep, turn: c.globeTurn, wake: c.globeWake,
    land: c.globeLand, hold: c.globeHold, blink: c.globeBlink, blinks: c.globeBlinks, reduced,
  };
}
/* the facing (degrees) that puts a city where the wheel shows it: `face` (radians) to the left of the middle */
export function facingFor(c: Pick<WheelCfg, 'face'>, lon: number): number { return lon - (c.face * 180) / Math.PI; }

/* The hand-over (`thin`): how far the page has scrolled past the globe (0 to 1) as the share of cells gone, in whole
   steps; the last part of the scroll holds the thinned globe before the cut to the header's. `leave` drops nothing. */
export const HANDOVER = { thinUntil: 0.7, cutAt: 0.85 };
export function handoverDrop(c: Pick<WheelCfg, 'globeHandover' | 'globeThinSteps'>, p: number): number {
  if (c.globeHandover !== 'thin' || p <= 0) return 0;
  return Math.min(1, Math.floor((p / HANDOVER.thinUntil) * c.globeThinSteps) / c.globeThinSteps);
}
/* whether the header's small globe is showing yet */
export function handoverCut(c: Pick<WheelCfg, 'globeHandover'>, p: number): boolean { return p >= (c.globeHandover === 'thin' ? HANDOVER.cutAt : 0.5); }
