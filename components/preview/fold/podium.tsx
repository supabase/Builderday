'use client';
import { useEffect, useRef } from 'react';
import { PrizePhoto } from '@/components/prize/prize-photo';
import { clampPhoto, type Photo, type PhotoLook } from '@/components/prize/photo';
import photoSaved from '@/saved/prize-photo.config.json';
import { PRIZE_SHEET, credits, specLine } from '@/lib/prizes';
import { once } from './motion';
import { reducedMotion } from './flap';
import './podium.css';

/* Prizes as a podium. The three global prizes stand on stepped plinths (the site's dotted grid, 1st tallest, its top
   edge the one green), each printed from its press photo in the site's look (hover one for the photo itself); the
   city prizes under them, the Meta Quest beside the credits amount, which stands in for a picture.
   Arriving (the page's tube arrivals), the stands are written in the way a ceremony calls them: 3rd, 2nd, then 1st,
   one `step` apart, then the city row. A cut each, as the board's rows are; under reduced motion all at once. */

const LOOK = clampPhoto(photoSaved as Partial<PhotoLook>);
const G = PRIZE_SHEET.global, C = PRIZE_SHEET.city;
const OBJ: Photo[] = ['pro', 'mini', 'neo'];
const PLACE = ['1st', '2nd', '3rd'];
/* the order each part is written in: 3rd, 2nd, 1st, then the city row */
const AT = [2, 1, 0];

export function FoldPodium({ city, auto, step }: { city: string; auto: boolean; step: number }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const parts = Array.from(el.querySelectorAll<HTMLElement>('[data-pf-wait]')).sort((a, b) => +(a.dataset.at ?? 0) - +(b.dataset.at ?? 0));
    if (!auto || step <= 0 || reducedMotion()) { parts.forEach((p) => p.removeAttribute('data-pf-wait')); return; }
    const timers: number[] = [];
    /* once a fifth of the stands are in view, so 3rd is never written off screen */
    const stop = once(el.querySelector('.pz-steps') ?? el, 0.2, () => parts.forEach((p, i) => timers.push(window.setTimeout(() => p.removeAttribute('data-pf-wait'), i * step))));
    return () => { stop(); timers.forEach((t) => window.clearTimeout(t)); };
  }, [auto, step]);
  const wait = auto ? '' : undefined;
  return (
    <section ref={root} id="prizes" className="pf-part pz" data-part="prizes" aria-labelledby="prizes-h">
      <h2 id="prizes-h" className="pf-h">Prizes</h2>
      <p className="pz-k"><b>The global final.</b> The Supabase team picks 1st, 2nd and 3rd from all 42 finalists, {PRIZE_SHEET.announce}.</p>
      <ol className="pz-steps">
        {G.map((g, i) => (
          <li key={g.place} data-place={g.place} data-pf-wait={wait} data-at={AT[i]}>
            <div className="pz-stand">
              <PrizePhoto p={OBJ[i]} look={LOOK} alt={'A ' + (g.thing ?? '')} className="pz-art" quiet />
              <div className="pz-plinth" aria-hidden="true"><span>{g.place}</span></div>
            </div>
            <div className="pz-words">
              <p className="pz-place" data-green={i === 0 ? '' : undefined}>Global {PLACE[i]}</p>
              <h3 className="pz-thing">{g.thing}</h3>
              <p className="pz-spec" data-empty={g.spec ? undefined : ''}>{specLine(g) ?? ' '}</p>
              <p className="pz-plus">+ {credits(g)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="pz-k"><b>In each of the 14 cities.</b> The 3 projects with the most votes in {city} and every other city.</p>
      <div className="pz-city" data-pf-wait={wait} data-at={3}>
        <div className="pz-city-one">
          <PrizePhoto p="quest" look={LOOK} alt={'A ' + (C.winner.thing ?? '')} className="pz-art" quiet />
          <div className="pz-words">
            <p className="pz-place" data-green="">1st in the city</p>
            <h3 className="pz-thing">{C.winner.thing}</h3>
            <p className="pz-spec">{specLine(C.winner)}</p>
            <p className="pz-plus">+ {credits(C.winner)} and a swag box</p>
          </div>
        </div>
        <div className="pz-city-two">
          <p className="pz-amount" aria-hidden="true">${C.finalist.credits}</p>
          <div className="pz-words">
            <p className="pz-place">2nd and 3rd</p>
            <h3 className="pz-thing pz-thing-s"><span className="sr-only">${C.finalist.credits} </span>In Supabase credits, each</h3>
            <p className="pz-plus">+ a swag box each</p>
          </div>
        </div>
      </div>
    </section>
  );
}
