/* The wheel's numbers. Every value here was a constant in the study (the wheel, the tube screen pass and the screen
   lines); here each one is a knob in /lab/wheel, saved to saved/wheel.config.json. The defaults are the study's own
   values, so the defaults draw the study. The land map is baked (tools/bake-land.mjs) and is not a knob. */

export type WheelFont = 'study' | 'geist';
export type WheelMark = 'hack' | 'both' | 'name' | 'builder';
/* spoke: the cells sit just before the active name and the link is in the bottom corner; column: the page's words, the
   cells and a Luma pill are one column on the left margin, with the cells on the active name's line */
export type WheelLayout = 'spoke' | 'column';
/* glass: the glass ball with the land map in it; ascii: the turning world as frames of text (ascii-globe.ts); none:
   the names turn about an empty hub, moved off the right edge; rings: no spokes and no ball, the names run along
   rings that make a ball seen from a pole, each ring turning the other way (anthony lio's rings study in LW16) */
export type WheelGlobe = 'glass' | 'ascii' | 'none' | 'rings';
/* the text globe's modes; the first value of each is the plain one, today's globe */
export type GlobeArrive = 'none' | 'sweep' | 'print';
export type GlobeTurn = 'step' | 'wake';
export type GlobeLand = 'plain' | 'hold';
export type GlobeLight = 'none' | 'morning';
export type GlobeMarks = 'one' | 'all' | 'tags';
export type GlobePick = 'off' | 'on';
export type GlobeRim = 'plain' | 'ticks';
export type GlobeBlink = 'forever' | 'few';
export type GlobeHandover = 'leave' | 'thin';
/* the pick's prize on the preview page: lens, the globe over the end of the amount, the part
   of the last 0 inside it redrawn in the globe's cells; beside, the globe beside the amount; protected, no globe, a band
   of characters runs into and out of the digits; none, the digits step into place once */
export type PrizeMode = 'beside' | 'lens' | 'protected' | 'none';
/* how far the globe reaches into the amount: its edge through the last 0's open middle, or the whole 0 inside it */
export type PrizeOverlap = 'edge' | 'whole';
/* the digit's cells: solid cells with a hairline between them, solid cells touching, or the densest character */
export type PrizeCell = 'gap' | 'block' | 'char';
/* the band through the amount: none, the land's hatch, or a row of stars */
export type PrizeBand = 'off' | 'hatch' | 'stars';
/* lens: the globe still, or one turn when the amount comes into view (then it rests facing the Americas) */
export type PrizeTurn = 'still' | 'once' | 'loop';
/* on a phone (the stage under 560 px): the globe raised so a third of the last 0 is inside it, the globe hanging under
   the amount with its rim clear of the digits, on the last 0 as on a wide screen (no globe under PRIZE_LENS_MIN), or no
   globe (the digits step in) */
