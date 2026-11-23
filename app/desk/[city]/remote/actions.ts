'use server';
/* The stage's presses and reads from a browser: the remote's keys, a laptop's keys on the wall, and the wall's door
   counts. Every press is checked on the server (a host of the city, signed in at the desk) before anything is
   written; see lib/stage/server.ts. */
import saved from '@/saved/stage.config.json';
import { clampStage, type StageCfg } from '@/lib/stage/config';
import { drive, loadStage, stageRights, type DriveOut } from '@/lib/stage/server';
import type { CityLive, StageAction } from '@/lib/stage/types';

const KINDS = new Set(['next', 'back', 'jump', 'blank', 'qr', 'chart', 'start', 'add', 'close', 'talk', 'spin']);
const talkMin = clampStage(saved as Partial<StageCfg>).talkMin;

export async function stageDrive(city: string, a: StageAction): Promise<DriveOut> {
  if (!a || typeof a !== 'object' || !KINDS.has(a.t)) return { ok: false, why: 'That key does nothing.' };
  if (a.t === 'jump' && !Number.isInteger(a.i)) return { ok: false, why: 'That scene is not in the deck.' };
  if (a.t === 'add' && ![1, 5].includes(a.min)) return { ok: false, why: 'Add one or five minutes.' };
  return drive(String(city), a, talkMin);
}

/* the city's times and door counts again (the clock is not carried by Realtime); the room code only for a host */
export async function stageCity(city: string): Promise<{ city: CityLive; at: number } | null> {
  const who = await stageRights(String(city));
  const s = await loadStage(String(city), { hidden: false, code: who.drive });
  return s ? { city: s.city, at: Date.now() } : null;
}
