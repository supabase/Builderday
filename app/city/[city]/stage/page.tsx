import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import saved from '@/saved/stage.config.json';
import day from '@/saved/day.config.json';
import { CITIES, CITY_IDS, EPOCH, SCHED, sched } from '@/lib/day-data';
import { clampStage, type StageCfg } from '@/lib/stage/config';
import { defaultDeck, visible } from '@/lib/stage/deck';
import { labCity, labRow, serverNow } from '@/lib/stage/lab';
import { loadStage, placeName, stageRights, wallEventFor } from '@/lib/stage/server';
import { StageLive, type WallStart } from '@/components/stage/stage-live';
import '@/components/stage/stage.css';
import { at } from '@/lib/routes';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { city } = await params, name = CITIES.find((x) => x.id === city)?.name ?? await placeName(city);
  return { title: name ? name + ' stage' : 'Stage', description: 'The wall in the room: open it on the laptop that feeds the projector.', robots: { index: false } };
}

/* The wall in the room. Open it on the laptop that feeds the projector and press F for full screen. Signed in at the
   desk as a host of the city, the laptop's keys drive it too; otherwise it follows the remote. With no backend it
   shows the seeded day and says so. A place of another event (on the desk, not in the code's list) needs the backend:
   its name comes from its row, and with no stage to read it says so instead of a seeded day. */
export default async function Page({ params }: P) {
  const { city } = await params;
  const known = CITY_IDS.includes(city), name = known ? CITIES.find((x) => x.id === city)!.name : await placeName(city);
  if (!name) notFound();
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:4320', proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const cfg = clampStage(saved as Partial<StageCfg>), first = serverNow();
  const who = await stageRights(city);
  const [stage, event] = await Promise.all([loadStage(city, { hidden: false, code: who.drive }), wallEventFor(city)]);
  /* the address on the wall's QR: the city page, which only Builder Day has. Another event's places have no page to
     sign in and submit on yet, so their wall shows the room code alone (builders use it from their editor). */
  const url = event.bd ? proto + '://' + host + at('/city/' + city) : '';
  const base = { city, name, url, cfg, first, seed: Number((day as { seed?: number }).seed) || 17, event };
  let start: WallStart;
  if (stage) {
    start = { ...base, local: null, note: '', live: { stage, can: { drive: who.drive, super: who.super }, url: process.env.NEXT_PUBLIC_SUPABASE_URL!, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, talkMin: cfg.talkMin } };
  } else if (!known) {
    return (
      <main className="sp-rm sp-msg">
        <h1>{name} stage</h1>
        <p>The stage cannot be read right now. Reload in a moment.</p>
      </main>
    );
  } else {
    /* the seeded day on this browser's own driver: the planned start from the schedule, no room code */
    const deck = defaultDeck(city), at = sched(SCHED).cs.find((x) => x.city.id === city)!.start;
    const lc = { ...labCity(city, first), planned_start: EPOCH + at * 60000, room_code: null, listed: null, here: null };
    start = { ...base, live: null, local: { deck, row: labRow(city, visible(deck)[0].id), city: lc }, note: 'Not connected: this wall shows the seeded day and only this browser drives it.' };
  }
  return <StageLive start={start} />;
}