export type PrizePhone = 'raise' | 'clear' | 'lens' | 'none';
/* the narrowest column, in CSS px, that keeps the globe on the last 0 (prize-text.css reads the same number) */
export const PRIZE_LENS_MIN = 330;
export type WheelCfg = {
  /* the wheel */
  step: number; hubY: number; hubOfHeight: number; hubOfWidth: number;
  /* a phone's wheel is small: its names sit further apart (easier to press), and the glass smears only the names past the
     last clear one */
  phoneStep: number; phoneHubY: number; phoneEdgeFrom: number; phoneEdgeTo: number; phoneFadeFrom: number; phoneFadeTo: number;
  labelFrom: number; labelPush: number; labelSize: number; track: number;
  fadeFrom: number; fadeTo: number; face: number; ink: number; dim: number;
  wheelPx: number; dragPx: number; openScale: number;
  ease: number; yawEase: number; openEase: number;
  ghosts: number; ghostAlpha: number; ghostGap: number; ghostFrom: number;
  settleFrom: number; settleTo: number; pulseLow: number; pulseRate: number; statusDelay: number;
  font: WheelFont; mark: WheelMark; layout: WheelLayout;
  /* the globe: which one, the text globe's frames a second, how far left of the hub it sits and how much of the turn's
     smear it takes (in radii), and with none, how far right the hub moves (in radii) */
  globe: WheelGlobe; globeFps: number; globeShift: number; globeEdge: number; bareShift: number;
  /* the text globe (text-globe.ts, globe-clock.ts, tuned at /lab/globe). Modes: how it arrives, turns, comes to rest,
     shows the morning, marks the cities, answers a press, labels its rim, blinks and hands over to the header. */
  globeArrive: GlobeArrive; globeTurn: GlobeTurn; globeLand: GlobeLand; globeLight: GlobeLight; globeMarks: GlobeMarks;
  globePick: GlobePick; globeRim: GlobeRim; globeBlink: GlobeBlink; globeHandover: GlobeHandover;
  /* Knobs: the grid's and the other marks' share of the ink, the leader to the limb, thinning toward the limb, the
     study's frames for the large size (off: generated), the blinks before the brackets hold, the steps of the arrival,
     of the wake, of the hold and of the hand-over's thinning, the sun's height under which the night hatch goes to dots,
     the tag's size in cells, the heights (CSS px) from which it is drawn mid and large (under mid: dots), the dots across
     a small globe, and the seed (the thinning's order, the print's stops) */
  globeGrid: number; globeMarkInk: number; globeLeader: number; globeThin: number; globeStudy: number; globeBlinks: number;
  globeSweep: number; globeWake: number; globeHold: number; globeThinSteps: number; globeNight: number; globeTag: number;
  globeMid: number; globeLarge: number; globeDots: number; globeSeed: number;
  /* the prize (PrizeText): the mode, the overlap, the cells, the band, the turn; knobs: the globe's height in digit
     heights, how far it sits below the digits' middle (in radii), the share of a cell the digit must cover, the band's
     rows */
  prize: PrizeMode; prizeOverlap: PrizeOverlap; prizeCell: PrizeCell; prizeBand: PrizeBand; prizeTurn: PrizeTurn;
  prizeSize: number; prizeY: number; prizeCover: number; prizeBandRows: number;
  /* the phone's arrangement, and the weight of the globe's land characters (the thin `:|` read dim at 500) */
  prizePhone: PrizePhone; prizeWeight: number;
  /* the rings: how many at most, the space from one to the next and the hole at the centre (in font sizes), how high
     the ring at the rim is, how many names each ring starts after the one outside it, and the space between names */
  ringCount: number; ringLine: number; ringHole: number; ringFlat: number; ringStagger: number; ringGap: number;
  /* the tube screen pass */
  edgeFrom: number; edgeTo: number; edgeReach: number; edgeTaps: number;
  fringe: number; grain: number; glassSplit: number; core: number; vignette: number; paper: number;
  mirrorStart: number; mirrorSize: number; mirrorTip: number; mirrorDepth: number; mirrorSqueeze: number;
  mirrorBlur: number; mirrorGlow: number; mirrorSplit: number; mirrorStrength: number;
  /* the screen lines over the page, and the sound */
  lineAlpha: number; linePeriod: number; sound: number; volume: number;
};

export const WHEEL_DEF: WheelCfg = {
  step: 10, hubY: 0.52, hubOfHeight: 0.4, hubOfWidth: 0.28,
  phoneStep: 12, phoneHubY: 0.47, phoneEdgeFrom: 0.98, phoneEdgeTo: 1.45, phoneFadeFrom: 1.2, phoneFadeTo: 1.65,
  labelFrom: 1.52, labelPush: 0.3, labelSize: 0.14, track: -0.03,
  fadeFrom: 1.2, fadeTo: 1.65, face: -0.6, ink: 232, dim: 0.42,
  wheelPx: 80, dragPx: 56, openScale: 1.14,
  ease: 9, yawEase: 5, openEase: 10,
  ghosts: 3, ghostAlpha: 0.22, ghostGap: 0.07, ghostFrom: 0.25,
  settleFrom: 0.02, settleTo: 0.35, pulseLow: 0.72, pulseRate: 1.25, statusDelay: 600,
  font: 'study', mark: 'builder', layout: 'spoke', globe: 'glass', globeFps: 8, globeShift: 0.04, globeEdge: 0.15, bareShift: 0.8,
  globeArrive: 'sweep', globeTurn: 'wake', globeLand: 'hold', globeLight: 'morning', globeMarks: 'all',
  globePick: 'on', globeRim: 'plain', globeBlink: 'few', globeHandover: 'thin',
  globeGrid: 0.52, globeMarkInk: 0.62, globeLeader: 0, globeThin: 0, globeStudy: 1, globeBlinks: 3,
  globeSweep: 6, globeWake: 2, globeHold: 2, globeThinSteps: 4, globeNight: 0.2, globeTag: 1.2,
  globeMid: 150, globeLarge: 240, globeDots: 15, globeSeed: 7,
  prize: 'lens', prizeOverlap: 'edge', prizeCell: 'gap', prizeBand: 'off', prizeTurn: 'loop', prizeSize: 2, prizeY: 0, prizeCover: 0.5, prizeBandRows: 2, prizePhone: 'lens', prizeWeight: 700,
  ringCount: 4, ringLine: 2.6, ringHole: 2, ringFlat: 0.3, ringStagger: 3.7, ringGap: 1.1,
  edgeFrom: 0.47, edgeTo: 1.25, edgeReach: 0.52, edgeTaps: 8,
  fringe: 1.2, grain: 0.045, glassSplit: 0.1, core: 0.86, vignette: 0.45, paper: 12,
  mirrorStart: 0.95, mirrorSize: 0.07, mirrorTip: 0.22, mirrorDepth: 0.68, mirrorSqueeze: 0.5,
  mirrorBlur: 0.006, mirrorGlow: 0.024, mirrorSplit: 0.012, mirrorStrength: 0.5,
  lineAlpha: 0.34, linePeriod: 3, sound: 1, volume: 1,
};

