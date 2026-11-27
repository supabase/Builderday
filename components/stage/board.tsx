'use client';
import { useState, type ReactNode } from 'react';
import { EVENT } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { ordinal } from '@/lib/forms';
import { TO_VOTE } from '@/lib/stage/deck';
import { placeTime } from '@/lib/stage/rows';
import { BOARD_VIEWS, type BoardView, type CityLive } from '@/lib/stage/types';
import type { Ranked, World } from '@/lib/stage/world';
import { hasVote } from '@/lib/stage/event';
import { Cells } from './brand';
import { Chart, type LiveProps } from './live';
import { Door, Pic, bare, mmss } from './parts';
import { useWall } from './use';

/* The live boards on the Builder Day frame (Cover, Orbit, Print). Building and Voting keep the clock and the door at
   the top; under them a board that changes what it shows: the latest entries, the pulse (entries over the build, as
   the globe's hatch), the top 10 with hatch bars, the top ten over time, moments that name a project and its builder,
   and the cities. The host picks one from the remote, or leaves them to take turns (a strip of the views shows which
   is on and which is next, with a line that fills while it shows). The showcase goes project by project, by the
   host's presses or on its own. The hatch is the globe's: `|` where the column and row add to a multiple of three,
   `:` elsewhere; green is now, here, and first. */

const LABEL = Object.fromEntries(BOARD_VIEWS) as Record<BoardView, string>;
const mod = (a: number, n: number) => ((a % n) + n) % n;
/* the hatch, n characters of it, on row r of a fixed grid */
const hatch = (n: number, r = 0, from = 0) => Array.from({ length: Math.max(0, n) }, (_, i) => ((from + i + r) % 3 === 0 ? '|' : ':')).join('');
const pace = (every: number) => (every < 1.5 ? 'About one a minute' : 'One every ' + Math.round(every) + ' minutes');
const minsWord = (m: number) => (m < 1 ? 'under a minute' : Math.round(m) === 1 ? 'a minute' : Math.round(m) + ' minutes');

/* the views that make sense now, in the order they take turns */
function turnsOf(w: World, votes: boolean): BoardView[] {
  const counts = votes && !w.hidden;
  if (w.phase === 'before') return ['world'];
  if (w.phase === 'build') return ['arrivals', 'pulse', ...(votes ? ['top10' as const] : []), 'moments', 'world'];
  return [...(votes ? ['top10' as const] : []), 'moments', ...(counts ? ['chart' as const] : []), 'pulse', 'world'];
}

function useView(w: World, pick: BoardView | null | undefined, chart: boolean, now: number): { on: BoardView; turns: BoardView[]; auto: boolean; at: number; into: number } {
  const { cfg, ev } = useWall(), votes = hasVote(ev), turns = turnsOf(w, votes), ms = cfg.viewSec * 1000;
  if (pick && turns.includes(pick)) return { on: pick, turns, auto: false, at: 0, into: 0 };
  if (chart && turns.includes('chart')) return { on: 'chart', turns, auto: false, at: 0, into: 0 };
  /* the turns keep to the wall's second, not the ranking's slower tick */
  const i = Math.floor(now / ms);
  return { on: turns[mod(i, turns.length)], turns, auto: true, at: i, into: mod(now, ms) };
}

/* the strip of views: each a mono label, the one on lit, a line that fills while it shows when they take turns */
function Strip({ v }: { v: ReturnType<typeof useView> }) {
  return (
    <ol className="stb-strip" aria-hidden="true">
      {v.turns.map((t) => (
        <li key={t} data-on={t === v.on ? '' : undefined}>
          {LABEL[t]}
          {/* the fill starts where the view's time already is (a wall that arrives mid-view is not reset) */}
          {t === v.on ? (v.auto ? <FillLine key={v.at} into={v.into} /> : <span className="stb-fill stb-fill-held" />) : null}
        </li>
      ))}
      {!v.auto ? <li className="stb-held">Held by the host</li> : null}
    </ol>
  );
}

