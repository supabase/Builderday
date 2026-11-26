'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CITIES, EVENT, SCHED, EPOCH, sched } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { placeTime } from '@/lib/stage/rows';
import { TO_VOTE } from '@/lib/stage/deck';
import { PRIZES } from '@/lib/prizes';
import type { Project } from '@/lib/data';
import { drawOf, type Ranked, type World } from '@/lib/stage/world';
import { click, unlock } from '@/components/wheel/click';
import { Door, In, Num, Others, Pic, Countdown, Words, mmss, bare } from './parts';
import type { SceneProps } from './intro';
import type { BoardView } from '@/lib/stage/types';
import { useWall } from './use';
import { hasFinal, hasVote, type WallEvent } from '@/lib/stage/event';

/* The live scenes, 14 to 18, drawn from the city's world at the wall's second (counts, the countdown) or at its board
   tick (the ranking, which re-sorts on a tick and glides). Each survives the worst cases: no entries, 182 entries, the
   longest name, and a tie at third. */

export type LiveProps = SceneProps & { ranked: World; chart: boolean; talkEnds: number | null; spin: { at: number; seed: number } | null;
  /* the host's picks on the frame's boards: the view (null: they take turns) and the showcase's project (null: it walks) */
  view?: BoardView | null; show?: number | null };

/* 14. Building: the countdown as the largest thing on the wall, the door, entries arriving with their pictures, the
   count, the other nine; on the switch, the chart in place of the arrivals */
export function Building({ city, world, ranked, url, chart }: LiveProps) {
  const { ev } = useWall();
  const before = world.phase === 'before', label = before ? 'Building' : world.phase === 'build' ? 'Building closes in' : 'Building is closed';
  return (
    <div className="st-sc st-building">
      <div className="st-build-l">
        <p className="st-b st-2">{label}{before ? ': ' + city.build_min + ' minutes, from the host’s word.' : ''}</p>
        <Countdown secs={world.phase === 'build' || before ? world.left : 0} lit={before ? 'OPENS' : world.phase === 'build' ? 'BUILD' : world.phase === 'done' ? 'CLOSED' : 'VOTE'} also={world.phase === 'build' ? 'VOTE' : null} label={label + ' ' + mmss(world.left)} />
        <p className="st-h">{before ? 'Entries open with the clock.' : <><Num v={String(world.inNow)} width={String(Math.max(world.total, 10)).length} /> {world.inNow === 1 ? 'entry' : 'entries'} in</>}</p>
      </div>
      {/* the plan's Building has the QR and the code; the address is on Doors, Submit, Questions and the QR key */}
      <div className="st-build-door">
        <Door url={url} code={city.room_code} addr={false} />
        <p className="st-l st-key">To submit: sign in with Supabase, get checked in at the door.</p>
      </div>
      <div className="st-build-b">
        {chart && hasVote(ev) && !ranked.hidden ? <Chart w={ranked} /> : <Arrivals world={world} />}
      </div>
      <Others others={world.others} />
    </div>
  );
}

/* the latest entries, newest first; a new one pushes the row along and is lit for a moment */
function Arrivals({ world }: { world: World }) {
  const box = useRef<HTMLOListElement>(null);
  useFlip(box, world.arrivals.map((x) => x.p.id).join(','), 'x', 'var(--dur-slide)', 'var(--ease-move)');
  if (world.phase === 'before') return <p className="st-b st-2 st-empty">Entries show here as they arrive.</p>;
  if (!world.arrivals.length) return <p className="st-b st-2 st-empty">No entries yet.</p>;
  return (
    <ol ref={box} className="st-arr" aria-label="Latest entries">
      {world.arrivals.map((a, i) => (
        <li key={a.p.id} data-id={a.p.id} className={'st-arr-i' + (i === 0 ? ' st-arr-new' : '')}>
          <Pic p={a.p} />
          <span className="st-arr-n">{a.p.name}</span>
        </li>
      ))}
    </ol>
  );
}

/* 15. Voting: building is closed, voting closes in; the ranking, ten rows read from the back, the cut under third in
   green; on the switch, the chart of the top ten over time in its place */
