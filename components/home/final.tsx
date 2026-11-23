'use client';
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import clsx from 'clsx';
import { EVENT, CITY_WORD_CAP, FINALIST_COUNT } from '@/lib/day-data';
import { dur, hhmm } from '@/lib/format';
import { cityPrize } from '@/lib/prizes';
import { LABEL } from '@/components/shared/page-parts';
import { Picture } from '@/components/pictures/picture';
import { useDay } from './day-context';
import { CityCell, PickBlock, PlaceText, finalLine, places, type Place, type Sure } from './final-parts';
import { play, tokEase, tokMs, wipe } from '@/components/shared/motion';

/* One diagram: the final as the draw sheet at full width. Each city sends three lines; the thirty lines run into one
   join, where the pick sits with the global prize. Three captions over it say how the day works, and the city prize is
   named once, over the lines. On a phone the drawing turns:
   the cities run down the page, their lines meet a trunk on the right, and the trunk runs down to the join.
   From the saved look: finRh (a place's row, px), curve (where the lines bend, % of the run). */
const tone = (s: Sure, k: number): string => s === 'pick' ? 'pick' : s === 'in' ? (k === 0 ? 'ink' : 'ink3') : 'dash';

export function Diagram({ finRh, curve }: { finRh: number; curve: number }) {
  const { cfg: c, W } = useDay(), gap = 16, bh = 3 * finRh + gap, H = 10 * bh - gap, yJ = H / 2;
  const rows = W.cs.map((x) => ({ x, ps: places(x, W) }));
  const cx = curve;   /* control points sit at curve% of the run */
  const yOf = (i: number, k: number) => i * bh + (k + 1) * finRh;
  const pickY = W.picked ? yOf(W.final.city.i, W.final.place - 1) : null;
  const sec = useRef<HTMLElement>(null);
  useLanding(sec, W.cs.map((x) => x.state).join(' '));
  usePickReveal(sec, W.picked ? c.seed + ':' + W.S.pickAt : '');
  return (
    <section ref={sec} className="ld relative mx-(--m) pt-8 pb-12 rule-t" id="final" aria-labelledby="ld-h" style={{ '--frh': finRh + 'px', '--bh': bh + 'px', '--dh': H + 'px' } as CSSProperties}>
      <div className="ld-cols items-end pb-6">
        <h2 className="ld-ab text-d48 leading-none font-semibold tracking-d48 phone:text-h1" id="ld-h">{FINALIST_COUNT} become one</h2>
        <p className="ld-cd min-h-[2lh] text-h2/[1.2] tracking-snug text-ink phone:min-h-0 phone:text-xl/[1.3]">{finalLine(W)}</p>
      </div>
      {/* three captions, on the drawing's own columns: the cities, the final, the pick */}
      <div className="ld-cols ld-caps items-start pb-5" id="prizes">
        <p className="ld-ab grid max-w-[48ch] gap-y-1 text-sm text-ink-2"><span className={LABEL}>{CITY_WORD_CAP} cities</span>Each builds for {c.buildMin} minutes from {hhmm(c.startHour * 60)} local. Voting is open the whole time and {dur(c.voteAfter)} after.</p>
        <p className="ld-c grid gap-y-1 text-sm text-ink-2"><span className={LABEL}>Top 3 go to the final</span><span><i className="ld-sq" aria-hidden="true" /> {cityPrize(undefined, W.allDone)}</span></p>
        <p className="ld-d grid gap-y-1 text-sm text-ink-2"><span className={LABEL}>One pick</span>{W.picked ? <>Votes decided the finalists. {EVENT.pickers} picked the winner from them.</> : <>Votes decide the finalists. {EVENT.pickers} pick the winner from them.</>}</p>
      </div>
      <div className="ld-draw relative">
        <ol className="relative">
          {rows.map(({ x, ps }) => (
            <li key={x.i} className="ld-city ld-cols relative items-start" data-state={x.state} data-ci={x.i}>
              <CityCell x={x} cls="ld-a pr-3" />
              <ol className="ld-b ld-places grid" aria-label={'Finalists in ' + x.name}>
                {x.state === 'done' && !x.top.length ? <li className="ld-place ld-empty text-sm text-ink-2">No finalists</li> : ps.map((p) => <PlaceRow key={p.k} p={p} />)}
              </ol>
            </li>
          ))}
        </ol>
        {/* the run: thirty curves from each place to the join */}
        <svg className="ld-run pointer-events-none absolute top-0 phone:hidden" viewBox={'0 0 100 ' + H} preserveAspectRatio="none" aria-hidden="true">
          {rows.flatMap(({ x, ps }) => ps.filter((p) => !(x.state === 'done' && !p.t)).map((p) => {
            const y = yOf(x.i, p.k), t = tone(p.sure, p.k);
            if (t === 'pick') return null;
            return <path key={x.i + '-' + p.k} d={`M0 ${y} C${cx} ${y} ${100 - cx} ${yJ} 100 ${yJ}`} className={'ld-p is-' + t} vectorEffect="non-scaling-stroke" data-ci={x.i} data-k={p.k} />;
          }))}
          {pickY != null ? <path d={`M0 ${pickY} C${cx} ${pickY} ${100 - cx} ${yJ} 100 ${yJ}`} className="ld-p is-pick" vectorEffect="non-scaling-stroke" data-g="1" /> : null}
        </svg>
        <i className={clsx('ld-join absolute size-5 rounded-round phone:hidden', W.picked ? 'bg-accent' : W.allDone ? 'edge-ink' : 'outline-(length:--line-thin) outline-ink-2 outline-dashed -outline-offset-1')} style={{ top: 'calc(' + yJ + 'px - 10px)' }} data-g={W.picked ? '1' : undefined} aria-hidden="true" />
        <div className="ld-pick absolute grid -translate-y-1/2 gap-y-4 phone:hidden" style={{ top: yJ + 'px' }}>
          {W.picked ? <span className="block aspect-video w-full"><Picture p={W.final.p} /></span> : null}
          <PickBlock />
        </div>
        {/* the phone's trunk and join */}
        <i className={clsx('ld-trunk absolute top-0 hidden w-(--hair) phone:block', W.allDone ? 'bg-ink-3' : 'dash-y')} aria-hidden="true" />
      </div>
      <div className="ld-phonepick relative hidden pt-6 phone:grid">
        <i className={clsx('ld-pjoin absolute top-0 size-5 rounded-round', W.picked ? 'bg-accent' : W.allDone ? 'edge-ink' : 'outline-(length:--line-thin) outline-ink-2 outline-dashed -outline-offset-1')} data-g={W.picked ? '1' : undefined} aria-hidden="true" />
        {W.picked ? <span className="mb-4 block aspect-video w-full"><Picture p={W.final.p} /></span> : null}
        <PickBlock />
      </div>
    </section>
  );
}

