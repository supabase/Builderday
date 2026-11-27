import type { WheelCfg } from './config';
import { MONO } from './config';
import { globeLook } from './globe-look';
import { drawTextGlobe, loadLand, type LandMap } from './text-globe';

/* The small globes of the text globe's family: every element on the page with `data-dot` gets a canvas of its own,
   and on it the globe of dots (text-globe.ts, size small) facing `data-lat` / `data-lon`, the city a green dot. They
   are drawn once, and again only when their size, their city or the config changes: nothing moves at rest. A new city
   turns the globe to it, the short way round. Under reduced motion it faces the city at once. A grown
   globe on hover is the element's own CSS scale. With no land map yet, nothing is drawn; the element's CSS ground
   stands in. Returns a function that removes them. */

const font = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'monospace');
const green = () => getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3ecf8e';

export function mountDotGlobes(root: ParentNode, cfg: WheelCfg): () => void {
  let land: LandMap | null = null, live = true;
  const drawn = new WeakMap<HTMLElement, { size: number; lat: number; lon: number }>();
  /* where each globe faces now (degrees of longitude), and its turn under way */
  const faces = new WeakMap<HTMLElement, number>(), turns = new WeakMap<HTMLElement, number>();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const draw = (el: HTMLElement) => {
    if (!land) return;
    let cv = el.querySelector<HTMLCanvasElement>(':scope > canvas.dot-globe');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'dot-globe'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); }
    const box = el.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 3);
    const size = Math.round(Math.min(box.width, box.height) * ratio), lat = Number(el.dataset.lat), lon = Number(el.dataset.lon);
    if (!size || !isFinite(lat) || !isFinite(lon)) return;
    const was = drawn.get(el);
    if (was && was.size === size && was.lat === lat && was.lon === lon) return;
    drawn.set(el, { size, lat, lon });
    if (!was || was.size !== size) cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), map = land; if (!ctx) return;
    const look = globeLook(cfg, font(), green());
    const paint = (facing: number) => {
      faces.set(el, facing);
      ctx.clearRect(0, 0, size, size);
      drawTextGlobe(ctx, {
        x: size / 2, y: size / 2, r: size / 2 - ratio * 0.5, ratio, facing: ((facing + 540) % 360) - 180, size: 'small',
        cities: [{ lat, lon }], active: 0, bracket: false, frames: null, land: map, look,
      });
    };
    cancelAnimationFrame(turns.get(el) ?? 0);
    const from = faces.get(el);
    el.setAttribute('data-dot-on', '');
    if (from == null || reduce.matches) { paint(lon); return; }
    const turn = ((lon - from + 540) % 360) - 180, t0 = performance.now();
    const step = (now: number) => {
      if (!live) return;
      /* 600 ms: about as long as the big globe's own turn takes to settle (cfg.yawEase) */
      const k = Math.min(1, (now - t0) / 600);
      paint(from + turn * (1 - (1 - k) ** 3));
      if (k < 1) turns.set(el, requestAnimationFrame(step));
    };
    step(t0);
  };
  const all = () => Array.from(root.querySelectorAll<HTMLElement>('[data-dot]'));
  const ro = new ResizeObserver((es) => es.forEach((e) => draw(e.target as HTMLElement)));
  const watched = new WeakSet<HTMLElement>();
  const scan = () => all().forEach((el) => { if (!watched.has(el)) { watched.add(el); ro.observe(el); } draw(el); });
  /* a city change rewrites the attributes; a new element (a link that became a button) comes in with the tree */
  const mo = new MutationObserver(scan);
  mo.observe(root as Node, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lat', 'data-lon', 'data-dot'] });
  loadLand().then((m) => { if (live && m) { land = m; scan(); } });
  return () => { live = false; ro.disconnect(); mo.disconnect(); };
}
