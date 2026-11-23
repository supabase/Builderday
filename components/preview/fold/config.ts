/* The preview page without its sheet: the wheel as the first screen, the day under the fold. Every taste value of
   the page is here, tuned at /lab/fold and saved in saved/fold.config.json, which /preview reads. The motion values
   (the *Ms knobs and the curves) are kept here until the motion config can take them. Pure. */

export const ARRIVALS = ['tune', 'scan', 'flap', 'print', 'mask', 'register', 'dial', 'east', 'quiet', 'sweep'] as const;
export type Arrival = (typeof ARRIVALS)[number] | 'none';
export type FoldDir = 'base' | 'plain' | 'line' | 'unroll';
export type FoldCfg = {
  dir: FoldDir;
  /* the whole page, or the first screen alone (the wheel at the window's height, no sign in, nothing under it) until the rest is ready */
  page: 'full' | 'hero';
  /* modes */
  glass: 'fixed' | 'today'; globe: 'docks' | 'leaves'; input: 'hand' | 'globe'; jump: 'roll' | 'smooth' | 'cut'; scrollEase: 'brake' | 'ease' | 'in-out';
  cities: 'belt' | 'board' | 'clocks'; ready: 'dry' | 'steps'; questions: 'open' | 'index' | 'reveal';
  order: 'prize-first' | 'cities-first' | 'how-first'; words: 'lede' | 'none'; arrive: 'tube' | 'none';
  /* the first screen's arrival, one of ten (numbered in /lab/arrive, where the owner picks), or none. Every one paints
     the final ground first and never holds the words; see ARRIVALS. `back`: reached with the browser's Back or Forward, it plays quiet. */
  arrival: Arrival; back: 'quiet' | 'same';
  /* the black bar of facts under the wheel (date, cities, build), or none */
  bar: 'none' | 'cells';
  /* the link at the top right of the first screen */
  topLink: 'none' | 'how';
  /* the account: with a place, the register cell becomes the account (merged) or the account cell
     sits beside it (beside); Sign in only in the header's cells (link) or also at the very top (both) */
  acct: 'merged' | 'beside'; acctTop: 'link' | 'both';
  /* the first screen; the space above the first part (under the wheel, on the page's ground) */
  peek: number; firstTop: number;
  /* the globe's dock: its size in the header, how much of the wheel's height the dock takes, its turn with the scroll */
  dockSize: number; dockEnd: number; dockTurn: number;
  /* the bar */
  barPad: number; cellPad: number; dotSize: number;
  /* the header: its height and when it changes (the share of the wheel scrolled away) */
  hdrH: number; hdrAt: number;
  /* the belt */
  beltH: number; beltInk: number; tickH: number; beltLead: number; beltSpan: number; beltMs: number; beltFade: number;
  /* the board */
  rowH: number; citySize: number; dim: number;
  /* layout */
  width: number; gutter: number; gap: number; gapPhone: number; wordsPhone: number;
  /* motion */
  convFrom: number; convMs: number; rowStep: number; flapMs: number; flapStagger: number; flaps: number;
  introSweep: number; introMs: number; rowTotal: number;
  /* dial: how many cities back the wheel and the globe start their turn */
  dialSweep: number;
  /* the arrival: the canvas's fade; the words (time, step, rise, red and blue edges, first ink); the globe's print;
     when the cells, the link and the peek come after the wheel's first frame, and how long the link and the peek take */
  canvasIn: number; wordsMs: number; wordsStep: number; wordsRise: number; wordsEdge: number; wordsInk: number;
  printMs: number; cellsAt: number; linkAt: number; linkMs: number; peekAt: number; peekMs: number;
  /* the header: cells erased a step apart (written at writeStep); the register cell's width; hover in and out; links' line */
  eraseStep: number; regMs: number; hoverIn: number; hoverOut: number; lineMs: number;
  /* the prize's one moment: digits settle, the small globes light, the codes are written */
  prizeMs: number; prizeGlobeStep: number; prizeCodeStep: number;
  bloom: number; bloomMs: number; rollMs: number; rollBar: number; scrollMin: number; scrollMax: number; dryStep: number; dryHold: number; writeStep: number;
  /* unroll (lab only) */
  unrollFrom: number; unrollSpread: number;
};