function PlaceRow({ p }: { p: Place }) {
  return (
    <li className={clsx('ld-place relative flex items-end', 'is-' + tone(p.sure, p.k))}>
      {p.k === 0 && (p.sure === 'in' || p.sure === 'pick') ? <i className="ld-sq absolute bottom-2 -left-3" aria-hidden="true" /> : null}
      <PlaceText p={p} cls="w-full pb-0.5 text-sm/4" />
    </li>
  );
}

/* Finalists landing: when a city closes while the page is open, its three lines draw from the places to the join
   (left to right, each --stagger after the last, all inside --dur-draw) and its three names fade in with them.
   Only for a change seen live: the first draw shows the day as it is. */
function useLanding(sec: RefObject<HTMLElement | null>, states: string) {
  const prev = useRef<string[] | null>(null);
  useLayoutEffect(() => {
    const now = states.split(' '), was = prev.current, el = sec.current; prev.current = now;
    if (!was || !el) return;
    const d = tokMs('--dur-draw'), st = tokMs('--stagger'), e = tokEase('--ease-draw'), e2 = tokEase('--ease-out');
    if (!d) return;
    const each = Math.max(80, d - 2 * st);
    now.forEach((s, i) => {
      if (s !== 'done' || was[i] === 'done') return;
      el.querySelectorAll<SVGPathElement>('.ld-p[data-ci="' + i + '"]').forEach((p) => wipe(p, each, +(p.dataset.k || 0) * st, e));
      el.querySelectorAll('.ld-city[data-ci="' + i + '"] .ld-place').forEach((li, k) => play(li, [{ opacity: 0 }, { opacity: 1 }], each, { delay: k * st, ease: e2 }));
    });
  }, [states, sec]);
}

/* The pick, once ever in this browser: when the join comes into view with a pick it has not shown, the pick's
   place underlines, its line draws to the join in green, the join fills, then the picture and the name come in, all
   inside --dur-reveal. Until then (data-pending) the join waits unfilled and the green line and the pick are hidden.
   Under reduced motion it is marked seen and shows at once. */
const PICK_KEY = 'hackday-pick-seen';
function usePickReveal(sec: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const el = sec.current; if (!el || !key) return;
    let seen = false; try { seen = localStorage.getItem(PICK_KEY) === key; } catch { seen = true; }
    if (seen || !tokMs('--dur-reveal')) { try { localStorage.setItem(PICK_KEY, key); } catch { /* storage blocked */ } return; }
    el.setAttribute('data-pending', '');
    return () => el.removeAttribute('data-pending');
  }, [sec, key]);
  useEffect(() => {
    const el = sec.current; if (!el || !key || !el.hasAttribute('data-pending')) return;
    /* it starts when the join is in full view: the middle of the drawing on a wide screen, its foot on a phone (the
       drawing is taller than the screen there); the join the screen does not show never intersects */
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect(); el.removeAttribute('data-pending');
      try { localStorage.setItem(PICK_KEY, key); } catch { /* storage blocked */ }
      reveal(el, tokMs('--dur-reveal'));
    }, { threshold: 1 });
    el.querySelectorAll('.ld-join, .ld-pjoin').forEach((j) => io.observe(j));
    return () => io.disconnect();
  }, [sec, key]);
}
function reveal(el: HTMLElement, R: number) {
  const ink = tokEase('--ease-draw'), out = tokEase('--ease-out'), q = (s: string) => Array.from(el.querySelectorAll(s));
  const fill = (j: Element, at: number) => {
    const bg = getComputedStyle(j).backgroundColor;
    play(j, [{ backgroundColor: 'transparent', scale: '0.6' }, { backgroundColor: bg, scale: '1' }], R * 0.12, { delay: R * at, ease: out });
  };
  q('.ld-place.is-pick').forEach((p) => play(p, [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }], R * 0.15, { ease: ink, pseudo: '::after' }));
  q('.ld-p.is-pick').forEach((p) => wipe(p, R * 0.4, R * 0.1, ink));
  q('.ld-join').forEach((j) => fill(j, 0.5));
  q('.ld-pick').forEach((p) => play(p, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], R * 0.2, { delay: R * 0.62, ease: out }));
  /* the phone: the trunk's join fills, then the pick comes in under it */
  q('.ld-pjoin').forEach((j) => fill(j, 0.2));
  q('.ld-phonepick > :not(.ld-pjoin)').forEach((p) => play(p, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], R * 0.2, { delay: R * 0.35, ease: out }));
}
