/* The sheets' drawing (components/forms/art.ts): its modes, defaults, bounds and clamp. Saved in saved/sheet.config.json.
   Kept out of the client files so a server page can read and clamp it.

   The rules (never knobs): the wheel's neutral black and white ink; green for one mark only; the text globe's hatch,
   `::|` fixed to the screen, for every solid cell and a `.` for a cell only partly covered; every glyph is decoration
   (aria-hidden) and every word in the sheet stays real text on plain ground; square corners, hairlines. */

export type ArtMode = 'none' | 'masthead' | 'pass' | 'split';
export type ArtReveal = 'none' | 'print' | 'sweep';
export type ArtHatch = 'globe' | 'dense' | 'dots';
export type ArtLook = {
  mode: ArtMode; seed: number;
  /* a cell's width (CSS px) and its height over its width; the word's height (share of the band); the band's height */
  cell: number; aspect: number; word: number; band: number;
  /* which characters fill a solid cell; the share of a cell that makes it solid, and that makes it an edge dot */
  hatch: ArtHatch; solid: number; edge: number;
  /* the print's offset shadow, in cells (0: none), and its ink */
  shadow: number; shadowInk: number;
  /* the dotted grid behind: a dot every n columns and rows (0: none), and its ink */
  grid: number; gridInk: number;
  /* the word's ink (0 to 255 grey) */
  ink: number;
  /* the text globe in the band (masthead and pass) or the column (split): on, its size (share of the band's height) */
  globe: boolean; globeSize: number;
  /* the green mark after the word */
  mark: boolean;
  /* how it arrives when the sheet opens, how long, and the delay after the sheet starts to open (ms) */
  reveal: ArtReveal; revealMs: number; revealDelay: number;
  /* split: the column's width (CSS px) */
  side: number;
};
export const ART_MODES: ArtMode[] = ['masthead', 'pass', 'split', 'none'];
export const ART_REVEALS: ArtReveal[] = ['print', 'sweep', 'none'];
export const ART_HATCHES: ArtHatch[] = ['globe', 'dense', 'dots'];
export const ART_DEF: ArtLook = {
  mode: 'pass', seed: 11,
  cell: 4, aspect: 1.8, word: 0.72, band: 140,
  hatch: 'globe', solid: 0.5, edge: 0.18,
  shadow: 2, shadowInk: 0.28,
  grid: 4, gridInk: 0.2,
  ink: 236,
  globe: true, globeSize: 0.8,
  mark: true,
  reveal: 'print', revealMs: 420, revealDelay: 80,
  side: 232,
};
export const ART_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], cell: [3, 11, 1], aspect: [1.5, 2.3, 0.05], word: [0.35, 0.9, 0.01], band: [96, 200, 4],
  solid: [0.3, 0.8, 0.02], edge: [0.05, 0.45, 0.01],
  shadow: [0, 4, 1], shadowInk: [0, 0.6, 0.02],
  grid: [0, 8, 1], gridInk: [0, 0.5, 0.02],
  ink: [160, 255, 1], globeSize: [0.5, 1.1, 0.02],
  revealMs: [0, 900, 10], revealDelay: [0, 300, 10], side: [180, 300, 4],
};
export function clampArt(s: Partial<ArtLook>): ArtLook {
  const o = { ...ART_DEF, ...s } as ArtLook & Record<string, unknown>;
  if (!ART_MODES.includes(o.mode)) o.mode = ART_DEF.mode;
  if (!ART_REVEALS.includes(o.reveal)) o.reveal = ART_DEF.reveal;
  if (!ART_HATCHES.includes(o.hatch)) o.hatch = ART_DEF.hatch;
  for (const [k, [a, b]] of Object.entries(ART_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : ART_DEF[k as keyof ArtLook]; }
  for (const k of ['seed', 'cell', 'band', 'shadow', 'grid', 'ink', 'revealMs', 'revealDelay', 'side'] as const) o[k] = Math.round(o[k]);
  o.globe = !!o.globe; o.mark = !!o.mark;
  return o;
}

/* what a sheet draws: the word in characters (a city's code, "IN"), the city the globe faces, and the pass's stub lines */
export type ArtSubject = { word: string; city?: string | null; lines?: string[] };
