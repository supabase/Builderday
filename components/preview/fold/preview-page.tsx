'use client';
import type { WheelCfg } from '@/components/wheel/config';
import type { Here, OurWheel } from '../facts';
import { clampFold, type FoldCfg } from './config';
import { HERO } from '@/components/wheel/wheel';
import { FoldPage } from './fold';

/* The page: the wheel, as saved in saved/fold.config.json. ?city= opens on a city, ?gl=0 draws without WebGL, ?2 lets
   the Register ticket's width follow the city's name (the saved width is fixed, as wide as the longest). */
const HUG = { ...HERO, width: 'hug' as const };

export function FoldPreview({ saved, wheel, ours, here, q }: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; here: Here | null; q: Record<string, string | undefined> }) {
  const cfg = clampFold(saved);
  const hero = q['2'] !== undefined ? HUG : HERO;
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  return <FoldPage cfg={cfg} wheel={wheel} ours={ours} forced={forced} here={here} noGl={q.gl === '0'} hero={hero} />;
}
