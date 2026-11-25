'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { Here, OurWheel } from '../facts';
import { clampFold, type FoldCfg } from './config';
import { HERO } from '@/components/wheel/wheel';
import { FoldPage } from './fold';

/* /preview: the wheel, then the day under the fold, as saved in saved/fold.config.json (tuned at /lab/fold). Always
   the line direction: base and plain live in the lab, and so does unroll. ?city= opens on a city (0 to 9), ?gl=0
   draws without WebGL, ?2 lets the Register ticket's width follow the city's name (the saved width is fixed, as wide
   as the longest), ?admin shows the page's knobs (admin-panel.tsx, loaded only then), and Save writes the file on
   the dev server. */
/* ?2: the same hero, its ticket hugging the name */
const HUG = { ...HERO, width: 'hug' as const };
const AdminPanel = dynamic(() => import('./admin-panel'), { ssr: false });

export function FoldPreview({ saved, wheel, ours, here, q, nowMs }: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; here: Here | null; q: Record<string, string | undefined>; nowMs: number }) {
  const admin = q.admin !== undefined;
  const [cfg, setCfg] = useState<FoldCfg>(() => ({ ...clampFold(saved), dir: 'line' }));
  const [w, setW] = useState<WheelCfg>(wheel);
  const hero = q['2'] !== undefined ? HUG : HERO;
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  return (
    <FoldPage cfg={cfg} wheel={w} ours={ours} forced={forced} here={here} noGl={q.gl === '0'} nowMs={nowMs} hero={hero}>
      {admin ? <AdminPanel cfg={cfg} setCfg={setCfg} w={w} setW={setW} /> : null}
    </FoldPage>
  );
}
