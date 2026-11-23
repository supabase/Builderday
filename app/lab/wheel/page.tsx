import type { Metadata } from 'next';
import saved from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { WheelLab } from '@/components/lab/wheel-lab';
import { isDirection } from '@/components/lab/wheel/direction-list';
import { ourWheel } from '@/components/lab/wheel/our-facts';

export const metadata: Metadata = { title: 'Wheel lab', description: 'Tuning page for the city wheel: the study rebuilt, and three directions with our facts.', robots: { index: false } };

/* ?dir= picks the direction, ?city= the first city (a number), ?gl=0 turns WebGL off, ?bare hides the lab chrome */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, dir = q.dir && isDirection(q.dir) ? q.dir : 'study';
  return <WheelLab saved={clampWheel(saved)} forced={q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ourWheel().cities.length - 1, Math.round(Number(q.city)) || 0)) : null} noGl={q.gl === '0'} bare={q.bare !== undefined} dir={dir} ours={ourWheel()} />;
}
