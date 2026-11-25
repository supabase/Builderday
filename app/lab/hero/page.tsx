import type { Metadata } from 'next';
import saved from '@/saved/fold.config.json';
import hero from '@/saved/hero.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { clampHero, type HeroCfg } from '@/components/wheel/hero-config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { HeroLab } from '@/components/lab/hero-lab';
import { backendOn } from '@/lib/server/env';
import { FormsProvider } from '@/components/forms/forms-provider';

export const metadata: Metadata = { title: 'Hero lab', description: 'Tuning page for the first screen’s left side: the words and the city’s row on the wheel’s line.', robots: { index: false } };

function requestTime() { return Date.now(); }

/* ?mode= row | ticket | spoke, ?city=, ?gl=0, ?bare (no panel, for stills) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const h = clampHero({ ...(hero as Partial<HeroCfg>), ...(q.mode ? { mode: q.mode as HeroCfg['mode'] } : {}) });
  return <FormsProvider live={backendOn()}><HeroLab saved={saved as Partial<FoldCfg>} hero={h} wheel={clampWheel(wheel)} ours={ourWheel()} q={q} nowMs={requestTime()} /></FormsProvider>;
}
