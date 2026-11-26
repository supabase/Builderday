'use client';
import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { Here, OurWheel } from '../facts';
import { clampFold, type FoldCfg } from './config';
import { HERO } from '@/components/wheel/wheel';
import { FoldPage, type Under } from './fold';

/* /preview: the wheel, then the day under the fold, as saved in saved/fold.config.json (tuned at /lab/fold). Always
   the line direction: base and plain live in the lab, and so does unroll. ?city= opens on a city (0 to 9), ?gl=0
   draws without WebGL, ?2 lets the Register ticket's width follow the city's name (the saved width is fixed, as wide
   as the longest), ?admin shows the page's knobs (admin-panel.tsx, loaded only then), and Save writes the file on
   the dev server. */
/* ?2: the same hero, its ticket hugging the name */
const HUG = { ...HERO, width: 'hug' as const };
const noSub = () => () => {};
const AdminPanel = dynamic(() => import('./admin-panel'), { ssr: false });

/* proto:under-hero: `under` swaps the sections under the hero */
export function FoldPreview({ saved, wheel, ours, here, q, nowMs, under }: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; here: Here | null; q: Record<string, string | undefined>; nowMs: number; under?: (u: Under) => ReactNode }) {
  const admin = q.admin !== undefined;
  const [cfg, setCfg] = useState<FoldCfg>(() => ({ ...clampFold(saved), dir: 'line' }));
  const [w, setW] = useState<WheelCfg>(wheel);
  /* ?2 as the server saw it, then as the address says once in the browser: Vercel drops a key with no value on its
     way to the page, so the browser's own address decides */
  const hug = useSyncExternalStore(noSub, () => new URLSearchParams(window.location.search).has('2'), () => q['2'] !== undefined);
  const hero = hug ? HUG : HERO;
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  return (
    <FoldPage cfg={cfg} wheel={w} ours={ours} forced={forced} here={here} noGl={q.gl === '0'} nowMs={nowMs} under={under} hero={hero}>
      {admin ? <AdminPanel cfg={cfg} setCfg={setCfg} w={w} setW={setW} /> : null}
    </FoldPage>
  );
}