export function Voting(props: LiveProps) {
  const { ev } = useWall();
  return ev.decide === 'judges' ? <Judging {...props} /> : <VotingBoard {...props} />;
}
/* where the judges decide alone: what was built, newest first, with no numbers and no order, and the line that the
   judges decide and the result comes at the end. Once all has closed, a judged event that votes with a budget shows
   its ranking (the judges' votes); one that scores never shows its scores here. */
function Judging({ world, ranked, url }: LiveProps) {
  const done = world.phase === 'done', before = world.phase === 'before', left = world.phase === 'build' || world.phase === 'vote';
  return (
    <div className="st-sc st-voting">
      <p className="st-vote-h st-h">
        {before ? 'The judges decide.' : done ? 'Judging is closed.' : world.phase === 'build' ? <>Building closes in <span className="st-num st-vote-n">{mmss(world.left)}</span></> : <>Judging closes in <span className="st-num st-vote-n">{mmss(world.left)}</span></>}
      </p>
      <p className={'st-l st-key' + (before ? ' st-hide' : '')}>{done ? (ranked.ranking.length ? 'The judges’ votes.' : 'The judges’ result is read out here.') : 'The judges decide. The result comes at the end.'}{left && url ? ' Entries at ' + bare(url) + '.' : ''}</p>
      {done && ranked.ranking.length ? <Ranking w={ranked} ev={null} /> : <Built world={world} />}
    </div>
  );
}
/* every entry in so far, newest first: a name and who built it, no numbers */
function Built({ world }: { world: World }) {
  if (world.phase === 'before') return <p className="st-b st-2 st-empty">Entries show here as they arrive.</p>;
  if (!world.all.length) return <p className="st-b st-2 st-empty">No entries yet.</p>;
  const list = world.all.slice().reverse().slice(0, 10);
  return (
    <ol className="st-rank" aria-label="Entries, newest first">
      {list.map((p) => (
        <li key={p.id} className="st-row st-row-plain">
          <span className="st-row-p" />
          <Pic p={p} className="st-row-pic" />
          <span className="st-row-n" title={p.name}>{p.name}</span>
          <span className="st-row-j">{p.handle}</span>
          <span className="st-row-v" />
        </li>
      ))}
    </ol>
  );
}
function VotingBoard({ world, ranked, chart, url }: LiveProps) {
  const { ev } = useWall(), apart = ev.decide === 'apart';
  const done = world.phase === 'done', before = world.phase === 'before';
  return (
    <div className="st-sc st-voting">
      <p className="st-vote-h st-h">
        {before ? 'Voting opens with building.' : done ? 'Voting is closed.' : world.phase === 'build' ? <>Voting is open. Building closes in <span className="st-num st-vote-n">{mmss(world.left)}</span></> : <>Building is closed. Voting closes in <span className="st-num st-vote-n">{mmss(world.left)}</span></>}
      </p>
      {/* voting is open to anyone (said apart from submitting, which needs the list and the code) */}
      <p className={'st-l st-key' + (before || done ? ' st-hide' : '')}>{(url ? TO_VOTE.replace('Anyone can vote', 'Anyone can vote at ' + bare(url)) : TO_VOTE) + (apart ? ' This is the people’s choice; the judges pick the winner.' : '')}</p>
      {chart && !ranked.hidden ? <Chart w={ranked} /> : <Ranking w={ranked} ev={ev} />}
    </div>
  );
}

/* the ranking: rows glide to their new places on the board tick (FLIP on transform, --ease-move, the stage's glide) */
/* FLIP: after a reorder each item starts where it was seen (its old place plus whatever glide it was still in) and
   glides to its new place on transform. A reorder in the middle of a glide carries on from where the item is. */
function useFlip(box: React.RefObject<HTMLElement | null>, order: string, axis: 'x' | 'y', dur: string, ease: string) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const ol = box.current; if (!ol) return;
    const now = new Map<string, number>(), reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ol.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => {
      const id = el.dataset.id!, at = axis === 'y' ? el.offsetTop : el.offsetLeft, was = last.current.get(id);
      now.set(id, at);
      if (was === undefined || reduce) { el.style.transition = ''; el.style.transform = ''; return; }
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform), cur = axis === 'y' ? m.m42 : m.m41, from = was + cur - at;
      if (Math.abs(from) < 0.5) return;
      el.style.transition = 'none'; el.style.transform = axis === 'y' ? `translateY(${from}px)` : `translateX(${from}px)`;
      void el.offsetWidth;
      el.style.transition = `transform ${dur} ${ease}`; el.style.transform = '';
    });
    last.current = now;
  }, [order, box, axis, dur, ease]);
}

