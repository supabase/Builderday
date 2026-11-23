import type { WheelCfg } from './config';
import { MONO } from './config';
import { globeLook } from './globe-look';
import { drawTextGlobe, loadLand, type LandMap } from './text-globe';

/* The small globes of the text globe's family: every element on the page with `data-dot` gets a canvas of its own,
   and on it the globe of dots (text-globe.ts, size small) facing `data-lat` / `data-lon`, the city a green dot. They
   are drawn once, and again only when their size, their city or the config changes: nothing moves at rest. A grown
   globe on hover is the element's own CSS scale. With no land map yet, nothing is drawn; the element's CSS ground
   stands in. Returns a function that removes them. */

const font = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'monospace');
const green = () => getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3ecf8e';

export function mountDotGlobes(root: ParentNode, cfg: WheelCfg): () => void {
  let land: LandMap | null = null, live = true;
  const drawn = new WeakMap<HTMLElement, string>();
  const draw = (el: HTMLElement) => {
    if (!land) return;
    let cv = el.querySelector<HTMLCanvasElement>(':scope > canvas.dot-globe');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'dot-globe'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); }
    const box = el.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 3);
    const size = Math.round(Math.min(box.width, box.height) * ratio), lat = Number(el.dataset.lat), lon = Number(el.dataset.lon);
    if (!size || !isFinite(lat) || !isFinite(lon)) return;
    const key = `${size}|${lat}|${lon}`;
    if (drawn.get(el) === key) return;
    drawn.set(el, key);
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    drawTextGlobe(ctx, {
      x: size / 2, y: size / 2, r: size / 2 - ratio * 0.5, ratio, facing: lon, size: 'small',
      cities: [{ lat, lon }], active: 0, bracket: false, frames: null, land, look: globeLook(cfg, font(), green()),
    });
    el.setAttribute('data-dot-on', '');
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
