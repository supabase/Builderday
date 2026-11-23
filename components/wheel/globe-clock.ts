import type { Reveal } from './text-globe';

/* The text globe's clock. The globe changes only on whole steps, `fps` a second (eight is animation "on threes"): on
   each step it shows where the turn has got to, keeps the steps before for the wake, counts the arrival, and decides
   whether the city's brackets are on. Between steps nothing changes, so the page draws nothing; once the wheel has
   come to rest, the wake has drained, the arrival is done and the brackets have stopped blinking, it draws nothing
   at all until the wheel moves again. Pure: no window, no DOM; the caller says what time it is. */

export type ClockCfg = {
  fps: number;
  arrive: 'none' | 'sweep' | 'print'; sweep: number;
  turn: 'step' | 'wake'; wake: number;
  /* hold: on coming to rest the pose holds `hold` steps before the brackets blink */
  land: 'hold' | 'plain'; hold: number;
  /* few: `blinks` blinks (one a second) and then the brackets stay; forever: they blink as long as it rests */
  blink: 'forever' | 'few'; blinks: number;
  reduced: boolean;
};
export type ClockOut = { facing: number; trail: number[]; reveal: Reveal | null; bracket: boolean };

export class GlobeClock {
  private k = -1;
  private arriveAt = -1;
  private wantArrive = false;
  private restAt = -1;
  private key = '';
  out: ClockOut = { facing: 0, trail: [], reveal: null, bracket: false };
  constructor(public cfg: ClockCfg) {}

  private mode: 'sweep' | 'print' = 'sweep';
  private steps = 1;
  /* the arrival, once: it starts on the next step. A page may name its own mode and length (its first screen's
     arrival); otherwise the saved ones */
  arrive(mode?: 'sweep' | 'print', steps?: number) {
    if (this.cfg.reduced || (!mode && this.cfg.arrive === 'none')) return;
    this.mode = mode ?? (this.cfg.arrive === 'print' ? 'print' : 'sweep'); this.steps = steps ?? this.cfg.sweep; this.wantArrive = true;
  }
  /* forget the steps (a jump, or a new config): the next tick draws */
  reset() { this.k = -1; this.key = ''; this.out.trail = []; }
  arriving() { return this.wantArrive || this.out.reveal !== null; }
  /* an arrival asked for that has not reached its first step: the globe is not drawn whole meanwhile */
  pending() { return this.wantArrive; }

  /* `facing` is where the turn is now (degrees), `settled` whether the wheel has come to rest on a city.
     Returns true when the globe's picture changed on this step. */
  tick(now: number, facing: number, settled: boolean): boolean {
    const c = this.cfg, k = Math.floor((now / 1000) * c.fps);
    if (k === this.k) return false;
    this.k = k;
    const o = this.out, f = Math.round(facing * 100) / 100;
    if (c.reduced) {
      o.facing = f; o.trail = []; o.reveal = null; this.wantArrive = false; o.bracket = settled;
    } else {
      if (c.turn === 'wake' && c.wake > 0) { o.trail = [o.facing, ...o.trail].slice(0, c.wake); } else o.trail = [];
      o.facing = f;
      if (this.wantArrive) { this.wantArrive = false; this.arriveAt = k; }
      if (this.arriveAt >= 0) {
        const step = k - this.arriveAt;
        if (step > this.steps) { this.arriveAt = -1; o.reveal = null; }
        else o.reveal = { mode: this.mode, step, steps: this.steps };
      }
      if (settled) {
        if (this.restAt < 0) this.restAt = k;
        const t = (k - this.restAt - (c.land === 'hold' ? c.hold : 0)) / c.fps;
        o.bracket = t < 0 ? false : c.blink === 'few' && t >= c.blinks ? true : Math.floor(t * 2) % 2 === 0;
      } else { this.restAt = -1; o.bracket = false; }
    }
    const key = `${o.facing}|${o.trail.join(',')}|${o.reveal ? o.reveal.step : -1}|${o.bracket}`;
    if (key === this.key) return false;
    this.key = key;
    return true;
  }

  /* nothing will change until the facing does: the page may stop asking */
  resting(): boolean {
    const o = this.out;
    return this.restAt >= 0 && !this.arriving() && o.trail.every((t) => t === o.facing) && (this.cfg.reduced || this.cfg.blink === 'few') && o.bracket;
  }
}
