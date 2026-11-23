/* The tables' rows as the stage's shapes, and back (supabase/migrations, `cities`, `scenes`, `stage`). Times in the
   database are timestamps; on the stage they are ms. The stage row's `timer` json keeps the plan's talk timer
   ({ ends_at, paused_left }, ms); the QR is the row's `qr` column; the deadline the wall said and the tombola's draw
   live in the row's `data` json. Pure. */

import { ZONE, localTime } from '@/lib/places';
import type { CityLive, SceneKind, SceneRow, StageRow, StageTimer } from './types';

type Json = Record<string, unknown>;
const ms = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
};
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {});

export function sceneFrom(r: Json): SceneRow {
  return {
    id: String(r.id), city: String(r.city), position: Number(r.position) || 0, kind: String(r.kind) as SceneKind,
    title: String(r.title ?? ''), data: obj(r.data), notes: String(r.notes ?? ''), hidden: !!r.hidden,
  };
}
export const deckFrom = (rows: Json[]) => rows.map(sceneFrom).sort((a, b) => a.position - b.position);

export function stageFrom(r: Json): StageRow {
  const t = obj(r.timer), d = obj(r.data), spin = obj(d.spin);
  const timer: StageTimer = {
    ends_at: ms(t.ends_at), paused_left: typeof t.paused_left === 'number' ? t.paused_left : null,
    qr: !!r.qr, deadline: ms(d.deadline),
    spin: typeof spin.at === 'number' && typeof spin.seed === 'number' ? { at: spin.at, seed: spin.seed } : null,
  };
  return {
    city: String(r.city), scene: r.scene ? String(r.scene) : '', step: Number(r.step) || 0, timer,
    chart_on: !!r.chart_on, blank: !!r.blank, updated_at: ms(r.updated_at) ?? 0, updated_by: r.updated_by ? String(r.updated_by) : null,
  };
}
/* the columns a press writes (the host's update grant on `stage`) */
export function stageTo(r: StageRow): Json {
  return {
    scene: r.scene || null, step: r.step, chart_on: r.chart_on, blank: r.blank, qr: !!r.timer.qr,
    timer: { ends_at: r.timer.ends_at ?? null, paused_left: r.timer.paused_left ?? null },
    data: { deadline: r.timer.deadline ?? null, spin: r.timer.spin ?? null },
    updated_at: new Date(r.updated_at || Date.now()).toISOString(), updated_by: r.updated_by,
  };
}

/* the city's times; the room code and the door's counts are not readable by everyone, so they come apart */
export function cityFrom(r: Json, extra: { room_code: string | null; listed: number | null; here: number | null }): CityLive {
  return {
    id: String(r.id), planned_start: ms(r.planned_start) ?? 0, build_min: Number(r.build_min) || 90, vote_after: Number(r.vote_after) || 0,
    build_start: ms(r.build_start), build_end: ms(r.build_end), vote_end: ms(r.vote_end),
    submissions_paused: !!r.submissions_paused, voting_paused: !!r.voting_paused, zone: r.zone ? String(r.zone) : null, ...extra,
  };
}
export const CITY_COLS = 'id, zone, planned_start, build_min, vote_after, build_start, build_end, vote_end, submissions_paused, voting_paused';

/* the time at the place at ms, as 09:41: Builder Day's cities by the code's zone (as before), any other place by its
   row's zone */
export function placeTime(c: Pick<CityLive, 'id' | 'zone'>, ms: number): string {
  if (ZONE[c.id] || !c.zone) return localTime(c.id, ms);
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: c.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms); } catch { return localTime(c.id, ms); }
}
