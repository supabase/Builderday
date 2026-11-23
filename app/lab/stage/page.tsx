import type { Metadata } from 'next';
import { headers } from 'next/headers';
import saved from '@/saved/stage.config.json';
import day from '@/saved/day.config.json';
import { CITY_IDS } from '@/lib/day-data';
import { clampStage, type StageCfg } from '@/lib/stage/config';
import { CONTENTS, type Content } from '@/lib/stage/world';
import { serverNow } from '@/lib/stage/lab';
import { loadStage } from '@/lib/stage/server';
import { StageLab } from '@/components/stage/stage-lab';

export const metadata: Metadata = { title: 'Stage lab', description: 'The wall and the remote side by side, joined in the browser.', robots: { index: false } };

/* ?dir=tube|board|plain, ?city=<id>, ?m=<moment> (doors, needs, line, deadline, start, build, late, vote, top3, tombola,
   final), ?scene=<kind> (any scene of the deck at the moment's times), ?step=<n>, ?content=seeded|none|many|long|tie, ?hold=1 (the clock stands still: for stills), ?speed=10|60 (a faster clock), ?at=<ms> (the
   instant a held clock shows), ?only=wall|remote (one side alone, for stills), ?qr=1 (the room code over the scene) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:4320', proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const cfg = clampStage({ ...(saved as Partial<StageCfg>), ...(q.dir ? { dir: q.dir } : {}) });
  const city = q.city && CITY_IDS.includes(q.city) ? q.city : 'london';
  const content = (CONTENTS.some(([c]) => c === q.content) ? q.content : 'seeded') as Content;
  const hold = q.hold === '1';
  /* a held clock without ?at stands at 09:20 in Berlin on the day, so stills are the same every time */
  /* whether the real pages can run on Realtime here: the stage tables exist and answer */
  const rt = q.only ? false : (await loadStage(city, { hidden: false, code: false })) !== null;
  const first = Number(q.at) || (hold ? Date.UTC(2026, 11, 10, 8, 20) : serverNow());
  return <StageLab start={{ cfg, first, seed: Number((day as { seed?: number }).seed) || 17, city, moment: q.m || 'doors', step: Number(q.step) || 0, content, hold, speed: [1, 10, 60].includes(Number(q.speed)) ? Number(q.speed) : 1, origin: proto + '://' + host, scene: q.scene || '', only: q.only === 'wall' || q.only === 'remote' ? q.only : '', qr: q.qr === '1', rt }} />;
}
