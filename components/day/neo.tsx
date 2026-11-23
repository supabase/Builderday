'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useReduced, useTubesStill } from './tube';

/* The city prize, drawn: a MacBook Neo given ten times, once in each city. One picture is a pure function of the
   config (seed included), the size and a time t, so a saved config draws the same picture every time. Tuned at
   /lab/neo, saved in saved/neo.config.json.

   The rules every mode keeps: no outline and no wireframe (the laptop is a dark object told by its light); one light,
   from the upper left, so every edge is bright on the left and gone by the right; the site's ground, white ink and blue
   light (orange never, green only for a city whose winner is known); the ten cities are in the picture; the only motion
   is slow (the screen's cities), and Screen off, reduced motion or a press holds it.

   - stack: ten closed laptops on a shelf, one per city, its code beside it
   - ajar: one laptop, its lid just open, light coming out of the gap and falling on the ground
   - screen: one open laptop, its screen showing each city's code in turn ("1st place")
   - row: ten small open laptops, five by two, each screen lit with its city's code */

import { type NeoLook } from './neo-config';
export { NEO_BOUNDS, NEO_DEF, NEO_MODES, clampNeo, neoMoves, type NeoLook, type NeoMode } from './neo-config';
import { neoMoves } from './neo-config';

const GREEN = '#3ecf8e', GREY = '#8a8b8a', INK = '#e8e8e6';
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const light = (k: number, a: number) => `rgba(${Math.round(80 + 175 * k)}, ${Math.round(140 + 115 * k)}, 255, ${Math.max(0, Math.min(1, a))})`;

export type NeoDraw = { cities: string[]; won?: string[]; mono: string; sans: string };

