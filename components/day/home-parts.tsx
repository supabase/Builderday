'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CITIES, EVENT, CITY_WORD, CITY_WORD_CAP } from '@/lib/day-data';
import type { HomeCity, HomeWorld } from '@/lib/home';
import { dur, fmtN, hhmm, ord, tz } from '@/lib/format';
import { StateChip } from '@/components/screen/chip';
import { Flash, countDelta } from '@/components/screen/flash';
import { FlapText, type FlapOpts } from '@/components/board/flap';
import { TestCard, seedOf } from '@/components/board/test-card';
import { Bug } from '@/components/board/bug';
import { DayGlobe } from '@/components/board/day-globe';
import { Segment } from '@/components/board/segment';
import { Switches } from '@/components/board/prefs';
import { useHold } from '@/components/board/hold';
import { useSecond, type DayClock } from '@/components/board/clock';
import { CODE, cityWord, focusCity, globeLabel, lights, type Day } from '@/components/board/day-model';
import type { PartsCfg } from '@/components/board/config';
import { Picture } from '@/components/pictures/picture';
import { Thumb } from './rank-pictures';
import { cityPrizeName, finalCount, finalLine, globalPrizeName, places } from '@/components/home/final-parts';
import { LiveSegment } from './shared';

/* The home on the day, as parts the three directions share: the opening (name, date, what is on now and the time left),
   the board of the cities, the wall of monitors, the final as one cell per finalist, the prizes and the footer. Every
   number comes from the home's world at the board's minute. Class prefixes: dh hero, db board, dw wall, dt thirty,
   dp prizes, df footer, fx fastext. */

export type Href = (id: string) => string;
export type Look = Pick<PartsCfg, 'mark' | 'cardBars' | 'cardPalette' | 'cards' | 'segSecs' | 'bugCorner'> & { flap: FlapOpts };

const q = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/* the date as the pages say it: 10 December 2026 */
export const DATE = EVENT.day + ' ' + MONTHS[EVENT.month - 1] + ' ' + EVENT.year;
/* minutes left, as a board says it */
export function fmtLeft(m: number): string { return m < 1 ? 'now' : m < 60 ? Math.ceil(m) + ' min' : dur(m, true); }

/* what comes next for a city: the word, the local time of it, and the minutes to it */
export function nextOf(x: HomeCity, W: HomeWorld): { what: string; at: number; left: number | null } {
  const off = x.city.offset;
  if (x.state === 'next') return { what: 'Opens', at: x.start + off, left: x.start - W.now };
  if (x.state === 'build') return { what: 'Entries close', at: x.buildEnd + off, left: x.buildEnd - W.now };
  if (x.state === 'vote') return { what: 'Votes close', at: x.end + off, left: x.end - W.now };
  return { what: 'Closed', at: x.end + off, left: null };
}
/* the day's final for the how-it-works drawings: the same count as the final table (a closed city counts the finalists
   it has, an open one three), the cells a closed city leaves empty, and the real pick once made */
export const dayFinalOf = (W: HomeWorld): { finalists: number; pick?: number; empty: number[] } => {
  const fc = W.cs[W.final.city.i], at = fc ? fc.top.findIndex((t) => t.p.id === W.final.p.id) : -1, top = EVENT.finalists, empty: number[] = [];
  W.cs.forEach((x, i) => { if (x.state === 'done') for (let k = x.top.length; k < top; k++) empty.push(i * top + k); });
  return { finalists: finalCount(W).of, empty, pick: W.picked && at >= 0 ? W.final.city.i * top + at : undefined };
};
const leadOf = (x: HomeCity) => (x.state === 'done' ? (x.top[0] ? { p: x.top[0].p, v: x.top[0].v } : null) : x.lead ?? null);
const entriesOf = (x: HomeCity) => (x.state === 'next' ? 0 : x.state === 'build' ? x.n ?? 0 : x.entries);
export const cardCity = (x: HomeCity) => ({ id: x.id, name: x.name, code: CODE[x.id], opens: x.start, offset: x.city.offset });