/* the ranking: rows glide to their new places on the board tick (--ease-move, the stage's glide) */
/* ev: the place's event, for the cut (null: no cut) */
function Ranking({ w, ev }: { w: World; ev: WallEvent | null }) {
  /* the cut: Builder Day's as always; another event's only where it has a final across places */
  const cut = ev && hasFinal(ev) ? (ev.bd ? EVENT.finalists : ev.finalists) : 0;
  const box = useRef<HTMLOListElement>(null);
  useFlip(box, w.ranking.map((r) => r.p.id).join(','), 'y', 'var(--st-glide)', 'var(--ease-move)');
  if (w.phase === 'before') return <p className="st-b st-2 st-empty">The ranking starts with the first entry.</p>;
  if (!w.ranking.length) return <p className="st-b st-2 st-empty">No entries yet.</p>;
  return (
    <>
      <ol ref={box} className="st-rank" aria-label="Ranking" data-ev={ev && !ev.bd ? '' : undefined}>
        {w.ranking.map((r) => <Row key={r.p.id} r={r} cut={cut} hidden={w.hidden} />)}
        {/* the cut stays where it is while rows glide across it */}
        {cut && w.ranking.length >= cut ? <li className="st-cut" data-g="" aria-hidden="true" style={cut === 3 ? undefined : { top: 'calc((' + cut + ' * 74 + 23) * var(--px))' }}><span>Top {cut} go to the final</span></li> : null}
      </ol>
      {w.tieNote ? <p className="st-l st-2 st-tie">{w.tieNote}</p> : null}
      {w.hidden ? <p className="st-l st-2 st-tie">Votes are hidden. The order is as it stood when they were hidden; every count appears when voting closes.</p> : null}
    </>
  );
}
/* hidden: the count prints a fixed placeholder, padded to the column, and no judges' share */
function Row({ r, cut, hidden }: { r: Ranked; cut: number; hidden?: boolean }) {
  const first = r.place === 1;
  return (
    <li className="st-row" data-id={r.p.id} data-cut={cut && r.place === cut ? '' : undefined} data-first={first ? '' : undefined}>
      <span className="st-row-p">{r.place}</span>
      <Pic p={r.p} className="st-row-pic" />
      <span className="st-row-n" title={r.p.name}>{r.p.name}</span>
      <span className="st-row-j">{hidden ? '' : r.tie ? 'Level' : r.j ? r.j + ' from judges' : ''}</span>
      <span className="st-row-v">{hidden ? <Num v={'··'.padStart(4)} width={4} /> : <Num v={String(r.v)} width={4} />}</span>
    </li>
  );
}

