import type { Metadata } from 'next';
import { Poster } from '@/components/desk/poster';
import { siteUrl } from '@/lib/server/env';
import '@/components/forms/forms.css';
import { EVENT } from '@/lib/day-data';

export const metadata: Metadata = { title: 'Door poster · ' + EVENT.name, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* /desk/poster?city=<id>: the A4 poster for the door, with the room code */
type Q = Record<string, string | string[] | undefined>;
export default async function PosterPage({ searchParams }: { searchParams: Promise<Q> }) {
  const c = (await searchParams).city;
  return <Poster city={typeof c === 'string' && /^[a-z0-9-]{1,40}$/.test(c) ? c : null} site={siteUrl()} />;
}
