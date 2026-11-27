/* format.ts: an event's format, the presets a new event starts from, how a place's entries are ranked under it, and
   the format said in words for the desk. The database holds the same fields on `events`
   (supabase/migrations/20261119100000_events.sql); the server maps the row with formatOf(). Pure. */

export type Decide = 'votes' | 'judges' | 'both' | 'apart';
export type Judging = 'budget' | 'scores';
export type Criterion = { id: string; name: string };

export type Format = {
  decide: Decide; judging: Judging; judgeBudget: number; criteria: Criterion[];
  finalOn: boolean; finalists: number; finalBy: 'pickers' | 'judges'; pickers: string;
  buildMin: number; voteAfter: number;
  /* the counts are hidden from the public from the start until this minute, then shown live; null: never hidden
     (column show_at, supabase/migrations/20261125110000_one_block.sql) */
  showAt: number | null;
  /* minutes after a place starts when voting opens, for everyone alike; null: from the start (column public_at) */
  publicAt: number | null;
  /* minutes after the start when judges may vote; null: with everyone else (column judge_at) */
  judgeAt: number | null;
  /* what one judge's vote counts in the tally (judge_weight); judgeBudget is in the judge's own votes */
  judgeWeight: number;
  roomCode: boolean; repoRequired: boolean; repoNew: boolean; demoRequired: boolean;
  prize: string; placePrize: string;
};

export const CRITERIA: Criterion[] = [{ id: 'idea', name: 'Idea' }, { id: 'build', name: 'Execution' }, { id: 'supabase', name: 'Use of Supabase' }];

/* Builder Day's format (2026-11-25): one 90-minute block, voting from the start (changed 2026-11-26), counts shown and judges in at 60,
   everything closed at 90; the top 3 of each place go to the global final */
export const BUILDER_DAY: Format = {
  decide: 'both', judging: 'budget', judgeBudget: 10, criteria: CRITERIA,
  finalOn: true, finalists: 3, finalBy: 'pickers', pickers: 'the Supabase team',
  buildMin: 90, voteAfter: 0, showAt: 60, publicAt: 0, judgeAt: 60, judgeWeight: 5,
  roomCode: true, repoRequired: true, repoNew: true, demoRequired: false,
  prize: 'A MacBook Pro', placePrize: 'A Meta Quest 3',
};

/* what a new event starts from; everything can be changed after */
export type Preset = { id: string; name: string; line: string; f: Partial<Format> };
export const PRESETS: Preset[] = [
  { id: 'builder', name: 'Votes and judges', line: 'Anyone votes, judges add their votes to the same tally. The top of each place goes to a final.', f: { decide: 'both', judging: 'budget', finalOn: true } },
  { id: 'judged', name: 'Judges only', line: 'Judges score every project on a few criteria. No public vote.', f: { decide: 'judges', judging: 'scores', finalOn: false, finalists: 3 } },
  { id: 'people', name: 'Votes only', line: 'Only the votes decide. Judges have no part.', f: { decide: 'votes', judging: 'budget', finalOn: false } },
  { id: 'apart', name: 'Judges, and a people’s choice', line: 'Judges score and pick the winner; the votes give a people’s choice on the side.', f: { decide: 'apart', judging: 'scores', finalOn: false } },
];
/* the row on `events`, mapped */
type Row = Record<string, unknown>;
export function formatOf(r: Row): Format {
  const crit = Array.isArray(r.criteria) ? (r.criteria as Criterion[]).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string') : CRITERIA;
  return {
    decide: (r.decide as Decide) || 'both', judging: (r.judging as Judging) || 'budget', judgeBudget: Number(r.judge_budget) || 50, criteria: crit.length ? crit : CRITERIA,
    finalOn: r.final_on !== false, finalists: Number(r.finalists) || 3, finalBy: r.final_by === 'judges' ? 'judges' : 'pickers', pickers: String(r.pickers ?? ''),
    buildMin: Number(r.build_min) || 90, voteAfter: Number(r.vote_after ?? 0),
    showAt: r.show_at == null ? null : Number(r.show_at),
    publicAt: r.public_at == null ? null : Number(r.public_at), judgeAt: r.judge_at == null ? null : Number(r.judge_at), judgeWeight: Number(r.judge_weight) || 1,
    roomCode: r.room_code !== false, repoRequired: r.repo_required !== false, repoNew: r.repo_new !== false, demoRequired: r.demo_required === true,
    prize: String(r.prize ?? ''), placePrize: String(r.place_prize ?? ''),
  };
}
export function formatRow(f: Partial<Format>): Row {
  const o: Row = {};
  if (f.decide) o.decide = f.decide;
  if (f.judging) o.judging = f.judging;
  if (f.judgeBudget != null) o.judge_budget = f.judgeBudget;
  if (f.criteria) o.criteria = f.criteria;
  if (f.finalOn != null) o.final_on = f.finalOn;
  if (f.finalists != null) o.finalists = f.finalists;
  if (f.finalBy) o.final_by = f.finalBy;
  if (f.pickers != null) o.pickers = f.pickers;
  if (f.buildMin != null) o.build_min = f.buildMin;
  if (f.voteAfter != null) o.vote_after = f.voteAfter;
  if (f.showAt !== undefined) o.show_at = f.showAt;
  if (f.publicAt !== undefined) o.public_at = f.publicAt;
  if (f.judgeAt !== undefined) o.judge_at = f.judgeAt;
  if (f.judgeWeight != null) o.judge_weight = f.judgeWeight;
  if (f.roomCode != null) o.room_code = f.roomCode;
  if (f.repoRequired != null) o.repo_required = f.repoRequired;
  if (f.repoNew != null) o.repo_new = f.repoNew;
  if (f.demoRequired != null) o.demo_required = f.demoRequired;
  if (f.prize != null) o.prize = f.prize;
  if (f.placePrize != null) o.place_prize = f.placePrize;
  return o;
}

