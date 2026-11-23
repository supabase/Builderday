import type { Metadata } from 'next';
import { DeskLive } from '@/components/desk/live';
import { mailDriver } from '@/lib/server/mail';
import { siteUrl } from '@/lib/server/env';

export const metadata: Metadata = { title: 'Desk', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* /desk: admins, hosts and judges. ?event=<id> opens an event, ?city=<id> one of its places, ?tab= a screen. Signing
   in is the six-digit code. */
type Q = Record<string, string | string[] | undefined>;
export default async function DeskPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v) ? v : null);
  return <DeskLive event={one(q.event)} city={one(q.city)} tab={one(q.tab) || undefined} mail={mailDriver()} site={siteUrl()} />;
}
