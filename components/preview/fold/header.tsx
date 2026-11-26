'use client';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { MarkFace, type MarkMode } from '@/components/wheel/wheel';
import { useFlapText, type FlapOpts } from './flap';
import { EVENT } from '@/lib/day-data';
import { away } from '@/lib/routes';

/* The header: the wheel's own top row, stuck to the top of the window: the mark left, the register cell right, with a
   small globe facing the visitor's city. It gets the paper once the page leaves the top. The cell's city turns on flaps
   when the visitor's city changes. */
export function FoldHeader({ paper, reg, lens, jump, flap, dot, mirror, mark = 'name' }: {
  paper?: boolean;
  reg: { href: string; city: string; waiting: boolean };
  lens: RefObject<HTMLSpanElement | null>; jump: (id: string, e: MouseEvent) => void; flap: FlapOpts;
  /* with the text globe: the cell's small globe is dots, drawn on its own canvas (dot-globes.ts), facing the city */
  dot?: { lat: number; lon: number } | null;
  /* with the glass globe: the docked globe, copied here by the wheel */
  mirror?: RefObject<HTMLCanvasElement | null>;
  /* the wheel's mark mode: the header draws BUILD and the name, or the pixel globe and the name */
  mark?: MarkMode;
}) {
  const cityEl = useRef<HTMLSpanElement>(null), last = useRef(reg.city);
  /* the verb turns on flaps too when the city's state changes (Register for, Waiting list); rendered with its first
     words only, so React and the flaps never write the same text */
  const verb = reg.waiting ? 'Waiting list ' : 'Register for ', [verb0] = useState(verb), verbEl = useRef<HTMLSpanElement>(null);
  const whenShown = useCallback(() => false, []);
  useFlapText(verbEl, verb, whenShown);
  useEffect(() => {
    const el = cityEl.current; if (!el || last.current === reg.city) return;
    last.current = reg.city;
    /* the cell's width follows the letters shown, so the name is never clipped */
    el.textContent = reg.city; el.style.width = reg.city.length + 'ch';
  }, [reg.city, flap]);
  const lensEl = dot
    ? <span ref={lens} className="pf-reg-lens" aria-hidden="true" data-dot="" data-lat={dot.lat} data-lon={dot.lon} />
    : <span ref={lens} className="pf-reg-lens" aria-hidden="true"><canvas ref={mirror} className="pf-reg-mirror" /></span>;
  return (
    <header className="pf-hdr" style={{ ['--pf-n' as string]: 1 }} data-paper={paper ? '' : undefined}>
      <p className="wh-wordmark pf-mark" data-mark={mark === 'builder' ? 'builder' : 'name'}><a href="#top" aria-label={EVENT.name} onClick={(e) => jump('top', e)}><MarkFace mark={mark === 'builder' ? 'builder' : 'name'} /></a></p>
      <nav className="pf-cells" aria-label="On this page">
        <a className="pf-cell pf-reg" href={reg.href} {...away(reg.href)} style={{ ['--i' as string]: 0 }}>
          {lensEl}
          <span className="sr-only">{reg.waiting ? 'Join the waiting list in ' : 'Register for '}{reg.city}</span>
          <span aria-hidden="true" className="pf-reg-w"><span ref={verbEl}>{verb0}</span><span ref={cityEl} className="pf-reg-c" style={{ width: reg.city.length + 'ch' }}>{reg.city}</span></span>
          <span aria-hidden="true" className="pf-reg-s">{reg.waiting ? 'Waitlist' : 'Register'}</span>
        </a>
      </nav>
    </header>
  );
}