/* ---------- the opening ---------- */
function PickSegment({ clock, first, at }: { clock: DayClock; first: number; at: number }) {
  const s = useSecond(clock, first), secs = at * 60 - s;
  return <Segment secs={secs} lit="CLOSED" label={'The pick is in ' + Math.max(1, Math.round(secs / 60)) + ' minutes.'} withSecs />;
}
export function Hero({ W, day, clock, first, href, segSecs, globe, mine, children }: {
  W: HomeWorld; day: Day; clock: DayClock; first: number; href: Href; segSecs: boolean; globe?: 'edge' | 'none';
  /* the visitor's own city (a place on its list): its builders vote from the start, everyone else from publicAt */
  mine?: string | null; children?: ReactNode;
}) {
  const fx = focusCity(W), n = nextOf(fx, W);
  const early = (fx.state === 'build' || fx.state === 'vote') && fx.publicAt != null && W.now < fx.publicAt && mine !== fx.id;
  const now = W.picked ? null : W.allDone ? { k: 'The final', t: 'The pick is at ' + hhmm(W.S.pickAt) + ' UTC' }
    : { k: fx.name, t: n.what + ' at ' + hhmm(n.at) + ' local' };
  return (
    <section className="dh" aria-labelledby="dh-h" data-hero-globe={globe ?? 'none'}>
      <div className="dh-text">
        <p className="bd-k dh-k"><span className="dh-kp">{DATE}</span> <span className="dh-kp"><span className="dh-dot">· </span>{CITY_WORD} cities, east to west</span></p>
        {W.picked ? <><p className="dh-hk">Picked</p><h1 id="dh-h" className="dh-h dh-hp">{W.final.p.name}</h1></> : <h1 id="dh-h" className="dh-h">{EVENT.name}</h1>}
        {W.picked ? null : <p className="dh-sub">Each city builds for {day.buildMin} minutes from its own start and votes from the start until {dur(day.voteAfter)} after. The top 3 in each city go to the final, and {EVENT.pickers} pick one of them.</p>}
        {now ? (
          <div className="dh-now">
            <p className="dh-nk"><span className="bd-k">{W.allDone || fx.state === 'next' ? 'Next' : 'Now'}</span> {now.k} <span className="dh-nt"><span className="dh-dot">· </span>{now.t}</span></p>
            {W.allDone ? <PickSegment clock={clock} first={first} at={W.S.pickAt} /> : <LiveSegment clock={clock} first={first} x={fx} withSecs={segSecs} name={fx.name} />}
            {W.allDone ? <p className="dh-go"><a className="dh-btn" href="#final">See the {W.finalists.length} finalists<span aria-hidden="true">→</span></a></p> : (
              <p className="dh-go"><Link className="dh-btn" href={href(fx.id)}>{fx.state === 'next' ? 'See ' + fx.name : early ? 'Watch ' + fx.name : 'Vote in ' + fx.name}<span aria-hidden="true">→</span></Link>
                {early ? <span className="bd-k">Everyone votes from {hhmm(fx.publicAt! + fx.city.offset)} local</span> : null}
                {W.live.length > 1 ? <span className="bd-k">{W.live.length} cities are live</span> : null}</p>
            )}
          </div>
        ) : (
          <div className="dh-now">
            <p className="dh-sub">{finalLine(W)} The top 3 of each city made the final.</p>
            <p className="dh-go"><Link className="dh-btn" href={href(W.final.city.id)}>See {W.final.city.name}<span aria-hidden="true">→</span></Link></p>
          </div>
        )}
        {children}
      </div>
      {globe === 'edge' ? <div className="dh-globe"><DayGlobe lights={lights(W)} minute={W.now} face={-0.55} label={globeLabel(W)} /></div> : null}
    </section>
  );
}

