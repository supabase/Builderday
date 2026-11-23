'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { WheelEngine } from '@/components/wheel/engine';
import { SheetWheel } from '@/components/preview/preview';
import type { OurWheel } from '@/components/preview/facts';
import { FOLD_BOUNDS, FOLD_CHOICES, FOLD_INT, clampFold, type FoldCfg } from '@/components/preview/fold/config';
import { FoldPage } from '@/components/preview/fold/fold';
import { measure } from '@/components/admin/contrast';
import { clampScreen } from '@/components/screen/config';
import screenCfg from '@/saved/screen.config.json';
import { LabPanel, togglePanel, useLabSave } from './lab-kit';
import { FOLD_GROUPS as GROUPS, FOLD_LABELS as LABELS } from '@/components/preview/fold/knobs';

/* /lab/fold: the preview page without its sheet, as four directions (base: today's page with the sheet; plain: the
   sheet's blocks under the wheel; line: the morning line; unroll: line with the wheel unrolling into the board) and
   every mode and knob of the page. Save writes saved/fold.config.json, which /preview reads.
   ?dir= picks the direction, ?acct= and ?acctTop= the account's modes, ?bare hides the panel, ?city= forces the city, ?at= scrolls to a part, ?gl=0 draws
   without WebGL, ?still=1 shows every arrival already arrived (for stills). Keys: \ the panel, S save. */

export function FoldLab({ saved, wheel, ours, q, nowMs }: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; q: Record<string, string | undefined>; nowMs: number }) {
  const [cfg, setCfg] = useState<FoldCfg>(() => {
    const c = clampFold({ ...saved, ...(q.dir ? { dir: q.dir } : {}), ...(q.acct ? { acct: q.acct } : {}), ...(q.acctTop ? { acctTop: q.acctTop } : {}) });
    return q.still === '1' ? { ...c, arrive: 'none' } : c;
  });
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampFold({ ...c, [k]: v })), []);
  const bare = q.bare !== undefined, noGl = q.gl === '0', forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(9, Math.round(Number(q.city)) || 0)) : null;
  const { save, msg, rail } = useLabSave('fold', 'lab-fold-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const eng = useRef<WheelEngine | null>(null);

  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);
  useEffect(() => {
    if (bare) return;
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, bare]);
  /* ?at=: straight to a part */
  useEffect(() => {
    if (!q.at) return;
    const id = window.setTimeout(() => document.getElementById(q.at!)?.scrollIntoView({ block: 'start' }), 300);
    return () => window.clearTimeout(id);
  }, [q.at]);

  /* the meter: small text with the lines on, green as a share of the window, and frames a second while scrolling */
  const [text, setText] = useState('Measuring…'), [bad, setBad] = useState(false), fps = useRef({ n: 0, t0: 0, last: 0, val: 0 });
  useEffect(() => {
    if (bare || cfg.dir === 'base') return;
    let raf = 0, stop = 0;
    const count = (t: number) => { const f = fps.current; f.n++; if (!f.t0) f.t0 = t; if (t - f.t0 > 500) { f.val = Math.round((f.n * 1000) / (t - f.t0)); f.n = 0; f.t0 = t; } raf = performance.now() - stop < 300 ? requestAnimationFrame(count) : 0; };
    const onScroll = () => { stop = performance.now(); if (!raf) { fps.current.t0 = 0; fps.current.n = 0; raf = requestAnimationFrame(count); } };
    const read = () => {
      const r = measure(document, clampScreen(screenCfg));
      const vw = window.innerWidth * window.innerHeight; let green = 0;
      document.querySelectorAll<HTMLElement>('.pf *').forEach((el) => {
        const s = getComputedStyle(el), m = /rgba?\((\d+), (\d+), (\d+)/.exec(s.backgroundColor);
        if (m && +m[2] > 150 && +m[2] > +m[1] * 1.4 && +m[2] > +m[3] * 1.1) { const b = el.getBoundingClientRect(); green += Math.max(0, Math.min(b.bottom, window.innerHeight) - Math.max(b.top, 0)) * Math.max(0, Math.min(b.right, window.innerWidth) - Math.max(b.left, 0)); }
      });
      setText(`Small text: ${r.n} pieces, lowest ${r.min.toFixed(1)}:1, ${r.under} under 7:1 with the lines on. Green: ${((green / vw) * 100).toFixed(1)}% of the window. Scrolling: ${fps.current.val || '–'} frames a second.`);
      setBad(r.under > 0);
    };
    const id = window.setInterval(read, 1500); window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.clearInterval(id); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [bare, cfg.dir]);

  const out = (k: string) => { const v = cfg[k as keyof FoldCfg]; return typeof v === 'number' ? (FOLD_INT.has(k) ? String(v) : String(+v.toFixed(3))) : String(v); };
  const panel = bare ? null : (
    <LabPanel title="Fold: the preview without its sheet" cfg={cfg} bounds={FOLD_BOUNDS} choices={FOLD_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
      out={out} optionLabel={(_k, v) => LABELS[v] || v} meter={cfg.dir === 'base' ? { text: 'Base: today’s preview, with the sheet.', bad: false } : { text, bad }}
      msg={msg} rail={rail} railLabel={(s) => `${s.dir}, ${s.order}, ${s.glass}, ${s.globe}, ${s.jump}, ${s.cities}`} apply={(s) => setCfg(clampFold(s))}
      buttons={[['Save', doSave, true]]} />
  );
  if (cfg.dir === 'base') return <><SheetWheel cfg={wheel} noGl={noGl} mark={wheel.mark} engineRef={eng} ours={ours} forced={forced} />{panel}</>;
  return <FoldPage cfg={cfg} wheel={wheel} ours={ours} forced={forced} noGl={noGl} nowMs={nowMs}>{panel}</FoldPage>;
}
