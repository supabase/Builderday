/* The hero ticket's launch: pressing Register folds the ticket into a paper rocket that flies to its city on the text
   globe, lands on the city's mark, and then Luma opens. launch.ts plays it, use-launch.ts wires it to the ticket's
   link. Tuned at /lab/launch, saved in saved/launch.config.json. */

import saved from '@/saved/launch.config.json';

/* on: the press plays the launch; off: the link simply opens Luma */
export const LAUNCH_ONS = ['on', 'off'] as const;
/* when Luma opens: as the rocket lands (the press waits for the flight), or at once with the rocket flying behind */
export const LAUNCH_OPENS = ['land', 'press'] as const;
/* what the ship leaves behind: the globe's characters fading along the path, a dotted line, or nothing */
export const LAUNCH_TRAILS = ['chars', 'dots', 'none'] as const;
/* how the ticket comes back after the launch: printed again from the left, or faded in */
export const LAUNCH_BACKS = ['print', 'fade'] as const;

export type LaunchCfg = {
  on: (typeof LAUNCH_ONS)[number];
  open: (typeof LAUNCH_OPENS)[number];
  trail: (typeof LAUNCH_TRAILS)[number];
  back: (typeof LAUNCH_BACKS)[number];
  /* the press before the fold (ms) and how far it gives (scale) */
  pressMs: number; press: number;
  /* the fold (ms); the ship's length (px) and its height against its length */
  foldMs: number; shipW: number; shipH: number;
  /* the flight (ms); how high it arcs (of the distance); how small it gets at the globe (of its size); how far into the
     flight it has turned to its course (share); how much it sways (deg) */
  flightMs: number; arc: number; shrink: number; turn: number; sway: number;
  /* the trail: how many marks along the path (per 100 px) and how long each one stays (ms) */
  trailN: number; trailMs: number;
  /* the landing (ms) and the rings' reach (× the mark) */
  landMs: number; ring: number;
  /* the ticket coming back (ms), after Luma has opened */
  backMs: number; backDelay: number;
};

export const LAUNCH_DEF: LaunchCfg = {
  on: 'on', open: 'land', trail: 'chars', back: 'print',
  pressMs: 90, press: 0.97,
  foldMs: 320, shipW: 112, shipH: 0.3,
  flightMs: 560, arc: 0.4, shrink: 0.22, turn: 0.22, sway: 4,
  trailN: 9, trailMs: 520,
  landMs: 560, ring: 3,
  backMs: 420, backDelay: 600,
};

export const LAUNCH_BOUNDS: Record<string, [number, number, number]> = {
  pressMs: [0, 200, 10], press: [0.94, 1, 0.005],
  foldMs: [160, 700, 10], shipW: [64, 180, 2], shipH: [0.24, 0.5, 0.01],
  flightMs: [300, 1200, 10], arc: [0, 0.9, 0.05], shrink: [0.1, 0.6, 0.01], turn: [0.05, 0.6, 0.01], sway: [0, 12, 0.5],
  trailN: [2, 20, 1], trailMs: [200, 1200, 20],
  landMs: [240, 1200, 20], ring: [1.5, 5, 0.1],
  backMs: [160, 900, 10], backDelay: [0, 1600, 50],
};

export const LAUNCH_CHOICES: Record<string, readonly string[]> = { on: LAUNCH_ONS, open: LAUNCH_OPENS, trail: LAUNCH_TRAILS, back: LAUNCH_BACKS };

export function clampLaunch(v: Partial<LaunchCfg> | null | undefined): LaunchCfg {
  const c = { ...LAUNCH_DEF, ...(v || {}) } as Record<string, unknown>;
  for (const [k, [lo, hi]] of Object.entries(LAUNCH_BOUNDS)) { const n = Number(c[k]); c[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : LAUNCH_DEF[k as keyof LaunchCfg]; }
  for (const [k, list] of Object.entries(LAUNCH_CHOICES)) if (!list.includes(String(c[k]))) c[k] = LAUNCH_DEF[k as keyof LaunchCfg];
  for (const k of Object.keys(c)) if (!(k in LAUNCH_DEF)) delete c[k];
  return c as LaunchCfg;
}

/* the saved launch, as the hero plays it */
export const LAUNCH: LaunchCfg = clampLaunch(saved as Partial<LaunchCfg>);
