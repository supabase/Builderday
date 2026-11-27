/* Votes hidden until minute 60 (owner, 2026-11-25): from the start of a city until 60 minutes in, no count shows and
   the order is the order entries came in; from 60 every count shows and stays live until everything closes at 90. The
   rule and the view are the model's (the city's world carries `hidden`, `showAt` and rows with no counts); the pages
   only draw it. A lab can force the rule with ?hidden=1, which this file plays from the seeded day. */

/* only for the lab's forced view: the minute counts show */
export const SHOW_AT_LAB = 60;

type Hideable = { hidden?: boolean; showAt?: number | null };
/* the model's word on a world (city or home city), read without trusting its shape */
export function modelHidden(w: unknown): { hidden: boolean; showAt: number | null } {
  const h = (w ?? {}) as Hideable;
  return { hidden: h.hidden === true, showAt: typeof h.showAt === 'number' && isFinite(h.showAt) ? h.showAt : null };
}

/* the lab's rule for one city: live (building or voting) and not yet at the minute counts show */
export function forcedHidden(x: { start: number; state: string }, now: number, until = SHOW_AT_LAB): boolean {
  return (x.state === 'build' || x.state === 'vote') && now >= x.start && now < x.start + until;
}
