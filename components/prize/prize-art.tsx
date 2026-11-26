'use client';
/* One prize, drawn in characters (ascii.ts) as two stacked layers: the body in the page's grey and the parts with
   their own light (a screen, the sensors, the tape, the amount) in green. The grid fills the box's width: the font
   size is the width over the number of columns. A visitor can drag it round (pointer only: it is a picture, the
   words beside it carry everything); on release it coasts to a stop, and with reduced motion it stops at once. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderAscii, type Obj } from './ascii';
import type { PrizeArtCfg } from './config';
import './prize-art.css';

type Props = { o: Obj; cfg: PrizeArtCfg; alt: string; label?: string; cols?: number; rows?: number; yaw?: number; className?: string; still?: boolean };

export function PrizeArt({ o, cfg, alt, label, cols, rows, yaw, className, still }: Props) {
  const C = cols ?? cfg.cols, R = rows ?? cfg.rows, base = yaw ?? cfg.yaw;
  const [turn, setTurn] = useState(0);
  const f = useMemo(() => renderAscii(cfg, o, base + turn, C, R, label), [cfg, o, base, turn, C, R, label]);
  const box = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; t0: number; v: number; last: number; at: number } | null>(null), raf = useRef(0);
  const canDrag = cfg.drag && !still;
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const down = (e: React.PointerEvent) => {
    if (!canDrag || e.button !== 0) return;
    cancelAnimationFrame(raf.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, t0: turn, v: 0, last: e.clientX, at: performance.now() };
    box.current?.setAttribute('data-drag', '');
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, w = box.current?.offsetWidth || 1; if (!d) return;
    const now = performance.now(), dt = Math.max(1, now - d.at);
    /* turn per pixel, and the speed of the last move (radians a frame), for the coast */
    d.v = ((e.clientX - d.last) / w) * cfg.dragTurn * (16 / dt); d.last = e.clientX; d.at = now;
    setTurn(d.t0 + ((e.clientX - d.x) / w) * cfg.dragTurn);
  };
  const up = () => {
    const d = drag.current; drag.current = null; box.current?.removeAttribute('data-drag'); if (!d) return;
    if (!cfg.coast || matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(d.v) < 0.002) return;
    /* the same slowing on any screen: the decay is per 16.7 ms, not per frame */
    let v = Math.max(-0.25, Math.min(0.25, d.v)), last = performance.now();
    const step = (now: number) => { const k = Math.min(4, (now - last) / 16.7); last = now; v *= Math.pow(0.9, k); setTurn((t) => t + v * k); if (Math.abs(v) > 0.0015) raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
  };
  return (
    <div ref={box} className={'pa' + (className ? ' ' + className : '')} role="img" aria-label={alt} data-drag-ok={canDrag ? '' : undefined}
      style={{ ['--pa-cols' as string]: C, ['--pa-lh' as string]: cfg.aspect * 0.6 }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <pre className="pa-ink" aria-hidden="true">{f.ink}</pre>
      <pre className="pa-acc" aria-hidden="true">{f.accent}</pre>
    </div>
  );
}
