'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { tokMs } from '@/components/shared/motion';
import { step as stepClick, wake } from '@/components/board/prefs';
import { MOVE } from './acts';
import type { Facts, ScopeCfg } from './scope';
import { Tube, useReduced, useTubesStill, type TubeClock } from './tube';
import { lineMo, lineScore, type LineMo, type Score } from './line';
import { LinePlay } from './line-clock';

/* How it works: one tube plays the day as one loop, Build into Vote into Final and round to Build again, with no stop
   between steps. Each step's heading is a button that moves the drawing to that step and plays on from there; the day
   bar under the tube scrubs it. Pressing the drawing holds it (WCAG 2.2.2); Screen off and reduced motion show each step
   as a still of its finished drawing. A config with the tour off waits for "Play the day". Seconds per step and the
   jump come from the motion tokens (--tour-step, --dur-jump).

   The words never change: all three steps stay on the page, so reading never waits on the drawing. */

type Mode = 'tour' | 'step';

/* The day's clock: t runs 0 to 3 (Build, Vote, Final) and comes round to 0. The tube reads it every frame it draws;
   between reads nothing runs, so off screen or in a hidden tab the day waits where it is. */
class DayClock implements TubeClock {
  t = 0; from: number | undefined; fast = false; mode: Mode = 'tour';
  /* the bar: 0 to 3, a step each */
  readonly max = 3;
  startOf(a: number) { return a; }
  endOf(a: number) { return a + 1; }
  pressTo(t: number) { this.scrub(t); }
  grabbed = false; paused = false; still = false; cut = false;
  stepMs = 12000; jumpMs = 700; stillAt = 0.9;
  private onFrame?: () => void;
  private last = 0; private subs = new Set<() => void>(); private uis = new Set<() => void>(); private snapV = '0|tour';

  get act() { return Math.min(2, Math.max(0, Math.floor(this.t))); }
  get moving() { return this.mode === 'tour' && !this.paused && !this.still && !this.grabbed; }
  read = (now: number) => {
    const dt = this.last ? Math.min(100, Math.max(0, now - this.last)) : 0; this.last = now;
    if (this.moving && dt > 0) this.advance(dt);
    this.onFrame?.();
    return { ph: Math.min(0.99999, this.t / 3), from: this.from, moving: this.moving };
  };
  private advance(dt: number) {
    const a = this.act; let u = this.t - a;
    /* a press moves the picture in durJump; the rest of a step runs at the step's own pace */
    u += this.fast && u < MOVE ? (dt / this.jumpMs) * MOVE : dt / this.stepMs;
    if (u >= MOVE && this.from !== undefined) { this.from = undefined; this.fast = false; }
    /* the end of Final runs on into Build: the drawings move from Final's last pose to Build's first on their own */
    this.t = a + u >= 3 ? a + u - 3 : a + u;
    if (this.act !== a) this.ui();
  }
  private to(a: number, fast: boolean) {
    const was = this.t;
    if (this.paused || this.still) { this.t = a + this.stillAt; this.from = undefined; this.fast = false; }
    else if (this.cut) { this.t = a + MOVE; this.from = undefined; this.fast = false; }
    else { this.from = was; this.t = a; this.fast = fast; }
    this.ui(); this.poke();
  }
  /* a step's button, its arrow keys and "Next": move there and play on */
  press(a: number) {
    const n = Math.min(2, Math.max(0, a)), was = this.mode; this.mode = 'tour';
    if (n === this.act && was === 'tour' && !this.still) { this.poke(); return; }
    this.to(n, true);
  }
  /* the day bar: straight to that moment */
  scrub(t: number) {
    this.t = Math.min(2.9999, Math.max(0, t)); this.from = undefined; this.fast = false;
    this.ui(); this.poke();
  }
  play() { this.mode = 'tour'; this.to(0, true); }
  setSpeed(v: number) { void v; }
  tune(stepMs: number, jumpMs: number, stillAt: number, cut: boolean) { this.stepMs = stepMs; this.jumpMs = jumpMs; this.stillAt = stillAt; this.cut = cut; }
  /* one watcher of each drawn frame (the lamp's fill and the bar) */
  watch(f: () => void) { this.onFrame = f; f(); return () => { if (this.onFrame === f) this.onFrame = undefined; }; }
  setPaused(p: boolean) { if (p !== this.paused) { this.paused = p; this.poke(); } }
  setGrab(g: boolean) { if (g !== this.grabbed) { this.grabbed = g; this.poke(); } }
  setStill(s: boolean) { this.still = s; if (s) { this.t = this.act + this.stillAt; this.from = undefined; this.fast = false; } this.ui(); this.poke(); }
  start(mode: Mode) { this.mode = mode; this.t = this.still ? this.stillAt : 0; this.from = undefined; this.fast = false; this.ui(); this.poke(); }
  snap = () => this.snapV;
  subUi = (f: () => void) => { this.uis.add(f); return () => { this.uis.delete(f); }; };
  listen = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  private ui() { const v = this.act + '|' + this.mode; if (v !== this.snapV) { this.snapV = v; this.uis.forEach((f) => f()); } }
  private poke() { this.subs.forEach((f) => f()); }
}

