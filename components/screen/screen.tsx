'use client';
import { useEffect, useRef } from 'react';
import { applyScreen, type ScreenHandle } from './apply';
import { mountGlobes } from './globe';
import type { ScreenCfg } from './config';

/* The screen kit as parts a page can use.
   - <Screen cfg> turns the kit on for its page (the lines, the grain, the corners, big type under the lines).
   - <Globe size lat lon> is a glass globe with a city's light: hub, lens (64px) or dot (24px). <Globes /> once per
     page draws all of them with one canvas.
   - .fringe, .cell, .cell-open and .cell-closing are classes; the mark and the click come from the wheel. */

export { HackMark as Mark } from '@/components/wheel/mark';
export { click, settle, unlock } from '@/components/wheel/click';

export function Screen({ cfg }: { cfg: ScreenCfg }) {
  const h = useRef<ScreenHandle | null>(null);
  useEffect(() => { h.current = applyScreen(document, cfg); return () => { h.current?.off(); h.current = null; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { h.current?.update(cfg); }, [cfg]);
  return null;
}

const SIZE = { lens: 64, dot: 24 } as const;
export function Globe({ size = 'lens', lat, lon, glow = true, className }: { size?: 'lens' | 'dot' | number; lat: number; lon: number; glow?: boolean; className?: string }) {
  const px = typeof size === 'number' ? size : SIZE[size];
  return <span className={className} data-globe="" data-lat={lat} data-lon={lon} data-glow={glow ? '1' : '0'} aria-hidden="true" style={{ display: 'inline-block', flex: 'none', width: px, height: px }} />;
}
export function Globes() {
  useEffect(() => mountGlobes(document), []);
  return null;
}