export const FOLD_DEF: FoldCfg = {
  dir: 'line', page: 'full',
  glass: 'fixed', globe: 'docks', input: 'hand', jump: 'smooth', scrollEase: 'brake', cities: 'belt', ready: 'dry', questions: 'open', order: 'prize-first', words: 'lede', arrive: 'tube', arrival: 'tune', back: 'quiet', bar: 'none', topLink: 'none', acct: 'merged', acctTop: 'both',
  peek: 56, firstTop: 28,
  dockSize: 26, dockEnd: 0.62, dockTurn: 0.3,
  barPad: 22, cellPad: 12, dotSize: 2,
  hdrH: 64, hdrAt: 0.45,
  beltH: 64, beltInk: 0.55, tickH: 10, beltLead: 160, beltSpan: 140, beltMs: 180, beltFade: 40,
  rowH: 72, citySize: 32, dim: 0.42,
  width: 1264, gutter: 88, gap: 160, gapPhone: 96, wordsPhone: 20,
  convFrom: 5, convMs: 260, rowStep: 45, flapMs: 45, flapStagger: 22, flaps: 4,
  introSweep: 1.5, introMs: 300, rowTotal: 360, dialSweep: 3,
  canvasIn: 240, wordsMs: 380, wordsStep: 80, wordsRise: 6, wordsEdge: 4, wordsInk: 0.12,
  printMs: 640, cellsAt: 400, linkAt: 480, linkMs: 200, peekAt: 640, peekMs: 200,
  eraseStep: 20, regMs: 200, hoverIn: 100, hoverOut: 150, lineMs: 120,
  prizeMs: 600, prizeGlobeStep: 40, prizeCodeStep: 25,
  bloom: 0, bloomMs: 420, rollMs: 260, rollBar: 48, scrollMin: 420, scrollMax: 820, dryStep: 150, dryHold: 450, writeStep: 30,
  unrollFrom: 0.15, unrollSpread: 0.35,
};

export const FOLD_BOUNDS: Record<string, [number, number, number]> = {
  peek: [40, 80, 1], firstTop: [0, 160, 2],
  dockSize: [16, 40, 1], dockEnd: [0.3, 0.9, 0.01], dockTurn: [0, 1.5, 0.05],
  barPad: [12, 56, 1], cellPad: [8, 24, 1], dotSize: [1, 4, 0.5],
  hdrH: [52, 96, 1], hdrAt: [0.3, 0.9, 0.01],
  beltH: [28, 96, 1], beltInk: [0.2, 1, 0.01], tickH: [4, 24, 1], beltLead: [0, 480, 10], beltSpan: [60, 300, 5], beltMs: [0, 600, 10], beltFade: [0, 120, 2],
  rowH: [52, 112, 1], citySize: [20, 56, 1], dim: [0.2, 0.8, 0.01],
  width: [960, 1600, 8], gutter: [20, 120, 1], gap: [64, 280, 4], gapPhone: [48, 200, 4], wordsPhone: [16, 28, 1],
  convFrom: [0, 12, 0.5], convMs: [0, 600, 10], rowStep: [0, 160, 5], flapMs: [20, 120, 5], flapStagger: [0, 80, 2], flaps: [0, 8, 1],
  introSweep: [0, 4, 0.1], introMs: [0, 900, 10], rowTotal: [0, 1200, 10], dialSweep: [1, 8, 0.5],
  canvasIn: [0, 600, 10], wordsMs: [0, 900, 10], wordsStep: [0, 200, 5], wordsRise: [0, 24, 1], wordsEdge: [0, 12, 0.5], wordsInk: [0, 1, 0.01],
  printMs: [0, 1600, 20], cellsAt: [0, 1200, 10], linkAt: [0, 1200, 10], linkMs: [0, 600, 10], peekAt: [0, 1600, 10], peekMs: [0, 600, 10],
  eraseStep: [0, 80, 1], regMs: [0, 500, 10], hoverIn: [0, 300, 10], hoverOut: [0, 300, 10], lineMs: [0, 300, 10],
  prizeMs: [0, 1200, 20], prizeGlobeStep: [0, 120, 5], prizeCodeStep: [0, 120, 5],
  bloom: [0, 0.02, 0.001], bloomMs: [0, 900, 10], rollMs: [0, 400, 10], rollBar: [0, 160, 2], scrollMin: [0, 1200, 10], scrollMax: [0, 1600, 10], dryStep: [0, 400, 10], dryHold: [0, 2000, 50], writeStep: [0, 120, 5],
  unrollFrom: [0, 0.5, 0.01], unrollSpread: [0, 0.8, 0.01],
};

export const FOLD_CHOICES: Record<string, string[]> = {
  dir: ['base', 'plain', 'line', 'unroll'], page: ['full', 'hero'],
  glass: ['fixed', 'today'], globe: ['docks', 'leaves'], input: ['hand', 'globe'], jump: ['roll', 'smooth', 'cut'], scrollEase: ['brake', 'ease', 'in-out'],
  cities: ['belt', 'board', 'clocks'], ready: ['dry', 'steps'], questions: ['open', 'index', 'reveal'], order: ['prize-first', 'cities-first', 'how-first'], words: ['lede', 'none'], arrive: ['tube', 'none'], arrival: [...ARRIVALS, 'none'], back: ['quiet', 'same'], bar: ['none', 'cells'], topLink: ['none', 'how'], acct: ['merged', 'beside'], acctTop: ['link', 'both'],
};