/* the top ten over time, as steps, with the names at the line ends (pushed apart so none overlap) */
export function Chart({ w }: { w: World }) {
  const W = 1300, H = 560, L = 70, R = 980, T = 16, B = 500;
  const { series, span, max } = w.chart;
  const top = Math.max(5, Math.ceil(max / 5) * 5);
  const X = (m: number) => L + ((R - L) * m) / Math.max(1, span), Y = (v: number) => B - ((B - T) * v) / top;
  const labels = useMemo(() => {
    const ls = series.map((s) => ({ s, y: Y(s.pts[s.pts.length - 1][1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 44) ls[i].y = ls[i - 1].y + 44;
    const over = ls.length ? ls[ls.length - 1].y - B : 0; if (over > 0) ls.forEach((l) => { l.y -= over; });
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Y is a pure function of span and top
  }, [series, span, top]);
  if (w.phase === 'before' || !series.length) return <p className="st-b st-2 st-empty">{w.phase === 'before' ? 'The chart starts with the first entry.' : 'No entries yet.'}</p>;
  const step = (pts: [number, number][]) => pts.map(([m, v], i) => (i ? `H${X(m).toFixed(1)}V${Y(v).toFixed(1)}` : `M${X(m).toFixed(1)} ${Y(v).toFixed(1)}`)).join('');
  const ticks = [0, Math.round(top / 2), top];
  return (
    <figure className="st-chart">
      <figcaption className="st-l st-2">Top 10 over time</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="st-chart-svg" role="img" aria-label={'Votes over time for the top ' + series.length}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={R} y1={Y(t)} y2={Y(t)} className="st-chart-grid" /><text x={L - 14} y={Y(t) + 14} className="st-chart-t" textAnchor="end">{t}</text></g>)}
        {series.slice().reverse().map((s) => <path key={s.p.id} d={step(s.pts)} className="st-chart-l" data-place={s.place} />)}
        {labels.map(({ s, y }) => (
          <g key={s.p.id}>
            <line x1={R + 6} x2={R + 28} y1={Y(s.pts[s.pts.length - 1][1])} y2={y} className="st-chart-lead" />
            <text x={R + 36} y={y + 14} className="st-chart-n" data-place={s.place}>{s.place + ' ' + clip(s.p.name, 14)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* The showcase: the entries in turn, oldest first, one a board tick (the wall's clock picks which, so every screen
   shows the same one): the picture, the name, who built it, the pitch. The entry the wall arrives on is simply
   there; each one after lands like a step (st-in: in and 12px up, the stage's enter time, ease-out), the one before
   is cut. Under reduced motion each is simply swapped. The next picture is laid out unseen so it is ready when it
   comes. */
export function Showcase({ world, now, url, show }: LiveProps) {
  const { cfg, ev } = useWall(), list = world.all, n = list.length, tickMs = cfg.tick * 1000;
  /* the host's presses pick the project; left alone it walks them */
  const i = !n ? -1 : show !== null && show !== undefined ? ((show % n) + n) % n : Math.floor(now / tickMs) % n, p = i >= 0 ? list[i] : null, next = n > 1 ? list[(i + 1) % n] : null;
  /* the first entry shown is there on arrival; any change after that lands */
  const [seen, setSeen] = useState<{ id: number | null; moved: boolean }>({ id: p?.id ?? null, moved: false });
  if ((p?.id ?? null) !== seen.id) setSeen({ id: p?.id ?? null, moved: true });
  const moved = seen.moved || (p?.id ?? null) !== seen.id;
  if (!p) return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v="What was built" /></h1>
      <p className="st-h st-2">{world.phase === 'before' ? 'Entries show here as they arrive.' : 'No entries yet.'}</p>
    </div>
  );
  return (
    <div className="st-sc st-show">
      <p className="st-show-h"><span className="st-k">What was built</span><span className="st-l st-2"><span className="st-num">{i + 1}</span> of <span className="st-num">{n}</span></span></p>
      <div key={p.id} className={'st-show-card' + (moved ? ' st-in' : '')}>
        <Pic p={p} className="st-show-pic" />
        <div className="st-show-t">
          <h1 className="st-show-n st-d3">{p.name}</h1>
          {p.handle ? <p className="st-h st-2">by {p.handle}</p> : null}
          {p.pitch ? <p className="st-show-pitch st-b">{p.pitch}</p> : null}
        </div>
      </div>
      <p className={'st-l st-2' + ((world.phase === 'build' || world.phase === 'vote') && hasVote(ev) ? '' : ' st-hide')}>{url ? TO_VOTE.replace('Anyone can vote', 'Anyone can vote at ' + bare(url)) : TO_VOTE}</p>
      {next ? <span className="st-show-next" aria-hidden="true"><Pic p={next} /></span> : null}
    </div>
  );
}

/* 16. The top 3: three closed places, then third, second, first, one press each; a talk timer the host can start */
export function Top3({ step, world, now, talkEnds }: LiveProps) {
  const { ev } = useWall();
  const top = world.ranking.slice(0, EVENT.finalists), shown = Math.min(step, 3);
  /* what the places are and what first wins: Builder Day's as always; another event's from its format */
  const apart = !ev.bd && ev.decide === 'apart', judged = !ev.bd && ev.decide === 'judges';
  const prize = ev.bd ? PRIZES.city.what : apart ? null : ev.placePrize || null;
  const unit = (v: number) => judged ? v + (v === 1 ? ' judge’s vote' : ' judges’ votes') : v + (v === 1 ? ' vote' : ' votes');
  const title = apart ? (world.phase === 'done' ? 'The people’s choice' : 'The people’s choice so far') : world.phase === 'done' ? 'The top 3' : 'The top 3 so far';
  /* where the judges decide and their result is not on the wall (scores, or before the close): the host reads it */
  if (judged && !top.length) return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v="The judges’ result" /></h1>
      <p className="st-h st-2">{world.phase === 'done' ? 'The judges name the winner here.' : 'The judges decide when judging closes.'}</p>
      {prize ? <p className="st-b st-g" data-g="">1st wins {prize}.</p> : null}
    </div>
  );
  const open = (place: number) => shown >= 4 - place; /* third opens first */
  const talk = talkEnds && talkEnds > now ? (talkEnds - now) / 1000 : null;
  return (
    <div className="st-sc st-top3">
      <div className="st-top3-h">
        <h1 className="st-d3"><Words v={title} /></h1>
        {talk !== null ? <p className="st-talk"><span className="st-k">Talk</span><Num v={mmss(talk)} width={5} /></p> : null}
      </div>
      {!top.length ? <p className="st-b st-2 st-empty">No entries in {world.phase === 'before' ? 'yet' : 'this city'}.</p> : (
        <ol className="st-podium">
          {[1, 2, 3].map((place) => {
            const r = top[place - 1];
            return (
              <li key={place} className="st-place" data-open={open(place) && r ? '' : undefined} data-first={place === 1 ? '' : undefined}>
                <span className="st-place-k">{['1st', '2nd', '3rd'][place - 1]}</span>
                {open(place) && r ? (
                  <In i={4 - place} className="st-place-b">
                    <Pic p={r.p} className="st-place-pic" />
                    <span className="st-place-n">{place === 1 ? <Words v={r.p.name} /> : r.p.name}</span>
                    <span className="st-l st-2">{r.p.handle} · {unit(r.v)}</span>
                    {place === 1 && prize ? <span className="st-l st-g" data-g="">Wins {prize}.</span> : null}
                  </In>
                ) : <span className="st-place-closed" aria-label="Not revealed yet" />}
              </li>
            );
          })}
        </ol>
      )}
      {/* a tie at third is said when third opens: who reached the count first keeps the place */}
      {shown >= 1 && world.tieNote ? <p className="st-l st-2">{world.tieNote}</p> : null}
      {apart ? <p className="st-l st-2">The judges pick the winner.</p> : null}
    </div>
  );
}

/* 17. Tombola: a draw among everyone outside the top 3. The names pass a fixed window, fast at first and slower,
   one name per step, and land on the drawn entry at the spin's length; every screen draws the same one (the seed is on
   the stage row). Under reduced motion it lands at once. */
export function Tombola({ step, world, spin }: LiveProps) {
  const { cfg, reduced, now: clock } = useWall(), pool = world.pool;
  const target = spin ? drawOf(pool, spin.seed) : -1;
  const [idx, setIdx] = useState(-1);
  /* the run: N names in all, the last being the drawn one */
  const N = useMemo(() => (pool.length ? Math.max(1, Math.ceil(110 / pool.length)) * pool.length + target : 0), [pool.length, target]);
  useEffect(() => {
    if (!spin || !pool.length) return;
    const t0 = performance.now() - Math.max(0, clock() - spin.at);
    let raf = 0, was = -1;
    const frame = () => {
      const u = reduced ? 1 : Math.min(1, (performance.now() - t0) / cfg.spinMs);
      /* quartic ease-out on the count of names: one name per step, slower and slower */
      const k = Math.min(N, Math.floor(N * (1 - Math.pow(1 - u, 4))));
      if (k !== was) { was = k; setIdx(k); if (cfg.sound && !reduced) click(); }
      if (u < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spin, pool.length, N, cfg.spinMs, cfg.sound, reduced, clock]);
  if (!spin || step === 0) return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v="Tombola" /></h1>
      <p className="st-h">{pool.length ? 'Everyone outside the top 3: ' + pool.length + (pool.length === 1 ? ' entry.' : ' entries.') : 'Nobody to draw from yet.'}</p>
      {pool.length ? <p className="st-b st-2">Drum roll, please.</p> : null}
    </div>
  );
  if (!pool.length) return <div className="st-sc st-mid"><h1 className="st-d2">Tombola</h1><p className="st-h">Nobody to draw from yet.</p></div>;
  const at = (k: number) => pool[(((k - N + target) % pool.length) + pool.length) % pool.length];
  const k = Math.max(0, idx), landed = k >= N, cur: Project = at(k);
  return (
    <div className="st-sc st-tombola" data-landed={landed ? '' : undefined}>
      <p className="st-b st-2">{landed ? 'Drawn from ' + pool.length + ' entries' : 'Drawing from ' + pool.length + ' entries'}</p>
      <div className="st-reel" aria-live="off">
        <span className="st-reel-o" aria-hidden="true">{at(k - 1).name}</span>
        <span className="st-reel-w" key={landed ? 'land' : 'run'}><span className="st-reel-n">{cur.name}</span></span>
        <span className="st-reel-o" aria-hidden="true">{at(k + 1).name}</span>
      </div>
      {/* laid out from the start and shown on landing, so nothing above it moves when it appears */}
      <div className={'st-reel-who' + (landed ? ' st-in' : ' st-hide')} aria-hidden={!landed}><Pic p={cur} className="st-reel-pic" /><span className="st-h">{cur.handle}</span></div>
      <p className="sr-only" aria-live="polite">{landed ? 'Drawn: ' + cur.name + ' by ' + cur.handle : ''}</p>
    </div>
  );
}
/* the click needs a press first (browsers start audio only after one); the remote's or the wall's key gives it */
export const wakeSound = () => unlock();

/* 18. The final: thirty finalists, one pick; when and where to watch; the ten cities' top threes as they finish */
export function Final(props: LiveProps) {
  const { ev } = useWall();
  return ev.bd ? <BuilderFinal {...props} /> : <EventFinal />;
}
/* another event's last scene: with a final across places, how many go and who picks (the other places' boards are
   Builder Day's, so none here); with no final, the winner is named in this room */
function EventFinal() {
  const { ev } = useWall();
  if (hasFinal(ev)) return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v={ev.places * ev.finalists + ' finalists. One pick.'} /></h1>
      <p className="st-h st-2">The top {ev.finalists} of each of the {ev.places} places go to the final.</p>
      {ev.pickers ? <p className="st-b st-2">{ev.pickers} pick one{ev.prize ? ', who wins ' + ev.prize : ''}.</p> : null}
    </div>
  );
  return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v="The winner" /></h1>
      <p className="st-h st-2">{ev.decide === 'votes' ? 'The most votes wins, named here.' : 'The judges name the winner here.'}</p>
      {ev.placePrize ? <p className="st-b st-g" data-g="">1st wins {ev.placePrize}.</p> : null}
    </div>
  );
}
function BuilderFinal({ city, world, url }: LiveProps) {
  const S = sched(SCHED), pickMs = EPOCH + S.pickAt * 60000, n = CITIES.length * EVENT.finalists;
  const mine = world.phase === 'done' ? world.ranking.slice(0, 3).map((r) => r.p) : null;
  const blocks = CITIES.map((c) => {
    if (c.id === city.id) return { id: c.id, code: CODE[c.id], names: mine?.map((p) => p.name) ?? null, word: world.phase === 'before' ? 'Not started' : world.phase === 'build' ? 'Building' : 'Voting' };
    const o = world.others.find((x) => x.id === c.id);
    /* not read yet (or a place outside the ten): the city waits */
    if (!o) return { id: c.id, code: CODE[c.id], names: null, word: 'Not started' };
    return { id: c.id, code: CODE[c.id], names: o.state === 'done' ? o.top.map((t) => t.p.name) : null, word: o.state === 'next' ? 'Not started' : o.state === 'build' ? 'Building' : 'Voting' };
  });
  return (
    <div className="st-sc st-final">
      <h1 className="st-d3"><Words v={n + ' finalists. One pick.'} /></h1>
      <p className="st-b st-2">{EVENT.pickers} pick one at {placeTime(city, pickMs)}. Watch at {bare(url).split('/')[0]}.</p>
      <ul className="st-ten">
        {blocks.map((b) => (
          <li key={b.id} className="st-ten-c" data-here={b.id === city.id ? '' : undefined} data-done={b.names ? '' : undefined}>
            <span className="st-ten-code">{b.code}</span>
            {b.names && b.names.length ? b.names.map((x, i) => <span key={i} className="st-ten-n">{x}</span>) : <span className="st-ten-w">{b.names ? 'No entries' : b.word}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
