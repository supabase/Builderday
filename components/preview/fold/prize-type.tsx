'use client';
import { useEffect, useRef } from 'react';
import { PRIZE_SHEET, credits, specLine } from '@/lib/prizes';
import { reducedMotion } from './flap';
import './prize-type.css';

/* Prizes in big type, no pictures: each prize's name as large as its place (the global 1st the largest, the city
   prizes the smallest), its place, spec and price, and credits beside it in small words. The names are the section's
   headings and stand plain (no screen lines).
   Arriving (the page's tube arrivals), each list's names rise into their lines once, as that list comes into view,
   `step` apart, the words fading in after them; hidden only once this script has armed it, so without it, or under
   reduced motion, everything simply shows. */

const G = PRIZE_SHEET.global, C = PRIZE_SHEET.city;
const ORD = ['1st', '2nd', '3rd'];

type Line = { rank: string; place: string; green?: boolean; thing: string; spec: string | null; plus: string };
const GLOBAL: Line[] = G.map((g, i) => ({ rank: 'g' + g.place, place: 'Global ' + ORD[i], green: i === 0, thing: g.thing!, spec: specLine(g), plus: '+ ' + credits(g) }));
const CITY: Line[] = [
  { rank: 'c1', place: '1st in the city', green: true, thing: C.winner.thing!, spec: specLine(C.winner), plus: '+ ' + credits(C.winner) + ' and a swag box' },
  { rank: 'c2', place: '2nd and 3rd in the city', thing: '$' + C.finalist.credits + ' in credits', spec: null, plus: 'Supabase credits and a swag box, each' },
];

export function FoldPrizeType({ cities, finalists, auto, ms, step }: { cities: number; finalists: number; auto: boolean; ms: number; step: number }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const lists = Array.from(el.querySelectorAll<HTMLElement>('.pt-list'));
    el.removeAttribute('data-armed'); lists.forEach((l) => l.removeAttribute('data-in'));
    if (!auto || ms <= 0 || reducedMotion()) return;
    /* each list rises as it nears the screen, so the city prizes are not spent while far below it;
       a list already on screen (a reload part way down) shows at once */
    const stops = lists.map((l) => {
      const r = l.getBoundingClientRect();
      if (r.top < innerHeight * 0.8 && r.bottom > 0) { l.setAttribute('data-in', ''); return () => {}; }
      /* a list starts rising a little before it reaches the screen, so it is already there when it arrives */
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); l.setAttribute('data-in', ''); } }, { rootMargin: '0px 0px 25% 0px' });
      io.observe(l); return () => io.disconnect();
    });
    el.setAttribute('data-armed', '');
    return () => stops.forEach((f) => f());
  }, [auto, ms]);
  const line = (l: Line, i: number) => (
    <li key={l.rank} className="pt-line" data-rank={l.rank} style={{ ['--i' as string]: i }}>
      <h3 className="pt-name" data-sk-skip=""><span>{l.thing}</span></h3>
      <div className="pt-meta">
        <p className="pt-place" data-green={l.green ? '' : undefined}>{l.place}</p>
        {/* each part of the spec holds together: a narrow column breaks the line only at " · " */}
        {l.spec ? <p className="pt-spec">{l.spec.split(' · ').map((part, k) => <span key={k}>{k ? ' · ' : ''}<span className="pt-spec-p">{part}</span></span>)}</p> : null}
        <p className="pt-plus">{l.plus}</p>
      </div>
    </li>
  );
  return (
    <section ref={root} id="prizes" className="pf-part pt" data-part="prizes" aria-labelledby="prizes-h" style={{ ['--pt-ms' as string]: ms + 'ms', ['--pt-step' as string]: step + 'ms' }}>
      <h2 id="prizes-h" className="pf-h">Prizes</h2>
      <p className="pt-lede">The top 3 in each of the {cities} cities win there, then go on to the global final: {PRIZE_SHEET.picker} picks 1st, 2nd and 3rd from all {finalists}, {PRIZE_SHEET.announce}.</p>
      <p className="pt-tier">The global final</p>
      <ol className="pt-list">{GLOBAL.map(line)}</ol>
      <p className="pt-tier">In each of the {cities} cities</p>
      <ul className="pt-list">{CITY.map(line)}</ul>
    </section>
  );
}