/* one picture: ctx is set to CSS pixels (w by h) by the caller */
export function renderNeo(p: CanvasRenderingContext2D, w: number, h: number, c: NeoLook, t: number, d: NeoDraw) {
  p.clearRect(0, 0, w, h);
  /* a canvas not laid out yet (a closed sheet, a hidden tab) has no room to draw in */
  if (w < 120 || h < 60) return;
  const r = rng(c.seed), won = new Set(d.won ?? []), codes = d.cities.length ? d.cities : ['SYD', 'TYO', 'SIN', 'BLR', 'BER', 'LOS', 'LON', 'SAO', 'NYC', 'SFO'];
  /* a rim: bright where the light is (left), gone by the right */
  const rim = (x0: number, y0: number, x1: number, y1: number, a: number, lw = 1) => {
    const g = p.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, a * c.rim)})`); g.addColorStop(0.5, `rgba(255,255,255,${0.22 * a * c.rim})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    p.strokeStyle = g; p.lineWidth = lw; p.beginPath(); p.moveTo(x0, y0); p.lineTo(x1, y1); p.stroke();
  };
  const label = (s: string, x: number, y: number, col: string, align: CanvasTextAlign = 'left', size = c.label) => {
    p.font = `400 ${size}px ${d.mono}`; p.textAlign = align; p.textBaseline = 'middle'; p.fillStyle = col; p.fillText(s, x, y);
  };
  /* an open laptop, front on: lid with a lit screen, the deck under it. Returns the screen's box */
  const open = (cx: number, top: number, W: number, lidH: number, deckH: number, glowA: number) => {
    const lx = cx - W / 2, lb = top + lidH, bez = W * 0.032, rr = W * 0.025, front = W * 1.12;
    p.fillStyle = '#070808'; p.beginPath(); p.roundRect(lx, top, W, lidH, [rr, rr, 2, 2]); p.fill();
    const sx = lx + bez, sy = top + bez, sw = W - bez * 2, sh = lidH - bez * 2.3;
    const g = p.createRadialGradient(sx + sw * 0.42, sy + sh * 0.4, 0, sx + sw / 2, sy + sh / 2, Math.hypot(sw, sh) * 0.62);
    /* many stops, so the light falls off with no ring */
    [[0, 0.42], [0.2, 0.33], [0.4, 0.21], [0.6, 0.11], [0.8, 0.04], [1, 0]].forEach(([o, a]) => g.addColorStop(o, light(c.white * (1 - o * 0.6), a * glowA)));
    p.save(); p.beginPath(); p.roundRect(sx, sy, sw, sh, rr * 0.4); p.clip(); p.fillStyle = '#04060b'; p.fillRect(sx, sy, sw, sh); p.fillStyle = g; p.fillRect(sx, sy, sw, sh); p.restore();
    p.beginPath(); p.moveTo(lx, lb); p.lineTo(lx + W, lb); p.lineTo(cx + front / 2, lb + deckH); p.lineTo(cx - front / 2, lb + deckH); p.closePath(); p.fillStyle = '#080909'; p.fill();
    const sp = p.createRadialGradient(cx, lb, 0, cx, lb, W * 0.5); sp.addColorStop(0, light(c.white, 0.18 * glowA)); sp.addColorStop(1, light(c.white, 0));
    p.save(); p.clip(); p.fillStyle = sp; p.fillRect(lx - W, lb, W * 3, deckH); p.restore();
    rim(lx + rr, top + 0.5, lx + W - rr, top + 0.5, 0.8); rim(lx + 0.5, top + rr, lx + 0.5, lb - 2, 0.45); rim(cx - front / 2, lb + deckH, cx + front / 2, lb + deckH, 0.65);
    return { sx, sy, sw, sh };
  };
  const streak = (s: { sx: number; sy: number; sw: number; sh: number }) => {
    if (c.streak <= 0) return;
    const g = p.createLinearGradient(s.sx, s.sy, s.sx + s.sw * 0.6, s.sy + s.sh * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.48, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.08 * c.streak})`); g.addColorStop(0.62, `rgba(255,255,255,${0.025 * c.streak})`); g.addColorStop(0.64, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    p.save(); p.beginPath(); p.rect(s.sx, s.sy, s.sw, s.sh); p.clip(); p.fillStyle = g; p.fillRect(s.sx, s.sy, s.sw, s.sh); p.restore();
  };

  if (c.mode === 'stack') {
    /* a closed laptop a city on a shelf, the first city on top. The pitch never lets two labels touch; with many cities in
       a short canvas the labels are set smaller (not under 7 px) so the stack fits */
    const n = Math.max(1, codes.length), lab0 = c.label * 3.2, W0 = Math.max(40, Math.min(w * c.width, w - lab0 - 28));
    const lab = Math.min(c.label, Math.max(7, (h - 8 - W0 * c.thick - W0 * c.depth * 0.5) / Math.max(1, n - 1) - 3));
    const labW = lab * 3.2, W = Math.max(40, Math.min(w * c.width, w - labW - 28)), th = W * c.thick, D = W * c.depth * 0.5;
    const pitch = Math.min(Math.max(th + th * c.gap, lab + 3), Math.max(lab + 3, (h - 8 - th - D) / Math.max(1, n - 1))), total = pitch * (n - 1) + th + D, y0 = Math.max(4, (h - total) / 2) + D;
    const offs = codes.map(() => (r() - 0.5) * 2 * c.jitter * W * 0.03), reach = Math.max(0, ...offs), cx = (w - labW - 14 - reach) / 2, inset = W * c.persp;
    /* the codes stand just right of the stack, in one column */
    const lx = cx + W / 2 + reach + 14;
    for (let i = codes.length - 1; i >= 0; i--) {
      const x = cx + offs[i], yf = y0 + i * pitch, l = x - W / 2, rt = x + W / 2;
      /* the top face (only the top one shows much of it), lit from the back left */
      const tg = p.createLinearGradient(l, yf - D, rt, yf); tg.addColorStop(0, i ? '#111212' : '#191b1b'); tg.addColorStop(1, '#09090a');
      p.beginPath(); p.moveTo(l + inset, yf - D); p.lineTo(rt - inset, yf - D); p.lineTo(rt, yf); p.lineTo(l, yf); p.closePath(); p.fillStyle = tg; p.fill();
      if (!i) { const sg = p.createLinearGradient(l, yf - D, l + W * 0.5, yf); sg.addColorStop(0, `rgba(255,255,255,${0.05 * c.rim})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); p.fillStyle = sg; p.fill(); rim(l + inset, yf - D + 0.5, rt - inset, yf - D + 0.5, 0.35); }
      /* the front: lid over base, the seam, the thumb notch in the lid's edge */
      p.fillStyle = '#060707'; p.fillRect(l, yf, W, th);
      p.fillStyle = '#020202'; p.fillRect(l, yf + th * 0.45, W, Math.max(0.6, th * 0.08));
      p.beginPath(); p.ellipse(x, yf, W * 0.045, th * 0.32, 0, 0, Math.PI); p.fill();
      rim(l, yf + 0.5, rt, yf + 0.5, i ? 0.6 : 0.95);
      rim(l + 0.5, yf, l + 0.5, yf + th, 0.4);
      const code = codes[i]; label(code, lx, yf + th / 2, won.has(code) ? GREEN : i ? GREY : INK, 'left', lab);
    }
    return;
  }

  if (c.mode === 'ajar') {
    /* one laptop, the lid just open: the light comes out of the gap and falls on the ground in front */
    const W = w * c.width, th = W * 0.03, D = W * 0.3 * 0.5, gap = W * c.open, cx = w / 2;
    const yb = h * 0.56, l = cx - W / 2, rt = cx + W / 2;
    /* the spill: the gap's light on the ground, wider and fainter as it comes forward */
    if (c.spill > 0) {
      const len = h * 0.4 * c.spill, sg = p.createLinearGradient(0, yb + th, 0, yb + th + len);
      sg.addColorStop(0, light(c.white, 0.16 * c.screen)); sg.addColorStop(1, light(c.white, 0));
      p.beginPath(); p.moveTo(l + W * 0.04, yb + th); p.lineTo(rt - W * 0.04, yb + th); p.lineTo(rt + W * 0.12, yb + th + len); p.lineTo(l - W * 0.12, yb + th + len); p.closePath(); p.fillStyle = sg; p.fill();
    }
    /* the base */
    p.fillStyle = '#060707'; p.fillRect(l, yb, W, th); rim(l, yb + th, rt, yb + th, 0.3);
    /* the gap: a hot line, its glow */
    p.save(); p.shadowColor = light(c.white, 0.9 * c.screen); p.shadowBlur = c.glow;
    const gg = p.createLinearGradient(l, 0, rt, 0); gg.addColorStop(0, light(c.white, 0.25 * c.screen)); gg.addColorStop(0.5, light(Math.min(1, c.white + 0.4), Math.min(1, c.screen))); gg.addColorStop(1, light(c.white, 0.25 * c.screen));
    p.fillStyle = gg; p.fillRect(l + W * 0.02, yb - gap, W * 0.96, gap); p.restore();
    /* the lid: its front edge over the gap, its top face behind it */
    const ly = yb - gap - th, inset = W * 0.07;
    const tg = p.createLinearGradient(l, ly - D, rt, ly); tg.addColorStop(0, '#1a1c1c'); tg.addColorStop(1, '#09090a');
    p.beginPath(); p.moveTo(l + inset, ly - D); p.lineTo(rt - inset, ly - D); p.lineTo(rt, ly); p.lineTo(l, ly); p.closePath(); p.fillStyle = tg; p.fill();
    rim(l + inset, ly - D + 0.5, rt - inset, ly - D + 0.5, 0.4);
    p.fillStyle = '#060707'; p.fillRect(l, ly, W, th); rim(l, ly + 0.5, rt, ly + 0.5, 0.95); rim(l + 0.5, ly, l + 0.5, ly + th, 0.4);
    /* the gap's light on the lid's underside edge */
    const ug = p.createLinearGradient(0, ly + th - 1, 0, ly + th); ug.addColorStop(0, light(c.white, 0)); ug.addColorStop(1, light(c.white, 0.5 * c.screen)); p.fillStyle = ug; p.fillRect(l, ly + th - 1.5, W, 1.5);
    return;
  }

  if (c.mode === 'screen') {
    /* one open laptop; the screen shows each city's code in turn */
    const W = Math.min(w * c.width, (h * 0.86) / (c.lid + 0.1)), lidH = W * c.lid, deckH = W * 0.08, top = (h - lidH - deckH) / 2;
    const s = open(w / 2, top, W, lidH, deckH, c.screen);
    const k = t / c.cycle, i = ((Math.floor(k) % codes.length) + codes.length) % codes.length, u = k - Math.floor(k);
    const a = Math.min(1, u / 0.14, (1 - u) / 0.14), code = codes[i], col = won.has(code) ? GREEN : INK, fs = s.sh * 0.36;
    label('1ST PLACE', s.sx + s.sw * 0.07, s.sy + s.sh * 0.14, `rgba(200,205,215,${0.75 * a})`, 'left', Math.max(c.label - 1, fs * 0.16));
    p.font = `500 ${fs}px ${d.sans}`; p.textAlign = 'center'; p.textBaseline = 'middle';
    try { (p as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = -0.03 * fs + 'px'; } catch { /* unspaced */ }
    const cy = s.sy + s.sh * 0.52, cx = s.sx + s.sw / 2;
    if (c.fringe > 0) { p.globalCompositeOperation = 'lighter'; p.globalAlpha = 0.55 * a; p.fillStyle = '#ff3b30'; p.fillText(code, cx - c.fringe, cy); p.fillStyle = '#2f6bff'; p.fillText(code, cx + c.fringe, cy); p.globalCompositeOperation = 'source-over'; }
    p.globalAlpha = a; p.fillStyle = col; p.fillText(code, cx, cy); p.globalAlpha = 1;
    try { (p as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; } catch { /* unspaced */ }
    /* ten marks along the foot of the screen, this city's lit */
    const n = codes.length, mw = s.sw * 0.5 / n;
    for (let j = 0; j < n; j++) { p.fillStyle = j === i ? (won.has(codes[j]) ? GREEN : INK) : 'rgba(232,232,230,0.18)'; p.fillRect(s.sx + s.sw * 0.25 + j * mw + mw * 0.2, s.sy + s.sh * 0.86, mw * 0.6, Math.max(1.5, s.sh * 0.012)); }
    streak(s);
    return;
  }

  /* row: ten small open laptops, five by two */
  const cols = 5, rows = Math.ceil(codes.length / cols), cell = Math.min((w * Math.min(0.96, c.width * 1.5)) / cols, (h * 0.92) / rows / (c.lid + 0.42)), W = cell * 0.86;
  const gx = (w - cell * cols) / 2, rowH = cell * (c.lid + 0.42), gy = (h - rowH * rows) / 2;
  codes.forEach((code, j) => {
    const cx = gx + (j % cols + 0.5) * cell, top = gy + Math.floor(j / cols) * rowH, lidH = W * c.lid, glow = 0.7 + r() * 0.5;
    const s = open(cx, top, W, lidH, W * 0.07, c.screen * glow);
    label(code, cx, s.sy + s.sh / 2, won.has(code) ? GREEN : INK, 'center', Math.max(c.label - 1, Math.min(c.label + 2, s.sh * 0.3)));
    streak(s);
  });
}

/* The picture on a page: drawn once per size, and (screen mode) slowly while on screen. Screen off and reduced
   motion hold it at its first city; a press holds it where it is (a real button while it moves) */
export function NeoPrize({ cfg, cities, won, className }: { cfg: NeoLook; cities: string[]; won?: string[]; className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null), screenOff = useTubesStill(), reduced = useReduced();
  const moves = neoMoves(cfg) && !screenOff && !reduced, [held, setHeld] = useState(false), heldRef = useRef(false);
  if (!moves && held) setHeld(false);
  useEffect(() => { heldRef.current = held; }, [held]);
  const key = JSON.stringify([cfg, cities, won ?? [], moves]);
  useEffect(() => {
    const el = cv.current, p = el?.getContext('2d'); if (!el || !p) return;
    const [look, cs, wn, mv] = JSON.parse(key) as [NeoLook, string[], string[], boolean];
    const css = getComputedStyle(document.documentElement);
    const fonts = { mono: css.getPropertyValue('--font-geist-mono').trim() || 'ui-monospace, monospace', sans: css.getPropertyValue('--font-geist').trim() || 'sans-serif' };
    let raf = 0, seen = false, last = 0, tNow = 0, prev = 0;
    const draw = () => {
      const ratio = Math.min(2, devicePixelRatio || 1), w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * ratio) || el.height !== Math.round(h * ratio)) { el.width = Math.round(w * ratio); el.height = Math.round(h * ratio); }
      p.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderNeo(p, w, h, look, tNow, { cities: cs, won: wn, ...fonts });
    };
    const frame = (now: number) => {
      raf = 0; if (!seen || document.hidden) return;
      if (!heldRef.current) tNow += prev ? Math.min(0.1, (now - prev) / 1000) : 0; prev = now;
      if (now - last >= 1000 / 30) { last = now; draw(); }
      if (mv) raf = requestAnimationFrame(frame);
    };
    const go = () => { prev = 0; if (!raf) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) go(); }); io.observe(el);
    const ro = new ResizeObserver(() => { draw(); }); ro.observe(el);
    const vis = () => { if (!document.hidden) go(); };
    document.addEventListener('visibilitychange', vis);
    let gone = false; document.fonts?.ready.then(() => { if (!gone) draw(); });
    draw();
    return () => { gone = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [key]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) setHeld((v) => !v); } };
  return (
    <div className={'neo ' + (className ?? '')} data-mode={cfg.mode} data-hold={moves ? '' : undefined}
      {...(moves ? { role: 'button', tabIndex: 0, 'aria-pressed': held, 'aria-label': 'Hold the laptop drawing', onClick: () => setHeld((v) => !v), onKeyDown: onKey } : { 'aria-hidden': true })}>
      <canvas ref={cv} className="neo-cv" />
      {moves && held ? <span className="sc-held" aria-hidden="true">Held · press to go on</span> : null}
    </div>
  );
}
