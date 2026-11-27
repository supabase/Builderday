/* The hero ticket's launch (launch-config.ts holds every value): the press gives, the ticket folds into a paper rocket
   (its words fold away first, then its corners crease to a nose and its tail cuts to two fins, a crease down the
   middle), flies an arc to its city on the text globe leaving the globe's characters behind it, and goes in at the
   city's mark, which rings once. Then (Luma having opened) the ticket prints back in from the left.

   Motion, as the motion rules ask: the fold is a change of shape on screen, so it eases in and out; the flight starts
   slow and leaves fast (a launch), turning to its course in its first part; the landing's rings ease out; the ticket's
   return is printed in steps, like the stub printer. Everything is transform, opacity and clip-path. */
import type { LaunchCfg } from './launch-config';

export type P = { x: number; y: number };
const GREEN = '#3ecf8e';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const quad = (a: P, c: P, b: P, t: number): P => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
const tangent = (a: P, c: P, b: P, t: number) => Math.atan2(2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y), 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x));
/* the arc's control point: above the higher end, by `arc` of the distance */
const ctrl = (a: P, b: P, arc: number): P => { const d = Math.hypot(b.x - a.x, b.y - a.y); return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - d * arc }; };
/* a launch: slow off the pad, fast at the end (quadratic in, a little linear so it never stalls) */
const launchEase = (t: number) => 0.25 * t + 0.75 * t * t;

/* the ticket's outline in three shapes, ten points each, so one morphs into the next: the ticket, the corners creased
   to a nose, the paper rocket (a body, a nose, two swept fins and a cut tail) */
const RECT = 'polygon(0% 0%, 30% 0%, 70% 0%, 100% 0%, 100% 50%, 100% 100%, 70% 100%, 30% 100%, 0% 100%, 0% 50%)';
const NOSE = 'polygon(0% 0%, 30% 0%, 66% 10%, 90% 32%, 100% 50%, 90% 68%, 66% 90%, 30% 100%, 0% 100%, 0% 50%)';
/* the rocket: its body is the middle 44% of the box's height (BODY), its fins reach out to 12% and 88% */
const SHIP = 'polygon(0% 12%, 24% 28%, 66% 28%, 88% 38%, 100% 50%, 88% 62%, 66% 72%, 24% 72%, 0% 88%, 10% 50%)', BODY = 0.44;

/* the wheel sets the ticket's own transform (its row's place); every keyframe keeps it under its own */
const baseOf = (t: HTMLElement) => { const b = getComputedStyle(t).transform; return b === 'none' ? '' : b + ' '; };

function layer() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '60', overflow: 'hidden' });
  document.body.appendChild(el); return el;
}
const mono = (t: HTMLElement) => getComputedStyle(t.querySelector('.wh-stub-code') ?? t).fontFamily || 'ui-monospace, monospace';

/* what the ship leaves: the globe's characters (or dots) along its path, each lit as it passes and fading as it falls */
function trail(root: HTMLElement, pts: P[], at: number[], c: LaunchCfg, font: string) {
  if (c.trail === 'none') return;
  const chars = ':|.:|::', step = 100 / c.trailN;
  let run = 0, k = 0;
  for (let i = 1; i < pts.length; i++) {
    run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    /* none at the start (it would sit on the ticket) and none on the last stretch (it would sit on the mark) */
    if (run < step || i < 3 || i > pts.length - 3) continue;
    run = 0; k++;
    const s = document.createElement('span');
    if (c.trail === 'chars') { s.textContent = chars[k % chars.length]; Object.assign(s.style, { font: `400 12px/1 ${font}`, color: 'rgba(255,255,255,.66)' }); }
    else Object.assign(s.style, { width: '2px', height: '2px', background: 'rgba(255,255,255,.66)' });
    Object.assign(s.style, { position: 'absolute', left: pts[i].x + 'px', top: pts[i].y + 'px', translate: '-50% -50%', opacity: '0' });
    root.appendChild(s);
    s.animate([{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0, transform: 'translateY(5px)' }], { duration: c.trailMs, delay: at[i], easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' });
  }
}

/* the landing: two rings out from the mark, and the globe's [+] for a moment */
function land(root: HTMLElement, at: P, c: LaunchCfg, font: string) {
  [0, 1].forEach((k) => {
    const r = document.createElement('span');
    Object.assign(r.style, { position: 'absolute', left: at.x - 12 + 'px', top: at.y - 12 + 'px', width: '24px', height: '24px', borderRadius: '50%', border: `1px solid ${GREEN}` });
    root.appendChild(r);
    r.animate([{ transform: 'scale(.4)', opacity: 0.9 }, { transform: `scale(${c.ring})`, opacity: 0 }], { duration: c.landMs, delay: k * c.landMs * 0.2, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' });
  });
  const m = document.createElement('span'); m.textContent = '[+]';
  Object.assign(m.style, { position: 'absolute', left: at.x + 'px', top: at.y + 'px', translate: '-50% -50%', font: `500 13px/1 ${font}`, color: GREEN });
  root.appendChild(m);
  m.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none', offset: 0.18 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: c.landMs * 1.6, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' });
  return c.landMs * 1.6;
}

/* the ticket back as it was: every launch animation off, then printed in from the left (or faded in) */
function back(t: HTMLElement, crease: HTMLElement, c: LaunchCfg) {
  t.getAnimations().forEach((a) => a.cancel());
  Array.from(t.children).forEach((ch) => ch.getAnimations().forEach((a) => a.cancel()));
  crease.remove(); t.style.willChange = '';
  if (c.back === 'print') t.animate([{ clipPath: 'inset(-4px 100% -4px -4px)' }, { clipPath: 'inset(-4px -4px -4px -4px)' }], { duration: c.backMs, easing: 'steps(10, end)' });
  else t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: c.backMs, easing: 'cubic-bezier(.23,1,.32,1)' });
}

