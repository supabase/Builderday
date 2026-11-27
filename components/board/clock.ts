'use client';
import { useSyncExternalStore } from 'react';
import { EPOCH } from '@/lib/day-data';

/* The day's clock as one store. It ticks once a second, and only the clock reads the second: the rest of the page reads
   the minute, so at rest one thing changes on screen. The model's time is in minutes from EPOCH (Dec 10, 00:00 UTC).

   - live: the clock follows real time from `at` (a preview of a moment, or the real day), at `speed` seconds per second.
   - still: it stays at `at`, for stills and for a lab that scrubs time itself.
   The loop stops while the tab is hidden. */

export type DayClock = {
  /* seconds since EPOCH, now */
  sec: () => number;
  subSec: (fn: () => void) => () => void;
  subMin: (fn: () => void) => () => void;
  /* jump to a minute (a lab's moment); keeps running if live */
  set: (minute: number) => void;
  setLive: (live: boolean, speed?: number) => void;
};

export function createClock(at: number, live: boolean, speed = 1): DayClock {
  let base = at * 60, t0 = 0, run = live, spd = speed, timer = 0, lastSec = Math.floor(base), lastMin = Math.floor(base / 60);
  const secs = new Set<() => void>(), mins = new Set<() => void>();
  const now = () => (run && t0 ? base + ((performance.now() - t0) / 1000) * spd : base);
  const tick = () => {
    const s = Math.floor(now()), m = Math.floor(s / 60);
    if (s !== lastSec) { lastSec = s; secs.forEach((f) => f()); }
    if (m !== lastMin) { lastMin = m; mins.forEach((f) => f()); }
  };
  const loop = () => {
    window.clearInterval(timer); timer = 0;
    if (!run || typeof document === 'undefined' || document.hidden || (!secs.size && !mins.size)) return;
    if (!t0) t0 = performance.now();
    /* a step of the clock lands within a quarter of its second */
    timer = window.setInterval(tick, Math.max(40, 250 / spd));
  };
  const vis = () => {
    if (document.hidden) { base = now(); t0 = 0; window.clearInterval(timer); timer = 0; }
    else { t0 = performance.now(); loop(); tick(); }
  };
  const sub = (set: Set<() => void>) => (fn: () => void) => {
    set.add(fn);
    if (set.size === 1 && secs.size + mins.size === 1) { document.addEventListener('visibilitychange', vis); loop(); }
    return () => { set.delete(fn); if (!secs.size && !mins.size) { window.clearInterval(timer); timer = 0; document.removeEventListener('visibilitychange', vis); } };
  };
  return {
    sec: () => now(),
    subSec: sub(secs), subMin: sub(mins),
    set(minute) { base = minute * 60; t0 = run ? performance.now() : 0; tick(); secs.forEach((f) => f()); mins.forEach((f) => f()); },
    setLive(l, s) { base = now(); run = l; if (s) spd = s; t0 = l ? performance.now() : 0; loop(); },
  };
}

/* the whole second, for the clock itself */
export function useSecond(c: DayClock, first: number): number {
  return useSyncExternalStore(c.subSec, () => Math.floor(c.sec()), () => Math.floor(first * 60));
}

/* the board's minute: it moves on the board tick (every `tick` seconds), so rows and counts change together, as on a
   departures board, and the page draws once a tick instead of once a second */
export function useTick(c: DayClock, first: number, tick: number): number {
  const t = Math.max(1, tick), at = (s: number) => (Math.floor(s / t) * t) / 60;
  return useSyncExternalStore(c.subSec, () => at(c.sec()), () => at(first * 60));
}
/* the real minute now, for a page that follows the real day */
export function realMinute(): number { return (Date.now() - EPOCH) / 60000; }

/* 00:00:00 from seconds, wrapped to the day */
export function hms(s: number): string {
  s = ((Math.floor(s) % 86400) + 86400) % 86400;
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}
