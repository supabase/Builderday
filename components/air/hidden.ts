/* Votes hidden from minute 70 (owner, 2026-11-23): from 70 minutes after a city starts until its voting closes, its
   counts and its order are frozen; then they are revealed. The rule and the frozen view are the model's (the city's
   world carries `hidden`, `hideAt` and rows with no counts); the pages only draw it. Until the model carries them,
   the pages read them as missing (not hidden), and a lab can force the rule with ?hidden=1, which this file plays
   from the seeded day: the order as it stood at the minute, the counts gone, new entries at the bottom. */

/* only for the lab's forced view, while the model has no `hideAt` of its own */
export const HIDE_AFTER_LAB = 70;

type Hideable = { hidden?: boolean; hideAt?: number | null };
/* the model's word on a world (city or home city), read without trusting its shape */
export function modelHidden(w: unknown): { hidden: boolean; hideAt: number | null } {
  const h = (w ?? {}) as Hideable;
  return { hidden: h.hidden === true, hideAt: typeof h.hideAt === 'number' && isFinite(h.hideAt) ? h.hideAt : null };
}

/* the lab's rule for one city: live (building or last votes) and past the minute */
export function forcedHidden(x: { start: number; state: string }, now: number, after = HIDE_AFTER_LAB): boolean {
  return (x.state === 'build' || x.state === 'vote') && now >= x.start + after;
}

/* the view a page draws: hidden (counts and order frozen now), from when, and until when */
export type HideView = { hidden: boolean; hideAt: number | null; until: number };
export function hideView(w: unknown, x: { start: number; end: number; state: string }, now: number, force: boolean | null): HideView {
  const m = modelHidden(w);
  if (force === false) return { hidden: false, hideAt: m.hideAt, until: x.end };
  if (force === true) return { hidden: forcedHidden(x, now), hideAt: x.start + HIDE_AFTER_LAB, until: x.end };
  return { hidden: m.hidden, hideAt: m.hideAt, until: x.end };
}
