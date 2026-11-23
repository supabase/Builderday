'use client';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { MarkFace, type MarkMode } from '@/components/wheel/wheel';
import { Person, type CellState } from '@/components/account/account';
import { flapInto, useFlapText, type FlapOpts } from './flap';
import { EVENT } from '@/lib/day-data';
import { at } from '@/lib/routes';

/* The header: the wheel's own top row, stuck to the top of the window. At the top of the page it is today's row (the
   mark and the name left, one link right). Once the page leaves the top it gets the paper and one rule; once the
   wheel's active row reaches it, its right side becomes cells, written left to right a step apart: the parts of the page, and the register cell with a
   small glass globe (the wheel's own globe docks there). The cell of the part on screen is lit. The register cell's
   city turns on flaps when the visitor's city changes.
   The account: a cell after the register cell, "Sign in" or the person's city code; with a place
   and `merged`, the register cell itself becomes the account ("You're in Berlin"), since there is nothing left to
   register for. With `top`, Sign in (or the account) is also a plain link at the very top, beside the top link. */

export type Acct = { state: CellState; code: string; cityName: string; merged: boolean; top: boolean; open: () => void };
const acctWords = (a: Acct) => (a.state === 'out' ? 'Sign in' : a.state === 'place' ? 'You’re in ' + a.cityName : 'Your account');
/* on a phone the city is its code, so the words never reach the name beside the mark */
const acctShort = (a: Acct) => (a.state === 'place' ? 'You’re in ' + a.code : acctWords(a));