/* [min, max, step] for every number, tested in the lab: none of these ends breaks the picture */
export const WHEEL_BOUNDS: Record<string, [number, number, number]> = {
  phoneStep: [6, 16, 0.5], phoneHubY: [0.35, 0.65, 0.01], phoneEdgeFrom: [0.2, 1.2, 0.01], phoneEdgeTo: [0.9, 1.8, 0.01], phoneFadeFrom: [0.4, 1.6, 0.01], phoneFadeTo: [0.5, 1.8, 0.01],
  step: [6, 16, 0.5], hubY: [0.35, 0.65, 0.01], hubOfHeight: [0.25, 0.55, 0.01], hubOfWidth: [0.18, 0.4, 0.01],
  labelFrom: [1.2, 2, 0.02], labelPush: [0, 0.6, 0.02], labelSize: [0.08, 0.22, 0.005], track: [-0.06, 0.02, 0.005],
  fadeFrom: [0.6, 1.5, 0.05], fadeTo: [1.2, 2, 0.05], face: [-1.2, 0.4, 0.05], ink: [160, 255, 1], dim: [0.15, 0.8, 0.01],
  wheelPx: [30, 200, 5], dragPx: [24, 120, 2], openScale: [1, 1.3, 0.01],
  ease: [3, 20, 0.5], yawEase: [1, 12, 0.5], openEase: [3, 20, 0.5],
  ghosts: [0, 5, 1], ghostAlpha: [0, 0.5, 0.01], ghostGap: [0.02, 0.15, 0.005], ghostFrom: [0.05, 1, 0.05],
  settleFrom: [0, 0.2, 0.01], settleTo: [0.1, 0.8, 0.01], pulseLow: [0.3, 1, 0.01], pulseRate: [0.3, 3, 0.05], statusDelay: [200, 1500, 50],
  edgeFrom: [0.2, 0.9, 0.01], edgeTo: [0.9, 1.6, 0.01], edgeReach: [0, 1, 0.02], edgeTaps: [2, 16, 1],
  fringe: [0, 3, 0.1], grain: [0, 0.12, 0.005], glassSplit: [0, 0.25, 0.01], core: [0.6, 0.98, 0.01], vignette: [0, 0.9, 0.01], paper: [0, 40, 1],
  mirrorStart: [0.8, 1.1, 0.01], mirrorSize: [0.03, 0.14, 0.005], mirrorTip: [0.05, 0.4, 0.01], mirrorDepth: [0.3, 1, 0.02], mirrorSqueeze: [0.2, 1, 0.02],
  mirrorBlur: [0, 0.02, 0.001], mirrorGlow: [0, 0.06, 0.002], mirrorSplit: [0, 0.04, 0.001], mirrorStrength: [0, 1, 0.02],
  globeGrid: [0.25, 0.85, 0.01], globeMarkInk: [0.3, 1, 0.01], globeBlinks: [0, 5, 1],
  globeSweep: [3, 10, 1], globeWake: [1, 3, 1], globeHold: [0, 6, 1], globeThinSteps: [2, 6, 1], globeNight: [0.02, 0.6, 0.01], globeTag: [1, 1.6, 0.05],
  globeMid: [100, 240, 5], globeLarge: [160, 480, 5], globeDots: [10, 28, 1], globeSeed: [1, 9999, 1],
  prizeSize: [1.4, 2.6, 0.05], prizeY: [-0.3, 0.3, 0.01], prizeCover: [0.25, 0.75, 0.01], prizeBandRows: [1, 4, 1], prizeWeight: [400, 800, 100],
  globeFps: [2, 24, 1], globeShift: [0, 0.6, 0.01], globeEdge: [0, 1, 0.01], bareShift: [0, 1.4, 0.01],
  ringCount: [1, 7, 1], ringLine: [1.4, 4, 0.05], ringHole: [0, 5, 0.1], ringFlat: [0.1, 1, 0.01], ringStagger: [0, 10, 0.1], ringGap: [0.4, 3, 0.05],
  lineAlpha: [0, 0.6, 0.01], linePeriod: [2, 6, 1], volume: [0, 2, 0.05],
};
export const WHEEL_TOGGLES = new Set(['sound', 'globeLeader', 'globeThin', 'globeStudy']);
export const WHEEL_CHOICES: Record<string, string[]> = {
  font: ['study', 'geist'], mark: ['hack', 'both', 'name', 'builder'], layout: ['spoke', 'column'], globe: ['glass', 'ascii', 'none', 'rings'],
  globeArrive: ['none', 'sweep', 'print'], globeTurn: ['step', 'wake'], globeLand: ['plain', 'hold'], globeLight: ['none', 'morning'],
  globeMarks: ['one', 'all', 'tags'], globePick: ['off', 'on'], globeRim: ['plain', 'ticks'], globeBlink: ['forever', 'few'], globeHandover: ['leave', 'thin'],
  prize: ['beside', 'lens', 'protected', 'none'], prizeOverlap: ['edge', 'whole'], prizeCell: ['gap', 'block', 'char'], prizeBand: ['off', 'hatch', 'stars'], prizeTurn: ['still', 'once', 'loop'], prizePhone: ['raise', 'clear', 'lens', 'none'],
};
/* the text globe's modes at their plain values: the globe as the page drew it before the modes */
export const GLOBE_PLAIN: Partial<WheelCfg> = {
  globeArrive: 'none', globeTurn: 'step', globeLand: 'plain', globeLight: 'none', globeMarks: 'one', globePick: 'off', globeRim: 'plain', globeBlink: 'forever', globeHandover: 'leave', prize: 'beside',
};
export const GLOBE_MODES = Object.keys(GLOBE_PLAIN) as (keyof WheelCfg)[];

