'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { WheelEngine } from './engine';
import { launch, type P } from './launch';
import type { LaunchCfg } from './launch-config';

/* The hero ticket's Register press plays the launch (launch.ts), then opens Luma.
   - Only a plain press on the ticket's Luma link: a press with a modifier key, a middle click, the account button (your
     own city) and reduced motion all keep the link as it is.
   - Luma opens as the rocket lands (or at the press, by the config). A tab opened a moment after the press can be
     refused by a pop-up blocker; then this page goes to Luma instead, so the press always gets there.
   - `dry` (the lab): the launch plays and nothing opens. */
export function useLaunch(eng: RefObject<WheelEngine | null>, cfg: LaunchCfg, dry = false) {
  const live = useRef({ cfg, dry }), busy = useRef(false);
  useEffect(() => { live.current = { cfg, dry }; }, [cfg, dry]);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const { cfg: c, dry: d } = live.current;
      if (c.on !== 'on' || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.wh-ticket a.wh-reg');
      const t = a?.closest<HTMLElement>('.wh-ticket');
      if (!a || !t || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      e.preventDefault();
      if (busy.current) return;
      busy.current = true;
      const href = a.href, go = () => {
        if (d) return;
        const w = window.open(href, '_blank');
        if (w) w.opener = null; else location.assign(href);
      };
      if (c.open === 'press') go();
      launch(t, target(eng.current), c, c.open === 'land' ? go : undefined).finally(() => { busy.current = false; });
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [eng]);
}

/* the city's mark on the text globe; the wheel's middle if the mark is not drawn (behind the globe's edge, or no globe) */
function target(eng: WheelEngine | null): P {
  const m = eng?.mark?.(); if (m) return m;
  const g = eng?.geometry?.(), c = document.querySelector('.wh canvas, canvas')?.getBoundingClientRect();
  return g && c ? { x: c.left + g.x, y: c.top + g.y } : { x: innerWidth * 0.72, y: innerHeight * 0.45 };
}
