/* The lab's moments: each sets the city's live times around a given instant and puts one scene on the wall, so every
   scene can be tried at the moment it is meant for, and a still can be taken there (`?m=` on /lab/stage). Times are
   laid around `now`, so a held clock gives the same picture every time. Pure. */

import { CITIES, CITY_IDS } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { deadlineAt } from './act';
import type { CityLive, SceneKind, SceneRow, StageRow } from './types';

export type Moment = { id: string; label: string; kind: SceneKind; step: number; set: (now: number, c: CityLive) => Partial<CityLive>; deadline?: boolean };
const M = 60000;
const before = (now: number, c: CityLive): Partial<CityLive> => ({ planned_start: now + 40 * M, build_start: null, build_end: null, vote_end: null, listed: 142, here: 61, build_min: c.build_min });
const runFor = (min: number) => (now: number, c: CityLive): Partial<CityLive> => {
  const s = now - min * M, e = s + c.build_min * M;
  return { planned_start: s, build_start: s, build_end: e, vote_end: e + c.vote_after * M, listed: 142, here: 118 };
};
export const MOMENTS: Moment[] = [
  { id: 'doors', label: 'Doors', kind: 'doors', step: 0, set: before },
  { id: 'needs', label: 'The needs', kind: 'needs', step: 0, set: before },
  { id: 'line', label: 'The line', kind: 'line', step: 0, set: before },
  /* the deadline is said just before the clock starts: the planned start is a few minutes off */
  { id: 'deadline', label: 'Deadline', kind: 'deadline', step: 0, set: (n, c) => ({ ...before(n, c), planned_start: n + 3 * M }) },
  { id: 'start', label: 'Start', kind: 'building', step: 0, set: before, deadline: true },
  { id: 'build', label: 'Building 25 min in', kind: 'building', step: 0, set: runFor(25) },
  { id: 'late', label: '6 min left', kind: 'building', step: 0, set: (n, c) => runFor(c.build_min - 6)(n, c) },
  { id: 'vote', label: 'Voting', kind: 'voting', step: 0, set: (n, c) => runFor(c.build_min + 12)(n, c) },
  { id: 'top3', label: 'The top 3', kind: 'top3', step: 0, set: (n, c) => runFor(c.build_min + c.vote_after + 4)(n, c) },
  { id: 'tombola', label: 'Tombola', kind: 'tombola', step: 0, set: (n, c) => runFor(c.build_min + c.vote_after + 9)(n, c) },
  { id: 'final', label: 'The final', kind: 'final', step: 0, set: (n, c) => runFor(c.build_min + c.vote_after + 12)(n, c) },
];

/* the lab's room code: three letters of the city and a seeded number (the real one is on the city row) */
export const labCode = (id: string) => CODE[id] + '-' + String(4100 + CITY_IDS.indexOf(id) * 37).slice(-4);

export function labCity(id: string, now: number): CityLive {
  const c = CITIES[Math.max(0, CITY_IDS.indexOf(id))];
  return {
    id: c.id, planned_start: now + 40 * M, build_min: 90, vote_after: 30, build_start: null, build_end: null, vote_end: null,
    room_code: labCode(c.id), submissions_paused: false, voting_paused: false, listed: 142, here: 61,
  };
}
export const labRow = (city: string, scene: string, step = 0): StageRow => ({ city, scene, step, timer: {}, chart_on: false, blank: false, updated_at: 0, updated_by: null });

/* a moment's row and city: the scene of its kind (shown even if hidden, as the tombola is), the times around now */
export function atMoment(m: Moment, deck: SceneRow[], city: CityLive, now: number): { deck: SceneRow[]; row: StageRow; city: CityLive } {
  const d = deck.map((s) => (s.kind === m.kind ? { ...s, hidden: false } : s)), s = d.find((x) => x.kind === m.kind) ?? d[0];
  const c = { ...city, ...m.set(now, city) }, row = labRow(city.id, s.id, m.step);
  if (m.deadline) row.timer = { deadline: deadlineAt(now - 4 * M, c.build_min) };
  return { deck: d, row, city: c };
}
/* the server's time when a page is asked for (the wall's first second, so the server and the browser agree) */
export const serverNow = () => Date.now();
