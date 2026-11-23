'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Item } from '@/components/board/announce';
import { Flash } from '@/components/screen/flash';
import { bar, change, hiddenCell, MARK, MARK_WORD, pad, typedAt, type BarMode, type MarkState } from './devices';

/* The live devices as pieces of a page. Each draws text in a fixed column (D2): the page reflows on no tick. */

const RM = '(prefers-reduced-motion: reduce)';
export const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia(RM); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, () => window.matchMedia(RM).matches, () => false);

/* D6: the votes as a hatch bar; dim: hidden, the last length in : and . */
export function Bar({ v, scale, cells, mode, dim = false }: { v: number; scale: number; cells: number; mode: BarMode; dim?: boolean }) {
  if (mode === 'none') return null;
  const b = bar(v, scale, cells, mode, dim);
  return <span className="oa-bar" data-mode={mode} data-dim={dim ? '' : undefined} aria-hidden="true"><span className="oa-bar-on">{b.on}</span><span className="oa-bar-off">{b.off}</span></span>;
}

/* D2 + D3: a count in its column, lit when it changes (the board's flash); while hidden, the placeholder */
export function Count({ v, w = 4, hidden = false }: { v: number | null; w?: number; hidden?: boolean }) {
  if (hidden || v == null) return <span className="oa-n" data-hidden=""><span aria-hidden="true">{hiddenCell(w)}</span><span className="sr-only">hidden</span></span>;
  return <Flash value={v} className="oa-n">{pad(v, w)}</Flash>;
}

/* D1: the change in ten minutes, as a glyph and a number */
export function Delta({ now, before, hidden = false }: { now: number; before: number | null | undefined; hidden?: boolean }) {
  if (hidden) return <span className="oa-d" aria-hidden="true">{'   '}</span>;
  const c = change(now, before);
  return <span className="oa-d" data-g={c.glyph === '▲' ? 'up' : c.glyph === '▼' ? 'down' : 'same'}><span aria-hidden="true">{c.text.padEnd(4, ' ')}</span><span className="sr-only">{c.said} in 10 minutes</span></span>;
}

/* a city's state: its mark (the shape) and its word */
export function StateCell({ s, word }: { s: MarkState; word?: string }) {
  return <span className="oa-state" data-s={s}><span className="oa-state-m" aria-hidden="true">{MARK[s]}</span><span>{word ?? MARK_WORD[s]}</span></span>;
}

/* D5: the wire as a vidiprinter. One line at a time: the code, the time, the sentence, typed at `rate` characters a
   second; held `hold` seconds; then the next older line. A newer line always comes first (the backlog skips ahead:
   it is never late). Pause, previous, next, and the log of the lines. Under reduced motion each line is simply set. */
/* compact: the header's version, the line and a Log key only (hover still holds it), the log dropping under it */
export function Wire({ items, rate, hold, label, empty, paused: startPaused = false, compact = false }: { items: Item[]; rate: number; hold: number; label: string; empty: string; paused?: boolean; compact?: boolean }) {
  const reduced = useReduced();
  const [i, setI] = useState(0), [paused, setPaused] = useState(startPaused), [log, setLog] = useState(false), [n, setN] = useState(0);
  const newest = items[0]?.id ?? '', seen = useRef(newest), [over, setOver] = useState(false), held = paused || over;
  /* a newer line jumps the queue */
  useEffect(() => { if (newest !== seen.current) { seen.current = newest; setI(0); setN(0); } }, [newest]);
  const it = items[Math.min(i, items.length - 1)], text = it ? it.text : '';
  /* a character a step (only the line's own cell changes), then the hold, then the next line */
  useEffect(() => {
    if (!it || held) return;
    if (reduced || n >= text.length) { const t = window.setTimeout(() => { setN(0); setI((k) => (items.length ? (k + 1) % items.length : 0)); }, hold * 1000); return () => window.clearTimeout(t); }
    const t = window.setInterval(() => setN((k) => Math.min(text.length, k + 1)), 1000 / rate);
    return () => window.clearInterval(t);
  }, [it, held, reduced, rate, hold, items.length, n, text.length]);
  const shown = reduced || held ? text : typedAt(text, (n / rate) * 1000 + 1, rate), typing = !reduced && !held && shown.length < text.length;
  /* the header's log closes on Escape or a press outside it */
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!compact || !log) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setLog(false); };
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setLog(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [compact, log]);
  const go = (d: number) => { if (!items.length) return; setN(0); setI((k) => (k + d + items.length) % items.length); };
  return (
    <section ref={root} className="oa-wire" data-compact={compact ? '' : undefined} aria-label={label} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOver(true); }} onPointerLeave={() => setOver(false)}>
      {it ? (
        <p className="oa-wire-l">
          <span className="oa-wire-c">{it.code}</span><span className="oa-wire-t">{it.time}</span>
          <span className="oa-wire-x"><span aria-hidden="true">{shown}{typing ? <span className="oa-cur">█</span> : null}</span><span className="sr-only">{text}</span></span>
        </p>
      ) : <p className="oa-wire-l oa-wire-empty">{empty}</p>}
      <div className="oa-wire-k">
        {compact ? null : <>
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Play' : 'Pause'}</button>
          <button type="button" onClick={() => go(1)} aria-label="Older line">‹</button>
          <button type="button" onClick={() => go(-1)} aria-label="Newer line">›</button>
        </>}
        <button type="button" onClick={() => setLog((l) => !l)} aria-expanded={log}>Log</button>
      </div>
      {log ? <ol className="oa-wire-log">{items.map((x) => <li key={x.id}><span className="oa-wire-c">{x.code}</span><span className="oa-wire-t">{x.time}</span><span>{x.text}</span></li>)}</ol> : null}
    </section>
  );
}

/* the docked line: the person's own place while their row is off screen (idea 20) */
export function Dock({ text, onPress, show }: { text: string; onPress?: () => void; show: boolean }) {
  return <div className="oa-dock" data-on={show ? '' : undefined} aria-hidden={!show || undefined}>{onPress ? <button type="button" onClick={onPress} tabIndex={show ? 0 : -1}>{text}</button> : <span>{text}</span>}</div>;
}