/* The morning line's clock (line.ts, line-clock.ts): the bar is the loop's time in seconds, with a mark where each act
   starts; the acts are not equal. A press turns the globe onto the act's opening (rule 11); arrow keys cut; a drag on
   the bar is the playhead itself, and a click that jumps more than 2 s is a press to that moment. Reduced motion and
   Screen off show each act at its rest. */
export class LineClock implements TubeClock {
  P = new LinePlay(); S: Score | null = null; mo: LineMo = lineMo(); mode: Mode = 'tour';
  grabbed = false; paused = false; still = false; pickClick = false;
  private onFrame?: () => void; private subs = new Set<() => void>(); private uis = new Set<() => void>(); private snapV = '0|tour';
  private lastSec = 0;
  /* the click at the pick: the wheel's step sound, which plays only when sound is on */
  private onPick = () => stepClick(true);

  get max() { return this.S?.loop ?? 36; }
  get t() { return this.P.shown; }
  get act() { return this.S ? this.P.act : 0; }
  startOf(a: number) { return this.S ? this.S.acts[a] : (a * this.max) / 3; }
  /* Final ends where the seam starts: the bar's right end is Final's rest (the pick), never the seam into Build */
  endOf(a: number) { return a < 2 ? this.startOf(a + 1) : this.S ? this.S.final.seamAt : this.max; }
  get moving() { return this.P.moving || (this.mode === 'tour' && !this.paused && !this.still && !this.grabbed); }
  read = (now: number) => {
    /* the tube may read before the score is tuned (children's effects run first): a still at the top until it is */
    const S = this.S;
    if (!S) return { ph: 0, moving: false, mo: this.mo };
    this.P.playing = this.mode === 'tour' && !this.paused && !this.still && !this.grabbed;
    const r = this.P.read(now);
    /* the one click of the loop, at the pick (behind a lab switch, and only with sound on: the caller checks) */
    if (this.pickClick && this.lastSec < S.final.p2 && r.sec >= S.final.p2 && r.sec - this.lastSec < 0.5) this.onPick?.();
    this.lastSec = r.sec;
    this.ui(); this.onFrame?.();
    return { ph: r.ph, moving: this.moving, press: r.press, mo: this.mo };
  };
  tune(cfg: ScopeCfg, f: Facts, mo: LineMo, small: boolean) {
    this.mo = mo; this.S = lineScore(cfg, f, mo, small); this.P.tune(this.S, mo, cfg); this.pickClick = !!cfg.pickClick;
    if (this.still) this.P.scrubTo(this.S.stills[this.P.act]);
    this.ui(); this.poke();
  }
  setSpeed(v: number) { this.P.speed = v; }
  /* a step's button and "Next": turn there and play on; the arrow keys cut */
  press(a: number, cut = false) {
    const n = Math.min(2, Math.max(0, a)), was = this.mode; this.mode = 'tour';
    if (!this.S) return;
    /* still or held: go straight to the act's still (a held press must not freeze on a turn or a cross-fade) */
    if (this.still || this.paused) { this.P.scrubTo(this.S.stills[n]); this.ui(); this.poke(); return; }
    if (n === this.act && was === 'tour') { this.poke(); return; }
    this.P.press(n, undefined, cut); this.ui(); this.poke();
  }
  /* the bar: a drag is the playhead; a click far from it is a press to that moment */
  scrub(t: number) { if (!this.S) return; this.P.scrubTo(Math.min(this.S.final.seamAt - 0.001, Math.max(0, t))); this.lastSec = this.P.sec; this.ui(); this.poke(); }
  pressTo(t: number) { if (!this.S) return; if (this.still || this.paused || Math.abs(t - this.P.sec) <= 2) { this.scrub(t); return; } this.P.pressTo(t, undefined, false, true); this.ui(); this.poke(); }
  play() { this.mode = 'tour'; if (this.S) this.P.scrubTo(0); this.ui(); this.poke(); }
  watch(f: () => void) { this.onFrame = f; f(); return () => { if (this.onFrame === f) this.onFrame = undefined; }; }
  setPaused(p: boolean) { if (p !== this.paused) { this.paused = p; this.poke(); } }
  setGrab(g: boolean) { if (g !== this.grabbed) { this.grabbed = g; this.poke(); } }
  setStill(s: boolean) { this.still = s; if (s && this.S) this.P.scrubTo(this.S.stills[this.P.act]); this.ui(); this.poke(); }
  start(mode: Mode) { this.mode = mode; if (this.S) this.P.scrubTo(this.still ? this.S.stills[0] : 0.8); this.lastSec = this.P.sec; this.ui(); this.poke(); }
  snap = () => this.snapV;
  subUi = (f: () => void) => { this.uis.add(f); return () => { this.uis.delete(f); }; };
  listen = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  private ui() { const v = this.act + '|' + this.mode; if (v !== this.snapV) { this.snapV = v; this.uis.forEach((f) => f()); } }
  private poke() { this.subs.forEach((f) => f()); }
}
type AnyClock = DayClock | LineClock;

