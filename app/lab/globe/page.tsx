import type { Metadata } from 'next';
import saved from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { GlobeLab } from '@/components/lab/globe-lab';
import { ourWheel } from '@/components/preview/facts';

export const metadata: Metadata = { title: 'Globe lab', description: 'Tuning page for the text globe: how it arrives, turns, comes to rest, shows the morning, marks the cities and hands over to the header.', robots: { index: false } };

/* ?city= the first city (a number), ?bare hides the lab chrome */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, ours = ourWheel();
  const city = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : 0;
  return <GlobeLab saved={clampWheel(saved)} ours={ours} first={city} bare={q.bare !== undefined} />;
}
