import type { Metadata } from 'next';
import saved from '@/saved/prize-art.config.json';
import { clampArt, type PrizeArtCfg } from '@/components/prize/config';
import { PrizeArtLab } from '@/components/lab/prize-art-lab';

export const metadata: Metadata = { title: 'Prize art lab', description: 'The prizes drawn in characters, every value on a knob.', robots: { index: false } };

/* ?show=pro|mini|neo|quest|credits|box opens on that prize */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <PrizeArtLab saved={clampArt({ ...(saved as Partial<PrizeArtCfg>), ...(q.show ? { show: q.show as PrizeArtCfg['show'] } : {}) })} />;
}
