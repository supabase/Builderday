'use client';
import { CITIES, EVENT, CITY_WORD, SCHED } from '@/lib/day-data';
import { PRIZES } from '@/lib/prizes';
import { CODE } from '@/lib/places';
import savedScope from '@/saved/explain.config.json';
import savedNeo from '@/saved/neo.config.json';
import { NeoPrize, clampNeo, type NeoLook } from './neo';
import { clampScope, type Facts, type ScopeCfg } from './scope';
import { Tube } from './tube';
import { NeoGlass, PrizeGlass } from './prize-glass';
import { dayFacts } from './explain-facts';
import { PrizeText } from './prize-text';
import type { WheelCfg } from '@/components/wheel/config';
import { DayTour, type LineClock } from './step-through';

/* How the day works and what it gives away, drawn on tubes (scope.ts): the build clock running down while the beam
   draws an app, votes arriving, thirty finalists becoming one pick; then the prizes, $10,000 rolling in on flaps and a
   laptop drawing itself. The look and every timing come from saved/explain.config.json, tuned at /lab/explain.
   Used in the wheel's sheet (the preview home), on the day home and on a city page. The register link goes to the
   city's Luma event (lib/luma.ts). */

/* the register link lives in lib/luma.ts; kept here for the pages that import it from this file */
export { LUMA, lumaHref } from '@/lib/luma';

export type ExplainFacts = { buildMin: number; voteAfter: number; startHour: number };
const SAVED = clampScope(savedScope as Partial<ScopeCfg>);
/* the city prize's drawing (neo: drawn), tuned at /lab/neo */
const NEO = clampNeo(savedNeo as Partial<NeoLook>);
const cap = (s: string) => s.replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase());
/* finalists and pick: the day's own count and pick once they are known, so this agrees with the rest of the page */
export type DayFinal = { finalists?: number; pick?: number; empty?: number[]; city?: string };
export const facts = (f?: ExplainFacts, d?: DayFinal): Facts => {
  const df = dayFacts();
  return { buildMin: f?.buildMin ?? 90, voteAfter: f?.voteAfter ?? 30, startHour: f?.startHour ?? SCHED.startHour, codes: CITIES.map((c) => CODE[c.id]), top: EVENT.finalists, cities: df.cities, seedPick: df.seedPick, pickAt: df.pickAt, prize: PRIZES.global.what ?? undefined, pickers: EVENT.pickers, cityPrize: PRIZES.city.what ?? undefined, ...d };
};

const H = ({ level, id, children }: { level: 2 | 3; id: string; children: string }) => (level === 3 ? <h3 id={id} className="ex-h">{children}</h3> : <h2 id={id} className="ex-h">{children}</h2>);

