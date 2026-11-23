/* What a press does: one pure function from (deck, row, city, action, now) to the new row and, for the presses that
   set the city's clock, the new city times. Both drivers call it, so a press means the same thing on the lab's local
   driver and on the Realtime one. Times are ms. Pure. */

import { nextWords, stepsOf, visible } from './deck';
import type { CityLive, SceneRow, StageAction, StageRow } from './types';

export type ActOut = { row: StageRow; city?: Partial<CityLive>; ask?: string } | null;

/* the deadline the wall says when it flips: now plus the building time, up to the next five minutes */
export function deadlineAt(now: number, buildMin: number): number { const five = 5 * 60000; return Math.ceil((now + buildMin * 60000) / five) * five; }
/* where building ends when the host starts the clock: the deadline the wall said, if there is still at least half
   the building time to it; otherwise the full building time from now */
export function buildEndFor(row: StageRow, city: CityLive, now: number): number {
  const d = row.timer.deadline, min = city.build_min * 60000;
  return d && d - now >= min / 2 ? d : now + min;
}
export const started = (c: CityLive) => c.build_start !== null;

/* the question a press asks before it is done (Start building, Close voting); null when it asks nothing */
export function askOf(deck: SceneRow[], row: StageRow, city: CityLive, a: StageAction, cityName: string, at: (ms: number) => string, now: number): string | null {
  const s = visible(deck).find((x) => x.id === row.scene);
  if (a.t === 'start' || (a.t === 'next' && s?.kind === 'building' && !started(city)))
    return started(city) ? null : 'Start the clock for ' + cityName + '? Building ends at ' + at(buildEndFor(row, city, now)) + '. This cannot be undone.';
  if (a.t === 'close') return 'Close voting in ' + cityName + ' now? This cannot be undone.';
  return null;
}

export function act(deck: SceneRow[], row: StageRow, city: CityLive, a: StageAction, now: number, by: string | null, talkMin = 2): ActOut {
  const v = visible(deck), i = Math.max(0, v.findIndex((s) => s.id === row.scene)), s = v[i];
  const out = (r: Partial<StageRow>, c?: Partial<CityLive>): ActOut => ({ row: { ...row, ...r, updated_at: now, updated_by: by }, city: c });
  const go = (j: number, step: number): ActOut => { const t = v[j]; return t ? out({ scene: t.id, step, timer: { ...row.timer, ends_at: null, paused_left: null, spin: null } }) : null; };
  const startClock = (): ActOut => {
    if (started(city)) return null;
    const end = buildEndFor(row, city, now);
    return out({}, { build_start: now, build_end: end, vote_end: end + city.vote_after * 60000 });
  };
  switch (a.t) {
    case 'next': {
      if (!s) return go(0, 0);
      /* Building's next press starts the clock (once, asked first); after that it moves on */
      if (s.kind === 'building' && !started(city)) return startClock();
      /* the tombola's next press spins */
      if (s.kind === 'tombola' && row.step === 0) return out({ step: 1, timer: { ...row.timer, spin: { at: now, seed: Math.floor(now % 1e9) } } });
      if (row.step + 1 < stepsOf(s)) {
        /* the deadline's flip: the wall says it, so the clock keeps to it */
        const t = s.kind === 'deadline' && row.step === 0 ? { ...row.timer, deadline: started(city) ? city.build_end : deadlineAt(now, city.build_min) } : row.timer;
        return out({ step: row.step + 1, timer: t });
      }
      return go(i + 1, 0);
    }
    case 'back': {
      if (!s) return go(0, 0);
      if (row.step > 0) return out({ step: row.step - 1, timer: s.kind === 'tombola' ? { ...row.timer, spin: null } : row.timer });
      const p = v[i - 1]; return p ? go(i - 1, s.kind === 'tombola' ? 0 : stepsOf(p) - 1) : null;
    }
    case 'jump': return a.i >= 0 && a.i < v.length ? go(a.i, 0) : null;
    case 'blank': return out({ blank: !row.blank });
    case 'qr': return out({ timer: { ...row.timer, qr: !row.timer.qr } });
    case 'chart': return out({ chart_on: !row.chart_on });
    case 'start': return startClock();
    case 'add': {
      if (!started(city) || !city.build_end || !city.vote_end) return null;
      const ms = a.min * 60000;
      /* while building: building and voting both move; once building has closed: voting only */
      if (now < city.build_end) return out({}, { build_end: city.build_end + ms, vote_end: city.vote_end + ms });
      if (now < city.vote_end) return out({}, { vote_end: city.vote_end + ms });
      return null;
    }
    case 'close': {
      if (!started(city) || !city.vote_end || now >= city.vote_end) return null;
      return out({}, { build_end: Math.min(city.build_end ?? now, now), vote_end: now });
    }
    case 'talk': {
      const on = row.timer.ends_at && row.timer.ends_at > now;
      return out({ timer: { ...row.timer, ends_at: on ? null : now + talkMin * 60000, paused_left: null } });
    }
    case 'spin': return s?.kind === 'tombola' ? out({ step: 1, timer: { ...row.timer, spin: { at: now, seed: Math.floor((now * 7.31) % 1e9) } } }) : null;
  }
}
export { nextWords };