/* play the launch from the ticket `t` to the point `to` (viewport px). `landed` runs as the ship reaches the mark (that
   is where the page opens Luma); the promise settles once the ticket is back. */
export async function launch(t: HTMLElement, to: P, c: LaunchCfg, landed?: () => void) {
  const r = t.getBoundingClientRect(), from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const B = baseOf(t), font = mono(t), root = layer();
  const sx = c.shipW / r.width, sy = (c.shipW * c.shipH) / BODY / r.height;
  t.style.willChange = 'transform, clip-path';
  if (getComputedStyle(t).position === 'static') t.style.position = 'relative';

  /* the crease: the lower half a shade darker, a hairline down the middle, coming in with the fold */
  const crease = document.createElement('span');
  crease.setAttribute('aria-hidden', 'true');
  Object.assign(crease.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', zIndex: '3',
    background: 'linear-gradient(to bottom, transparent 0 49.4%, rgba(12,13,13,.28) 49.4% 50.6%, rgba(12,13,13,.09) 50.6% 100%)' });

  try {
    /* the press */
    const p0 = c.press;
    if (c.pressMs) await t.animate([{ transform: B + 'none' }, { transform: B + `scale(${p0})` }], { duration: c.pressMs, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' }).finished;

    /* the fold: the words fold away in its first part, then the outline creases to a nose and cuts to fins */
    Array.from(t.children).forEach((ch) => (ch as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: c.foldMs * 0.4, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }));
    t.appendChild(crease);
    crease.animate([{ opacity: 0 }, { opacity: 1 }], { duration: c.foldMs * 0.6, delay: c.foldMs * 0.3, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    await t.animate([
      { clipPath: RECT, transform: B + `scale(${p0})` },
      { clipPath: NOSE, transform: B + `scale(${lerp(p0, sx, 0.45)}, ${lerp(p0, sy, 0.3)})`, offset: 0.45 },
      { clipPath: SHIP, transform: B + `scale(${sx}, ${sy})` },
    ], { duration: c.foldMs, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished;

    /* the flight: along the arc, turning to its course in its first part, swaying a little, smaller as it goes */
    const k = ctrl(from, to, c.arc), N = 48, pts: P[] = [], at: number[] = [], frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N, u = launchEase(f), p = quad(from, k, to, u);
      const head = (tangent(from, k, to, Math.max(u, 0.002)) * 180) / Math.PI;
      const turn = lerp(0, head, Math.min(1, f / c.turn)) + Math.sin(f * Math.PI * 2) * c.sway * (1 - f);
      const s = lerp(1, c.shrink, u * u);
      pts.push(p); at.push(f * c.flightMs);
      frames.push({ clipPath: SHIP, transform: B + `translate(${p.x - from.x}px, ${p.y - from.y}px) rotate(${turn}deg) scale(${sx * s}, ${sy * s})`, opacity: f > 0.94 ? (1 - f) / 0.06 : 1 });
    }
    trail(root, pts, at, c, font);
    await t.animate(frames, { duration: c.flightMs, easing: 'linear', fill: 'forwards' }).finished;

    /* the landing; Luma opens here */
    const ms = land(root, to, c, font);
    landed?.();
    await new Promise((res) => setTimeout(res, Math.max(ms, c.backDelay)));
  } finally {
    back(t, crease, c);
    setTimeout(() => root.remove(), c.backMs + 50);
  }
}
