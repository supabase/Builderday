import { MONO, SANS, SHADER_KEYS, type WheelCfg } from './config';
import { drawTextGlobe, loadFrames, loadLand, markAt, markPoint, subsolar, type Frames, type LandMap, type TextGlobeDraw } from './text-globe';
import { GlobeClock } from './globe-clock';
import { globeClockCfg, globeLook, handoverDrop } from './globe-look';
import { createCrt, type Crt, type CrtFrame } from './crt';
import { click, settle, setVolume, unlock, type WheelStatus } from './click';
import { at } from '@/lib/routes';

/* The wheel: the city names are the spokes of a wheel around a glass globe whose centre sits on the right edge of
   the screen. The name that points left is the active city. The mouse wheel, a drag, the arrow keys and a click on a
   name turn it, one city at a time, and after the last city comes the first. The names are drawn on a 2D canvas and
   shown through the tube screen pass (crt.ts); without WebGL the 2D canvas is the picture, with a flat disc for the
   globe.

   Three changes from the study: the 2D picture is drawn and uploaded only while it moves (at rest the frame is one
   shader pass, for the breathing light, which is a uniform); the loop stops while the tab is hidden or the wheel is
   off screen; and without WebGL the globe is a flat disc with the land map, not nothing.

   With cfg.globe 'ascii' the big globe is the turning world as text (text-globe.ts), drawn into the 2D picture, so it
   scrolls and smears with the names. It follows the same turn as the glass but changes only on the steps of its clock
   (globe-clock.ts, cfg.globeFps a second), so it turns like stop motion; its modes (the arrival, the wake, the hold,
   the morning, the marks, a press on a city, the blink, the hand-over) are in the config. At rest it draws nothing.
   The link's small globe is then a globe of dots on the page (dot-globes.ts), not glass, and in a page's flow the big
   globe never docks: it leaves (or thins out as the page scrolls), and the header draws its own small one. With
   'none' the hub moves off the right edge and the names turn about nothing; there and with the rings the small
   globes stay glass. */

/* code: the three letters the text globe tags a city with; opens: when the city's day starts (ms), for the morning */
export type WheelCity = { name: string; lat: number; lon: number; status: WheelStatus; code?: string; opens?: number };
type Els = { pin: HTMLElement; canvas: HTMLCanvasElement; cells?: HTMLElement | null; lens?: HTMLElement | null; cta?: HTMLElement | null; foot?: HTMLElement | null; grip?: HTMLElement | null };

/* The wheel in a page's flow (off unless asked for): the page scrolls past the wheel instead of the wheel taking the
   whole screen. The vertical mouse wheel and a vertical swipe scroll the page and never turn the wheel; a sideways
   move, a drag on a name or the globe, a click on a name and the left and right arrows turn it.
   - fixed: the canvas is fixed to the window (the page's glass) and the engine moves the names, the cells and the link
     with the scroll itself, in its own frame, so they never part from the picture. Not fixed: the canvas scrolls
     with the page, as a picture would, and the rest of these options do nothing.
   - globe: docks: as the wheel scrolls away its glass globe shrinks along a straight line into the place `dock` gives
     (the header's register cell), and stays there; leaves: it scrolls away with the names, and `dock` gets a small
     globe of its own while `shown` says so. Under reduced motion it always leaves.
   - The globe's place and size are a function of the scroll alone. Docked, its light does not breathe; `turn` turns
     it a little with the speed of the scroll (radians at 1,000 px a second, 0 for none).
   - unroll (fixed only): while it says so, the names are not drawn (the page is carrying them somewhere else).
   - mirror (fixed, docks): once docked, the globe's pixels are copied into this canvas each time they are drawn, so
     the page can show the docked globe above whatever scrolls under its header. */
export type WheelFlow = {
  fixed: boolean; peek: number; globe: 'docks' | 'leaves'; dockEnd: number; turn: number; wheelOverGlobe?: boolean;
  dock: () => { x: number; y: number; r: number } | null; shown: () => boolean; unroll?: () => boolean;
  mirror?: () => HTMLCanvasElement | null;
  /* the first screen's arrival: with hold the names start unseen and wait for arrive(); ready is called once, after
     the first frame is drawn */
  hold?: boolean; ready?: () => void;
};
export type WheelEngine = {
  setCfg: (c: WheelCfg) => void; setCities: (c: WheelCity[]) => void; go: (slot: number, silent?: boolean) => void; jump: (slot: number) => void; step: (n: number) => void;
  measure: () => void; slot: () => number; gl: () => boolean; stats: () => { frames: number; pictures: number; glDraws: number }; destroy: () => void;
  /* a page's flow: run the loop until it is drawn and still (after the page moved the dock or showed its globe) */
  wake?: () => void;
  /* a page's flow: the names come in, turning onto the city from `sweep` cities back while they fade up over `ms`.
     No turn and no fade under reduced motion: they are simply there */
  arrive?: (sweep: number, ms: number, o?: ArriveOpts) => void;
  /* a page's flow: the hub and radius in CSS px (the wheel at the top of the page), where the wheel is turned to, and
     the wheel's height, where its names are clipped */
  geometry?: () => { x: number; y: number; r: number; at: number; h: number };
  /* where the active city's mark sits on the text globe, in viewport CSS px (null: no text globe, or behind the limb) */
  mark?: () => { x: number; y: number } | null;
};

/* how the text globe comes in with the names (held unseen until then with the flow's hold): it prints in rows over
   `steps` of its clock, sweeps, or is simply there. `turnGlobe`: the globe turns with the names from where they start,
   not only the names. */
export type ArriveOpts = { globe?: 'print' | 'sweep' | 'none'; steps?: number; turnGlobe?: boolean; names?: boolean };

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (v: number) => v * v * (3 - 2 * v);
const smoothstep = (a: number, b: number, v: number) => smooth(clamp01((v - a) / (b - a)));
const rad = (d: number) => (d * Math.PI) / 180;
const OFF_CANVAS = 20000;
/* the light on the ball of rings: from the top left, in front */
const RING_LIGHT = [-0.5, -0.55, 0.67].map((v, _, all) => v / Math.hypot(...all));
const LAND_URL = '/wheel/land.png';
/* the text globe arrives once per visit */
const ARRIVED = 'hackday-globe-arrived';
/* the page's green, written on <html> */
function greenOf() { return getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3ecf8e'; }

/* a font stack for the canvas: var(--x) is read off the page, since a canvas does not know the page's variables */
function canvasFont(stack: string) {
  return stack.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'sans-serif');
}