/* its start is read once, on mount: later seconds would restart it */
function FillLine({ into }: { into: number }) {
  const [delay] = useState(-into);
  return <span className="stb-fill" style={{ animationDelay: delay + 'ms' }} />;
}

function Clock({ k, secs, tone }: { k: string; secs: number; tone?: 'g' }) {
  return (
    <div className="stb-clock">
      <p className="stc-k">{k}</p>
      <p className={'stb-time' + (tone ? ' stc-g' : '')} role="timer" aria-label={k + ' ' + mmss(secs)}>{mmss(secs)}</p>
    </div>
  );
}

/* Building: the clock, the counts, the door; the board */
export function CoverBuilding(p: LiveProps) {
  const { city, world, ranked, url, chart, view } = p;
  const v = useView(ranked, view, chart, world.now);
  const before = world.phase === 'before';
  return (
    <div className="stc-sc stb">
      <div className="stb-top">
        {before ? <Clock k={'Building · ' + city.build_min + ' minutes, from the host’s word'} secs={city.build_min * 60} /> : <Clock k={world.phase === 'build' ? 'Building closes in' : 'Building is closed'} secs={world.phase === 'build' ? world.left : 0} tone={world.phase === 'build' ? 'g' : undefined} />}
        <Cells className="stb-cells" items={[world.inNow + (world.inNow === 1 ? ' entry' : ' entries'), ...(city.here !== null ? [city.here + ' here'] : []), 'Ends ' + (city.build_end ? placeTime(city, city.build_end) : '--:--')]} />
        <Door url={url} code={city.room_code} size="small" />
      </div>
      <Strip v={v} />
      <View v={v.on} {...p} />
    </div>
  );
}

/* Voting: the clock to the close, where to vote; the board */
export function CoverVoting(p: LiveProps) {
  const { world, ranked, url, chart, view } = p;
  const v = useView(ranked, view, chart, world.now), { ev } = useWall();
  const open = world.phase === 'vote' || world.phase === 'build';
  return (
    <div className="stc-sc stb">
      <div className="stb-top">
        <Clock k={open ? 'Voting closes in' : 'Voting is closed'} secs={open ? world.left : 0} tone={open ? 'g' : undefined} />
        <p className="stc-b stb-how">{url && hasVote(ev) ? TO_VOTE.replace('Anyone can vote', 'Anyone can vote at ' + bare(url)) : TO_VOTE}</p>
        <Door url={url} code={null} size="small" addr={false} />
      </div>
      <Strip v={v} />
      <View v={v.on} {...p} />
    </div>
  );
}

function View({ v, ...p }: LiveProps & { v: BoardView }) {
  const w = p.ranked;
  const body: Record<BoardView, () => ReactNode> = {
    arrivals: () => <Latest w={p.world} city={p.city} />,
    pulse: () => <Pulse w={p.world} city={p.city} />,
    top10: () => <Top10 w={w} />,
    chart: () => <div className="stb-chart"><Chart w={w} /></div>,
    moments: () => <Moments w={w} all={p.world} city={p.city} />,
    world: () => <Cities w={p.world} city={p.city} />,
  };
  return <section key={v} className="stb-view st-in" aria-label={LABEL[v]}>{body[v]()}</section>;
}

const Empty = ({ children }: { children: ReactNode }) => <p className="stc-h stc-2 stb-empty">{children}</p>;

