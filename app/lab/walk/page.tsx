import type { Metadata } from 'next';
import saved from '@/saved/walk.config.json';
import { clampWalk, type WalkCfg } from '@/components/preview/walk/config';
import { WalkLab } from '@/components/lab/walk-lab';

export const metadata: Metadata = { title: 'Walk lab', description: 'How it works as a walk through one city’s 90 minutes, every value on a knob.', robots: { index: false } };

/* ?mode=race|tower|ledger opens on that mode */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <WalkLab saved={clampWalk({ ...(saved as Partial<WalkCfg>), ...(q.mode ? { mode: q.mode as WalkCfg['mode'] } : {}) })} />;
}
