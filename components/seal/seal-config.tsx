'use client';
import { createContext, useContext, useMemo } from 'react';
import saved from '@/saved/seal.config.json';
import { clampCfg, forCity, merged, type SealCfg, type SealCfgInput } from '@/lib/seal';
import { SealSvgView } from './seal-svg';

/* The seal look the pages draw with: the saved config, unless a tuning page passes another. */
const SAVED = clampCfg(saved as SealCfgInput);
const SealCfgContext = createContext<SealCfg>(SAVED);
export function useSealCfg(): SealCfg { return useContext(SealCfgContext); }

/* one city's seal; draw adds the stroke replay */
export function CitySeal({ id, size, draw }: { id: string; size: number; draw?: boolean }) {
  const cfg = useContext(SealCfgContext);
  const s = useMemo(() => forCity(cfg, id, { size, draw }), [cfg, id, size, draw]);
  return <SealSvgView seal={s} />;
}
/* the ten interlaced: the winner's seal */
export function MergedSeal({ ids, size }: { ids: string[]; size: number }) {
  const cfg = useContext(SealCfgContext), key = ids.join();
  const s = useMemo(() => merged(cfg, key.split(','), { size, draw: true }), [cfg, key, size]);
  return <SealSvgView seal={s} />;
}