export const FOLD_INT = new Set(['peek', 'firstTop', 'gapPhone', 'wordsPhone', 'dockSize', 'barPad', 'cellPad', 'hdrH', 'beltH', 'tickH', 'beltLead', 'beltSpan', 'beltMs', 'beltFade', 'rowH', 'citySize', 'width', 'gutter', 'gap', 'convMs', 'rowStep', 'flapMs', 'flapStagger', 'flaps', 'introMs', 'rowTotal', 'canvasIn', 'wordsMs', 'wordsStep', 'wordsRise', 'printMs', 'cellsAt', 'linkAt', 'linkMs', 'peekAt', 'peekMs', 'eraseStep', 'regMs', 'hoverIn', 'hoverOut', 'lineMs', 'prizeMs', 'prizeGlobeStep', 'prizeCodeStep', 'bloomMs', 'rollMs', 'rollBar', 'scrollMin', 'scrollMax', 'dryStep', 'dryHold', 'writeStep']);

export function clampFold(c: Partial<FoldCfg> | Record<string, unknown>): FoldCfg {
  const o = { ...FOLD_DEF } as Record<string, unknown>, src = c as Record<string, unknown>;
  for (const k of Object.keys(FOLD_DEF)) {
    const v = src[k], b = FOLD_BOUNDS[k];
    if (FOLD_CHOICES[k]) { if (FOLD_CHOICES[k].indexOf(String(v)) >= 0) o[k] = v; continue; }
    if (typeof v === 'number' && isFinite(v)) o[k] = b ? Math.min(b[1], Math.max(b[0], v)) : v;
  }
  return o as FoldCfg;
}

/* the page's values as custom properties on its root */
export function foldVars(c: FoldCfg): Record<string, string> {
  return {
    '--pf-peek': c.peek + 'px', '--pf-first': c.firstTop + 'px', '--pf-dock': c.dockSize + 'px', '--pf-bar-pad': c.barPad + 'px', '--pf-cell-pad': c.cellPad + 'px', '--pf-dot': c.dotSize + 'px',
    '--pf-hdr': c.hdrH + 'px', '--pf-belt': c.beltH + 'px', '--pf-belt-ink': String(c.beltInk), '--pf-tick': c.tickH + 'px', '--pf-belt-fade': c.beltFade + 'px',
    '--pf-row': c.rowH + 'px', '--pf-city': c.citySize + 'px', '--pf-dim': String(c.dim),
    '--pf-width': c.width + 'px', '--pf-gutter-max': c.gutter + 'px', '--pf-gap': c.gap + 'px', '--pf-gap-phone': c.gapPhone + 'px', '--pf-words-phone': c.wordsPhone + 'px',
    '--pf-conv-from': c.convFrom + 'px', '--pf-conv-ms': c.convMs + 'ms', '--pf-bloom': String(1 + c.bloom), '--pf-bloom-ms': c.bloomMs + 'ms',
    '--wh-canvas-in': c.canvasIn + 'ms', '--pf-w-ms': c.wordsMs + 'ms', '--pf-w-step': c.wordsStep + 'ms', '--pf-w-rise': c.wordsRise + 'px', '--pf-w-edge': c.wordsEdge + 'px', '--pf-w-ink': String(c.wordsInk),
    '--pf-cells-at': c.cellsAt + 'ms', '--pf-link-at': c.linkAt + 'ms', '--pf-link-ms': c.linkMs + 'ms', '--pf-peek-at': c.peekAt + 'ms', '--pf-peek-ms': c.peekMs + 'ms', '--pf-names-ms': c.introMs + 'ms', '--pf-print-ms': c.printMs + 'ms',
    '--pf-erase-step': c.eraseStep + 'ms', '--pf-reg-ms': c.regMs + 'ms', '--pf-hover-in': c.hoverIn + 'ms', '--pf-hover-out': c.hoverOut + 'ms', '--pf-line-ms': c.lineMs + 'ms',
    '--pf-flap-ms': String(c.flapMs), '--pf-flap-step': String(c.flapStagger), '--pf-flaps': String(c.flaps),
    '--pf-prize-ms': c.prizeMs + 'ms', '--pf-prize-g': c.prizeGlobeStep + 'ms', '--pf-prize-c': c.prizeCodeStep + 'ms',
    '--pf-roll-ms': c.rollMs + 'ms', '--pf-roll-bar': c.rollBar + 'px', '--pf-write-step': c.writeStep + 'ms',
  };
}
