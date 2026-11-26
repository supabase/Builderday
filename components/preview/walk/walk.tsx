'use client';
/* How it works, walked: one city's 90 minutes as five steps (0, 45, 60, 90, after) that scroll past a stage that
   stays put. Scroll only reports where the reader is: inside a step the minute follows the scroll (and stops at the
   step's last minute, so the step holds); the step's own change (the counts appearing, the cut locking, the final)
   plays once, on transitions that turn back if the reader scrolls back. The stage draws the race one of three ways
   (race, tower, ledger), on one 0-90 scale that never changes. Every fact is in the step's words too, so the stage
   is hidden from screen readers. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { CITIES } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { PRIZE_SHEET } from '@/lib/prizes';
import type { WalkCfg } from './config';
import { END, OPEN, SHOW, countAt, finalists, makeRace, standing, topOf, type Proj, type Row, type Standing } from './race';
import './walk.css';

export type WalkCity = { id: string; name: string; opens: number; offset: number };

const mq = (q: string) => () => typeof window !== 'undefined' && window.matchMedia(q).matches;
const useMq = (q: string) => useSyncExternalStore((f) => { const m = window.matchMedia(q); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, mq(q), () => false);
const PHONE = '(max-width: 760px)';

const G = PRIZE_SHEET.global, C = PRIZE_SHEET.city;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* how each mode draws a vote that is in but not shown */
const HIDDEN: Record<WalkCfg['mode'], string> = { race: 'Each blue mark is a vote in, not shown yet.', tower: 'Each ? is a count not shown yet.', ledger: 'A hatched bar is a count not shown yet.' };

/* the five steps: the minutes each one covers, and its words */
type Step = { from: number; to: number; key: string; h: string; p: (cfg: WalkCfg) => string };
const STEPS: Step[] = [
  { from: 0, to: OPEN - 1, key: 'Minutes 0–44', h: 'Build',
    p: () => `Build something new with Supabase, and submit it in your browser or from your editor any time before the close.` },
  { from: OPEN, to: SHOW - 1, key: 'Minutes 45–59', h: 'Voting opens, counts hidden',
    p: (cfg) => `Anyone with the link can vote, after confirming an email once. The counts stay hidden until minute 60, so the list shows projects in the order they came in. ${HIDDEN[cfg.mode]}` },
  { from: SHOW, to: END - 1, key: 'Minutes 60–89', h: 'Counts appear, judges join',
    p: () => 'The counts appear and update live. Judges join with 10 votes each, and each of their votes counts 5.' },
  { from: END, to: END, key: 'Minute 90', h: 'Everything closes',
    p: () => `Voting and submitting close together. The 3 projects with the most votes are the city’s finalists: 1st wins a ${C.winner.thing}, 2nd and 3rd get $${C.finalist.credits} in credits.` },
  { from: END, to: END, key: 'After 90', h: 'The global final',
    p: () => `42 finalists from 14 cities. ${cap(PRIZE_SHEET.picker)} picks 1st, 2nd and 3rd (${G.map((g) => g.thing).join(', ')}), announced ${PRIZE_SHEET.announce}.` },
];