/* the three steps: one tube steps through the day (step-through.tsx), or a tube per step */
export function HowItWorks({ f, compact = false, id = 'how', scope, day, level = 2, speed, onClock, strip }: { f: ExplainFacts; compact?: boolean; id?: string; scope?: ScopeCfg; day?: DayFinal; level?: 2 | 3; speed?: number; onClock?: (c: LineClock | null) => void; strip?: React.ReactNode }) {
  const cfg = scope ?? SAVED, top = EVENT.finalists, F = facts(f, day), fin = F.finalists ?? top * CITIES.length, layout = cfg.layout;
  const steps = [
    { scene: 'build' as const, k: 'Build', t: f.buildMin + ' minutes to build', p: 'Build something new with Supabase in ' + f.buildMin + ' minutes. Submit it on your city’s page or from your editor.' },
    { scene: 'vote' as const, k: 'Vote', t: 'Votes from the first minute', p: 'Voting opens when building starts and closes ' + f.voteAfter + ' minutes after it ends. Anyone with the link can vote, so share your project while you build.' },
    { scene: 'final' as const, k: 'Final', t: fin + ' finalists, one winner', p: 'The top ' + top + ' in each city go to the final. ' + EVENT.pickers + ' pick one of the ' + fin + '.' },
  ];
  const accent = { ['--ex-accent' as string]: cfg.accent === 'orange' ? '#ff7a1a' : '#3ecf8e' };
  /* one tube for the day: the step-through */
  if (layout === 'reel') return <DayTour cfg={cfg} F={F} steps={steps} day={f} compact={compact} id={id} heading={<H level={level} id={id + '-h'}>How it works</H>} style={accent} speed={speed} onClock={onClock} strip={strip} />;
  return (
    <section id={id} className="ex" data-compact={compact ? '' : undefined} data-layout={layout} aria-labelledby={id + '-h'} style={accent}>
      <div className="ex-top"><H level={level} id={id + '-h'}>How it works</H></div>
      <ol className="ex-mons">
        {steps.map((s) => (
          <li key={s.k} className="ex-mon">
            <Tube scene={s.scene} cfg={cfg} f={F} what={s.k.toLowerCase() + ' drawing'} className="ex-tube" />
            <span className="ex-umd"><span className="ex-k">{s.k}</span><span className="ex-t">{s.t}</span></span>
            <p className="ex-p">{s.p}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* the prizes: the global one on flaps, the city prize as a laptop drawing itself, with the cities under it */
/* text: the wheel's config, when the page's globe is the text globe (the preview): the pick's globe is then the text
   globe and the small globes are dots (prize-text.tsx); the day pages never pass it */
export function PrizeBlock({ compact = false, id = 'prize', winner, scope, f, day, level = 2, neo, text, arrive = false }: { arrive?: boolean; compact?: boolean; id?: string; winner?: string | null; scope?: ScopeCfg; f?: ExplainFacts; day?: DayFinal; level?: 2 | 3; neo?: NeoLook; text?: WheelCfg }) {
  const cfg = scope ?? SAVED, g = PRIZES.global.what, c = PRIZES.city.what, F = facts(f, day), fin = F.finalists ?? EVENT.finalists * CITIES.length, mode = cfg.prize;
  const amount = g ? cap(g) : 'To be announced', item = c ? cap(c) : 'To be announced';
  /* the rule for who wins sits on the same block as the prize, and a prize given ten times says so */
  const who = winner ? 'Won by ' + winner : 'One winner, picked from the ' + fin + ' finalists by ' + EVENT.pickers;
  const cities = F.cities ?? [], pickCity = F.pick !== undefined ? cities[Math.floor(F.pick / F.top)] : null;
  const cash = mode === 'flaps' ? { ...cfg, cash: 'flap' as const } : mode === 'nixie' ? { ...cfg, cash: 'nixie' as const } : cfg;
  const codes = <ul className="ex-codes" aria-label={`One in each of the ${CITY_WORD} cities`}>{CITIES.map((x) => <li key={x.id}>{CODE[x.id]}</li>)}</ul>;
  if (mode === 'docket') return (
    <section id={id} className="ex ex-prize ex-docket" data-compact={compact ? '' : undefined} aria-labelledby={id + '-h'}>
      <div className="ex-top"><H level={level} id={id + '-h'}>Prizes</H></div>
      <p className="ex-k ex-dk-k">The winner</p>
      <dl className="ex-dk">
        <div><dt>Prize</dt><dd className="ex-dk-big">{amount}</dd></div><div><dt>To whom</dt><dd>{winner ? winner : 'One of the ' + fin + ' finalists'}</dd></div><div><dt>Picked by</dt><dd>{EVENT.pickers}</dd></div>
      </dl>
      <p className="ex-k ex-dk-k">City prize</p>
      <dl className="ex-dk">
        <div><dt>Prize</dt><dd className="ex-dk-big">{item} ×{CITIES.length}</dd></div><div><dt>To whom</dt><dd>1st place in each city</dd></div><div><dt>Cities</dt><dd>{codes}</dd></div>
      </dl>
    </section>
  );
  return (
    <section id={id} className="ex ex-prize" data-compact={compact ? '' : undefined} data-prize={mode} aria-labelledby={id + '-h'}>
      <div className="ex-top"><H level={level} id={id + '-h'}>Prizes</H></div>
      <div className="ex-glob">
        <span className="ex-k">{mode === 'tubes' ? 'The winner from the ' + fin + ' finalists' : 'The winner'}</span>
        {mode === 'glass' && text
          ? <PrizeText amount={amount} cities={cities} cfg={text} arrive={arrive} rule={<p className="ex-t ex-rule" data-sk-skip><span className="ex-sr">{amount}. </span>{who}</p>} />
          : mode === 'glass'
          ? <PrizeGlass amount={amount} cities={cities} lit={pickCity} cfg={{ mirror: cfg.gMirror, through: cfg.gThrough, fringe: cfg.gFringe, turn: cfg.gTurn, size: cfg.gSize, row: !!cfg.gRow, on: !!cfg.gOn, big: cfg.gBig, touch: cfg.gTouch }} />
          : <Tube scene="cash" cfg={cash} f={F} what="prize drawing" className="ex-tube" />}
        {mode === 'tubes'
          ? <><p className="ex-big" data-sk-skip>{amount}</p><span className="ex-t">{winner ? 'Won by ' + winner : 'Picked by ' + EVENT.pickers}</span></>
          : mode === 'glass' && text ? null
          : <p className="ex-t ex-rule" data-sk-skip>{mode === 'glass' ? <><span className="ex-sr">{amount}. </span>{who}</> : <><b>{amount}</b> · {who}</>}</p>}
      </div>
      <div className="ex-city">
        <span className="ex-k">{mode === 'tubes' ? 'First place in each city' : 'City prize'}</span>
        {cfg.neo === 'drawn'
          ? <NeoPrize cfg={neo ?? NEO} cities={CITIES.map((x) => CODE[x.id])} />
          : cfg.neo === 'glass'
          ? <NeoGlass cfg={{ mirror: cfg.gMirror, through: cfg.gThrough, fringe: cfg.gFringe, turn: cfg.gTurn, lid: cfg.nLid, deck: cfg.nDeck, screen: cfg.nScreen, rim: cfg.nRim, streak: cfg.nStreak, white: cfg.nWhite, globe: cfg.nGlobe, gx: cfg.nGx, gy: cfg.nGy }} />
          : <Tube scene="neo" cfg={cfg} f={F} what="laptop drawing" className="ex-tube" />}
        <p className="ex-what" data-sk-skip>{mode === 'tubes' ? item : <><b>{item}</b> ×{CITIES.length}</>}</p>
        {mode === 'tubes' ? null : <span className="ex-t">1st place in each city</span>}
        {codes}
      </div>
    </section>
  );
}
