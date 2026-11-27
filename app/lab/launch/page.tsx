import type { Metadata } from 'next';
import saved from '@/saved/fold.config.json';
import hero from '@/saved/hero.config.json';
import wheel from '@/saved/wheel.config.json';
import launch from '@/saved/launch.config.json';
import { clampWheel } from '@/components/wheel/config';
import { clampHero, type HeroCfg } from '@/components/wheel/hero-config';
import { clampLaunch, type LaunchCfg } from '@/components/wheel/launch-config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { LaunchLab } from '@/components/lab/launch-lab';
import { backendOn } from '@/lib/server/env';
import { FormsProvider } from '@/components/forms/forms-provider';

export const metadata: Metadata = { title: 'Launch lab', description: 'Tuning page for the hero ticket’s launch: Register folds it into a paper rocket that flies to its city on the globe.', robots: { index: false } };

function requestTime() { return Date.now(); }

/* ?city= (the ticket's city), ?gl=0 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <FormsProvider live={backendOn()}><LaunchLab saved={saved as Partial<FoldCfg>} hero={clampHero(hero as Partial<HeroCfg>)} wheel={clampWheel(wheel)} launch={clampLaunch(launch as Partial<LaunchCfg>)} ours={ourWheel()} q={q} nowMs={requestTime()} /></FormsProvider>;
}