/* ---------- the departures board ---------- */
function Lane({ x, W, span }: { x: HomeCity; W: HomeWorld; span: [number, number] }) {
  const [a, b] = span, X = (m: number) => q(((Math.min(b, Math.max(a, m)) - a) / (b - a)) * 100), now = X(W.now);
  const past = Math.min(Math.max(W.now, x.start), x.end);
  return (
    <svg className="db-lane-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <rect className="ln-plan" x={X(x.start)} y={4} width={q(X(x.buildEnd) - X(x.start))} height={4} />
      <rect className="ln-vote" x={X(x.buildEnd)} y={5} width={q(X(x.end) - X(x.buildEnd))} height={2} />
      {W.now > x.start ? <rect className="ln-done" x={X(x.start)} y={4} width={q(X(past) - X(x.start))} height={4} /> : null}
      <line className="ln-now" x1={now} x2={now} y1={0} y2={12} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function LaneHead({ W, span }: { W: HomeWorld; span: [number, number] }) {
  const [a, b] = span, hours: number[] = [];
  for (let h = Math.ceil(a / 360) * 360; h <= b; h += 360) hours.push(h);
  return <span className="db-lanehead">{hours.map((h) => <span key={h} style={{ left: q(((h - a) / (b - a)) * 100) + '%' }}>{hhmm(h)}</span>)}<span className="sr-only">Hours in UTC; the line is now, {hhmm(W.now)} UTC</span></span>;
}

export function Board({ W, day, look, href, tick, strips, pic }: { W: HomeWorld; day: Day; look: Look; href: Href; tick: number; strips?: boolean; pic?: boolean }) {
  const h = useHold(W), V = h.shown, span: [number, number] = [V.S.first - 30, V.S.last + 30];
  return (
    <section className="db" aria-labelledby="db-h" data-strips={strips ? '' : undefined} {...h.props}>
      <div className="db-top">
        <h2 id="db-h" className="db-h">{CITY_WORD_CAP} cities</h2>
        <span className="bd-k db-note">{V.allDone ? 'East to west. Every city has closed.' : <>East to west. The board turns every {tick} s{h.held ? '; held while you read it' : ''}.</>}</span>
      </div>
      <table className="db-t" role="table">
        <caption className="sr-only">The {CITY_WORD} cities at {hhmm(V.now)} UTC: state, leader, votes, entries and what comes next.</caption>
        <thead><tr>
          <th scope="col" className="db-city">City</th><th scope="col" className="db-local">Local</th><th scope="col" className="db-st">State</th>
          <th scope="col" className="db-lead">Leader</th><th scope="col" className="db-v">Leader&rsquo;s votes</th><th scope="col" className="db-n">Entries</th><th scope="col" className="db-next">Next</th>
          {strips ? <th scope="col" className="db-lane"><LaneHead W={V} span={span} /></th> : null}
        </tr></thead>
        <tbody role="rowgroup">{V.cs.map((x) => {
          const n = nextOf(x, V), word = cityWord(x, V, day), lead = leadOf(x);
          return (
            <tr key={x.id} role="row" className="db-row" data-state={x.state}>
                            <th scope="row" role="rowheader" className="db-city"><Link href={href(x.id)}><span className="db-code">{CODE[x.id]}</span> <span className="db-name">{x.name}</span></Link></th>
              <td role="cell" className="db-local"><span className="db-cap">Local </span>{hhmm(V.now + x.city.offset)}</td>
              <td role="cell" className="db-st"><StateChip s={word} /></td>
              <td role="cell" className="db-lead" title={lead?.p.name} data-pic={pic ? '' : undefined}>{pic ? <span className="db-lp">{lead ? <Thumb p={lead.p} w={72} /> : <span className="rp-tube db-blank" aria-hidden="true" />}</span> : null}{lead ? <><FlapText text={lead.p.name} opts={look.flap} className="fp-clip" />{word === 'picked' ? <span className="db-pk">Picked: {V.final.p.name}, {ord(V.final.place)}</span> : null}</> : <span className="db-mute">{x.state === 'next' ? 'Not open yet' : x.state === 'build' ? 'No entries yet' : 'No entries'}</span>}</td>
              <td role="cell" className="db-v">{lead ? <Flash value={lead.v} mark={look.mark} delta={countDelta}>{fmtN(lead.v)}</Flash> : <span className="db-mute">–</span>}{lead ? <span className="db-cap"> votes</span> : null}</td>
              <td role="cell" className="db-n">{x.state === 'next' ? <span className="db-mute">–</span> : <><Flash value={entriesOf(x)} mark={look.mark}>{fmtN(entriesOf(x))}</Flash><span className="db-cap"> in</span></>}</td>
              <td role="cell" className="db-next"><span className="db-what">{n.what} {hhmm(n.at)}<span className="db-cap"> local</span></span>{n.left != null ? <span className="db-left">{fmtLeft(n.left)}</span> : null}</td>
              {strips ? <td className="db-lane"><Lane x={x} W={V} span={span} /></td> : null}
            </tr>
          );
        })}</tbody>
      </table>
    </section>
  );
}

/* ---------- the control wall ---------- */
export function Wall({ W, day, look, href }: { W: HomeWorld; day: Day; look: Look; href: Href }) {
  const h = useHold(W), V = h.shown;
  return (
    <section className="dw" aria-labelledby="dw-h" {...h.props}>
      <div className="db-top">
        <h2 id="dw-h" className="db-h">{CITY_WORD_CAP} cities</h2>
        <span className="bd-k db-note">East to west. A test card before a city opens, its leader while it is live, its finalists after{h.held ? '; held while you read it' : ''}.</span>
      </div>
      <ol className="dw-grid">{V.cs.map((x) => {
        const n = nextOf(x, V), lead = leadOf(x), word = cityWord(x, V, day), c = cardCity(x), seed = look.cards[x.id] ?? seedOf(x.id);
        const live = x.state === 'build' || x.state === 'vote';
        const say = x.name + ': ' + (lead ? (x.state === 'done' ? 'first, ' : 'leading, ') + lead.p.name + ' with ' + fmtN(lead.v) + ' votes. ' : '') + n.what + ' ' + hhmm(n.at) + ' local.';
        return (
          <li key={x.id} className="dw-mon" data-state={x.state}>
            <Link href={href(x.id)} className="dw-link" aria-label={say}>
              <span className="dw-bar"><span className="dw-code">{CODE[x.id]}</span><span className="dw-name">{x.name}</span><span className="dw-local">{hhmm(V.now + x.city.offset)}</span></span>
              <span className="dw-screen">
                {live && lead ? (<><Picture p={lead.p} cls="dw-pic" /><Bug code={CODE[x.id]} place="1st" votes={fmtN(lead.v)} left={n.left != null ? fmtLeft(n.left) : ''} corner={look.bugCorner} /></>)
                  : <TestCard city={c} seed={seed} bars={look.cardBars} palette={look.cardPalette} closedown={x.state === 'done'} finalists={x.top.map((t) => ({ place: t.place, name: t.p.name, votes: t.v }))}
                      line={live ? 'Building · no entries yet' : undefined} />}
              </span>
              <span className="dw-foot"><StateChip s={word} /><span className="dw-lead">{live && lead ? lead.p.name : x.state === 'done' ? (x.top.length ? '1st ' + x.top[0].p.name : 'No entries') : 'Opens ' + hhmm(n.at)}</span><span className="dw-left">{n.left != null ? fmtLeft(n.left) : ''}</span></span>
            </Link>
          </li>
        );
      })}</ol>
    </section>
  );
}

/* ---------- the final as thirty cells ---------- */
export function Thirty({ W, href }: { W: HomeWorld; href: Href }) {
  return (
    <section className="dt" id="final" aria-labelledby="dt-h">
      <div className="dt-top"><h2 id="dt-h" className="db-h">The final</h2></div>
      <p className="dt-line">{finalLine(W)}</p>
      <ol className="dt-cols">{W.cs.map((x) => (
        <li key={x.id} className="dt-col" data-state={x.state}>
          <Link className="dt-code" href={href(x.id)}><span>{CODE[x.id]}</span> <span className="bd-k">{x.state === 'done' ? 'Final' : x.state === 'next' ? 'Opens ' + hhmm(x.start + x.city.offset) : 'Now'}</span></Link>
          <ol className="dt-cells">{places(x, W).map((p) => (
            <li key={p.k} className="dt-c" data-sure={p.sure}>
              <span className="dt-p">{ord(p.k + 1)}</span>
              {p.t ? <><span className="dt-n" title={p.t.p.name}>{p.t.p.name}</span><span className="dt-v">{fmtN(p.t.v)}</span></>
                : <span className="dt-n db-mute">{x.state === 'next' ? '–' : 'No entry'}</span>}
            </li>
          ))}</ol>
        </li>
      ))}</ol>
    </section>
  );
}

/* ---------- prizes and footer ---------- */
export function Prizes({ W }: { W?: HomeWorld }) {
  return (
    <section className="dp" id="day-prizes" aria-labelledby="dp-h">
      <div className="dt-top"><h2 id="dp-h" className="db-h">Prizes</h2></div>
      <dl className="dp-cells">
        <div><dt className="bd-k">First place in each city</dt><dd className="dp-what">{cityPrizeName()}</dd><dd className="bd-k">Ten, one per city</dd></div>
        <div><dt className="bd-k">The pick from the finalists</dt><dd className="dp-what">{globalPrizeName()}</dd><dd className="bd-k">{W?.picked ? 'Won by ' + W.final.p.name + ', ' + W.final.city.name : 'Picked by ' + EVENT.pickers}</dd></div>
      </dl>
    </section>
  );
}
export function DayFooter({ href, sound }: { href: Href; sound: boolean }) {
  return (
    <footer className="df">
      <nav aria-label={`The ${CITY_WORD} cities`}><ul className="df-cities">{CITIES.map((c) => <li key={c.id}><Link href={href(c.id)}><span className="dw-code">{CODE[c.id]}</span> {c.name} <span className="bd-k">{tz(c.offset)}</span></Link></li>)}</ul></nav>
      <div className="df-end"><Switches sound={sound} /><span className="bd-k">{EVENT.name} · {DATE}</span></div>
    </footer>
  );
}

/* ---------- fastext: four keys along the bottom ---------- */
export type Key = { label: string; href: string; tone: 'blue' | 'orange' | 'ink' | 'grey' };
export function Fastext({ keys }: { keys: Key[] }) {
  return <nav className="fx" aria-label="Quick keys"><ul>{keys.map((k) => <li key={k.label}><Link href={k.href} data-tone={k.tone}><i aria-hidden="true" /><span>{k.label}</span></Link></li>)}</ul></nav>;
}
export function homeKeys(W: HomeWorld, href: Href): Key[] {
  const fx = focusCity(W), prev = W.cs[(fx.i + 9) % 10], next = W.cs[(fx.i + 1) % 10];
  return [
    { label: prev.name, href: href(prev.id), tone: 'blue' }, { label: next.name, href: href(next.id), tone: 'orange' },
    { label: 'The final', href: '#final', tone: 'ink' }, { label: W.allDone ? 'Prizes' : 'Vote in ' + fx.name, href: W.allDone ? '#day-prizes' : href(fx.id), tone: 'grey' },
  ];
}
