/* snapshot.ts: what the public pages read about a city, as one JSON answer. The shape is shared by the
   server that builds it and the pages that read it. No email, no owner id, no flag: only what a visitor may see. Times are milliseconds since 1970 (UTC). Pure. */
import { tieOrder } from './format';

export type SnapCity = {
  id: string; name: string; offset: number; venue: string | null; luma: string | null; editor: string | null;
  planned: number; buildMin: number; voteAfter: number;
  /* the live times, set when the host starts the clock; null before */
  buildStart: number | null; buildEnd: number | null; voteEnd: number | null;
  submissionsPaused: boolean; votingPaused: boolean;
  /* the counts are hidden from the start of building until this many minutes in, then shown live; null: never hidden */
  showAt: number | null;
  /* minutes after the start of building when voting opens, for everyone; null: from the start */
  publicAt: number | null;
  /* minutes after the start when judges may vote; null: with everyone */
  judgeAt: number | null;
  /* what one judge's vote counts; votes and judge below, and the steps, are already counted at it */
  judgeWeight: number;
};
export type SnapEntry = {
  no: number; slug: string; name: string; pitch: string; url: string; repo: string | null; video: string | null;
  picture: string | null; by: string | null; via: 'editor' | 'web'; created: number;
  votes: number; judge: number; reached: number;
  /* the host's order inside a tie once voting has closed (1 first); null: not placed */
  tie: number | null;
};
/* every vote that counts, oldest first: [entry no, ms, n, 1 when a judge's] (n is 1 for a public vote; a judge's press, at the judge weight,
   may be several, or negative when taken back) */
export type SnapStep = [no: number, at: number, n: number, judge: 0 | 1];
/* hidden: set while the city's counts are hidden (public answers only): from the start of building (`from`) no count
   leaves the server, so every entry's votes and judge are 0 and the order is the order entries came in; until: when
   the counts are shown */
export type CitySnap = { at: number; stale?: boolean; city: SnapCity; entries: SnapEntry[]; steps: SnapStep[]; hidden?: { from: number; until: number } | null };
/* the pick, once a super admin has entered the Supabase team's choice */
export type DaySnap = { at: number; stale?: boolean; cities: CitySnap[]; pick: { city: string; no: number } | null };

/* the ranking rule: most votes, then the host's order in a tie, then who reached that count first, then who arrived
   first */
export function rankOrder(a: SnapEntry, b: SnapEntry): number { return b.votes - a.votes || tieOrder(a.tie, b.tie) || a.reached - b.reached || a.created - b.created; }
/* when voting opens in the city (ms), for everyone; null before the clock starts */
export function publicFrom(c: SnapCity): number | null { return c.buildStart == null ? null : c.buildStart + (c.publicAt ?? 0) * 60000; }
/* when judges may vote (ms); null before the clock starts */
export function judgeFrom(c: SnapCity): number | null { return c.buildStart == null ? null : c.buildStart + (c.judgeAt ?? c.publicAt ?? 0) * 60000; }

/* the phase at a moment, from the live times (planned times before the clock starts are never a phase) */
export function phaseAt(c: SnapCity, ms: number): 'next' | 'build' | 'vote' | 'done' {
  if (c.buildStart == null || ms < c.buildStart) return 'next';
  if (ms < (c.buildEnd ?? Infinity)) return 'build';
  if (ms < (c.voteEnd ?? Infinity)) return 'vote';
  return 'done';
}

/* the stretch a city's counts are hidden, in ms: from the start of building until showAt minutes in (or the close, if
   that is sooner); null when it never hides or the clock has not started */
export function hiddenSpan(c: SnapCity): { from: number; until: number } | null {
  if (c.showAt == null || c.buildStart == null) return null;
  const from = c.buildStart, until = Math.min(c.buildStart + c.showAt * 60000, c.voteEnd ?? Infinity);
  return from < until ? { from, until } : null;
}
export function hiddenNow(c: SnapCity, ms: number): boolean { const h = hiddenSpan(c); return !!h && ms >= h.from && ms < h.until; }

/* What the public may see of a city at a moment. While its counts are hidden: the steps cut at the start of the
   stretch (none), so every count is 0 and each entry's tie-break time is its arrival: the order is the order they
   came. Outside the stretch, the snapshot as it is. Idempotent: an answer already marked hidden is kept.
   The steps must be the full list (the server's own read); a snapshot without them is frozen with nothing counted. */
export function publicSnap(s: CitySnap, ms: number): CitySnap {
  if (s.hidden || !hiddenNow(s.city, ms)) return s;
  const span = hiddenSpan(s.city)!, from = span.from;
  const steps = s.steps.filter((x) => x[1] < from);
  const at = new Map<number, { v: number; j: number; reached: number }>();
  steps.forEach(([no, t, n, judge]) => { const x = at.get(no) || { v: 0, j: 0, reached: 0 }; x.v += n; if (judge) x.j += n; if (n > 0) x.reached = t; at.set(no, x); });
  const entries = s.entries.map((e) => {
    const x = at.get(e.no);
    return { ...e, votes: x ? x.v : 0, judge: x ? x.j : 0, reached: x && x.reached ? x.reached : e.created };
  });
  return { ...s, entries, steps, hidden: span };
}