export function Walk({ cfg, city, onStage, heading = true }: { cfg: WalkCfg; city: WalkCity; onStage?: () => void; heading?: boolean }) {
  const root = useRef<HTMLElement>(null), box = useRef<HTMLOListElement>(null);
  const rm = useMq('(prefers-reduced-motion: reduce)'), phone = useMq(PHONE);
  const [pos, setPos] = useState({ k: 0, p: 0 });
  const { seed, projects, youArrive, youPlace, judges, stepH, line, scrubTo, revealMs } = cfg;
  const race = useMemo(() => makeRace({ seed, projects, youArrive, youPlace, judges }), [seed, projects, youArrive, youPlace, judges]);
  const top = useMemo(() => topOf(race) * 1.08, [race]);

  /* where the reader is: the step whose top has passed the reading line, and how far through it */
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0; const el = box.current; if (!el) return;
      const vh = window.innerHeight, items = Array.from(el.children) as HTMLElement[];
      /* on a phone a step starts when its card has reached its place under the stage; on a wide screen when the
         step's top passes the reading line */
      const phone = window.matchMedia(PHONE).matches, stage = root.current?.querySelector<HTMLElement>('.wk-stage');
      let ln = vh * line;
      if (phone && stage) {
        const b = Math.round((parseFloat(getComputedStyle(stage).top) || 0) + stage.offsetHeight);
        if (root.current && root.current.style.getPropertyValue('--wk-stage-b') !== b + 'px') root.current.style.setProperty('--wk-stage-b', b + 'px');
        ln = b + 13;
      }
      const lineOf = () => ln;
      let k = 0; items.forEach((it, i) => { if (it.getBoundingClientRect().top <= lineOf()) k = i; });
      const r = items[k].getBoundingClientRect(), p = Math.max(0, Math.min(1, (lineOf() - r.top) / Math.max(1, r.height)));
      setPos((o) => (o.k === k && Math.abs(o.p - p) < 0.002 ? o : { k, p }));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    /* heights in px from the window, not vh: a phone's toolbar changes vh as it scrolls */
    let w = 0, h = 0;
    const size = () => {
      const r = root.current, W = window.innerWidth, H = window.innerHeight;
      if (r && (W !== w || Math.abs(H - h) > 150)) { w = W; h = H; r.style.setProperty('--wk-step', Math.round(H * stepH) + 'px'); }
      on();
    };
    size(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', size);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', size); cancelAnimationFrame(raf); };
  }, [stepH, line]);

  /* the reveal at 60: runs forward once the third step is reached, back three times as fast if the reader leaves it */
  const target = pos.k >= 2 ? 1 : 0, rv = useRef(0), [reveal, setReveal] = useState(0);
  useEffect(() => {
    if (rm) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const dt = last ? now - last : 16; last = now;
      const r = rv.current, n = target > r ? Math.min(1, r + dt / revealMs) : Math.max(0, r - (3 * dt) / revealMs);
      rv.current = n; setReveal(n);
      if (n !== target) raf = requestAnimationFrame(tick);
    };
    /* arriving past 60 by a jump shows every count at once; the reveal plays only when the reader walks into it */
    if (pos.k >= 3) rv.current = 1;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, rm, revealMs, pos.k]);

  const S = STEPS[pos.k], minute = S.from + (S.to - S.from) * Math.min(1, pos.p / scrubTo), final = pos.k === STEPS.length - 1;
  const rev = minute < SHOW ? 0 : rm || pos.k >= 3 ? target : reveal, st = standing(race, minute, rev);
  const m = Math.floor(minute), phase = minute < OPEN ? 'building' : minute < SHOW ? 'counts hidden' : rev < 1 ? 'counts appearing' : minute < END ? 'counts live' : 'closed';
  const n = phone ? cfg.rowsPhone : cfg.rows;
  const vars = { '--wk-share': cfg.stageShare, '--wk-beat': cfg.beatMs + 'ms', '--wk-chart-h': cfg.chartH + 'px', '--wk-chart-hp': cfg.chartHPhone + 'px' } as CSSProperties;

  return (
    <section id="how" ref={root} className="pf-part wk" data-mode={cfg.mode} data-side={cfg.side} style={vars} aria-labelledby={heading ? 'how-h' : undefined}>
      {heading ? <h2 id="how-h" className="pf-h wk-h">How Builder Day works</h2> : null}
      <div className="wk-grid">
        <div className="wk-stage" aria-hidden="true" onClick={onStage} data-click={onStage ? '' : undefined}>
          <p className="wk-clock"><b>{final ? 'After 90' : 'Minute ' + m}</b><span>{final ? 'Announced ' + PRIZE_SHEET.announce : cap(phase)}</span></p>
          <Rail minute={final ? END : minute} />
          <div className="wk-views">
            <div className="wk-view" data-off={final ? '' : undefined}>
              {cfg.mode === 'race' ? <><Chart race={race} st={st} minute={minute} reveal={rev} top={top} /><Legend /><Board st={st} n={n} minute={minute} /></>
                : cfg.mode === 'tower' ? <><Board st={st} n={n + 1} minute={minute} tower /><Chart race={race} st={st} minute={minute} reveal={rev} top={top} strip /></>
                : <><Legend ledger /><Ledger st={st} n={n + 1} minute={minute} top={top} /></>}
            </div>
            <div className="wk-view wk-view-final" data-off={final ? undefined : ''}><Final city={city} race={race} seed={seed} /></div>
          </div>
        </div>
        <ol className="wk-steps" ref={box}>
          {STEPS.map((s, i) => (
            <li key={s.h} data-on={i === pos.k ? '' : undefined} data-past={i < pos.k ? '' : undefined}>
              <div className="wk-card">
                <p className="wk-key">{s.key}</p>
                <h3>{s.h}</h3>
                <p className="wk-p">{s.p(cfg)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* the clock as the progress rail: 0, 45, 60, 90, lit up to the minute; 45 to 60 is the hidden stretch */
const MARKS: [number, string, string, 'l' | 'r'][] = [[0, 'Build starts', 'Build', 'l'], [OPEN, 'Voting opens', 'Vote', 'r'], [SHOW, 'Counts shown', 'Shown', 'l'], [END, 'Close', 'Close', 'r']];
function Rail({ minute }: { minute: number }) {
  const pct = (x: number) => (100 * x) / END + '%';
  return (
    <div className="wk-rail">
      <div className="wk-track"><span className="wk-hid" style={{ left: pct(OPEN), width: pct(SHOW - OPEN) }} /><span className="wk-fill" style={{ transform: `scaleX(${minute / END})` }} /></div>
      <ol>{MARKS.map(([x, long, short, a]) => <li key={x} style={{ left: pct(x) }} data-a={a} data-x={x} data-on={minute >= x ? '' : undefined}><b>{x}</b><span className="wk-long">{long}</span><span className="wk-short">{short}</span></li>)}</ol>
    </div>
  );
}

/* the race: one line per project on a fixed scale; the hidden stretch as the ::| hatch with the votes falling in as
   blue marks; the cut (3rd place's count) in green once every count is out, solid at the close */
function Chart({ race, st, minute, reveal, top, strip }: { race: Proj[]; st: Standing; minute: number; reveal: number; top: number; strip?: boolean }) {
  const X = (t: number) => (100 * t) / END, Y = (v: number) => 100 - (100 * v) / top, m = minute;
  const shown = new Map(st.rows.map((r) => [r.i, r.shown]));
  const lines = race.map((p, i) => {
    if (p.arrive > m) return null;
    const s = shown.get(i), d = [`M${X(p.arrive)},${Y(0)}`];
    if (m <= SHOW || s === null || s === undefined) d.push(`H${X(Math.min(m, SHOW))}`);
    else {
      let c = countAt(p, SHOW); d.push(`H${X(Math.max(p.arrive, SHOW))}`, `V${Y(c)}`);
      for (const e of p.ev) { if (e.t < SHOW || e.t >= m) continue; c += e.n; d.push(`H${X(e.t)}`, `V${Y(c)}`); }
      d.push(`H${X(m)}`);
    }
    return { i, you: p.you, d: d.join('') };
  }).filter(Boolean) as { i: number; you: boolean; d: string }[];
  const ticks = strip ? [] : race.flatMap((p, i) => p.ev.filter((e) => !e.judge && e.t >= OPEN && e.t < Math.min(m, SHOW)).map((e, k) => ({ x: X(e.t), y: 92 - (((i * 37 + k * 53) % 97) / 97) * 62 })));
  const judges = strip ? [] : st.rows.filter((r) => r.shown !== null).flatMap((r) => r.p.ev.filter((e) => e.judge && e.t < m).map((e) => ({ x: X(e.t), y: Y(countAt(r.p, e.t + 0.001)), k: r.i + ':' + e.t, you: r.p.you })));
  /* who has gone in: a short mark on the base at each arrival, yours brighter */
  const arrivals = race.filter((p) => p.arrive <= m).map((p) => ({ x: X(p.arrive), you: p.you, k: p.name }));
  const you = st.rows.find((r) => r.p.you), youV = you ? (you.shown ?? 0) : 0, lead = st.cut !== null ? st.rows[0] : null;
  const tag = !you ? null : m < OPEN ? 'YOU · 0' : you.shown === null ? 'YOU · ?' : 'YOU · ' + you.shown;
  const hatchW = Math.max(0, X(Math.min(m, SHOW)) - X(OPEN));
  return (
    <div className="wk-chart" data-strip={strip ? '' : undefined}>
      {m >= OPEN ? <span className="wk-box" style={{ left: X(OPEN) + '%', width: hatchW + '%', opacity: 1 - Math.min(1, reveal * 1.6) }} /> : null}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" x2="100" y1="100" y2="100" className="wk-base" />
        {ticks.map((t, k) => <rect key={k} x={t.x - 0.12} y={t.y} width="0.24" height="4" className="wk-tick" opacity={1 - Math.min(1, reveal * 2)} />)}
        {lines.map((l) => <path key={l.i} d={l.d} className="wk-line" data-you={l.you ? '' : undefined} />)}
        {st.cut !== null ? <line x1={X(SHOW)} x2={X(m)} y1={Y(st.cut)} y2={Y(st.cut)} className="wk-cut" data-lock={st.closed ? '' : undefined} /> : null}
        {m < END ? <line x1={X(m)} x2={X(m)} y1="0" y2="100" className="wk-head" /> : null}
      </svg>
      {arrivals.map((a) => <span key={a.k} className="wk-in" data-you={a.you ? '' : undefined} style={{ left: a.x + '%' }} />)}
      {judges.map((j) => <span key={j.k} className="wk-judge" data-you={j.you ? '' : undefined} style={{ left: j.x + '%', top: j.y + '%' }} />)}
      {lead && lead.shown !== null ? <span className="wk-lead" style={{ left: X(m) + '%', top: Y(lead.shown) + '%' }} /> : null}
      {tag && !strip ? <span className="wk-tag" data-flip={X(m) > 78 ? '' : undefined} style={{ left: X(m) + '%', top: Y(youV) + '%', marginTop: youV === 0 ? -14 : st.cut !== null && Math.abs(Y(youV) - Y(st.cut)) < 6 ? (youV >= st.cut ? -12 : 12) : 0 }}>{tag}</span> : null}
    </div>
  );
}

const L = ({ l, s }: { l: string; s: string }) => <><span className="wk-long">{l}</span><span className="wk-short">{s}</span></>;
function Legend({ ledger }: { ledger?: boolean }) {
  return (
    <ul className="wk-legend">
      {ledger ? <li><i className="wk-k-bar" /><L l="each bar, one project’s votes" s="votes" /></li> : <li><i className="wk-k-line" /><L l="one line per project" s="votes" /></li>}
      {ledger ? <li><i className="wk-k-hatch" /><L l="hatched: hidden until 60" s="hidden" /></li> : <li><i className="wk-k-blue" /><L l="blue: a vote in, hidden" s="hidden vote" /></li>}
      {ledger ? null : <li><i className="wk-k-judge" /><L l="a judge’s vote, +5" s="judge +5" /></li>}
      <li><i className="wk-k-cut" /><L l="green: top-3 cut" s="top-3 cut" /></li>
    </ul>
  );
}

/* the city's list: the top rows, sliding when the order changes; your project kept in view under them */
function slots(st: Standing, n: number) {
  const you = st.rows.find((r) => r.p.you), pinned = you && you.rank > n ? you : null;
  return { pinned, slot: (r: Row) => (r.rank <= n ? r.rank - 1 : r === pinned ? n : -1) };
}
function Count({ r, minute, judges }: { r: Row; minute: number; judges?: boolean }) {
  if (minute < OPEN) return <span className="wk-n">—</span>;
  if (r.shown === null) return <span className="wk-n" data-q="">?</span>;
  return <span className="wk-n">{r.shown}{judges && r.judge ? <small>{r.judge} from judges</small> : null}</span>;
}
const prizeOf = (rank: number) => (rank === 1 ? C.winner.thing : '$' + C.finalist.credits + ' credits');

function Board({ st, n, minute, tower }: { st: Standing; n: number; minute: number; tower?: boolean }) {
  const { slot } = slots(st, n), rowH = tower ? 40 : 30;
  return (
    <div className="wk-board" data-tower={tower ? '' : undefined}>
      <ol style={{ height: (n + 1) * rowH + 8 }}>
        {st.rows.map((r) => {
          const s = slot(r), top3 = st.closed && r.rank <= 3, gap = st.cut !== null && r.shown !== null ? r.shown - st.cut : null;
          return (
            <li key={r.p.name} data-you={r.p.you ? '' : undefined} data-top={top3 ? '' : undefined} style={{ transform: `translateY(${s * rowH + (s === n ? 8 : 0)}px)`, opacity: s < 0 ? 0 : 1, zIndex: 100 - r.rank }}>
              <span className="wk-rank">{String(r.rank).padStart(2, '0')}</span>
              <span className="wk-name">{r.p.name}</span>
              {tower ? <span className="wk-gap" data-final={st.closed ? '' : undefined}>{st.closed ? (r.rank <= 3 ? 'finalist' : '') : gap === null ? '' : r.rank <= 3 ? 'in the top 3' : gap === 0 ? 'level with the cut' : Math.abs(gap) + ' short of the cut'}</span> : null}
              <span className="wk-prize" data-on={top3 ? '' : undefined}>{top3 ? prizeOf(r.rank) : ''}</span>
              <Count r={r} minute={minute} judges={tower} />
            </li>
          );
        })}
        {st.rows.length === 0 ? <li className="wk-empty">No projects in yet</li> : null}
      </ol>
      <p className="wk-foot">{minute < OPEN ? 'Voting opens at minute 45' : st.hidden ? st.inHidden + ' votes in · shown at minute 60' : st.closed ? 'The top 3 go to the global final' : 'Live · a judge’s vote counts 5'}</p>
    </div>
  );
}

/* the ledger: one bar per project on the same fixed scale; hidden bars are the ::| hatch with a ?; the cut runs
   down through every bar */
function Ledger({ st, n, minute, top }: { st: Standing; n: number; minute: number; top: number }) {
  const { slot } = slots(st, n), rowH = 34;
  return (
    <div className="wk-board wk-ledger">
      <ol style={{ height: (n + 1) * rowH + 8 }}>
        {st.cut !== null ? <span className="wk-cutline" data-lock={st.closed ? '' : undefined} style={{ transform: `translateX(${(100 * st.cut) / top}%)` }} /> : null}
        {st.rows.map((r) => {
          const s = slot(r), top3 = st.closed && r.rank <= 3;
          return (
            <li key={r.p.name} data-you={r.p.you ? '' : undefined} data-top={top3 ? '' : undefined} style={{ transform: `translateY(${s * rowH + (s === n ? 8 : 0)}px)`, opacity: s < 0 ? 0 : 1, zIndex: 100 - r.rank }}>
              <span className="wk-rank">{String(r.rank).padStart(2, '0')}</span>
              <span className="wk-name">{r.p.name}</span>
              <span className="wk-bar" data-q={minute >= OPEN && r.shown === null ? '' : undefined}><i style={{ transform: `scaleX(${minute < OPEN ? 0 : r.shown === null ? 1 : r.shown / top})` }} /></span>
              <Count r={r} minute={minute} />
              <span className="wk-prize" data-on={top3 ? '' : undefined}>{top3 ? prizeOf(r.rank) : ''}</span>
            </li>
          );
        })}
        {st.rows.length === 0 ? <li className="wk-empty">No projects in yet</li> : null}
      </ol>
      <p className="wk-foot">{minute < OPEN ? 'Voting opens at minute 45' : st.hidden ? st.inHidden + ' votes in · shown at minute 60' : st.closed ? 'The top 3 go to the global final' : 'Live · a judge’s vote counts 5'}</p>
    </div>
  );
}

/* after 90: every city's 3, yours named, and the three global places */
function Final({ city, race, seed }: { city: WalkCity; race: Proj[]; seed: number }) {
  const { ids, F } = useMemo(() => {
    const top3 = standing(race, END, 1).rows.slice(0, 3).map((r) => r.p.name);
    const ids = [city.id, ...CITIES.map((c) => c.id).filter((id) => id !== city.id)].slice(0, 14);
    return { top3, ids, F: finalists(ids, city.id, top3, seed) };
  }, [city.id, race, seed]);
  return (
    <div className="wk-final">
      <ol className="wk-codes">{ids.map((id) => <li key={id} data-mine={id === city.id ? '' : undefined}><b>{CODE[id] || id.slice(0, 3).toUpperCase()}</b><span>▪▪▪</span></li>)}</ol>
      <p className="wk-final-k">One city’s 3, among 42</p>
      <ol className="wk-mine">{F[city.id].map((name, k) => <li key={name} data-you={name === 'Your project' ? '' : undefined}><span>{String(k + 1).padStart(2, '0')}</span>{name}</li>)}</ol>
      <ol className="wk-slots">{G.map((g) => <li key={g.place}><span>Global {['1st', '2nd', '3rd'][g.place - 1]}</span>{g.thing}</li>)}</ol>
    </div>
  );
}
