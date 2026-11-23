/* family.ts: the one config the preview, the home on the day and the city pages share for their small parts (the
   Key, the Cells, the Chip, the labels, the section heads, the rows), so the three read as one family. The specimen
   lab (/lab/family) moves it and saves saved/family.config.json; the root layout writes the sizes as tokens on
   :root, and the parts read the modes from the saved file. Pure. */

export type FamilyCfg = {
  /* the preview's first-screen Key: the site's square, or the Luma pill it had */
  key: 'square' | 'pill';
  /* mono labels: sentence case, or capitals */
  labels: 'sentence' | 'upper';
  /* the state: glyph and word in a 1 px box, the glyph and word bare, or a filled cell */
  chip: 'boxed' | 'bare' | 'cell';
  /* the home's headline: the news of the moment, or the event's name */
  headline: 'news' | 'name';
  /* the three first screens on one grid, or each as it was */
  frame: 'same' | 'loose';
  /* the globe between pages: it turns from where the last page left it, or each page starts where it starts */
  arrive: 'turn' | 'cut';
  /* the city's Top ten: docks in once row 3 has left the screen, always beside the ranking, or not shown */
  standings: 'dock' | 'fixed' | 'off';
  /* the home's cities table: a rule with the time between what has started and what is still to open */
  nowLine: 'on' | 'off';
  /* a ranking row's count and Vote key: one box at the far right, or apart */
  voteBox: 'joined' | 'apart';
  /* the ending's action cell takes the pass's perforation and notch */
  endStub: 'off' | 'on';
  /* the face of the words on the wheel's first screen: Geist, as everywhere else, or the study's Inter stack */
  sans: 'geist' | 'study';
  /* a people count shows from this many up (0: always) */
  people: number;
  /* sizes (px unless named) */
  keyH: number; cellH: number; chipH: number; display: number; displayCity: number; h2: number; label: number; labelTrack: number;
  rowH: number; picTop: number; picRest: number;
  /* the city's first screen, in svh, so the ranking starts above the fold */
  cityFirst: number;
  /* how much of the preview's glass (fringe, glow) the day globes carry; how much of the globe hangs off the right edge */
  globeGlass: number; globeBleed: number;
};

export const FAMILY_DEF: FamilyCfg = {
  key: 'pill', labels: 'sentence', chip: 'boxed', headline: 'news', frame: 'same', arrive: 'turn', standings: 'dock', nowLine: 'off', voteBox: 'joined', endStub: 'off', sans: 'geist',
  people: 5, keyH: 48, cellH: 56, chipH: 28, display: 64, displayCity: 108, h2: 56, label: 12, labelTrack: 0.02, rowH: 72, picTop: 176, picRest: 128, cityFirst: 62, globeGlass: 0.5, globeBleed: 0.24,
};

export const FAMILY_CHOICES: { [K in keyof FamilyCfg]?: string[] } = {
  key: ['square', 'pill'], labels: ['sentence', 'upper'], chip: ['boxed', 'bare', 'cell'], headline: ['news', 'name'], frame: ['same', 'loose'], arrive: ['turn', 'cut'],
  standings: ['dock', 'fixed', 'off'], nowLine: ['on', 'off'], voteBox: ['joined', 'apart'], endStub: ['off', 'on'], sans: ['geist', 'study'],
};

/* [min, max, step]: the tested ends */
export const FAMILY_BOUNDS: { [K in keyof FamilyCfg]?: [number, number, number] } = {
  people: [0, 50, 1], keyH: [44, 56, 2], cellH: [32, 60, 2], chipH: [24, 36, 2], display: [48, 96, 2], displayCity: [72, 132, 2], h2: [40, 72, 2], label: [11, 13, 1], labelTrack: [0, 0.12, 0.01],
  rowH: [56, 96, 2], picTop: [112, 176, 4], picRest: [96, 176, 4], cityFirst: [50, 100, 1], globeGlass: [0, 1, 0.05], globeBleed: [0, 0.45, 0.01],
};

export function clampFamily(o: unknown): FamilyCfg {
  const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>, c = { ...FAMILY_DEF } as Record<string, unknown>;
  for (const k of Object.keys(FAMILY_DEF) as (keyof FamilyCfg)[]) {
    const v = src[k], ch = FAMILY_CHOICES[k], b = FAMILY_BOUNDS[k];
    if (ch) { if (typeof v === 'string' && ch.includes(v)) c[k] = v; }
    else if (b && typeof v === 'number' && isFinite(v)) c[k] = Math.min(b[1], Math.max(b[0], v));
  }
  return c as FamilyCfg;
}

/* the sizes as tokens (the kit's stylesheet reads them) */
export function familyVars(c: FamilyCfg): Record<string, string> {
  return {
    '--k-key-h': c.keyH + 'px', '--k-cell-h': c.cellH + 'px', '--k-chip-h': c.chipH + 'px', '--k-display': c.display + 'px', '--k-display-city': c.displayCity + 'px',
    '--k-h2': c.h2 + 'px', '--k-label': c.label + 'px', '--k-label-track': c.labelTrack + 'em', '--k-row-h': c.rowH + 'px', '--k-pic-top': c.picTop + 'px', '--k-pic-rest': c.picRest + 'px',
    '--k-first-city': c.cityFirst + 'svh', '--k-glass': String(c.globeGlass), '--k-bleed': String(c.globeBleed), '--k-label-case': c.labels === 'upper' ? 'uppercase' : 'none',
  };
}
export function familyCss(c: FamilyCfg): string {
  return ':root{' + Object.entries(familyVars(c)).map(([k, v]) => k + ':' + v).join(';') + '}';
}

/* rule 5: one date at two lengths */
export const DATE_LONG = (d: Date) => d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }) + ' ' + d.getUTCFullYear();
export const DATE_SHORT = (d: Date) => d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
/* "People" shows only from the threshold up */
export const showPeople = (c: FamilyCfg, n: number) => c.people === 0 || n >= c.people;
