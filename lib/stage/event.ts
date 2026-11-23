/* The event a wall belongs to, as a small plain object the server hands the wall and the remote. Builder Day's walls
   keep reading EVENT and PRIZES from the code (`bd` is true and every scene takes its old branch); a place of another
   event reads its own name, format and prizes from here. Pure. */

import { EVENT } from '@/lib/day-data';
import { PRIZES } from '@/lib/prizes';
import { BUILDER_DAY, type Decide, type Format, type Judging } from '@/lib/event/format';

export type WallEvent = {
  id: string; bd: boolean; name: string; short: string;
  decide: Decide; judging: Judging; finalOn: boolean; finalists: number; pickers: string;
  prize: string; placePrize: string;
  /* how many places the event has (a final needs more than one) */
  places: number;
};

export const BD_WALL: WallEvent = {
  id: EVENT.id, bd: true, name: EVENT.name, short: EVENT.short,
  decide: BUILDER_DAY.decide, judging: BUILDER_DAY.judging, finalOn: true, finalists: EVENT.finalists, pickers: EVENT.pickers,
  prize: PRIZES.global.what ?? '', placePrize: PRIZES.city.what ?? '', places: 10,
};

/* the wall's event from the event's record; Builder Day's record gives Builder Day's wall as it has always been */
export function wallEvent(e: { id: string; name: string; short: string; f: Format } | null, places: number): WallEvent {
  if (!e || e.id === EVENT.id) return BD_WALL;
  return {
    id: e.id, bd: false, name: e.name, short: e.short,
    decide: e.f.decide, judging: e.f.judging, finalOn: e.f.finalOn, finalists: e.f.finalists, pickers: e.f.pickers,
    prize: e.f.prize, placePrize: e.f.placePrize, places,
  };
}

/* a final across places: on, and more than one place to draw from */
export const hasFinal = (e: WallEvent) => e.bd || (e.finalOn && e.places > 1);
/* a public vote: everywhere but where judges decide alone */
export const hasVote = (e: WallEvent) => e.decide !== 'judges';

/* what the wall's ranking counts at a phase:
   - votes: every vote (Builder Day, and a votes-only event, where judges have none);
   - public: the people's choice only (judges pick the winner apart);
   - judge: the judges' votes, only once everything has closed (a judged event that votes with a budget);
   - none: no numbers and no order (a judged event while it runs, or one that scores: scores never reach the wall). */
export type RankBy = 'votes' | 'public' | 'judge' | 'none';
export function rankBy(e: Pick<WallEvent, 'decide' | 'judging'>, done: boolean): RankBy {
  if (e.decide === 'apart') return 'public';
  if (e.decide === 'judges') return done && e.judging === 'budget' ? 'judge' : 'none';
  return 'votes';
}
