'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import { wheelVars } from '@/components/wheel/wheel';
import { mountDotGlobes } from '@/components/wheel/dot-globes';
import { FoldHeader, type Acct, type HeaderAction, type Part } from '@/components/preview/fold/header';
import { clampFold, foldVars } from '@/components/preview/fold/config';
import { DayScreen } from '@/components/day/shared';
import { useForms } from '@/components/forms/forms-provider';
import { meNow, useFormsState } from '@/components/forms/store';
import { cellState, openAccount } from '@/components/account/account';
import { CODE } from '@/lib/places';
import type { Item } from '@/components/board/announce';
import { Wire } from './parts';
import foldSaved from '@/saved/fold.config.json';
import '@/components/board/board.css';
import '@/components/day/explain.css';
import '@/components/preview/fold/fold.css';
import '@/components/day/ending.css';
import './air.css';

/* The day pages' frame: the preview's machine (its ground, its glass, its header) around the day's own parts.
   - The header is the preview's FoldHeader and hands over as it does there: at the top only the mark, the wire and
     Sign in; once the first screen is mostly gone the cells flap in (the page's parts, the action cell with a dot
     globe on the city it acts on, Sign in) on the paper ground.
   - The cell of the part on screen is lit; a press on a cell lands on its part.
   - The page's ground is in the server's HTML (as on the preview), so the first paint is already it. */

export function AirShell({ wheel, parts, action, near, aside, wire, children, foot, label, plain = false }: {
  /* plain: the ground is flat black, with no screen over it (no grain, no glass) */
  plain?: boolean;
  wheel: WheelCfg; parts: Part[];
  /* the header's action, and the place its small globe faces */
  action: HeaderAction; near: { lat: number; lon: number };
  /* past the first screen, a line beside the mark (a city's top three) */
  aside?: ReactNode;
  /* the wire in the header (header: beside the mark, strip: under the bar); 'page' wires are the page's own */
  wire?: { items: Item[]; rate: number; hold: number; at: 'header' | 'strip'; ch: number; label: string; empty: string; paused?: boolean } | null;
  children: ReactNode; foot?: ReactNode; label: string;
}) {
  const fold = useMemo(() => clampFold(foldSaved), []);
  const [paper, setPaper] = useState(false), [lit, setLit] = useState<string | null>(null), [past, setPast] = useState(false);
  const lens = useRef<HTMLSpanElement>(null), main = useRef<HTMLElement>(null), first = useRef<HTMLDivElement>(null);

  /* the person, after /api/me answers (the first paint is the signed-out page) */
  const forms = useForms(), fs = useFormsState(), me = meNow(), pass = me?.pass ?? null;
  const signIn = useMemo(() => (forms ? () => openAccount(forms) : undefined), [forms]);
  const acct: Acct | null = useMemo(() => {
    if (!forms) return null;
    return { state: cellState(fs.signedIn, me), code: pass ? CODE[pass.city] || pass.city.slice(0, 3).toUpperCase() : '', cityName: pass?.cityName || '', merged: false, top: true, open: signIn! };
  }, [forms, fs.signedIn, me, pass, signIn]);

  useEffect(() => {
    const on = () => setPaper(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  /* past the first screen (most of it gone): the cells flap in and the aside shows */
  useEffect(() => {
    const el = first.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0)); io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const m = main.current; if (!m) return;
    const els = Array.from(m.querySelectorAll<HTMLElement>('[data-part]'));
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setLit((e.target as HTMLElement).dataset.part || null); }, { rootMargin: '-40% 0px -55% 0px' });
    els.forEach((p) => io.observe(p)); return () => io.disconnect();
  }, [parts]);
  useEffect(() => (wheel.globe === 'ascii' ? mountDotGlobes(document, wheel) : undefined), [wheel]);
  const jump = useCallback((id: string, e: MouseEvent) => {
    e.preventDefault();
    if (id === 'top') { window.scrollTo({ top: 0 }); return; }
    const el = document.getElementById(id); if (!el) return;
    setLit(id);
    el.scrollIntoView({ block: 'start' });
    if (e.detail === 0) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  }, []);
  const flap = useMemo(() => ({ flapMs: fold.flapMs, flaps: 0, stagger: fold.flapStagger }), [fold.flapMs, fold.flapStagger]);

  return (
    <div className="pf oa" data-wire={wire?.at} data-dir="line" data-glass="today" data-small="dots" data-plain={plain ? '' : undefined} style={{ ...wheelVars(wheel), ...foldVars(fold) } as CSSProperties}>
      <style>{plain ? ':root:has(.pf){--pf-paper:var(--bd-ground, #0c0d0d)}' : `:root:has(.pf){--pf-paper:rgb(${wheel.paper} ${wheel.paper + 1} ${wheel.paper + 1})}`}</style>
      {/* the screen (scan lines and fringe on the big type) is on with the flat ground too */}
      <DayScreen />
      <div className="pf-hdr-wrap">
        <FoldHeader mark={wheel.mark} on={past} paper={paper || past} parts={parts} lit={lit} lens={lens} jump={jump} flap={flap} topLink={false}
          reg={{ href: action.href ?? '#', city: '', waiting: false }} dot={{ lat: near.lat, lon: near.lon }} acct={acct} action={action}
          aside={aside ? <span data-on={past ? '' : undefined} aria-hidden={!past || undefined}>{aside}</span> : null}
          ticker={wire ? <div className="oa-ticker" data-at={wire.at} style={{ ['--wire-ch' as string]: wire.ch }}><Wire compact items={wire.items} rate={wire.rate} hold={wire.hold} label={wire.label} empty={wire.empty} paused={wire.paused} /></div> : null} />
      </div>
      <main ref={main} className="oa-main" id="day" aria-label={label}>
        <div ref={first} className="oa-sentinel" aria-hidden="true" />
        {children}
      </main>
      {foot ? <div className="pf-foot">{foot}</div> : null}
    </div>
  );
}
