/* Build in How Builder Day works, drawn as the two ways to submit (ways.tsx): its modes, defaults, bounds and clamp.
   Saved in saved/ways.config.json, tuned at /lab/ways. Kept out of the client file so a server page can read it.

   Rules (never knobs): one window, the toggle swaps what is in it and nothing around it moves; both ways send the same
   two things (the GitHub repo and the preview link) and run the same three checks (a public repo, a real project verified
   behind the scenes, before building closes); both end on the same green Submitted at the same minute; the clock in
   the window's bar is the day's (0 to 90). */

export type WaysChrome = 'window' | 'bare';
export type WaysChecks = 'three' | 'none';
export type WaysLook = {
  chrome: WaysChrome; checks: WaysChecks;
  /* the drawing's progress (0 to 1) at which: the clock reaches the minutes the submit starts (lead), the first value is
     typed (type1), the second (type2), the checks start and how far apart they land, the send */
  lead: number; type1: number; type2: number; check: number; checkStep: number; send: number;
  /* the minute the submit starts at (the clock runs 0 to this during lead) and the minute it is sent */
  from: number; at: number;
  /* the swap between the ways (ms), and how far the new one rises (px) */
  swapMs: number; swapRise: number;
};
export const WAYS_CHROMES: WaysChrome[] = ['window', 'bare'];
export const WAYS_CHECKS: WaysChecks[] = ['three', 'none'];
export const WAYS_DEF: WaysLook = {
  chrome: 'window', checks: 'three',
  lead: 0.16, type1: 0.42, type2: 0.6, check: 0.64, checkStep: 0.06, send: 0.86,
  from: 40, at: 46, swapMs: 180, swapRise: 4,
};
export const WAYS_BOUNDS: Record<string, [number, number, number]> = {
  lead: [0, 0.4, 0.01], type1: [0.2, 0.6, 0.01], type2: [0.3, 0.75, 0.01], check: [0.35, 0.8, 0.01], checkStep: [0.02, 0.1, 0.005], send: [0.6, 0.97, 0.01],
  from: [10, 85, 1], at: [20, 89, 1], swapMs: [0, 400, 10], swapRise: [0, 12, 1],
};
export function clampWays(s: Partial<WaysLook>): WaysLook {
  const o = { ...WAYS_DEF, ...s } as WaysLook & Record<string, unknown>;
  if (!WAYS_CHROMES.includes(o.chrome)) o.chrome = WAYS_DEF.chrome;
  if (!WAYS_CHECKS.includes(o.checks)) o.checks = WAYS_DEF.checks;
  for (const [k, [a, b]] of Object.entries(WAYS_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : WAYS_DEF[k as keyof WaysLook]; }
  /* keep the order: the lead, then the two values, the checks, the send */
  o.type1 = Math.max(o.type1, o.lead + 0.08); o.type2 = Math.max(o.type2, o.type1 + 0.06);
  o.check = Math.max(o.check, o.type2); o.send = Math.max(o.send, o.check + o.checkStep * 3);
  o.at = Math.round(o.at); o.from = Math.min(Math.round(o.from), o.at - 2); o.swapMs = Math.round(o.swapMs); o.swapRise = Math.round(o.swapRise);
  return o;
}
