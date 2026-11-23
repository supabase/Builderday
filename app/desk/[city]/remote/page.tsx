import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import saved from '@/saved/stage.config.json';
import { CITIES, CITY_IDS } from '@/lib/day-data';
import { clampStage, type StageCfg } from '@/lib/stage/config';
import { serverNow } from '@/lib/stage/lab';
import { loadStage, placeName, stageRights, wallEventFor } from '@/lib/stage/server';
import { RemoteLive } from '@/components/stage/stage-live';
import '@/components/stage/stage.css';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { themeColor: '#0c0d0d', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { city } = await params, name = CITIES.find((x) => x.id === city)?.name ?? await placeName(city);
  return { title: name ? name + ' remote' : 'Remote', robots: { index: false } };
}

/* The host's phone. Signed in at the desk as a host of the city, it drives the wall; otherwise it says what to do. */
export default async function Page({ params }: P) {
  const { city } = await params;
  /* Builder Day's cities from the code; a place of another event from its row (backend only) */
  const name = CITY_IDS.includes(city) ? CITIES.find((x) => x.id === city)!.name : await placeName(city);
  if (!name) notFound();
  const who = await stageRights(city);
  const stage = who.drive ? await loadStage(city, { hidden: true, code: true }) : null;
  if (!who.drive || !stage) {
    const why = !who.drive ? who.why : 'The stage cannot be read right now. Reload in a moment.';
    return (
      <main className="sp-rm sp-msg">
        <h1>{name} remote</h1>
        <p>{why}</p>
        <p><Link href="/desk">Sign in at the desk</Link></p>
        <p className="sp-msg-2">To try the remote with no backend, open <Link href="/lab/stage">the stage lab</Link>.</p>
      </main>
    );
  }
  const cfg = clampStage(saved as Partial<StageCfg>);
  const event = await wallEventFor(city);
  return <RemoteLive city={city} name={name} first={serverNow()} event={event} live={{ stage, can: { drive: true, super: who.super }, url: process.env.NEXT_PUBLIC_SUPABASE_URL!, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, talkMin: cfg.talkMin }} />;
}