/* the motion tokens for the morning line, read from the page (they come from saved/motion.config.json) */
const lineTokens = (): Partial<LineMo> => ({
  tourTurn: tokMs('--tour-turn') || undefined, tourHold: tokMs('--tour-hold') || undefined, pickHold: tokMs('--pick-hold') || undefined,
  durFlight: tokMs('--dur-flight') || undefined, durCross: tokMs('--dur-cross') || undefined,
});

export type TourStep = { k: string; t: string; p: string };
type Day = { buildMin: number; voteAfter: number; startHour: number };

/* the bar's reading: the step, and how far through it the drawing is. The drawing runs the day through the ten cities
   on one clock (UTC, written in the tube), so the bar names the step rather than one city's local time. */
function valueText(c: AnyClock, d: Day, names: string[]) {
  void d;
  const a = c.act, u = Math.min(1, Math.max(0, (c.t - c.startOf(a)) / Math.max(1e-6, c.endOf(a) - c.startOf(a))));
  return names[a] + ', step ' + (a + 1) + ' of 3' + (u > 0.02 && u < 0.98 ? ', ' + Math.round(u * 100) + '% through' : u >= 0.98 ? ', at its end' : '');
}

export function DayTour({ cfg, F, steps, day, compact, id, heading, style, speed = 1, onClock, strip }: {
  cfg: ScopeCfg; F: Facts; steps: TourStep[]; day: Day; compact: boolean; id: string; heading: ReactNode; style?: React.CSSProperties;
  /** the lab's speed switch (the morning line only) */
  speed?: number;
  /** the lab's frame keys and beat strip get the clock */
  onClock?: (c: LineClock | null) => void;
  /** the lab's beat strip, drawn between the tube and the bar */
  strip?: ReactNode;
}) {
  const [clocks] = useState(() => ({ day: new DayClock(), line: new LineClock() }));
  const isLine = cfg.dir === 'line' && cfg.story !== 'scenes', clock: AnyClock = isLine ? clocks.line : clocks.day;
  const snap = useSyncExternalStore(clock.subUi, clock.snap, () => '0|tour');
  const [actS, mode] = snap.split('|') as [string, Mode];
  /* Screen off stills the drawing as reduced motion does (a still, no tour, no Play); a press on the tube holds it */
  const act = Number(actS), screenOff = useTubesStill(), reduced = useReduced(), still = reduced || screenOff, [held, setHeldBy] = useState(false);
  /* Screen off or reduced motion lets go of a held drawing, so turning them back gives a moving one */
  if (still && held) setHeldBy(false);
  const fills = useRef<(HTMLLIElement | null)[]>([]), btns = useRef<(HTMLButtonElement | null)[]>([]), bar = useRef<HTMLInputElement>(null);
  const names = steps.map((s) => s.k), sec = useRef<HTMLElement>(null);
  /* where each act starts on the bar: from the saved motion values, so the server and the page agree */
  const ticks = (() => { if (!isLine) return { max: 3, at: [0, 1 / 3, 2 / 3] }; const S = lineScore(cfg, F, lineMo()); return { max: S.final.seamAt, at: S.acts.map((a) => a / S.final.seamAt) }; })();

  /* how it opens: playing, unless the config has the tour off (or off on a phone), or the drawings are still */
  useEffect(() => {
    clocks.day.tune(Math.max(tokMs('--tour-step') || 12000, cfg.loop * 1000), tokMs('--dur-jump') || 700, cfg.still, cfg.jump === 'cut');
  }, [clocks, cfg.loop, cfg.still, cfg.jump]);
  /* the line's score: from the config, the facts and the motion tokens; the small layout follows the tube's width */
  const fKey = JSON.stringify(F), cKey = JSON.stringify(cfg), [small, setSmall] = useState(false);
  useEffect(() => {
    if (!isLine) return;
    clocks.line.tune(JSON.parse(cKey) as ScopeCfg, JSON.parse(fKey) as Facts, lineMo(lineTokens()), small);
  }, [clocks, isLine, cKey, fKey, small]);
  useEffect(() => { clocks.line.setSpeed(speed); }, [clocks, speed]);
  useEffect(() => { onClock?.(isLine ? clocks.line : null); }, [clocks, isLine, onClock]);
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 640px)').matches;
    clock.start(cfg.tour && !still && (!phone || cfg.tourPhone) ? 'tour' : 'step');
  }, [clock, cfg.tour, cfg.tourPhone, still]);
  useEffect(() => { clock.setStill(still); }, [clock, still]);
  useEffect(() => { clock.setPaused(held); }, [clock, held]);

  /* each frame the tube draws: the current step's lamp fills with the tour, the bar follows the drawing */
  const spoken = useRef({ text: '', was: -1 });
  useEffect(() => {
    const sp = spoken.current;
    return clock.watch(() => {
      /* the lamp fills with the step: how far the drawing is through it */
      const a = clock.act, p = clock.still ? 1 : Math.min(1, Math.max(0, (clock.t - clock.startOf(a)) / Math.max(1e-6, clock.endOf(a) - clock.startOf(a))));
      fills.current.forEach((el, i) => { el?.style.setProperty('--ex-fill', i === a ? String(p) : '0'); });
      const b = bar.current;
      if (b) {
        const v = String(Math.round(clock.t * 1000) / 1000); if (b.value !== v) b.value = v;
        /* while it plays, the spoken value changes only with the step (a focused slider is read on every change); a
           drag or a key writes the full reading itself */
        if (a !== sp.was) { sp.was = a; const tx = names[a] + ', step ' + (a + 1) + ' of 3'; if (tx !== sp.text) { sp.text = tx; b.setAttribute('aria-valuetext', tx); } }
      }
    });
  });

  const go = (i: number, cut = false) => { wake(); clock.press(i, cut); stepClick(true); };
  const onSteps = (e: KeyboardEvent<HTMLOListElement>) => {
    /* left and right only: up and down stay the page's, to scroll */
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const i = btns.current.findIndex((b) => b === document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = Math.min(2, Math.max(0, i + d)); btns.current[n]?.focus(); if (n !== act) go(n, true);
  };
  const onBarKey = (e: KeyboardEvent<HTMLInputElement>) => {
    /* the line's bar is in seconds: an arrow moves a second (Shift five), Home and End go to the ends; each holds the
       drawing until the bar loses focus */
    const dk = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? Infinity : null;
    if (isLine && (dk || to !== null)) { e.preventDefault(); clock.setGrab(true); const before = clock.act; clock.scrub(to ?? clock.t + dk * (e.shiftKey ? 5 : 1)); bar.current?.setAttribute('aria-valuetext', valueText(clock, day, names)); if (clock.act !== before) { wake(); stepClick(true); } return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); const n = Math.min(2, Math.max(0, act + (e.key === 'PageUp' ? 1 : -1))); if (n !== act) go(n, true); }
  };
  /* a pointer on the bar: its first move is a click (a press when it jumps far), the rest a drag */
  const clickRef = useRef(false);
  const onBar = (v: number) => {
    const before = clock.act;
    if (clickRef.current) { clickRef.current = false; clock.pressTo(v); } else clock.scrub(v);
    const tx = valueText(clock, day, names); bar.current?.setAttribute('aria-valuetext', tx);
    if (clock.act !== before) { wake(); stepClick(true); }
  };
  const play = () => {
    /* the key goes away once the day plays: focus moves to the step it is on, so it is never lost */
    setHeldBy(false); wake(); clock.play();
    btns.current[clock.act]?.focus();
  };

  return (
    <section id={id} ref={sec} className="ex" data-compact={compact ? '' : undefined} data-layout="reel" data-tour={mode === 'tour' ? '' : undefined} aria-labelledby={id + '-h'} style={style}
>
      <div className="ex-top">
        {heading}
        <span className="ex-keys">
          {/* only where the day does not play by itself (a config with the tour off); once it plays, it loops */}
          {!still && mode !== 'tour' ? <button type="button" className="ex-key ex-play" onClick={play}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" fill="currentColor" /></svg>
            Play the day
          </button> : null}
        </span>
      </div>
      <div className="ex-stage">
        <Tube scene={cfg.story === 'scenes' ? 'reel' : 'day'} cfg={cfg} f={F} clock={clock} held={held} onHold={setHeldBy} what="day drawing" className="ex-reel" onSmall={setSmall} />
        {strip}
        {cfg.bar ? (
          <div className="ex-bar">
            <input ref={bar} className="ex-range" type="range" min={0} max={isLine ? ticks.max : 3} step={isLine ? 0.01 : 0.05} defaultValue={0} aria-label="Moment in the day" aria-valuetext={names[0] + ', step 1 of 3'}
              onInput={(e) => onBar(Number(e.currentTarget.value))} onKeyDown={onBarKey} onPointerDown={() => { clickRef.current = true; clock.setGrab(true); }} onPointerUp={() => { clickRef.current = false; clock.setGrab(false); }} onPointerCancel={() => clock.setGrab(false)} onBlur={() => clock.setGrab(false)} />
            <ol className="ex-ticks" aria-hidden="true">
              {names.slice(0, 3).map((n, i) => <li key={n} style={isLine && i ? { left: `calc(14px + ${ticks.at[i].toFixed(4)} * (100% - 28px))` } : undefined}>{n}</li>)}
            </ol>
          </div>
        ) : null}
      </div>
      <ol className="ex-mons" onKeyDown={onSteps} onPointerDown={() => wake()}>
        {steps.map((s, i) => (
          <li key={s.k} className="ex-mon" data-on={i === act ? '' : undefined} ref={(el) => { fills.current[i] = el; }}>
            <button type="button" className="ex-stepb" aria-current={i === act ? 'step' : undefined} ref={(el) => { btns.current[i] = el; }} onClick={() => go(i)}>
              <span className="ex-lamp" aria-hidden="true" />
              <span className="ex-umd"><span className="ex-k">{s.k}</span><span className="ex-t">{s.t}</span></span>
            </button>
            <p className="ex-p">{s.p}</p>
            {compact && cfg.next && i < 2 ? <button type="button" className="ex-next" onClick={() => { go(i + 1); sec.current?.querySelector('.ex-stage')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }}>Next: {steps[i + 1].k}</button> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