export type Part = { id: string; label: string };
/* the day pages: the cell's one action in place of Register (Vote in Rosario, Submit to London, The final) */
export type HeaderAction = { words: string; short: string; href?: string; press?: () => void };
export function FoldHeader({ on, paper, parts, lit, reg, lens, jump, flap, plainTop, topLink = true, globe, dot, mirror, acct, mark = 'name', action, aside, ticker }: {
  on: boolean; paper?: boolean; parts: Part[]; lit: string | null;
  reg: { href: string; city: string; waiting: boolean };
  lens: RefObject<HTMLSpanElement | null>; jump: (id: string, e: MouseEvent) => void; flap: FlapOpts;
  /* the top link: "How it works", which now goes to that part */
  plainTop?: boolean; topLink?: boolean;
  /* with the glass not fixed the wheel's canvas cannot reach the header, so the cell has a small globe of its own */
  globe?: { lat: number; lon: number } | null;
  /* with the text globe: the cell's small globe is dots, drawn on its own canvas (dot-globes.ts), facing the city */
  dot?: { lat: number; lon: number } | null;
  /* with the glass fixed: the docked globe, copied here by the wheel so it sits above what scrolls under the header */
  mirror?: RefObject<HTMLCanvasElement | null>;
  /* the person, once /api/me has answered; null on a page without the forms */
  acct?: Acct | null;
  /* the wheel's mark mode: the header draws BUILD and the name, or the pixel globe and the name */
  mark?: MarkMode;
  /* the day pages: the action cell, and a line beside the mark (a city's top three, past its first screen) */
  action?: HeaderAction | null; aside?: ReactNode;
  /* the day pages: the wire, after the mark (under the bar on a narrow screen) */
  ticker?: ReactNode;
}) {
  const cityEl = useRef<HTMLSpanElement>(null), last = useRef(reg.city), shown = useRef(on);
  useEffect(() => { shown.current = on; }, [on]);
  /* the verb turns on flaps too when the city's state changes (Register for, Waiting list); rendered with its first
     words only, so React and the flaps never write the same text */
  const verb = reg.waiting ? 'Waiting list ' : 'Register for ', [verb0] = useState(verb), verbEl = useRef<HTMLSpanElement>(null);
  const whenShown = useCallback(() => shown.current, []);
  useFlapText(verbEl, verb, whenShown);
  useEffect(() => {
    const el = cityEl.current; if (!el || last.current === reg.city) return;
    const from = last.current; last.current = reg.city;
    /* the flaps play only where they can be seen: while the cells are off the city is simply set. The cell's width
       follows the letters shown, so the name is never clipped while it turns; the flaps go from the old length to the new */
    if (!shown.current) { el.textContent = reg.city; el.style.width = reg.city.length + 'ch'; return; }
    return flapInto(el, reg.city, flap, from, true);
  }, [reg.city, flap]);
  const mine = !!acct && acct.merged && acct.state === 'place';
  const lensEl = dot
    ? <span ref={lens} className="pf-reg-lens" aria-hidden="true" data-dot="" data-lat={dot.lat} data-lon={dot.lon} />
    : <span ref={lens} className="pf-reg-lens" aria-hidden="true" {...(globe ? { 'data-globe': '', 'data-lat': globe.lat, 'data-lon': globe.lon } : {})}>{globe ? null : <canvas ref={mirror} className="pf-reg-mirror" />}</span>;
  return (
    <header className="pf-hdr" style={{ ['--pf-n' as string]: parts.length + (plainTop ? 0 : 1) + (acct && !mine ? 1 : 0) }} data-on={on ? '' : undefined} data-paper={paper ? '' : undefined} data-acct={acct ? '' : undefined}>
      <p className="wh-wordmark pf-mark" data-mark={mark === 'builder' ? 'builder' : 'name'}><a href="#top" aria-label={EVENT.name} onClick={(e) => jump('top', e)}><MarkFace mark={mark === 'builder' ? 'builder' : 'name'} /></a></p>
      {aside ? <div className="pf-aside">{aside}</div> : null}
      {ticker ?? null}
      {topLink || acct?.top ? (
        /* with the cells there (focus shows them from the top), the top links are for the pointer only: Tab and a screen
           reader meet each link once, in the cells */
        <div className="pf-tops" aria-hidden={on || !plainTop || undefined}>
          {topLink ? <a className="pf-top" href="#how" onClick={(e) => jump('how', e)} tabIndex={on || !plainTop ? -1 : undefined}>How it works</a> : null}
          {acct?.top ? <button type="button" className="pf-top" data-acct={acct.state} aria-haspopup="dialog" tabIndex={on || !plainTop ? -1 : undefined} onClick={acct.open}><span className="pf-top-l">{acctWords(acct)}</span><span className="pf-top-s" aria-hidden="true">{acctShort(acct)}</span></button> : null}
        </div>
      ) : null}
      {plainTop ? null : (
        <nav className="pf-cells" aria-label="On this page">
          {parts.map((p, i) => (
            <a key={p.id} href={'#' + p.id} className="pf-cell" style={{ ['--i' as string]: i }} aria-current={lit === p.id ? 'location' : undefined} onClick={(e) => jump(p.id, e)}>{p.label}</a>
          ))}
          {mine ? (
            <button type="button" className="pf-cell pf-reg" data-mine="" style={{ ['--i' as string]: parts.length }} aria-haspopup="dialog" onClick={acct!.open}>
              {lensEl}
              <span className="sr-only">Your account: on the list for {acct!.cityName}</span>
              <span aria-hidden="true" className="pf-reg-w">You’re in {acct!.cityName}</span>
              <span aria-hidden="true" className="pf-reg-s">You’re in {acct!.code}</span>
            </button>
          ) : action ? (
            action.press
              ? <button type="button" className="pf-cell pf-reg" data-action="" style={{ ['--i' as string]: parts.length }} aria-haspopup="dialog" onClick={action.press}>{lensEl}<span className="sr-only">{action.words}</span><span aria-hidden="true" className="pf-reg-w">{action.words}</span><span aria-hidden="true" className="pf-reg-s">{action.short}</span></button>
              : <a className="pf-cell pf-reg" data-action="" href={action.href ? at(action.href) : undefined} style={{ ['--i' as string]: parts.length }}>{lensEl}<span className="sr-only">{action.words}</span><span aria-hidden="true" className="pf-reg-w">{action.words}</span><span aria-hidden="true" className="pf-reg-s">{action.short}</span></a>
          ) : (
            <a className="pf-cell pf-reg" href={at(reg.href)} style={{ ['--i' as string]: parts.length }}>
              {lensEl}
              <span className="sr-only">{reg.waiting ? 'Join the waiting list in ' : 'Register for '}{reg.city}</span>
              <span aria-hidden="true" className="pf-reg-w"><span ref={verbEl}>{verb0}</span><span ref={cityEl} className="pf-reg-c" style={{ width: reg.city.length + 'ch' }}>{reg.city}</span></span>
              <span aria-hidden="true" className="pf-reg-s">{reg.waiting ? 'Waitlist' : 'Register'}</span>
            </a>
          )}
          {acct && !mine ? (
            <button type="button" className="pf-cell pf-acct" data-state={acct.state} style={{ ['--i' as string]: parts.length + 1 }} aria-haspopup="dialog" onClick={acct.open}
              aria-label={acct.state === 'out' ? 'Sign in' : acct.state === 'place' ? acct.code + ', your account, on the list for ' + acct.cityName : 'Your account'}>
              <Person on={acct.state !== 'out'} /><span className="pf-acct-w">{acct.state === 'out' ? 'Sign in' : acct.state === 'place' ? acct.code : 'Account'}</span>
            </button>
          ) : null}
        </nav>
      )}
    </header>
  );
}
