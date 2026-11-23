import { useEffect, useRef, type RefObject } from 'react';
/* A split-flap forward turn written straight into an element's text: every character turns past `flaps` flaps and
   lands on its own, one position every `stagger` ms, each flap `flapMs` long. Spaces stay spaces, so a word's shape
   holds while it turns. The flaps are fixed by position and turn, not random. Under reduced motion, or with no flaps,
   the text is simply set. Returns a stop that leaves the final text. Use it on monospaced text only, so nothing moves
   sideways while it turns. */

const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const pick = (i: number, k: number) => POOL[((Math.imul(i + 3, 2654435761) ^ Math.imul(k + 11, 40503)) >>> 0) % POOL.length];
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type FlapOpts = { flapMs: number; flaps: number; stagger: number };

/* fit: the element's width follows the letters shown (in ch), so a box that hugs its words never clips them mid-flap */
export function flapInto(el: HTMLElement, text: string, o: FlapOpts, from?: string, fit = false): () => void {
  const size = (s: string) => { if (fit) el.style.width = s.length + 'ch'; };
  if (reducedMotion() || o.flaps <= 0 || o.flapMs <= 0) { el.textContent = text; size(text); return () => {}; }
  if (from !== undefined) size(from);
  /* the length tweens too: positions past the new text's end keep the old letters until their turn, then go */
  const n = Math.max(text.length, from?.length ?? 0), t0 = performance.now(), end = (n - 1) * o.stagger + o.flaps * o.flapMs;
  let raf = 0;
  const frame = () => {
    const e = performance.now() - t0; let s = '';
    for (let i = 0; i < n; i++) {
      const b = text[i], k = Math.floor((e - i * o.stagger) / o.flapMs);
      /* before its turn a position shows what was there (or a first flap); then it turns forward and lands */
      if (b === undefined) { s += k < 0 ? (from?.[i] ?? '') : ''; continue; }
      s += b === ' ' || from?.[i] === b ? b : k >= o.flaps ? b : k < 0 ? (from?.[i] ?? pick(i, 0)) : pick(i, k + 1);
    }
    el.textContent = s; size(s);
    if (e < end) raf = requestAnimationFrame(frame); else { el.textContent = text; size(text); }
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); el.textContent = text; size(text); };
}

/* the flaps' values as the page's CSS has them (foldVars: --pf-flap-ms, --pf-flap-step, --pf-flaps), with the board's
   own as the fallback where a part is shown outside the preview */
export function flapOpts(el: Element): FlapOpts {
  const s = getComputedStyle(el), n = (v: string, d: number) => { const x = parseFloat(s.getPropertyValue(v)); return isFinite(x) ? x : d; };
  return { flapMs: n('--pf-flap-ms', 45), stagger: n('--pf-flap-step', 22), flaps: n('--pf-flaps', 4) };
}

/* an element's words turned on flaps each time `text` changes after the first render (the first is simply there).
   The element's React children never change (it is rendered with its first words), so React and the flaps never
   write the same text. `when`: flap only if this says so at the change (else the words are simply set). */
const put = (n: HTMLElement, t: string) => { n.textContent = t; };
export function useFlapText(el: RefObject<HTMLElement | null>, text: string, when?: (el: HTMLElement) => boolean) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const e = el.current; if (!e) return;
    const from = last.current; last.current = text;
    if (from === null || from === text || (when && !when(e))) { put(e, text); return; }
    return flapInto(e, text, flapOpts(e), from);
  }, [el, text, when]);
}
