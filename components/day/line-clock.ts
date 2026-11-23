/* The clock of the morning line (line.ts). It owns one number, the time in the loop, and moves it by the display's
   own frame stamps (a step is capped at 100 ms, so a tab coming back continues where it was). Everything on screen is
   worked out from that number and, for a moment after a press, from the press itself.

   A press on a step (rule 11): the old act's marks fade out where they are, the globe turns the shortest way onto the
   new act's opening angle (400 ms plus 4 ms a degree), and the new act's opening fades in as the turn ends. The time
   is set so the timeline itself reaches the opening at the end of the turn: the globe keeps its own speed throughout
   and only a difference that decays to zero along a smootherstep is added, so the speed is the same at both ends. */

import { lineBase, pressEnd, smoother, wrap180, type LineMo, type Press, type Score } from './line';
import type { ScopeCfg } from './scope';

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class LinePlay {
  S: Score | null = null;
  cfg: ScopeCfg | null = null;
  sec = 0;
  /* the lab's speed switch (1, 0.5, 0.25, 0.1) and whether time runs (pressing the drawing holds it) */
  speed = 1;
  playing = true;
  private last = -1;
  private p: Press | null = null;

  tune(S: Score, _mo: LineMo, cfg: ScopeCfg) {
    const was = this.S;
    this.S = S; this.cfg = cfg;
    if (was && was.loop !== S.loop) this.sec = mod(this.sec, S.loop);
  }
  /* the act on screen (a press counts as being at its target); the loop's last 250 ms are Build's, as the caption is */
  get act() { const S = this.S; if (!S) return 0; const t = this.p ? this.p.target : this.sec; return t >= S.loop - 0.25 ? 0 : t >= S.Fs ? 2 : t >= S.B ? 1 : 0; }
  get moving() { return !!this.p && this.p.age < this.p.T; }
  /* the time the bar and the lamps show: during a press's turn, the moment it is going to, reached at the act's own
     start (never the wrapped end of the loop the turn starts from, which would put the playhead at the far right) */
  get shown() {
    const S = this.S, p = this.p; if (!S || !p || p.age >= p.T) return this.sec;
    if (p.bar) return p.target;
    const a = this.act; return Math.max(S.acts[a], p.target - (p.T - p.age));
  }
  /* the offset still owed by a press, in degrees */
  private owed(p: Press | null) { return p && p.T > 0 ? p.dLon * (1 - smoother(p.age / p.T)) : 0; }
  angle() { const S = this.S!, cfg = this.cfg!; return mod(lineBase(S, cfg, this.sec) + this.owed(this.p), 360); }

  /* read the clock at a frame stamp (ms): advances time when playing and ages the press */
  read(now: number): { sec: number; ph: number; press?: Press; act: number } {
    const S = this.S!;
    const dt = this.last < 0 ? 0 : Math.min(100, Math.max(0, now - this.last)) / 1000;
    this.last = now;
    const step = dt * this.speed;
    if (this.p) {
      /* the timeline reaches the target as the turn ends: before that it runs up to it at its own speed */
      this.p.age += step;
      this.sec = mod(this.p.target + (this.p.age - this.p.T), S.loop);
      if (this.p.age >= pressEnd(this.p)) this.p = null;
    } else if (this.playing) this.sec = mod(this.sec + step, S.loop);
    return { sec: this.sec, ph: this.sec / S.loop, press: this.p ? { ...this.p } : undefined, act: this.act };
  }
  /* hold time where it is (dt still ages a press so a press always lands) */
  hold(on: boolean) { this.playing = !on; }
  /* set the playhead directly (a drag on the bar, a frame key, a still): no press, the drawing is the playhead's */
  scrubTo(sec: number) { const S = this.S!; this.p = null; this.sec = mod(sec, S.loop); }
  /* a press on a step: to just after its opening hand-off, so the new act's own card is what fades in */
  press(to: number, now?: number, cut = false) { const S = this.S!; if (to === this.act && !this.p) return; this.pressTo(S.pressAt[to], now, cut); }
  /* a press to any moment (a bar click that jumps more than 2 s) */
  pressTo(target: number, now?: number, cut = false, bar = false) {
    const S = this.S!, cfg = this.cfg!;
    if (now !== undefined && this.last < 0) this.last = now;
    target = mod(target, S.loop);
    const cur = this.angle(), old = this.p ? (this.p.age < this.p.T ? this.p.target : this.sec) : this.sec;
    if (cut || cfg.jump === 'cut') { this.p = { old, target, dLon: 0, T: 0, age: 0, bar }; this.sec = target; return; }
    /* the turn's length from the distance (400 ms plus 4 ms a degree), then the distance from the turn's start on the
       timeline. A turn against the globe's own direction slows it, may stop it and turn it back a little: it gets more
       time until it changes speed no faster for its size than the shortest forward turn does (no jolt either way) */
    const rate = S.rate, dist = (T: number) => wrap180(cur - lineBase(S, cfg, target - T));
    let T = 0.4 + 0.004 * Math.abs(dist(0.4)), d = dist(T);
    T = 0.4 + 0.004 * Math.abs(d); d = dist(T);
    const jolt = (T: number, d: number) => { const v = (Math.abs(d) * 1.875) / T, top = d >= 0 ? rate + v : Math.max(rate, v - rate); return (Math.abs(d) * 5.77) / (T * T) / top; };
    while (jolt(T, d) > 7.7 && T < 2) { T += 0.02; d = dist(T); }
    this.p = { old, target, dLon: d, T, age: 0, bar };
    this.sec = mod(target - T, S.loop);
  }
}