export function createWheel(els: Els, first: { cfg: WheelCfg; cities: WheelCity[]; start: number; noGl?: boolean; onCity: (i: number) => void; flow?: WheelFlow }): WheelEngine {
  const { pin, canvas } = els;
  const flow = first.flow;
  /* the glass is fixed to the window: the picture scrolls inside the canvas */
  const fixedGlass = () => !!flow?.fixed;
  /* where the screen lines' holes are written: the pin, or (with the glass fixed to the window) the page's root, so a
     header outside the wheel can cut the same holes */
  const vars = () => (fixedGlass() ? document.documentElement : pin);
  const HOLE_VARS = ['--globe-x', '--globe-y', '--globe-radius', '--small-x', '--small-y', '--small-radius', '--dock-x', '--dock-y', '--dock-radius'];
  let cfg = first.cfg, cities = first.cities;
  /* the text globe never docks and draws nothing in the header, so on fixed glass it has no need to be fixed: the
     canvas, the link and the cells scroll with the page itself. Placed by the loop, a frame after the scroll, they
     trailed the words beside them and the globes swam as the page moved. */
  const rides = () => fixedGlass() && cfg.globe === 'ascii';
  /* how far the loop moves what it places for a scroll of s: none while they ride the page */
  const lift = (s: number) => (rides() ? 0 : s);
  const crt: Crt | null = first.noGl ? null : createCrt(canvas, cfg, () => { dirty = true; lastGl = ''; start(true); });
  const picture = crt ? document.createElement('canvas') : canvas;
  const ctx = picture.getContext('2d')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduce.matches;

  const n = () => cities.length;
  const idx = (slot: number) => ((slot % n()) + n()) % n();
  const cityAt = (slot: number) => cities[idx(slot)];

  const view = { width: 1, height: 1, ratio: 1, x: 0, y: 0, radius: 1 };
  const turn = { yaw: 0 };
  const lens = { x: 0, y: 0, radius: 0, open: 0 };
  /* flow: the scroll this frame (CSS px), the dock's progress, the docked globe's turn with the scroll, the frame's
     quality cap (the device pixel ratio drops while frames fall on a scroll) and when the picture was last placed */
  const fl = { s: 0, t: 0, spin: 0, v: 0, cap: 2, slow: 0, drawnS: NaN, key: '', geomH: 1, gx: 0, gy: 0, gr: 0, hide: false, rim: 1, mirrored: null as HTMLCanvasElement | null };
  const cellsWidth = { row: 0, column: 0 };
  let target = first.start, position = first.start, clicked = Math.round(first.start), previous = -1;
  let wheelSum = 0, drag: { x: number; y: number; from: number; moved: boolean; axis: 'x' | 'y' | null; touch: boolean; grip: boolean; t: number; at: number; v: number } | null = null;
  let hush = false; /* a city picked from the page (the board, the map) makes its own sound, so the wheel stays quiet on the way */
  let shown = -1, settledOn = idx(first.start), ems: number[] = [];
  let drawnAt = NaN, dirty = true, lastGl = '', lastCells = '', lastOpacity = '', lastLand = '';
  let land: HTMLImageElement | null = null, tinted: HTMLCanvasElement | null = null;
  let raf = 0, running = false, onScreen = true, holes = '';
  /* the names' arrival: their share of ink, when the fade began and how long it takes, and no clicks while they turn in */
  const intro = { a: flow?.hold ? 0 : 1, t0: -1, ms: 1, quiet: false };
  /* with the flow's hold the text globe waits unseen too, and its arrival is the page's to start (arrive()) */
  const globeHold = { held: !!flow?.hold, want: null as null | { mode: 'print' | 'sweep'; steps: number } };
  let readyOut = false, readyFlow = false;
  /* the text globe: the study's frames and the land map once loaded, its clock, what was drawn last, the city under
     the pointer and the one pressed (reverse video), and how far it has thinned out on the scroll */
  let art: { frames: Frames | null; land: LandMap | null } | null = null, asciiKey = '', alive = true;
  const clock = new GlobeClock(globeClockCfg(first.cfg, reduce.matches));
  const tg = { hover: -1, invert: -1, drop: 0, press: 0 };
  /* the name under the mouse, where the mouse was, and how lit each name is (eases in and out) */
  const hov = { slot: null as number | null, x: 0, y: 0, on: false, at: NaN, lit: new Map<number, number>() };
  const glassOn = () => cfg.globe === 'glass', asciiOn = () => cfg.globe === 'ascii', ringsOn = () => cfg.globe === 'rings';
  /* the rings: each name's width and the middle of each letter (in font sizes), where the name's middle falls when the
     names run one after another, and lap, the length of all of them */
  let ringNames: { em: number; middle: number; letters: { ch: string; at: number }[] }[] = [], lap = 1;
  const stats = { frames: 0, pictures: 0, glDraws: 0 };
  /* the globe starts facing its city, as the study's does after its first turn */
  turn.yaw = cfg.face - rad(cityAt(target).lon);

  /* the names on the wheel are set like the words in the Luma box beside them (ending.css): its size, face and
     tracking, read off the page so the two stay one at every width. Without the box, the knobs. */
  let ctaPx = 0, ctaFace = '', ctaTrack = 0, ctaLands = false, ctaFades = false, ctaLead = 0, ctaGutter = 0, rowDocks = false, rowReach = '', rowHalf = 0;
  const measureName = () => {
    const c = els.cta ? getComputedStyle(els.cta) : null;
    ctaPx = c ? parseFloat(c.fontSize) || 0 : 0;
    ctaFace = ctaPx && c ? c.fontFamily : '';
    ctaTrack = ctaPx && c ? (parseFloat(c.letterSpacing) || 0) / ctaPx : 0;
    /* a box whose words end with the city's name takes the name from the wheel: what lies after the name in it */
    /* ...unless the page's CSS says the box stands apart here (--wh-lands: 0, a phone), and it fades the name in only when
       its hand-over is the fade (data-hand); a box that rolls its name keeps it in ink */
    ctaLands = !!els.cta?.hasAttribute('data-lands') && !!c && c.getPropertyValue('--wh-lands').trim() !== '0';
    ctaFades = ctaLands && els.cta?.getAttribute('data-hand') === 'fade';
    /* a box that stands apart leaves the names their own size and face */
    if (!ctaLands) { ctaPx = 0; ctaFace = ''; ctaTrack = 0; }
    /* the row docks at the foot of the first screen when its CSS says so (--wh-row-dock: 1, a phone): only the scroll moves it */
    const rowEl = els.cta?.closest('.wh-reg-at');
    const rs = rowEl ? getComputedStyle(rowEl) : null;
    rowDocks = !!rs && rs.getPropertyValue('--wh-row-dock').trim() === '1';
    /* how the row meets the wheel (--wh-reach): '' the names come to the row (they start where the box's name starts);
       stretch: the names stay where the wheel puts them and the row, starting on the margin, stretches to them; free: the
       row moves out to them */
    rowReach = rs ? rs.getPropertyValue('--wh-reach').trim() : '';
    rowHalf = rowEl instanceof HTMLElement ? rowEl.offsetHeight / 2 : 0;
    /* where the name starts in the row the box ends (the cells, the globe and the words before it) */
    /* the verb is set left. The name line is the end of the unseen longest verb, so a change of state does not move it */
    const mark = els.cta?.querySelector('.wh-reg-mark'), nm = els.cta?.querySelector('.wh-reg-city'), row = els.cta?.closest('.wh-reg-at');
    const lineAt = mark ? mark.getBoundingClientRect().right : nm?.getBoundingClientRect().left;
    ctaLead = lineAt != null && row ? lineAt - row.getBoundingClientRect().left : 0;
    /* the row starts on the left margin, under the page's words (the column's own left, wheel.css) */
    ctaGutter = els.cells ? parseFloat(getComputedStyle(els.cells).left) || 0 : 0;
  };
  /* the hero's one size (column layout): the names on the wheel and the words in the Luma box are one size, f, and the
     row's height and the stub are shares of it (wheel.css). The row runs from the page's edge to the globe: lead (all
     it holds before the box's name, in units of f, measured) then the longest name, ending at the names' inner circle,
     so f is what fills that width exactly, never more than a little over the wheel's own name size (grow). The row
     never moves off the edge; with room to spare at that cap the names come out to it. When even the smallest f will
     not fit (a phone, a tall tablet) the side docks: the words under the header and the row at the foot (data-dock,
     wheel.css), and the names keep the wheel's own size. Written on the pin only when it changes. */
  let heroF = 0, heroDock = false, leadEm = 13, fontsIn = false;
  const fitHero = (): boolean => {
    if (cfg.layout !== 'column' || !els.cta?.hasAttribute('data-lands')) {
      if (heroF) { heroF = 0; heroDock = false; pin.style.removeProperty('--wh-f'); pin.removeAttribute('data-dock'); return true; }
      return false;
    }
    const ps = getComputedStyle(pin), R = view.radius / view.ratio, natural = cfg.labelSize * R;
    const min = parseFloat(ps.getPropertyValue('--hero-min')) || 24, grow = parseFloat(ps.getPropertyValue('--hero-grow')) || 1.15, tall = parseFloat(ps.getPropertyValue('--hero-tall')) || 0.05;
    const gutter = ctaGutter || 24;
    const maxEm = Math.max(0, ...ems) || 6;
    const room = view.x / view.ratio - cfg.labelFrom * R - gutter;
    const fit = room / (leadEm + maxEm);
    /* a little give either side of the line, so a window resized across it does not flicker between the two */
    const dock = heroDock ? fit < min * 1.06 : fit < min;
    const f = dock ? natural : Math.min(natural * grow, fit, pin.clientHeight * tall);
    const changed = dock !== heroDock || Math.abs(f - heroF) > 0.25;
    heroDock = dock;
    if (changed) { heroF = f; pin.style.setProperty('--wh-f', `${f.toFixed(2)}px`); pin.toggleAttribute('data-dock', dock); }
    return changed;
  };
  /* the page's words keep clear of the names: as the wheel turns a name can stand anywhere on the circle the names
     start on, so each line of the words may run only as far as that circle where the line stands, less a gap. The
     words hang from the row (wheel.css), so a line's foot never moves when a line above it wraps: the headline gets
     the width at its foot and wraps there, the lines under it theirs. */
  let wordsKey = '';
  const fitWords = () => {
    const lead = els.cells?.querySelector<HTMLElement>('.wh-lead');
    if (!lead || cfg.layout !== 'column' || heroDock || !heroF) { if (wordsKey) { wordsKey = ''; pin.style.removeProperty('--wh-h1-max'); pin.style.removeProperty('--wh-lead-max'); } return; }
    const box = pin.getBoundingClientRect(), hx = view.x / view.ratio, hy = view.y / view.ratio, outer = nameOuter() / view.ratio;
    const gap = Math.max(36, heroF * 0.8);
    const room = (el: Element | null, g = gap) => {
      if (!el) return 9999;
      const r = el.getBoundingClientRect(), dy = Math.max(0, Math.abs(hy - (r.bottom - box.top)) - heroF * 0.55);
      const arc = dy >= outer ? 9999 : hx - Math.sqrt(outer * outer - dy * dy);
      return Math.max(0, arc - g - (r.left - box.left));
    };
    /* the headline is the biggest type on the screen, so it keeps more air: a name that stands level with it would
       otherwise read as the headline's next word */
    const h1el0 = lead.querySelector('h1');
    const h1 = Math.round(room(h1el0, Math.max(gap, (h1el0 ? parseFloat(getComputedStyle(h1el0).fontSize) : 0) * 1.6)));
    const rest = Math.round(Math.min(...[...lead.querySelectorAll(':scope > p, :scope > div > p')].map(room), 9999));
    const key = `${h1}|${rest}|${view.width}|${view.height}|${heroF}`;
    if (key === wordsKey) return;
    wordsKey = key;
    pin.style.setProperty('--wh-h1-max', `${h1}px`); pin.style.setProperty('--wh-lead-max', `${rest}px`);
    /* ...and the words stay under the page's header (--wh-safe-top): on a short window the headline takes the largest
       size whose top clears it, found by halving, only when the sizes change */
    const safe = parseFloat(getComputedStyle(pin).getPropertyValue('--wh-safe-top')) || 0;
    pin.style.removeProperty('--wh-title-cap');
    if (!safe) return;
    const top = () => lead.getBoundingClientRect().top - pin.getBoundingClientRect().top;
    if (top() >= safe) return;
    const h1el = lead.querySelector('h1'); if (!h1el) return;
    let lo = 24, hi = parseFloat(getComputedStyle(h1el).fontSize) || 48;
    for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; pin.style.setProperty('--wh-title-cap', `${mid}px`); if (top() >= safe) lo = mid; else hi = mid; }
    pin.style.setProperty('--wh-title-cap', `${lo.toFixed(1)}px`);
  };
  /* f and what it moves, until it holds (one pass in practice: the lead is in units of f, so it stays put) */
  const settleHero = () => {
    for (let i = 0; i < 3; i++) { const was = leadEm; const ch = fitHero(); measureName(); if (ctaPx && !heroDock && ctaLead) leadEm = ctaLead / ctaPx; if (!ch && Math.abs(leadEm - was) < 0.01) break; }
    fitWords();
  };
  /* the active name stands out from the others by the push; in the column it stays in line with them, and the Luma box
     takes it where it stands */
  const push = () => cfg.layout === 'column' ? 0 : cfg.labelPush;
  /* in the column the names are left-aligned: they start on one line and run in towards the globe. With a Luma box that
     takes the name, the line is where the box's name starts, the row starting on the left margin; else it is the outer
     end of the longest name. Either way the row never moves; only the box's right end follows the name. */
  const startAligned = () => cfg.layout === 'column' && !ringsOn();
  const natOuter = () => cfg.labelFrom * view.radius + Math.max(0, ...ems) * nameSize();
  const nameOuter = () => {
    if (!ctaLands || !ctaLead) return natOuter();
    const toRow = view.x - (ctaGutter + ctaLead) * view.ratio;
    /* stretched, the row can only reach so far in: past that the names come out to it */
    return rowReach === 'free' ? natOuter() : rowReach === 'stretch' ? Math.min(natOuter(), toRow) : toRow;
  };
  /* how far the name has landed in the box: none while the wheel turns, all of it at rest */
  const landed = () => ctaFades && cfg.layout === 'column' ? 1 - smoothstep(cfg.settleFrom, cfg.settleTo, Math.abs(target - position)) : 0;
  const nameSize = () => ctaPx ? ctaPx * view.ratio : cfg.labelSize * view.radius;
  const track = () => ctaPx ? ctaTrack : cfg.track;
  const font = () => ctaFace || canvasFont(SANS[cfg.font]);
  const measureEms = () => {
    ctx.font = `500 100px ${font()}`; ctx.letterSpacing = `${track() * 100}px`;
    ems = cities.map((c) => ctx.measureText(c.name).width / 100);
    let run = 0;
    ringNames = cities.map((c) => {
      const chars = [...c.name], edges = chars.map((_, i) => ctx.measureText(chars.slice(0, i + 1).join('')).width / 100);
      const em = edges[edges.length - 1] ?? 0, middle = run + em / 2;
      run += em + cfg.ringGap;
      return { em, middle, letters: chars.map((ch, i) => ({ ch, at: ((edges[i - 1] ?? 0) + edges[i]) / 2 })) };
    });
    lap = Math.max(run, 1e-3); ctx.letterSpacing = '0px';
  };

  const measureLens = () => {
    const el = els.lens; if (!el) { lens.radius = 0; return; }
    const frameBox = canvas.getBoundingClientRect(), box = el.getBoundingClientRect();
    lens.x = (box.left - frameBox.left + box.width / 2) * view.ratio;
    lens.y = (box.top - frameBox.top + box.height / 2 + (fixedGlass() ? lift(fl.s) : 0)) * view.ratio;
    lens.radius = (box.height / 2 / cfg.openScale) * view.ratio;
    const vs = vars().style;
    vs.setProperty('--small-x', `${lens.x / view.ratio}px`);
    vs.setProperty('--small-y', `${(lens.y - (fixedGlass() ? lift(fl.s) * view.ratio : 0)) / view.ratio}px`);
    vs.setProperty('--small-radius', `${asciiOn() ? 0 : box.height / 2}px`);
  };
  /* the cells' widths as one row and as one column, after their words change */
  const measureCells = () => {
    const c = els.cells; if (!c) return;
    c.classList.remove('is-docked', 'is-stacked'); cellsWidth.row = c.offsetWidth;
    /* the column is never stacked or docked, so it is never measured that way either */
    if (cfg.layout === 'column') { lastCells = ''; return; }
    c.classList.add('is-stacked'); cellsWidth.column = c.offsetWidth; lastCells = '';
  };

  const resize = () => {
    measureName();
    /* in a page's flow the wheel's own height (the window less the peek) plus the peek sizes the wheel, and a fixed
       canvas is the window's size */
    if (flow) { pin.classList.toggle('wh-rides', rides()); fl.key = ''; }
    const width = pin.clientWidth, height = flow ? pin.clientHeight + flow.peek : pin.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 2, fixedGlass() ? fl.cap : 2);
    const cw = fixedGlass() ? canvas.clientWidth || width : width, ch = fixedGlass() ? canvas.clientHeight || height : height;
    fl.geomH = height; fl.s = fixedGlass() ? Math.max(0, window.scrollY) : 0;
    canvas.width = picture.width = Math.round(cw * ratio); canvas.height = picture.height = Math.round(ch * ratio);
    const radius = Math.min(cfg.hubOfHeight * height, cfg.hubOfWidth * width) * ratio;
    /* with no globe the hub moves off the right edge, so the names sit further right on the same curve */
    Object.assign(view, { width: cw * ratio, height: ch * ratio, ratio, x: width * ratio + (cfg.globe === 'none' ? cfg.bareShift * radius : 0), y: cfg.hubY * height * ratio, radius });
    /* the screen lines leave a hole for the glass ball only; the text globe is on the screen, so it gets the lines */
    vars().style.setProperty('--globe-radius', `${glassOn() ? view.radius / ratio : 0}px`);
    vars().style.setProperty('--globe-y', `${view.y / ratio}px`);
    settleHero(); measureEms();
    measureLens(); dirty = true; lastGl = ''; lastCells = '';
  };

  /* ---- the picture: the names, and (without WebGL) the flat globe ---- */
  const ink = (a: number) => `rgba(${cfg.ink}, ${cfg.ink}, ${cfg.ink - 2}, ${a})`;

  /* ---- the rings: the line of names copied into rings, one inside the other, that make a ball seen from a pole. Near
     the rim a ring is lower and closer to the next, like the lines of latitude; the outer ring is the one read and
     turned, and every next ring turns the other way ---- */
  const ringAt = (slot: number) => ringNames[idx(slot)];
  const middleOf = (slot: number) => Math.floor(slot / n()) * lap + ringAt(slot).middle;
  const along = (at: number) => { const s0 = Math.floor(at); return middleOf(s0) + (middleOf(s0 + 1) - middleOf(s0)) * (at - s0); };
  const ballOf = () => { const size = nameSize(), outer = cfg.labelFrom * view.radius; return { size, outer, ball: outer + size * 0.6 }; };
  const lightAt = (x: number, y: number, ball: number) => {
    const nx = x / ball, ny = y / ball, nz = Math.sqrt(Math.max(1 - nx * nx - ny * ny, 0));
    return { lit: Math.max(nx * RING_LIGHT[0] + ny * RING_LIGHT[1] + nz * RING_LIGHT[2], 0), facing: nz };
  };
  const ringsOf = (size: number, outer: number, ball: number) => {
    const heightAt = (r: number) => cfg.ringFlat + (1 - cfg.ringFlat) * lightAt(r, 0, ball).facing;
    const rings = [{ radius: outer, height: 1 }];
    for (;;) {
      const { radius, height } = rings[rings.length - 1];
      const next = heightAt(radius - cfg.ringLine * size * height), inner = radius - (cfg.ringLine * size * (height + next)) / 2;
      if (rings.length >= Math.round(cfg.ringCount) || inner < cfg.ringHole * size) return rings;
      rings.push({ radius: inner, height: next });
    }
  };
  const drawRing = (ring: number, radius: number, height: number, ball: number, size: number, at: number, alpha: number, lift: number) => {
    const turned = (ring % 2 ? -at : at) + ring * cfg.ringStagger, middle = along(turned);
    /* half a turn shows; the rest is past the right edge */
    const reach = Math.PI / 2 + 0.2;
    for (let slot = Math.round(turned) - 8; slot <= Math.round(turned) + 8; slot++) {
      const nm = ringAt(slot), centre = ((middle - middleOf(slot)) * size) / radius;
      if (Math.abs(centre) - (nm.em * size) / radius / 2 > reach) continue;
      const near = ring === 0 ? smooth(1 - clamp01(Math.abs(slot - at))) : 0;
      for (const { ch, at: off } of nm.letters) {
        /* the next cities are below the middle, and each name reads up its ring */
        const angle = Math.PI + centre + ((off - nm.em / 2) * size) / radius;
        if (Math.abs(angle - Math.PI) > reach) continue;
        const x = radius * Math.cos(angle), y = radius * Math.sin(angle), { lit } = lightAt(x, y, ball);
        /* the outer ring stays easy to read, and its active name is not shaded */
        const shade = ring === 0 ? (cfg.dim + (1 - cfg.dim) * near) * (0.25 + 0.75 * lit + (0.75 - 0.75 * lit) * near) : 0.02 + 0.7 * lit * lit;
        /* the top of each letter points away from the centre */
        const t = angle + Math.PI / 2, cos = Math.cos(t), sin = Math.sin(t);
        ctx.setTransform(cos, sin, -sin * height, cos * height, view.x + x, view.y + y - lift);
        ctx.fillStyle = ink(shade * alpha);
        ctx.fillText(ch, 0, 0);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  const drawRings = (behind: number, lift: number) => {
    if (fl.hide) return;
    const { size, outer, ball } = ballOf(), clip = fixedGlass();
    if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(0, -lift, view.width, fl.geomH * view.ratio); ctx.clip(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `500 ${size}px ${font()}`; ctx.letterSpacing = '0px';
    ringsOf(size, outer, ball).forEach(({ radius, height }, ring) => {
      /* a fast turn leaves a short smear behind each name */
      for (let g = Math.round(cfg.ghosts); g >= 1 && Math.abs(behind) > cfg.ghostFrom; g--) drawRing(ring, radius, height, ball, size, position - behind * cfg.ghostGap * g, cfg.ghostAlpha / g, lift);
      drawRing(ring, radius, height, ball, size, position, 1, lift);
    });
    if (clip) ctx.restore();
  };

  const drawNames = (behind: number, lift = 0) => {
    if (ringsOn()) { drawRings(behind, lift); return; }
    const size = nameSize(), reach = cfg.labelFrom * view.radius, step = rad(cfg.step);
    if (lift) { ctx.save(); ctx.translate(0, -lift); }
    /* with the glass fixed to the window the picture is taller than the wheel: names past its bottom would show through
       the page under it, so they end where the wheel does */
    const clip = fixedGlass();
    if (fl.hide) { if (lift) ctx.restore(); return; }
    if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, view.width, fl.geomH * view.ratio); ctx.clip(); }
    const lefted = startAligned(), outer = lefted ? nameOuter() : 0;
    ctx.textAlign = lefted ? 'left' : 'right'; ctx.textBaseline = 'middle';
    ctx.font = `500 ${size}px ${font()}`; ctx.letterSpacing = `${track() * size}px`;
    /* the name the wheel comes to rest on fades out as it lands in the Luma box */
    const land = landed(), home = Math.round(target);
    const drawName = (slot: number, at: number, alpha: number) => {
      if (slot === home) alpha *= 1 - land;
      const angle = (at - slot) * step, near = 1 - clamp01(Math.abs(slot - at));
      const fade = 1 - smoothstep(cfg.fadeFrom, cfg.fadeTo, Math.abs(angle));
      if (fade <= 0) return;
      ctx.save(); ctx.translate(view.x, view.y); ctx.rotate(angle);
      const lit = Math.max(smooth(near), hov.lit.get(slot) ?? 0);
      ctx.fillStyle = ink((cfg.dim + (1 - cfg.dim) * lit) * fade * alpha);
      ctx.fillText(cityAt(slot).name, lefted ? -outer : -reach - push() * view.radius * smooth(near), 0);
      ctx.restore();
    };
    const from = Math.floor(position) - 14;
    for (let slot = from; slot <= from + 28; slot++) {
      /* a fast turn leaves a short smear behind each name */
      for (let g = Math.round(cfg.ghosts); g >= 1 && Math.abs(behind) > cfg.ghostFrom; g--) drawName(slot, position - behind * cfg.ghostGap * g, cfg.ghostAlpha / g);
      drawName(slot, position, 1);
    }
    if (clip) ctx.restore();
    if (lift) ctx.restore();
    if (!crt || fl.rim <= 0 || !glassOn()) return;
    /* the glass shows the start of each name at its rim: a small copy of the names drawn as soft shadow, off canvas.
       In a page they fade as the globe docks, or they would show where the globe was */
    const small = cfg.mirrorSize * view.radius;
    ctx.font = `500 ${small}px ${font()}`; ctx.letterSpacing = `${track() * small}px`; ctx.textAlign = 'left';
    ctx.shadowOffsetX = OFF_CANVAS;
    for (let slot = from; slot <= from + 28; slot++) {
      const angle = (position - slot) * step;
      if (Math.abs(angle) > 1) continue;
      const near = 1 - clamp01(Math.abs(slot - position));
      ctx.save(); ctx.translate(view.x - OFF_CANVAS, view.y); ctx.rotate(angle);
      ctx.shadowColor = ink((cfg.dim + (1 - cfg.dim) * smooth(near)) * fl.rim);
      for (const soft of [cfg.mirrorBlur, cfg.mirrorGlow]) { ctx.shadowBlur = soft * view.radius * 2; ctx.fillText(cityAt(slot).name, -cfg.mirrorStart * view.radius, 0); }
      ctx.restore();
    }
    ctx.shadowOffsetX = 0; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  };

  /* without WebGL: the globe as a flat disc, the land map scrolled by the turn, the city as a small light */
  const tint = () => {
    if (!land || tinted) return;
    const t = document.createElement('canvas'); t.width = land.naturalWidth; t.height = land.naturalHeight;
    const p = t.getContext('2d')!; p.drawImage(land, 0, 0); p.globalCompositeOperation = 'multiply';
    p.fillStyle = 'rgb(63, 97, 80)'; p.fillRect(0, 0, t.width, t.height); tinted = t;
  };
  const disc = (cx: number, cy: number, r: number, withCity: boolean, glow: number) => {
    if (r <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgb(20, 24, 23)'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const h = 2 * r * cfg.core, w = 2 * h, top = cy - h / 2;
    const centre = ((-turn.yaw / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
    tint();
    if (tinted) {
      ctx.globalCompositeOperation = 'lighter';
      const x = cx - centre * w;
      for (const k of [-1, 0, 1]) ctx.drawImage(tinted, x + k * w, top, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (withCity && glow > 0) {
      const c = cityAt(target), u = rad(c.lon) / (Math.PI * 2) + 0.5;
      let du = u - centre; du -= Math.round(du);
      const px = cx + du * w, py = top + (0.5 - rad(c.lat) / Math.PI) * h;
      const blue = ctx.createRadialGradient(px, py, 0, px, py, r * 0.35);
      blue.addColorStop(0, `rgba(41, 97, 255, ${0.8 * glow})`); blue.addColorStop(1, 'rgba(41, 97, 255, 0)');
      ctx.fillStyle = blue; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const orange = ctx.createRadialGradient(px, py, 0, px, py, r * 0.08);
      orange.addColorStop(0, `rgba(255, 117, 20, ${glow})`); orange.addColorStop(1, 'rgba(255, 117, 20, 0)');
      ctx.fillStyle = orange; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r - view.ratio / 2, 0, Math.PI * 2);
    ctx.strokeStyle = ink(0.45); ctx.lineWidth = view.ratio; ctx.stroke();
  };

  /* the text globe: everything one drawing needs; `lift` moves it up (device px), as the scroll does */
  const globeDraw = (lift = 0): TextGlobeDraw | null => {
    if (!art || (!art.frames && !art.land)) return null;
    const i = idx(target), c = cities[i], o = clock.out;
    return {
      x: view.x - cfg.globeShift * view.radius, y: view.y - lift, r: view.radius, ratio: view.ratio, facing: o.facing,
      cities, active: i, bracket: o.bracket, frames: art.frames, land: art.land,
      look: globeLook(cfg, canvasFont(MONO.geist), greenOf()), trail: o.trail, reveal: o.reveal,
      sun: cfg.globeLight === 'morning' && c.opens !== undefined ? subsolar(c.opens) : null,
      hover: tg.hover, invert: tg.invert, drop: tg.drop, seed: cfg.globeSeed, clip: 1.1,
    };
  };
  /* the clock moves on; the first time the globe can be drawn on a visit, it arrives (once per visit) */
  const stepAscii = (now: number, settled: boolean) => {
    if (!art) return;
    clock.tick(now, -turn.yaw * 180 / Math.PI, settled);
  };
  const drawGlobeText = (lift = 0) => {
    if (globeHold.held || clock.pending()) return;
    const d = globeDraw(lift); if (!d) return;
    drawTextGlobe(ctx, d);
  };
  const wantAscii = () => {
    if (!asciiOn() || art) return;
    art = { frames: null, land: null };
    Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => {
      if (!alive) return;
      art = { frames, land }; asciiKey = ''; dirty = true; lastGl = '';
      if (flow?.hold) { if (globeHold.want) { clock.arrive(globeHold.want.mode, globeHold.want.steps); globeHold.want = null; globeHold.held = false; } }
      else {
        let seen = false; try { seen = sessionStorage.getItem(ARRIVED) === '1'; sessionStorage.setItem(ARRIVED, '1'); } catch { /* storage blocked */ }
        if (!seen) clock.arrive();
      }
      start(true);
    });
  };

  /* ---- the loop ---- */
  /* the names at their arrival's share of ink; the globe drawn after them keeps its own */
  const names = (behind: number, lift = 0) => {
    if (intro.a <= 0) return;
    ctx.globalAlpha = intro.a; drawNames(behind, lift); ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    stats.frames++;
    const time = now / 1000, dt = previous < 0 ? 0 : Math.min(time - previous, 0.1);
    previous = time;
    const e = (k: number) => (reduced ? 1 : 1 - Math.exp(-dt * k));
    position += (target - position) * e(cfg.ease);
    if (Math.abs(target - position) < 1e-4) position = target;
    const behind = target - position;
    if (Math.round(position) !== clicked) { clicked = Math.round(position); if (cfg.sound && !intro.quiet) click(); }
    if (position === target) intro.quiet = false;
    if (intro.t0 >= 0) {
      const k = clamp01((now - intro.t0) / intro.ms), a = 1 - (1 - k) ** 3;
      if (a !== intro.a) { intro.a = a; dirty = true; }
      if (k >= 1) intro.t0 = -1;
    }

    const i = idx(target), city = cities[i];
    const rest = cfg.face - rad(city.lon), away = Math.atan2(Math.sin(rest - turn.yaw), Math.cos(rest - turn.yaw));
    turn.yaw += Math.abs(away) < 1e-5 ? away : away * e(cfg.yawEase);
    const isOpen = !!els.cta?.matches(':hover, :focus-visible');
    lens.open += ((isOpen ? 1 : 0) - lens.open) * e(cfg.openEase);
    if (Math.abs((isOpen ? 1 : 0) - lens.open) < 1e-4) lens.open = isOpen ? 1 : 0;

    /* the row takes the new city only when the wheel's name goes below the row's edge. Before that, the wheel still
       draws the name beside the row */
    const onLine = cfg.layout === 'column' && !rowDocks && !heroDock;
    const under = !onLine || Math.abs(Math.sin(behind * rad(cfg.step))) * nameOuter() < rowHalf * view.ratio + nameSize() * 0.35;
    if (shown !== i && under) { shown = i; first.onCity(i); }
    /* the wheel turns under a still mouse: the name under it changes */
    if (hov.on && position !== hov.at) { hov.at = position; hov.slot = slotAt(hov.x, hov.y); }
    for (const [slot, a] of hov.lit) {
      const to = slot === hov.slot ? 1 : 0, next = Math.abs(to - a) < 0.01 ? to : a + (to - a) * e(18);
      if (next === 0) hov.lit.delete(slot); else hov.lit.set(slot, next);
      if (next !== a) dirty = true;
    }
    if (hov.slot !== null && !hov.lit.has(hov.slot)) { hov.lit.set(hov.slot, reduced ? 1 : 0.001); dirty = true; }

    /* flow, fixed glass: the scroll moves the picture, the cells and the link; the globe docks or leaves */
    const fixed = fixedGlass(), R = view.ratio;
    /* s: the page's scroll; ls: how far the loop moves what it places for it (0 while they ride the page) */
    let s = 0, ls = 0, k = 0, globe = { x: view.x, y: view.y, radius: view.radius }, dock: CrtFrame['dock'];
    if (fixed && flow) {
      s = Math.max(0, window.scrollY);
      const ds = s - fl.s;
      if (dt > 0) fl.v += ((ds / dt) - fl.v) * Math.min(1, dt * 12);
      /* the speed eases toward 0 and would never reach it: under a pixel a second it is still, so the loop can stop */
      if (ds === 0 && Math.abs(fl.v) < 1) fl.v = 0;
      if (ds !== 0 && dt > 0) {
        /* frames falling while the page scrolls: the glass drops resolution before it drops frames */
        fl.slow += ((dt > 0.022 ? 1 : 0) - fl.slow) * 0.1;
        if (fl.slow > 0.6 && fl.cap > 1) { fl.cap -= 0.5; fl.slow = 0; fl.s = s; resize(); }
      }
      fl.s = s; ls = lift(s);
      const hide = !reduced && !!flow.unroll?.();
      if (hide !== fl.hide) { fl.hide = hide; dirty = true; }
      const mode = reduced || !glassOn() ? 'leaves' : flow.globe, D = flow.dock();
      if (mode === 'docks' && D) {
        fl.t = clamp01(s / Math.max(1, flow.dockEnd * fl.geomH)); k = smooth(fl.t);
        /* gone within the first part of the dock, before the globe has moved off them; in tenths, so the picture is
           drawn again about ten times, not every frame */
        const rim = Math.round((1 - clamp01(fl.t / 0.15)) * 10) / 10; if (rim !== fl.rim) { fl.rim = rim; dirty = true; }
        globe = { x: view.x + (D.x * R - view.x) * k, y: view.y + (D.y * R - view.y) * k, radius: view.radius + (D.r * R - view.radius) * k };
      } else {
        fl.t = 0; globe = { x: view.x, y: view.y - ls * R, radius: glassOn() ? view.radius : 0 };
        if (fl.rim !== 1) { fl.rim = 1; dirty = true; }
        /* the text globe's header has its own globe of dots; the others get a small glass one */
        if (D && flow.shown() && !asciiOn()) dock = { x: D.x * R, y: D.y * R, radius: D.r * R, glow: 1 };
      }
      /* docked, the globe turns a little with the speed of the scroll and settles back on its city */
      const want = reduced ? 0 : Math.max(-0.6, Math.min(0.6, (fl.v / 1000) * flow.turn));
      fl.spin += (want - fl.spin) * e(4); if (Math.abs(fl.spin) < 1e-5 && want === 0) fl.spin = 0;
      if (els.foot && fl.key !== String(ls)) { fl.key = String(ls); els.foot.style.translate = ls ? `0 ${-ls}px` : ''; }
      /* the text globe takes a drag where it is drawn, left of the hub; as it thins out on the scroll, cells go */
      const held = asciiOn() ? { x: view.x - cfg.globeShift * view.radius, y: globe.y, radius: view.radius } : globe;
      if (asciiOn()) {
        const drop = reduced ? 0 : handoverDrop(cfg, s / Math.max(1, flow.dockEnd * fl.geomH));
        if (drop !== tg.drop) tg.drop = drop;
      }
      const grip = els.grip;
      if (grip) {
        const gk = `${Math.round(held.x)}|${Math.round(held.y)}|${Math.round(held.radius)}|${k > 0.5}`;
        if (grip.dataset.at !== gk) {
          grip.dataset.at = gk; const r = held.radius / R;
          grip.style.translate = `${held.x / R - r}px ${held.y / R - r}px`; grip.style.width = grip.style.height = `${2 * r}px`;
          grip.toggleAttribute('data-docked', k > 0.5);
        }
      }
      fl.gx = held.x / R; fl.gy = held.y / R; fl.gr = held.radius / R;
    }

    /* the cells sit before the active name and show when the wheel is at rest */
    const size = nameSize();
    const settled = 1 - smoothstep(cfg.settleFrom, cfg.settleTo, Math.abs(behind));
    const cells = els.cells;
    if (cells) {
      const nameStart = view.x - cfg.labelFrom * view.radius - push() * view.radius - (ems[i] || 0) * size;
      /* on the rings the active name stands up on the left of the outer ring, so the cells end just before its letters */
      const end = ringsOn() ? (view.x - cfg.labelFrom * view.radius - size) / view.ratio : (nameStart - size * 0.6) / view.ratio;
      /* column: the page's words and the cells sit on the left margin (the CSS gutter), always on one line: they never
         stack or dock. The Luma box is apart from them, on the active name's line, ending just before its letters. */
      const column = cfg.layout === 'column';
      const stacked = !column && end - cellsWidth.row < 20, docked = !column && end - cellsWidth.column < 20;
      const key = `${column}|${stacked}|${docked}|${end}|${view.y}|${ls}|${ctaLands}|${ctaLead}|${ctaGutter}|${rowDocks}|${rowReach}|${ems.length}|${size}`;
      if (key !== lastCells) {
        lastCells = key;
        cells.classList.toggle('is-stacked', stacked && !docked); cells.classList.toggle('is-docked', docked);
        /* the column is placed by its CSS alone (wheel.css), and here only follows the page's scroll */
        cells.style.translate = docked || column ? (ls ? `0 ${-ls}px` : '') : `${end}px ${view.y / view.ratio - ls}px`;
        const cta = els.cta;
        if (column && cta) {
          /* the row (the cells, then the box) starts so the box's name starts where the wheel's names start: it never
             moves, whatever the city. A box with other words ends just before the names. */
          const namesStart = (view.x - nameOuter()) / view.ratio;
          const row = cta.closest<HTMLElement>('.wh-reg-at') ?? cta;
          /* stretched, the row is told where the wheel puts the names (from its own left, the margin) and how long the
             longest is, and sizes itself to them */
          if (rowReach === 'stretch') {
            row.style.setProperty('--wh-name-x', `${(view.x - natOuter()) / view.ratio - ctaGutter}px`);
            row.style.setProperty('--wh-name-w', `${Math.max(0, ...ems) * size / view.ratio}px`);
          }
          const x = rowReach === 'stretch' ? ctaGutter : ctaLands ? namesStart - ctaLead : namesStart - size * 0.6 / view.ratio - row.offsetWidth;
          row.style.translate = rowDocks ? (ls ? `0 ${-ls}px` : '') : `${x}px ${view.y / view.ratio - ls}px`;
          /* the page's words stand on the same line, above the row (wheel.css reads it) */
          pin.style.setProperty('--wh-line', `${view.y / view.ratio}px`);
          if (flow && fontsIn && !row.hasAttribute('data-placed')) row.setAttribute('data-placed', '');
        }
        /* in a page the cells wait unseen until this first placing, so it is not a layout shift */
        if (flow && fontsIn && !cells.hasAttribute('data-placed')) cells.setAttribute('data-placed', '');
      }
      /* the box's name comes in as the wheel's goes */
      const land = landed().toFixed(3);
      if (land !== lastLand) { lastLand = land; const nm = els.cta?.querySelector<HTMLElement>('.wh-reg-city'); if (nm) nm.style.opacity = ctaFades ? land : ''; }
      /* in the column the words and the pill around the cells stay, so the cells stay too and only their words change */
      const op = cfg.layout === 'column' ? '1' : settled.toFixed(3);
      if (op !== lastOpacity) { lastOpacity = op; cells.style.opacity = op; }
    }
    if (settled > 0.98 && settledOn !== i) { settledOn = i; if (cfg.sound && !hush) settle(city.status); hush = false; }

    /* docked, the light holds still */
    /* the text globe has no light that breathes: at rest nothing is drawn */
    const pulse0 = reduced || asciiOn() ? 1 : cfg.pulseLow + (1 - cfg.pulseLow) * Math.sin(time * cfg.pulseRate);
    const pulse = pulse0 + (1 - pulse0) * k;
    const glow = settled * pulse;
    const small = { x: lens.x, y: lens.y - ls * view.ratio, radius: asciiOn() ? 0 : lens.radius * (1 + (cfg.openScale - 1) * lens.open) };
    const yaw = turn.yaw + fl.spin * k;
    if (fixed) {
      /* the screen lines' holes follow the globes in the same frame */
      const hk = `${globe.x}|${globe.y}|${globe.radius}|${small.y}|${small.radius}|${dock ? dock.x + ',' + dock.y + ',' + dock.radius : ''}`;
      if (hk !== holes) {
        holes = hk; const st = vars().style, q = view.ratio;
        st.setProperty('--globe-x', `${globe.x / q}px`); st.setProperty('--globe-y', `${globe.y / q}px`); st.setProperty('--globe-radius', `${(glassOn() ? globe.radius : 0) / q}px`);
        st.setProperty('--small-y', `${small.y / q}px`);
        st.setProperty('--dock-x', `${(dock?.x ?? 0) / q}px`); st.setProperty('--dock-y', `${(dock?.y ?? 0) / q}px`); st.setProperty('--dock-radius', `${(dock?.radius ?? 0) / q}px`);
      }
    }

    /* the mirror: a new canvas (or the first docked frame) forces one draw, so there is a picture to copy */
    const mirror = fixed && flow?.mirror && fl.t >= 1 ? flow.mirror() : null;
    if (mirror && mirror !== fl.mirrored) lastGl = '';
    if (!mirror && fl.mirrored) { fl.mirrored.removeAttribute('data-on'); fl.mirrored = null; }
    const drawn = stats.glDraws + stats.pictures;
    let textMoved = false;
    if (asciiOn()) {
      stepAscii(now, settled > 0.98 && Math.abs(away) < 0.01);
      const o = clock.out, tk = `${o.facing}|${o.trail.join(',')}|${o.reveal ? o.reveal.step : -1}|${o.bracket}|${i}|${tg.hover}|${tg.invert}|${tg.drop}`;
      if (tk !== asciiKey) { asciiKey = tk; textMoved = true; }
    }
    if (crt) {
      const moved = dirty || textMoved || position !== drawnAt;
      if (moved) { ctx.clearRect(0, 0, view.width, view.height); names(behind); if (asciiOn()) drawGlobeText(); drawnAt = position; dirty = false; stats.pictures++; }
      /* skip the pass when nothing at all changed (at rest under reduced motion, where the light does not breathe) */
      const key = `${moved}|${yaw}|${small.radius}|${glow}` + (fixed ? `|${ls}|${globe.x}|${globe.y}|${globe.radius}|${dock ? dock.radius : 0}` : '');
      if (moved || key !== lastGl) {
        lastGl = key; stats.glDraws++;
        crt.draw(fixed
          ? { picture: moved ? picture : null, hub: { x: view.x, y: view.y - ls * view.ratio }, radius: view.radius, small, ratio: view.ratio, yaw, city: [rad(city.lat), rad(city.lon)], glow,
            scroll: ls * view.ratio, globe, mirror: 1 - k, dock }
          : { picture: moved ? picture : null, hub: view, radius: view.radius, small, ratio: view.ratio, yaw: turn.yaw, city: [rad(city.lat), rad(city.lon)], glow });
      }
    } else {
      /* the flat picture is drawn only when something in it moved; its city light does not breathe */
      const key = `${position}|${asciiOn() ? asciiKey : yaw}|${small.radius}|${settled}|${dirty}|${!!tinted}` + (fixed ? `|${ls}|${globe.x}|${globe.y}|${globe.radius}|${dock ? dock.radius : 0}` : '');
      if (key !== lastGl) {
        lastGl = key; dirty = false; drawnAt = position; stats.pictures++;
        ctx.clearRect(0, 0, view.width, view.height); names(behind, ls * view.ratio);
        if (asciiOn()) drawGlobeText(ls * view.ratio); else if (glassOn()) disc(globe.x, globe.y, globe.radius, true, settled);
        if (!asciiOn()) disc(small.x, small.y, small.radius, false, 0);
        if (dock) disc(dock.x, dock.y, dock.radius, true, settled);
      }
    }
    if (mirror && stats.glDraws + stats.pictures !== drawn) {
      /* copied in the same frame as the draw, before the buffer is handed to the screen */
      const size = Math.max(1, Math.round(2 * globe.radius)), m = mirror.getContext('2d');
      if (m) {
        if (mirror.width !== size || mirror.height !== size) { mirror.width = size; mirror.height = size; }
        m.clearRect(0, 0, size, size);
        m.drawImage(canvas, globe.x - globe.radius, globe.y - globe.radius, 2 * globe.radius, 2 * globe.radius, 0, 0, size, size);
        if (fl.mirrored !== mirror) { fl.mirrored = mirror; mirror.setAttribute('data-on', ''); }
      }
    }
    fl.drawnS = s;
    if (!readyOut && stats.pictures > 0) { readyOut = true; if (flow) canvas.setAttribute('data-drawn', ''); }
    /* the page's arrival starts once the wheel has drawn and the text globe's frames are here, so the names and the
       globe come in together (the page still caps the wait) */
    if (readyOut && !readyFlow && (!asciiOn() || art?.frames)) { readyFlow = true; flow?.ready?.(); }
    /* off screen in a page: once the last frame is drawn and nothing moves, the loop stops (no frame at rest) */
    if (fixed && !onScreen && position === target && Math.abs(away) < 1e-5 && (lens.open === 0 || lens.open === 1) && fl.spin === 0) stop();
  };
  /* force: a page's fixed glass wakes the loop while the wheel is off screen (a docked globe to turn or redraw) */
  const start = (force = false) => { if (running || document.hidden || (!onScreen && !(force && fixedGlass()))) return; running = true; previous = -1; raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  /* ---- input ---- */
  /* the shortest way round to a city */
  const go = (slot: number, silent = false) => { const k = n(), cur = idx(target); let d = idx(slot) - cur; if (d > k / 2) d -= k; if (d < -k / 2) d += k; if (silent && d !== 0) { intro.quiet = true; hush = true; } target += d; };
  const slotAt = (x: number, y: number): number | null => {
    const box = canvas.getBoundingClientRect();
    const dx = (x - box.left) * view.ratio - view.x, dy = (y - box.top) * view.ratio - view.y;
    const far = Math.hypot(dx, dy), angle = Math.atan2(-dy, -dx), step = rad(cfg.step);
    if (ringsOn()) {
      /* a name of the outer ring: the spot along the ring under the point, in font sizes */
      const { size, outer } = ballOf();
      if (Math.abs(far - outer) > size * 0.7 || !ringNames.length) return null;
      const spot = along(position) - (angle * outer) / size, first = Math.round(position) - 8;
      for (let s0 = first; s0 <= first + 16; s0++) if (Math.abs(spot - middleOf(s0)) < ringAt(s0).em / 2 + 0.3) return s0;
      return null;
    }
    /* the nearest name takes the point, across the band the longest name fills, so no gap between names is dead */
    const slot = Math.round(position - angle / step), size = nameSize();
    const near = 1 - clamp01(Math.abs(slot - position));
    const from = (cfg.labelFrom + push() * smooth(near)) * view.radius;
    const w = Math.max(0, ...ems) * size, inner = startAligned() ? nameOuter() - w : from;
    const onName = far > inner - size * 0.3 && far < inner + w + size * 0.3;
    return onName && Math.abs(angle) < cfg.fadeTo ? slot : null;
  };
  /* the rings have no ball of glass: the whole ball of rings takes a drag */
  const overRings = (x: number, y: number) => {
    const b = canvas.getBoundingClientRect(), hy = fixedGlass() && !rides() ? view.y / view.ratio - fl.s : b.top + view.y / view.ratio;
    return Math.hypot(x - b.left - view.x / view.ratio, y - hy) < ballOf().ball / view.ratio;
  };
  const overGlobe = (x: number, y: number) => ringsOn() ? overRings(x, y) : fixedGlass() && !rides() ? Math.hypot(x - fl.gx, y - fl.gy) < fl.gr : (() => { const b = canvas.getBoundingClientRect(), gx = view.x - (asciiOn() ? cfg.globeShift * view.radius : 0); return Math.hypot((x - b.left) * view.ratio - gx, (y - b.top) * view.ratio - view.y) < view.radius; })();
  /* the city whose mark on the text globe is under a point (a 44 px target), or -1 */
  const markUnder = (x: number, y: number): number => {
    if (!asciiOn() || (cfg.globePick !== 'on' && cfg.globeMarks !== 'tags')) return -1;
    const b = canvas.getBoundingClientRect(), d = globeDraw(fixedGlass() ? lift(fl.s) * view.ratio : 0);
    return d ? markAt(d, (x - b.left) * view.ratio, (y - b.top) * view.ratio, 22 * view.ratio) : -1;
  };
  const setHover = (i: number) => { if (i !== tg.hover) { tg.hover = i; if (flow) start(true); } };
  const onWheel = (ev: WheelEvent) => {
    if (ev.target instanceof Element && ev.target.closest('[data-wheel-skip]')) return;
    const line = ev.deltaMode === 1 ? 16 : 1;
    if (flow) {
      /* in a page a sideways move (a trackpad, a tilt wheel) turns the wheel. Over a name (or over the globe, if asked)
         the vertical wheel turns it too and the page holds still; elsewhere the vertical wheel scrolls the page */
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { ev.preventDefault(); wheelSum += ev.deltaX * line; }
      else if (slotAt(ev.clientX, ev.clientY) !== null || (flow.wheelOverGlobe && overGlobe(ev.clientX, ev.clientY))) { ev.preventDefault(); wheelSum += ev.deltaY * line; }
      else return;
      const steps = Math.trunc(wheelSum / cfg.wheelPx); wheelSum -= steps * cfg.wheelPx; target += steps;
      if (steps) start(true);
      return;
    }
    /* a mouse wheel gives lines, a trackpad gives pixels */
    wheelSum += ev.deltaY * line;
    const steps = Math.trunc(wheelSum / cfg.wheelPx); wheelSum -= steps * cfg.wheelPx; target += steps;
  };
  const onDown = (ev: PointerEvent) => {
    if (ev.target instanceof Element && ev.target.closest('a, button, input, select, textarea, [data-wheel-skip]')) return;
    const touch = ev.pointerType === 'touch', grip = !!els.grip && ev.target instanceof Node && els.grip.contains(ev.target);
    /* in a page a mouse drag turns the wheel only from a name or the globe; a touch anywhere on it may swipe sideways,
       and a touch on the globe turns it either way (the globe takes no scroll) */
    if (flow && !touch && !grip && slotAt(ev.clientX, ev.clientY) === null && !overGlobe(ev.clientX, ev.clientY)) return;
    drag = { x: ev.clientX, y: ev.clientY, from: target, moved: false, axis: flow ? (touch && !grip ? 'x' : null) : 'y', touch, grip, t: ev.timeStamp, at: 0, v: 0 };
    /* a press on a city's mark: reverse video after 0.1 s, while it is held */
    const m = cfg.globePick === 'on' ? markUnder(ev.clientX, ev.clientY) : -1;
    window.clearTimeout(tg.press);
    if (m >= 0) tg.press = window.setTimeout(() => { if (drag && !drag.moved) { tg.invert = m; start(true); } }, 100);
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag) {
      if (ev.pointerType !== 'mouse') return;
      const m = markUnder(ev.clientX, ev.clientY); setHover(m);
      /* the row and the page's words over the canvas take the mouse: no name is lit through them */
      const slot = ev.target === canvas ? slotAt(ev.clientX, ev.clientY) : null;
      Object.assign(hov, { x: ev.clientX, y: ev.clientY, on: true, at: position });
      if (slot !== hov.slot) { hov.slot = slot; if (flow) start(true); }
      pin.style.cursor = slot !== null || (m >= 0 && cfg.globePick === 'on') ? 'pointer' : '';
      return;
    }
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.axis && Math.hypot(dx, dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    const moved = drag.axis === 'x' ? dx : dy;
    if (Math.abs(moved) > 8) drag.moved = true;
    /* a drag up (or to the left) brings the next cities up */
    /* the speed of the hand (px per ms), smoothed, for the flick on release */
    const dt = ev.timeStamp - drag.t;
    if (dt > 0) { drag.v = 0.7 * ((moved - drag.at) / dt) + 0.3 * drag.v; drag.t = ev.timeStamp; drag.at = moved; }
    if (drag.moved) { target = drag.from - Math.round(moved / cfg.dragPx); if (tg.invert >= 0) tg.invert = -1; if (flow) start(true); }
  };
  const onUp = (ev: PointerEvent) => {
    if (!drag) return;
    /* a flick keeps the wheel going: the hand's speed carried on for a quarter second, as a scroll glides on after the
       finger lifts. A hand that stopped before letting go (no move in the last 80 ms) adds nothing */
    if (drag.moved && !reduced && ev.timeStamp - drag.t < 80 && Math.abs(drag.v) > 0.3) {
      target -= Math.max(-6, Math.min(6, Math.round((drag.v * 250) / cfg.dragPx)));
    }
    const slot = drag.moved ? null : slotAt(ev.clientX, ev.clientY);
    const m = drag.moved || slot !== null || cfg.globePick !== 'on' ? -1 : markUnder(ev.clientX, ev.clientY);
    drag = null; window.clearTimeout(tg.press); tg.invert = -1;
    if (slot !== null) { target = slot; if (flow) start(true); }
    else if (m >= 0) { go(m); if (flow) start(true); } else if (flow) start(true);
  };
  const onCancel = () => { drag = null; window.clearTimeout(tg.press); tg.invert = -1; };
  const onLeave = () => { setHover(-1); hov.on = false; hov.slot = null; };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target instanceof HTMLElement ? ev.target : null;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('[data-wheel-skip]'))) return;
    if (flow) {
      /* in a page the left and right arrows turn the wheel while it is on screen. Up and down turn it only with focus on
         the wheel; otherwise they, Page Up, Page Down and Space scroll the page */
      const mine = !!t && pin.contains(t);
      if (!mine && (!onScreen || (t && t.closest('[role="slider"], [role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"]')))) return;
      /* with focus on the wheel it is a slider: Home and End go to the first and the last city (the short way round), and
         Page Up and Page Down turn three, so none of them scrolls the page from under it */
      if (mine && (ev.key === 'Home' || ev.key === 'End')) {
        const N = n(), from = Math.round(target), to = ev.key === 'Home' ? 0 : N - 1;
        let d = (((to - idx(from)) % N) + N) % N; if (d > N / 2) d -= N;
        ev.preventDefault(); target = from + d; start(true); return;
      }
      const k = ({ ArrowRight: 1, ArrowLeft: -1, ...(mine ? { ArrowDown: 1, ArrowUp: -1 } : {}), ...(mine ? { PageDown: 3, PageUp: -3 } : {}) } as Record<string, number>)[ev.key];
      if (!k) return;
      ev.preventDefault(); target += k; start(true); return;
    }
    const steps = ({ ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 } as Record<string, number>)[ev.key];
    if (!steps) return;
    ev.preventDefault(); target += steps;
  };
  const onVis = () => { if (document.hidden) stop(); else start(); };
  const onReduce = () => { reduced = reduce.matches; clock.cfg = globeClockCfg(cfg, reduced); clock.reset(); };
  const unlockTypes = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;
  /* in a page, audio is set up only while the wheel may be heard (setting it up costs a long frame on the first press) */
  const unlockSound = () => { if (!flow || cfg.sound) unlock(); };

  pin.addEventListener('wheel', onWheel, { passive: !flow });
  /* fixed glass with a docked globe that turns with the scroll: a scroll wakes the loop while the wheel is off screen
     (it reads nothing here; the loop reads the scroll in its own frame) */
  const onScroll = () => { if (!running) start(true); };
  const wakes = !!flow?.fixed && (flow.turn > 0 || flow.globe === 'leaves');
  if (wakes) window.addEventListener('scroll', onScroll, { passive: true });
  pin.addEventListener('pointerdown', onDown); pin.addEventListener('pointermove', onMove);
  pin.addEventListener('pointerup', onUp); pin.addEventListener('pointercancel', onCancel); pin.addEventListener('pointerleave', onLeave);
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  reduce.addEventListener('change', onReduce);
  for (const t of unlockTypes) window.addEventListener(t, unlockSound, { capture: true });
  const ro = new ResizeObserver(resize); ro.observe(pin); if (fixedGlass()) ro.observe(canvas);
  /* off screen the loop stops; a page's fixed glass first draws the frame the scroll left it at, then stops itself */
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) start(); else if (fixedGlass()) start(true); else stop(); });
  io.observe(pin);

  const img = new Image();
  img.onload = () => { land = img; crt?.setLand(img); dirty = true; lastGl = ''; };
  img.onerror = () => console.warn('The land map did not load.');
  img.src = at(LAND_URL);

  setVolume(cfg.volume); wantAscii();
  measureName(); measureEms(); resize(); measureCells(); start();
  /* the faces may still be loading: measure the names again once they are in */
  /* ...and the hero is fitted again with them, before the side is first shown (it waits for this, so it never moves
     once seen); a page with no font loading API shows it at once */
  if (!document.fonts) fontsIn = true;
  document.fonts?.ready.then(() => { if (!alive) return; fontsIn = true; measureName(); measureEms(); settleHero(); lastCells = ''; dirty = true; start(true); });
  /* the names follow the Luma box's words: when its look settles or changes (its stylesheet arriving, a new width), read
     it again */
  let ctaSeen: Element | null = null;
  /* ...and where the box's name starts in its row, which moves when a stretched row takes its width */
  const ctaRo = new ResizeObserver(() => {
    if (!alive) return;
    const was = `${ctaPx}|${ctaFace}|${ctaTrack}`, lead = ctaLead; settleHero();
    if (`${ctaPx}|${ctaFace}|${ctaTrack}` !== was) measureEms();
    if (`${ctaPx}|${ctaFace}|${ctaTrack}` !== was || Math.abs(ctaLead - lead) > 0.5) { dirty = true; lastCells = ''; start(true); }
  });
  let rowSeen: Element | null = null;
  const watchCta = () => {
    const c = els.cta; if (c && c !== ctaSeen) { if (ctaSeen) ctaRo.unobserve(ctaSeen); ctaSeen = c; ctaRo.observe(c); }
    const r = c?.closest('.wh-reg-at') ?? null; if (r !== rowSeen) { if (rowSeen) ctaRo.unobserve(rowSeen); rowSeen = r; if (r) ctaRo.observe(r); }
  };
  watchCta();

  return {
    setCfg(c) {
      const old = cfg; cfg = c; if (flow) start(true);
      if (SHADER_KEYS.some((k) => old[k] !== c[k])) crt?.rebuild(c);
      if (old.font !== c.font || old.track !== c.track || old.ringGap !== c.ringGap) { measureEms(); document.fonts?.ready.then(() => { measureEms(); dirty = true; }); }
      setVolume(c.volume); wantAscii(); asciiKey = ''; dirty = true; clock.cfg = globeClockCfg(c, reduced);
      resize();
    },
    setCities(c) { cities = c; measureEms(); shown = -1; dirty = true; if (flow) start(true); },
    go(slot, silent) { go(slot, silent); if (flow) start(true); },
    /* straight to a city with no turn: the first city of a visit, once the page knows where the visitor is */
    jump(slot) { target = position = slot; clicked = Math.round(slot); settledOn = idx(slot); turn.yaw = cfg.face - rad(cityAt(slot).lon); clock.reset(); dirty = true; lastGl = ''; if (flow) start(true); },
    step(s) { target += s; if (flow) start(true); },
    wake() { lastGl = ''; holes = ''; start(true); },
    arrive(sweep, ms, o = {}) {
      if (o.names === false) { /* the names keep waiting: only the globe arrives */ }
      else if (reduced || ms <= 0) { intro.a = 1; intro.t0 = -1; }
      else {
        position = target - sweep; clicked = Math.round(position); intro.quiet = true; intro.t0 = performance.now(); intro.ms = ms;
        /* the globe's clock forgets its last step, so the first picture is the pose it turns in from, never the city it
           ends on for one step and then a jump back */
        if (o.turnGlobe && sweep) { turn.yaw = cfg.face - rad(cityAt(Math.round(position)).lon); clock.reset(); asciiKey = ''; lastGl = ''; dirty = true; }
      }
      /* the globe: shown now, and printed or swept in from the next step of its clock */
      const g = reduced ? 'none' : o.globe ?? 'none';
      if (g === 'none') globeHold.held = false;
      else {
        /* the print starts with its frames: until they are here the globe stays unseen, so it never shows whole first */
        const w = { mode: g, steps: Math.max(1, Math.round(o.steps ?? cfg.globeSweep)) };
        if (art?.frames) { globeHold.held = false; clock.arrive(w.mode, w.steps); } else {
          globeHold.want = w; globeHold.held = true;
          /* frames that never come: the globe is shown as it is after two seconds */
          window.setTimeout(() => { if (alive && globeHold.want) { globeHold.want = null; globeHold.held = false; dirty = true; lastGl = ''; start(true); } }, 2000);
        }
      }
      dirty = true; lastGl = ''; asciiKey = ''; start(true);
    },
    ...(flow ? { geometry: () => ({ x: view.x / view.ratio, y: view.y / view.ratio, r: view.radius / view.ratio, at: position, h: fl.geomH }) } : {}),
    mark() {
      const d = globeDraw(); const p = d && markPoint(d); if (!p) return null;
      const b = canvas.getBoundingClientRect();
      return { x: b.left + p[0] / view.ratio, y: b.top + p[1] / view.ratio };
    },
    measure() { watchCta(); settleHero(); measureEms(); measureCells(); lastLand = ''; measureLens(); lastGl = ''; },
    slot: () => idx(target),
    gl: () => !!crt,
    stats: () => ({ ...stats }),
    destroy() {
      ctaRo.disconnect();
      alive = false; stop(); ro.disconnect(); io.disconnect();
      pin.removeEventListener('wheel', onWheel); if (wakes) window.removeEventListener('scroll', onScroll); pin.removeEventListener('pointerdown', onDown); pin.removeEventListener('pointermove', onMove);
      pin.removeEventListener('pointerup', onUp); pin.removeEventListener('pointercancel', onCancel); pin.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); reduce.removeEventListener('change', onReduce);
      for (const t of unlockTypes) window.removeEventListener(t, unlockSound, { capture: true });
      crt?.dispose();
      if (fixedGlass()) for (const v of HOLE_VARS) document.documentElement.style.removeProperty(v);
    },
  };
}