/* the rules that hold the format together; the first broken one, in words, or null */
export function formatProblem(f: Format): string | null {
  if (f.judging === 'scores' && !(f.decide === 'judges' || f.decide === 'apart')) return 'Scores only work where judges decide alone or apart from the votes. In one tally, judges vote.';
  if (!f.criteria.length || f.criteria.length > 6) return 'Give between one and six criteria.';
  if (!(f.finalists >= 1 && f.finalists <= 20)) return 'Between 1 and 20 go to the final from each place.';
  if (!(f.buildMin >= 15 && f.buildMin <= 600)) return 'Building lasts between 15 and 600 minutes.';
  if (!(f.voteAfter >= 0 && f.voteAfter <= 240)) return 'Voting runs on between 0 and 240 minutes.';
  const end = f.buildMin + f.voteAfter, ok = (v: number | null) => v == null || (Number.isInteger(v) && v >= 0 && v < end);
  if (!ok(f.publicAt)) return 'Voting opens between the start and the close.';
  if (!ok(f.judgeAt)) return 'Judges start voting between the start and the close.';
  if (f.judgeAt != null && f.judgeAt < (f.publicAt ?? 0)) return 'Judges can’t start before voting opens.';
  if (!ok(f.showAt)) return 'Counts are shown from between the start and the close, or never hidden.';
  if (!(Number.isInteger(f.judgeWeight) && f.judgeWeight >= 1 && f.judgeWeight <= 20)) return 'A judge’s vote counts as between 1 and 20 votes.';
  if (!(f.judgeBudget >= 1 && f.judgeBudget <= 1000)) return 'A judge has between 1 and 1000 votes.';
  if (!f.repoRequired && !f.demoRequired) return null;
  return null;
}

/* who has a say, for the desk's columns */
export const hasVotes = (f: Format) => f.decide !== 'judges';

/* one entry's numbers, as the tally keeps them */
export type Tallied = { votes: number; judge: number; scoreSum?: number; scoreN?: number; reached?: number; created?: number; tie?: number | null };
export const publicVotes = (e: Tallied) => e.votes - e.judge;
/* the judges' mean total: each judge's scores added, averaged over the judges who scored */
/* the judges' average total: every score added up, over the judges who scored (score_n counts judges) */
export const meanScore = (e: Tallied) => (e.scoreN ? (e.scoreSum || 0) / e.scoreN : 0);

/* the number that ranks an entry in its place */
export function rankValue(e: Tallied, f: Format): number {
  if (f.decide === 'votes') return publicVotes(e);
  if (f.decide === 'both') return e.votes;
  return f.judging === 'scores' ? meanScore(e) : e.judge;
}

/* the order of a place's entries: the format's number, then who got there first */
export function ranked<T extends Tallied>(list: T[], f: Format, by: (e: T) => number = (e) => rankValue(e, f)): T[] {
  return list.slice().sort((a, b) => by(b) - by(a) || tieOrder(a.tie, b.tie) || (a.reached ?? a.created ?? 0) - (b.reached ?? b.created ?? 0));
}
/* inside a tie: the host's order first (tie_rank, 1 first); an entry the host has not placed comes after */
export function tieOrder(a: number | null | undefined, b: number | null | undefined): number {
  return a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b;
}
/* Ties that touch the top `top` places (the places that win something): each entry in such a tie, by key, with
   'open' until the host has placed every entry in it, then 'settled'. `list` is in ranked order. */
export function topTies<T>(list: T[], top: number, count: (e: T) => number, tie: (e: T) => number | null | undefined, key: (e: T) => string | number): Map<string | number, 'open' | 'settled'> {
  const out = new Map<string | number, 'open' | 'settled'>();
  for (let i = 0; i < list.length && i < top;) {
    let j = i + 1; while (j < list.length && count(list[j]) === count(list[i])) j++;
    if (j - i > 1) { const g = list.slice(i, j), st = g.every((e) => tie(e) != null) ? 'settled' : 'open'; g.forEach((e) => out.set(key(e), st)); }
    i = j;
  }
  return out;
}

/* the format in a few words, for the event's card and the top of Format */
export function formatLine(f: Format, places: number): string {
  const who = f.decide === 'votes' ? 'Votes decide' : f.decide === 'judges' ? (f.judging === 'scores' ? 'Judges score' : 'Judges vote') : f.decide === 'both' ? 'Votes and judges in one tally' : 'Judges decide, votes give a people’s choice';
  const fin = f.finalOn && places > 1 ? ', top ' + f.finalists + ' of each place to a final' : '';
  return who + fin + ', ' + f.buildMin + ' minutes to build.';
}
/* what the value is called on the desk */
export function rankUnit(f: Format): string {
  if (f.decide === 'votes' || f.decide === 'both') return 'votes';
  return f.judging === 'scores' ? 'score' : 'judges’ votes';
}
export const maxScore = (f: Format) => f.criteria.length * 5;