/* the latest in: pictures, names, when each came in (minutes into the build) */
function Latest({ w, city }: { w: World; city: CityLive }) {
  const start = city.build_start ?? w.now;
  if (!w.arrivals.length) return <Empty>{w.phase === 'before' ? 'Entries show here as they arrive.' : 'No entries yet. The first one shows here.'}</Empty>;
  const [nw, ...rest] = w.arrivals, minIn = (at: number) => Math.max(0, Math.round((at - start) / 60000)) + ' min in';
  return (
    <div className="stb-latest">
      <div key={nw.p.id} className="stb-newest st-in">
        <Pic p={nw.p} className="stb-pic" />
        <div className="stb-newest-t">
          <p className="stc-k stc-g">Just in</p>
          <p className="stb-newest-n">{nw.p.name}</p>
          <p className="stc-b stc-2">{nw.p.handle ? 'by ' + nw.p.handle + ' · ' : ''}{minIn(nw.at)}</p>
          {nw.p.pitch ? <p className="stc-b stb-newest-pitch">{nw.p.pitch}</p> : null}
        </div>
      </div>
      <ol className="stb-before">
        {rest.slice(0, 4).map((a) => (
          <li key={a.p.id}>
            <Pic p={a.p} className="stb-pic" />
            <span className="stb-n">{a.p.name}</span>
            <span className="stb-m">{minIn(a.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* the pulse: entries over the build, a column every few minutes, an entry a character row while they fit; the column
   of now in green; minutes still to come as the dotted ground */
function Pulse({ w, city }: { w: World; city: CityLive }) {
  const { cfg } = useWall();
  const start = city.build_start ?? city.planned_start, end = city.build_end ?? start + city.build_min * 60000;
  const bin = cfg.pulseBin * 60000, n = Math.max(1, Math.ceil((end - start) / bin));
  const counts = Array.from({ length: n }, () => 0);
  for (const t of w.times) { const i = Math.floor((t - start) / bin); if (i >= 0 && i < n) counts[i]++; else if (i >= n) counts[n - 1]++; }
  const nowI = w.now < end ? Math.floor((w.now - start) / bin) : -1, peak = Math.max(...counts), ROWS = 7;
  const per = Math.max(1, Math.ceil(peak / ROWS));
  const pi = counts.indexOf(peak), mins = Math.max(1, (Math.min(w.now, end) - start) / 60000);
  const every = w.inNow ? mins / w.inNow : 0;
  const labelEvery = Math.max(1, Math.round(30 / cfg.pulseBin));
  return (
    <div className="stb-pulse">
      <figure className="stb-cols" role="img" aria-label={'Entries every ' + cfg.pulseBin + ' minutes: ' + counts.join(', ')}>
        {counts.map((c, i) => {
          const rows = Math.ceil(c / per);
          return (
            <div key={i} className="stb-col" data-now={i === nowI ? '' : undefined} data-later={nowI >= 0 && i > nowI ? '' : undefined}>
              <span className="stb-stack">
                {Array.from({ length: ROWS }, (_, r) => <span key={r} data-on={ROWS - r <= rows ? '' : undefined}>{ROWS - r <= rows ? hatch(2, r, i * 2) : '. '}</span>)}
              </span>
              <span className="stb-c">{c || ''}</span>
              <span className="stb-x">{i % labelEvery === 0 ? placeTime(city, start + i * bin) : ''}</span>
            </div>
          );
        })}
      </figure>
      <dl className="stb-facts">
        <div><dt className="stc-k">In</dt><dd className="stb-big">{w.inNow}</dd></div>
        <div><dt className="stc-k">Pace</dt><dd className="stc-h">{w.inNow ? pace(every) : 'Waiting for the first'}</dd></div>
        {peak ? <div><dt className="stc-k">Busiest</dt><dd className="stc-h">{placeTime(city, start + pi * bin)}, {peak} in</dd></div> : null}
      </dl>
    </div>
  );
}

/* the top 10: two columns of five, a hatch bar each (the leader's in green), the cut after third, how each moved in
   the last ten minutes; hidden, the order stands and no count or bar prints */
function Top10({ w }: { w: World }) {
  const { cfg } = useWall();
  if (!w.ranking.length) return <Empty>{w.phase === 'before' ? 'The top 10 starts with the first vote.' : 'No entries yet.'}</Empty>;
  const top = w.ranking.slice(0, 10), max = Math.max(1, ...top.map((r) => r.v)), cut = EVENT.finalists;
  const col = (rs: Ranked[]) => (
    <ol className="stb-rank">
      {rs.map((r) => {
        const moved = r.was === null ? 'New' : r.was > r.place ? '▲' + (r.was - r.place) : r.was < r.place ? '▼' + (r.place - r.was) : '';
        const len = w.hidden ? 0 : Math.max(r.v ? 1 : 0, Math.round((r.v / max) * cfg.barCells));
        return (
          <li key={r.p.id} data-first={r.place === 1 ? '' : undefined} data-cut={r.place === cut ? '' : undefined} data-in={r.place <= cut ? '' : undefined}>
            <span className="stb-p">{r.place}</span>
            <Pic p={r.p} className="stb-rpic" />
            <span className="stb-rt">
              <span className="stb-rn">{r.p.name}</span>
              <span className="stb-bar" aria-hidden="true">{w.hidden ? '' : hatch(len, r.place)}<span className="stb-bar-g">{w.hidden ? '' : '.'.repeat(Math.max(0, cfg.barCells - len))}</span></span>
            </span>
            <span className="stb-v">{w.hidden ? '··' : r.v}</span>
            <span className="stb-mv" data-up={moved.startsWith('▲') ? '' : undefined}>{w.hidden ? '' : moved}</span>
          </li>
        );
      })}
    </ol>
  );
  return (
    <div className="stb-top10">
      {col(top.slice(0, 5))}
      {top.length > 5 ? col(top.slice(5, 10)) : <span />}
      {w.hidden || w.tieNote ? <p className="stb-cutline">{w.hidden ? 'Votes are hidden until voting closes. The order is as it stood then.' : w.tieNote}</p> : null}
    </div>
  );
}

/* moments: a project and its builder, picked out by what happened. First in, the newest, the climber, the leader, the
   most votes in the last ten minutes; each one only when it is true */
function Moments({ w, all, city }: { w: World; all: World; city: CityLive }) {
  const start = city.build_start ?? all.now, out: { k: string; p: World['all'][number]; line: string; g?: boolean }[] = [];
  if (all.all[0]) out.push({ k: 'First in', p: all.all[0], line: minsWord((all.times[0] - start) / 60000) + ' after the start' });
  const lead = w.ranking[0], second = w.ranking[1];
  if (lead && !w.hidden && lead.v > 0) out.push({ k: 'Leading', p: lead.p, line: lead.v + ' votes' + (second ? ', ' + (lead.v - second.v ? lead.v - second.v + ' ahead' : 'level with 2nd') : ''), g: true });
  const climb = w.hidden ? null : w.ranking.filter((r) => r.was !== null && r.was - r.place >= 2).sort((a, b) => (b.was! - b.place) - (a.was! - a.place))[0];
  if (climb) out.push({ k: 'Climbing', p: climb.p, line: 'Up ' + (climb.was! - climb.place) + ', now ' + ordinal(climb.place) });
  const hot = w.hidden ? null : w.chart.series.map((s) => { const last = s.pts[s.pts.length - 1], back = s.pts.filter(([m]) => m <= last[0] - 10).pop() ?? s.pts[0]; return { s, d: last[1] - back[1] }; }).sort((a, b) => b.d - a.d)[0];
  if (hot && hot.d > 0 && hot.s.p.id !== lead?.p.id) out.push({ k: 'Most votes, last 10 min', p: hot.s.p, line: '+' + hot.d + ' votes' });
  if (all.arrivals[0] && all.phase === 'build' && all.arrivals[0].p.id !== all.all[0]?.id) out.push({ k: 'Newest', p: all.arrivals[0].p, line: minsWord((all.now - all.arrivals[0].at) / 60000) + ' ago' });
  if (!out.length) return <Empty>Moments show here once entries are in: the first in, the leader, the climbers.</Empty>;
  return (
    <ol className="stb-moments">
      {out.slice(0, 4).map((m) => (
        <li key={m.k} data-g={m.g ? '' : undefined}>
          <p className="stc-k">{m.k}</p>
          <Pic p={m.p} className="stb-mpic" />
          <p className="stb-mn">{m.p.name}</p>
          <p className="stb-ml">{m.p.handle ? 'by ' + m.p.handle + ' · ' : ''}{m.line}</p>
        </li>
      ))}
    </ol>
  );
}

/* the cities: this one first, lit; the others by what they are doing; a city that has its top 3 shows its first */
const STATE: Record<string, string> = { build: 'Building', vote: 'Voting', done: 'Top 3 set' };
function Cities({ w, city }: { w: World; city: CityLive }) {
  const here = { id: city.id, code: CODE[city.id] ?? city.id.slice(0, 3).toUpperCase(), word: w.phase === 'build' ? 'Building' : w.phase === 'vote' ? 'Voting' : w.phase === 'done' ? 'Top 3 set' : 'Starts ' + placeTime(city, city.planned_start) };
  const live = w.others.filter((o) => o.state === 'build' || o.state === 'vote').length + (w.phase === 'build' || w.phase === 'vote' ? 1 : 0);
  return (
    <div className="stb-cities">
      <p className="stc-h"><span className="stc-g">{live}</span> of {w.others.length + 1} cities are building or voting now</p>
      <ul className="stb-grid">
        <li data-here="">
          <span className="stb-code">{here.code}</span><span className="stb-w">Here</span><span className="stb-w stc-g">{here.word}</span>
        </li>
        {w.others.map((o) => (
          <li key={o.id} data-state={o.state}>
            <span className="stb-code">{o.code}</span>
            <span className="stb-w">{o.name}</span>
            <span className="stb-w stc-2">{o.state === 'next' ? o.word.replace(/^.* starts in /, 'In ') : o.state === 'done' && o.top[0] ? o.top[0].p.name : STATE[o.state]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* the showcase, project by project: the picture large, the name, who built it, the pitch, its place and when it came
   in. The host steps it from the remote; left alone it walks them on the board tick */
export function CoverShowcase({ world, ranked, now, city, show }: LiveProps) {
  const { cfg } = useWall(), list = world.all, n = list.length;
  const i = !n ? -1 : show !== null && show !== undefined ? mod(show, n) : Math.floor(now / (cfg.tick * 1000)) % n;
  const p = i >= 0 ? list[i] : null;
  /* the project the wall arrived on is simply there; each one after lands */
  const [first] = useState(p?.id ?? null);
  if (!p) return <div className="stc-sc stc-mid"><h1 className="stc-d2">What was built</h1><p className="stc-h stc-2">{world.phase === 'before' ? 'Entries show here as they arrive.' : 'No entries yet.'}</p></div>;
  const r = ranked.ranking.find((x) => x.p.id === p.id), start = city.build_start ?? now, at = world.times[i];
  const next = n > 1 ? list[mod(i + 1, n)] : null;
  return (
    <div className="stc-sc stb-show">
      <div key={p.id} className={'stb-show-card' + (p.id !== first ? ' st-in' : '')}>
        <Pic p={p} className="stb-show-pic" />
        <div className="stb-show-t">
          <p className="stc-k">Project {i + 1} of {n}{show === null || show === undefined ? '' : ' · picked by the host'}</p>
          <h1 className="stc-d2 stb-show-n">{p.name}</h1>
          {p.handle ? <p className="stc-h stc-2">by {p.handle}</p> : null}
          {p.pitch ? <p className="stc-b stb-show-pitch">{p.pitch}</p> : null}
          <Cells items={[
            ...(r && !ranked.hidden ? [{ v: ordinal(r.place) + ' · ' + r.v + ' votes', on: r.place <= EVENT.finalists }] : []),
            ...(at ? ['In at ' + placeTime(city, at) + ' · ' + Math.max(0, Math.round((at - start) / 60000)) + ' min in'] : []),
          ]} />
          {p.repo ? <p className="stb-repo">{bare(p.repo)}</p> : null}
        </div>
      </div>
      {next ? <p className="stb-next"><span className="stc-k">Next</span><Pic p={next} className="stb-next-pic" /><span>{next.name}</span></p> : null}
    </div>
  );
}
