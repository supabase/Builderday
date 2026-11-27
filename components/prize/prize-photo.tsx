'use client';
/* One prize as its real photo, printed in the site's look (photo.ts). The photo is keyed and cropped once per page,
   then printed into a canvas the size of its box, again whenever the box or the look changes. With `reveal`, the
   real photo sits under the print and a hover (a fine pointer only) fades the print off it: the print is the look,
   the photo is the proof. It is a picture: the words beside it carry everything. */
import { useEffect, useRef, useState } from 'react';
import { at } from '@/lib/routes';
import { PHOTO_SRC, SCREEN, SIZE, draw, expOf, keyOut, paintScreen, place, type Mode, type Photo, type PhotoLook, type Screen } from './photo';
import './prize-photo.css';

type Keyed = { c: HTMLCanvasElement; w: number; h: number };
const cache = new Map<string, Promise<Keyed>>();

function keyed(p: Photo, tol: number, feather: number, screen: Screen): Promise<Keyed> {
  const id = p + '|' + tol + '|' + feather + '|' + screen;
  let k = cache.get(id);
  if (!k) {
    k = new Promise<Keyed>((done, fail) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, src = document.createElement('canvas');
        src.width = w; src.height = h;
        const x = src.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0);
        const sr = SCREEN[p]; if (sr) paintScreen(x, sr, screen);
        const im = x.getImageData(0, 0, w, h), b = keyOut(im.data, w, h, tol, feather); x.putImageData(im, 0, 0);
        const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
        c.getContext('2d')!.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        done({ c, w: b.w, h: b.h });
      };
      img.onerror = () => { cache.delete(id); fail(new Error('no photo')); };
      img.src = at(PHOTO_SRC[p]);
    });
    cache.set(id, k);
  }
  return k;
}

function paint(cv: HTMLCanvasElement, k: Keyed, look: PhotoLook, p: Photo, mode: Mode) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
  if (!W || !H) return;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, W, H);
  const at0 = place(k, W, H, look.pad, SIZE[p]), tmp = document.createElement('canvas');
  const sample = (cols: number, rows: number, cw: number, ch: number, ox: number, oy: number) => {
    tmp.width = cols; tmp.height = rows;
    const t = tmp.getContext('2d', { willReadFrequently: true })!; t.imageSmoothingQuality = 'high';
    t.drawImage(k.c, (at0.x - ox) / cw, (at0.y - oy) / ch, at0.w / cw, at0.h / ch);
    return t.getImageData(0, 0, cols, rows).data;
  };
  const full = () => {
    tmp.width = W; tmp.height = H;
    const t = tmp.getContext('2d', { willReadFrequently: true })!; t.imageSmoothingQuality = 'high';
    t.drawImage(k.c, at0.x, at0.y, at0.w, at0.h);
    return t.getImageData(0, 0, W, H);
  };
  draw(ctx, W, H, dpr, look, expOf(look, p), sample, full, mode);
}

/* `alt` names the picture; with `quiet` it is hidden from readers (when the words beside it already say it) */
type Props = { p: Photo; look: PhotoLook; alt: string; className?: string; ratio?: string; quiet?: boolean };

export function PrizePhoto({ p, look, alt, className, ratio, quiet }: Props) {
  const box = useRef<HTMLDivElement>(null), print = useRef<HTMLCanvasElement>(null), real = useRef<HTMLCanvasElement>(null);
  const [k, setK] = useState<Keyed | null>(null), [armed, setArmed] = useState(false);
  useEffect(() => { let on = true; keyed(p, look.tol, look.feather, look.screen).then((x) => on && setK(x), () => {}); return () => { on = false; }; }, [p, look.tol, look.feather, look.screen]);
  useEffect(() => {
    if (!k || !box.current) return;
    /* one print a frame at most, and none when a resize leaves the box the size it was */
    let raf = 0, size = '';
    const go = () => {
      const b = box.current; if (!b) return;
      const s = b.clientWidth + 'x' + b.clientHeight; if (s === size) return; size = s;
      if (print.current) paint(print.current, k, look, p, look.mode);
      if (real.current && armed) paint(real.current, k, { ...look, sat: 1 }, p, 'photo');
    };
    go();
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(go); }); ro.observe(box.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [k, look, p, armed]);
  const reveal = look.reveal && look.mode !== 'photo';
  return (
    /* the photo under the print is painted on the first hover, not on load */
    <div ref={box} className={'pp' + (className ? ' ' + className : '')} role={quiet ? undefined : 'img'} aria-label={quiet ? undefined : alt} aria-hidden={quiet || undefined} data-reveal={reveal ? '' : undefined}
      style={ratio ? { aspectRatio: ratio } : undefined} onPointerEnter={reveal && !armed ? () => setArmed(true) : undefined}>
      {reveal ? <canvas ref={real} className="pp-real" aria-hidden="true" /> : null}
      <canvas ref={print} className="pp-print" aria-hidden="true" />
    </div>
  );
}
