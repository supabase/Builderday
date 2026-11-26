'use client';
/* proto:under-hero. The picker (the prototype kit's, verbatim) over the real preview page: the hero, header and footer
   are the page's own; only the sections under the hero change. Baseline is today's page. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { Here, OurWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { FoldPreview } from '@/components/preview/fold/preview-page';
import { Panels, Ruler, Walkthrough } from './variants';
import './proto.css';

const NAMES = ['Baseline', 'Panels', 'Ruler', 'Walkthrough'];
/* the screen's lines and fringe on the type under the hero: everywhere (today), section headings only, or none */
const TITLES = ['scan', 'heads', 'plain'] as const;
const TITLE_NAME = { scan: 'Scan all', heads: 'Scan heads', plain: 'No scan' };

export function Harness(props: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; here: Here | null; q: Record<string, string | undefined>; nowMs: number }) {
  const [v, setV] = useState(() => Math.max(0, Math.min(NAMES.length - 1, (parseInt(props.q.v ?? '1', 10) || 1) - 1)));
  const [k, setK] = useState(0);
  const [titles, setTitles] = useState<(typeof TITLES)[number]>(() => (TITLES as readonly string[]).includes(props.q.titles ?? '') ? props.q.titles as (typeof TITLES)[number] : 'heads');
  const cycle = useCallback(() => setTitles((t) => {
    const n = TITLES[(TITLES.indexOf(t) + 1) % TITLES.length];
    const url = new URL(location.href); url.searchParams.set('titles', n); history.replaceState(null, '', url);
    return n;
  }), []);
  useEffect(() => { document.documentElement.setAttribute('data-pv-titles', titles); return () => document.documentElement.removeAttribute('data-pv-titles'); }, [titles]);
  const pick = useCallback((i: number) => {
    if (i < 0 || i >= NAMES.length) return;
    setV(i); setK((x) => x + 1);
    const url = new URL(location.href); url.searchParams.set('v', String(i + 1)); history.replaceState(null, '', url);
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= NAMES.length) pick(n - 1);
      else if (e.key === 'ArrowRight') pick((v + 1) % NAMES.length);
      else if (e.key === 'ArrowLeft') pick((v - 1 + NAMES.length) % NAMES.length);
      else if (e.key === 'r' || e.key === 'R') setK((x) => x + 1);
      else if (e.key === 't' || e.key === 'T') cycle();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [v, pick, cycle]);

  const nav = useRef<HTMLElement>(null), hl = useRef<HTMLSpanElement>(null), items = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const place = () => { const el = items.current[v], h = hl.current; if (!el || !h) return; h.style.width = el.offsetWidth + 'px'; h.style.transform = `translateX(${el.offsetLeft}px)`; };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [v]);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => nav.current?.setAttribute('data-ready', ''))); return () => cancelAnimationFrame(id); }, []);

  const V = [null, Panels, Ruler, Walkthrough][v];
  return (
    <>
      <FoldPreview {...props} under={V ? (u) => <V key={k} u={u} /> : undefined} />
      <nav className="proto-picker" aria-label="Prototype variants" ref={nav}>
        <span className="proto-picker-highlight" aria-hidden="true" ref={hl} />
        {NAMES.map((n, i) => <button key={n} ref={(el) => { items.current[i] = el; }} className="proto-picker-item" data-active={i === v ? '' : undefined} aria-current={i === v ? 'true' : undefined} onClick={() => pick(i)}>{n}</button>)}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button className="proto-picker-item" aria-label="Scan on the type under the hero (T)" onClick={cycle}>{TITLE_NAME[titles]}</button>
        <span className="proto-picker-divider" aria-hidden="true" />
        <button className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => setK((x) => x + 1)}>↻</button>
      </nav>
    </>
  );
}
