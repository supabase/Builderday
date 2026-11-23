/* The team's picture (components/account/team-art.ts): its modes, defaults, bounds and clamp. Saved in
   saved/team.config.json, tuned at /lab/team. Kept out of the client files so a server page can read and clamp it.

   The rules (never knobs): the sheets' print, in characters only; the text globe's hatch `::|` for every solid dot;
   one seat for every place in the team, so how many are in and how many are left reads at a glance; a member is
   their initials in the departure board's 5 by 7 letters, an empty seat is drawn dim; green marks you and nothing
   else; every character is decoration (aria-hidden), and the names are real text beside it. */

export type TeamMode = 'seats' | 'board' | 'none';
export type TeamEmpty = 'plus' | 'dots' | 'frame';
export type TeamHatch = 'globe' | 'dense' | 'dots';
export type TeamLook = {
  mode: TeamMode; seed: number;
  /* a dot of a letter, in characters across and rows down */
  dotW: number; dotH: number;
  /* columns between seats; air inside a seat around its letters (characters) */
  gap: number; pad: number;
  /* the print's offset shadow, in characters (0: none) */
  shadow: number;
  /* the dotted grid behind: a dot every n characters (0: none) */
  grid: number;
  /* how an empty seat is drawn; whether every seat has an outline */
  empty: TeamEmpty; frame: boolean;
  hatch: TeamHatch;
  /* the green [+] under your seat */
  mark: boolean;
  /* the largest character size, CSS px (it shrinks to fit the sheet) */
  size: number;
};
export const TEAM_MODES: TeamMode[] = ['seats', 'board', 'none'];
export const TEAM_EMPTIES: TeamEmpty[] = ['plus', 'dots', 'frame'];
export const TEAM_HATCHES: TeamHatch[] = ['globe', 'dense', 'dots'];
export const TEAM_DEF: TeamLook = {
  mode: 'seats', seed: 7,
  dotW: 2, dotH: 1, gap: 2, pad: 1,
  shadow: 1, grid: 3,
  empty: 'plus', frame: true,
  hatch: 'globe', mark: true,
  size: 12,
};
export const TEAM_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], dotW: [1, 2, 1], dotH: [1, 2, 1], gap: [1, 6, 1], pad: [0, 3, 1], shadow: [0, 2, 1], grid: [0, 6, 1], size: [8, 16, 1],
};
export function clampTeam(s: Partial<TeamLook>): TeamLook {
  const o = { ...TEAM_DEF, ...s } as TeamLook & Record<string, unknown>;
  if (!TEAM_MODES.includes(o.mode)) o.mode = TEAM_DEF.mode;
  if (!TEAM_EMPTIES.includes(o.empty)) o.empty = TEAM_DEF.empty;
  if (!TEAM_HATCHES.includes(o.hatch)) o.hatch = TEAM_DEF.hatch;
  for (const [k, [a, b]] of Object.entries(TEAM_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.round(Math.min(b, Math.max(a, v))) : TEAM_DEF[k as keyof TeamLook]; }
  o.frame = !!o.frame; o.mark = !!o.mark;
  return o;
}
