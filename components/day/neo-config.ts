/* The city prize drawing's config (neo.tsx): its modes, defaults, bounds and clamp. Saved in saved/neo.config.json.
   Kept out of the client file so a server page can read and clamp it. */

export type NeoMode = 'stack' | 'ajar' | 'screen' | 'row';
export type NeoLook = {
  mode: NeoMode; seed: number;
  /* every mode: the laptop's width (of the frame), rim light, how white the light is, screen light, label size (px) */
  width: number; rim: number; white: number; screen: number; label: number;
  /* stack: slab thickness and gap (of the width), top face depth, back edge narrowing, how far the slabs sit off line */
  thick: number; gap: number; depth: number; persp: number; jitter: number;
  /* ajar: the gap, the glow round it, how far the light falls in front */
  open: number; glow: number; spill: number;
  /* screen and row: lid height (of the width), seconds per city, the colour split on the code, the streak */
  lid: number; cycle: number; fringe: number; streak: number;
};
export const NEO_MODES: NeoMode[] = ['stack', 'ajar', 'screen', 'row'];
export const NEO_DEF: NeoLook = {
  mode: 'stack', seed: 7, width: 0.62, rim: 1, white: 0.3, screen: 1, label: 11,
  thick: 0.035, gap: 0.3, depth: 0.28, persp: 0.08, jitter: 0.5,
  open: 0.03, glow: 14, spill: 0.5,
  lid: 0.62, cycle: 2.6, fringe: 1.2, streak: 0.6,
};
export const NEO_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], width: [0.4, 0.85, 0.01], rim: [0, 1.5, 0.05], white: [0, 1, 0.05], screen: [0.2, 1.6, 0.05], label: [10, 14, 1],
  thick: [0.02, 0.07, 0.002], gap: [0, 1.5, 0.05], depth: [0.12, 0.45, 0.01], persp: [0, 0.2, 0.01], jitter: [0, 1.5, 0.05],
  open: [0.008, 0.08, 0.002], glow: [0, 30, 1], spill: [0, 1.2, 0.05],
  lid: [0.5, 0.72, 0.01], cycle: [1.2, 6, 0.1], fringe: [0, 3, 0.1], streak: [0, 1.5, 0.05],
};
export function clampNeo(s: Partial<NeoLook>): NeoLook {
  const o = { ...NEO_DEF, ...s } as NeoLook & Record<string, unknown>;
  if (!NEO_MODES.includes(o.mode)) o.mode = NEO_DEF.mode;
  for (const [k, [a, b]] of Object.entries(NEO_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : NEO_DEF[k as keyof NeoLook]; }
  o.seed = Math.round(o.seed); o.label = Math.round(o.label);
  return o;
}
/* whether a mode moves by itself (only the screen's cities do) */
export const neoMoves = (c: NeoLook) => c.mode === 'screen';

