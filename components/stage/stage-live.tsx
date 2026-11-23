'use client';
import { useCallback, useEffect, useState } from 'react';
import type { StageCfg } from '@/lib/stage/config';
import { createLocalDriver, type StageDriver } from '@/lib/stage/driver';
import { createRealtimeDriver } from '@/lib/stage/realtime';
import { worldFromSnap } from '@/lib/stage/live-world';
import type { CityLive, StageRow, SceneRow, StageSnap } from '@/lib/stage/types';
import type { World } from '@/lib/stage/world';
import { BD_WALL, rankBy, type WallEvent } from '@/lib/stage/event';
import type { CitySnap, DaySnap } from '@/lib/event/snapshot';
import { stageCity, stageDrive } from '@/app/desk/[city]/remote/actions';
import { StageWall } from './wall';
import { StageRemote } from './remote';
import { at } from '@/lib/routes';

/* The real wall (/city/<id>/stage) and the real remote (/desk/<id>/remote). With the backend reachable both run on
   the Realtime driver, and the wall draws the city's own numbers (the snapshots the pages read, every few seconds).
   Without it the wall runs the local driver on the seeded day and says so in a corner; the remote does not run. */

export type Live = { stage: { deck: SceneRow[]; row: StageRow; city: CityLive }; can: StageSnap['can']; url: string; anon: string; talkMin: number };
export type WallStart = { city: string; name: string; url: string; cfg: StageCfg; first: number; seed: number; live: Live | null; local: { deck: SceneRow[]; row: StageRow; city: CityLive } | null; note: string; event?: WallEvent };

const realtime = (id: string, l: Live): StageDriver => createRealtimeDriver({
  url: l.url, anon: l.anon, start: l.stage, can: l.can, talkMin: l.talkMin,
  send: (a) => stageDrive(id, a), refresh: () => stageCity(id),
});

/* the city's numbers for the wall: its snapshot every few seconds, the other nine every half minute */
function useNumbers(id: string, on: boolean) {
  const [snap, setSnap] = useState<CitySnap | null>(null);
  const [day, setDay] = useState<DaySnap | null>(null);
  useEffect(() => {
    if (!on) return;
    let stop = false;
    const get = async <T,>(u: string, f: (v: T) => void) => { try { const r = await fetch(at(u), { cache: 'no-store' }); if (r.ok && !stop) f(await r.json() as T); } catch { /* the next read tries again */ } };
    const city = () => get<CitySnap>('/api/city/' + id + '/snapshot', setSnap), all = () => get<DaySnap>('/api/day/snapshot', setDay);
    void city(); void all();
    const a = window.setInterval(city, 5000), b = window.setInterval(all, 30000);
    /* a page that was hidden, frozen or offline reads both again as soon as it is back */
    const back = () => { if (document.visibilityState === 'visible') { void city(); void all(); } };
    document.addEventListener('visibilitychange', back); document.addEventListener('resume', back);
    window.addEventListener('online', back); window.addEventListener('pageshow', back);
    return () => {
      stop = true; window.clearInterval(a); window.clearInterval(b);
      document.removeEventListener('visibilitychange', back); document.removeEventListener('resume', back);
      window.removeEventListener('online', back); window.removeEventListener('pageshow', back);
    };
  }, [id, on]);
  return { snap, day };
}

export function StageLive({ start }: { start: WallStart }) {
  const [driver] = useState<StageDriver>(() => start.live ? realtime(start.city, start.live) : createLocalDriver({ ...start.local!, talkMin: start.cfg.talkMin }));
  useEffect(() => () => driver.close(), [driver]);
  const { snap, day } = useNumbers(start.city, !!start.live);
  /* the ranking counts what the place's event says (Builder Day: every vote, as always) */
  const ev = start.event ?? BD_WALL;
  const by = useCallback((done: boolean) => rankBy(ev, done), [ev]);
  const source = useCallback((o: { city: CityLive; now: number; rows: number; arrivals: number }): World => worldFromSnap({ snap, day, ...o, by }), [snap, day, by]);
  /* the pointer hides after two seconds without moving */
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let id = 0;
    const move = () => { setIdle(false); window.clearTimeout(id); id = window.setTimeout(() => setIdle(true), 2000); };
    move(); window.addEventListener('pointermove', move);
    return () => { window.clearTimeout(id); window.removeEventListener('pointermove', move); };
  }, []);
  return (
    <main className="sp" data-idle={idle ? '' : undefined}>
      <StageWall driver={driver} cfg={start.cfg} name={start.name} url={start.url} seed={start.seed} content="seeded" first={start.first} keys source={start.live ? source : undefined} event={ev} />
      {start.note ? <p className="sp-note" role="status">{start.note}</p> : null}
    </main>
  );
}

export function RemoteLive({ city, name, first, live, event = BD_WALL }: { city: string; name: string; first: number; live: Live; event?: WallEvent }) {
  const [driver] = useState<StageDriver>(() => realtime(city, live));
  useEffect(() => () => driver.close(), [driver]);
  return <main className="sp-rm"><StageRemote driver={driver} name={name} first={first} event={event} /></main>;
}
