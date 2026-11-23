import type { Metadata } from 'next';
import saved from '@/saved/fold.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { ArriveLab } from '@/components/lab/arrive-lab';
import { backendOn } from '@/lib/server/env';
import { FormsProvider } from '@/components/forms/forms-provider';

export const metadata: Metadata = { title: 'Arrive lab', description: 'The first screen of the preview with its ten arrivals, numbered.', robots: { index: false } };

function requestTime() { return Date.now(); }

/* ?n= opens on an arrival by its number (1 to 10), ?gl=0 draws without WebGL */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <FormsProvider live={backendOn()}><ArriveLab saved={saved as Partial<FoldCfg>} wheel={clampWheel(wheel)} ours={ourWheel()} q={q} nowMs={requestTime()} /></FormsProvider>;
}