/* the values the shader is built from: when one of these changes, the program is compiled again */
export const SHADER_KEYS = ['globe', 'globeEdge', 'fadeFrom', 'fadeTo', 'edgeFrom', 'edgeTo', 'edgeReach', 'edgeTaps', 'fringe', 'grain', 'glassSplit', 'core', 'vignette', 'paper',
  'mirrorStart', 'mirrorSize', 'mirrorTip', 'mirrorDepth', 'mirrorSqueeze', 'mirrorSplit', 'mirrorStrength'] as const;

export function clampWheel(c: Partial<WheelCfg> | Record<string, unknown>): WheelCfg {
  const o = { ...WHEEL_DEF } as Record<string, unknown>, src = c as Record<string, unknown>;
  for (const k of Object.keys(WHEEL_DEF)) {
    const v = src[k], b = WHEEL_BOUNDS[k];
    if (WHEEL_CHOICES[k]) { if (WHEEL_CHOICES[k].indexOf(String(v)) >= 0) o[k] = v; continue; }
    if (WHEEL_TOGGLES.has(k)) { if (v !== undefined) o[k] = v ? 1 : 0; continue; }
    if (typeof v === 'number' && isFinite(v)) o[k] = b ? Math.min(b[1], Math.max(b[0], v)) : v;
  }
  if ((o.fadeTo as number) <= (o.fadeFrom as number)) o.fadeTo = (o.fadeFrom as number) + 0.05;
  if ((o.settleTo as number) <= (o.settleFrom as number)) o.settleTo = (o.settleFrom as number) + 0.05;
  if ((o.globeLarge as number) < (o.globeMid as number)) o.globeLarge = o.globeMid;
  if ((o.phoneFadeTo as number) <= (o.phoneFadeFrom as number)) o.phoneFadeTo = (o.phoneFadeFrom as number) + 0.05;
  if ((o.phoneEdgeTo as number) <= (o.phoneEdgeFrom as number)) o.phoneEdgeTo = (o.phoneEdgeFrom as number) + 0.05;
  return o as WheelCfg;
}

/* the wheel as a phone draws it: up to 640 px wide */
export const PHONE_WHEEL = '(max-width: 640px)';
export const fitWheel = (c: WheelCfg, phone: boolean): WheelCfg => (phone ? { ...c, step: c.phoneStep, hubY: c.phoneHubY, edgeFrom: c.phoneEdgeFrom, edgeTo: c.phoneEdgeTo, fadeFrom: c.phoneFadeFrom, fadeTo: c.phoneFadeTo } : c);

/* the faces: the study's stack (Inter where installed, else Helvetica Neue), or the site's Geist */
export const SANS: Record<WheelFont, string> = {
  study: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
  geist: 'var(--font-geist), "Helvetica Neue", Helvetica, Arial, sans-serif',
};
export const MONO: Record<WheelFont, string> = {
  study: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
  geist: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
};
