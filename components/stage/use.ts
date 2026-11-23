'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { StageDriver } from '@/lib/stage/driver';
import type { StageCfg } from '@/lib/stage/config';
import type { StageSnap } from '@/lib/stage/types';
import type { WallEvent } from '@/lib/stage/event';

/* The hooks the wall and the remote share: the driver's snapshot, its clock to the second, and reduced motion. */

export function useSnap(d: StageDriver): StageSnap {
  return useSyncExternalStore(d.subscribe, d.get, d.get);
}

/* the driver's time, stepped once a second (a frozen clock never steps). Counts and countdowns read this; nothing
   that reads it animates. Until the page has hydrated it is the first value, so the server and the client agree. */
export function useSecond(d: StageDriver, first: number): number {
  const [t, setT] = useState(first);
  useEffect(() => {
    let id = 0;
    const tick = () => { setT(Math.floor(d.now() / 1000) * 1000); id = window.setTimeout(tick, 1000 - (d.now() % 1000) + 5); };
    tick();
    return () => window.clearTimeout(id);
  }, [d]);
  return t;
}

const subReduce = (fn: () => void) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn); };
export const useReduced = () => useSyncExternalStore(subReduce, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);

/* The step the scene on the wall arrived at. A scene change is a cut: whatever the wall shows when it arrives is
   simply there; a step that a press adds after that is fresh, so it lands and its line draws (fresh(i) is i > base).
   Going back below the base lowers it, so coming forward again plays the step again. */
export function useArrival(scene: string, step: number): number {
  const [s, setS] = useState({ scene, base: step });
  if (s.scene !== scene) { setS({ scene, base: step }); return step; }
  if (step < s.base) { setS({ scene, base: step }); return step; }
  return s.base;
}

/* what every scene can read: the look, the city's name, the place's event, and when its steps appeared */
export type WallCtx = { cfg: StageCfg; name: string; ev: WallEvent; fresh: (i: number) => boolean; reduced: boolean; now: () => number };
export const Wall = createContext<WallCtx | null>(null);
export const useWall = () => useContext(Wall)!;

/* the phone and the wall's laptop stay awake while the page is showing (asked again when the page comes back) */
export function useAwake(on = true) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, gone = false;
    const ask = () => { if (document.visibilityState !== 'visible') return; navigator.wakeLock.request('screen').then((l) => { if (gone) void l.release(); else lock = l; }, () => { /* refused: the device decides */ }); };
    ask(); document.addEventListener('visibilitychange', ask);
    return () => { gone = true; document.removeEventListener('visibilitychange', ask); void lock?.release(); };
  }, [on]);
}
