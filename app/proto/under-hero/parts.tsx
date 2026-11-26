'use client';
/* proto:under-hero. The pieces every direction draws: the clock, the race chart, the board, the editor take, the
   finalists grid and the prize block. Throwaway: nothing outside /proto/under-hero imports this. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CITIES } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { PRIZE_SHEET, credits } from '@/lib/prizes';
import { BEATS, END, OPEN, RACE, SHOW, TOTAL, atMs, countAt, finalists, standing, type At } from './race';
type AtT = At;

const reducedNow = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, reducedNow, () => false);

/* local clock time of a minute into the city's build */
export const localAt = (city: { opens: number; offset: number }, m: number) => new Date(city.opens + (city.offset + m) * 60000).toISOString().slice(11, 16);

/* A clock in ms that runs while its element is on screen. Reduced motion: the close, held. loop: the last 220 ms of
   the hold fade the drawing out, the clock goes back to 0 while it is unseen, and it fades in again. replay() starts
   it over. fade is that opacity, for the drawing only. */
export function useClock<T extends HTMLElement = HTMLDivElement>(total: number, loop = true) {
  const ref = useRef<T>(null), rm = useReduced();
  const [ms, setMs] = useState(0), [wipe, setWipe] = useState(0), t0 = useRef<number | null>(null), seen = useRef(false);
  const replay = useCallback(() => { t0.current = null; setMs(0); setWipe((w) => w + 1); }, []);
  useEffect(() => {
    if (rm) return;
    const el = ref.current; if (!el) return;
    let raf = 0, vis = false;
    const tick = (now: number) => {
      if (t0.current === null) t0.current = now - ms;
      const e = now - t0.current;
      if (e >= total) { if (loop) { t0.current = now; setWipe((w) => w + 1); setMs(0); } else { setMs(total); return; } }
      else setMs(e);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([x]) => {
      vis = x.isIntersecting; cancelAnimationFrame(raf);
      if (vis) { seen.current = true; t0.current = null; raf = requestAnimationFrame(tick); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // ms is read only to resume where it stopped
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rm, total, loop, wipe]);
  const fade = rm || !loop ? 1 : Math.max(0, Math.min(1, wipe > 0 ? ms / 220 : 1, (total - ms) / 220));
  return { ref, ms: rm ? total - 1 : ms, replay, wipe, fade };
}

/* ---------------- the race chart ---------------- */
const TOP_V = 56;
/* from: the first minute drawn (a panel about voting starts just before 45) */
export function RaceChart({ at, W = 560, H = 300, x0 = 8, x1 = W - 70, top = 26, bottom = H - 34, axis = 'short', from = 0, className }: { at: AtT; W?: number; H?: number; x0?: number; x1?: number; top?: number; bottom?: number; axis?: 'short' | 'long' | 'none'; from?: number; className?: string }) {
  const X = (m: number) => x0 + ((x1 - x0) * (Math.max(from, m) - from)) / (END - from), Y = (v: number) => bottom - ((bottom - top) * v) / TOP_V;
  const st = standing(at), shown = new Map(st.rows.map((r) => [r.i, r.shown])), leader = st.cut !== null ? st.rows[0] : null;
  const m = at.min, lift = at.min > SHOW || (at.min === SHOW && at.reveal > 0) ? Math.min(1, at.reveal / 0.2) : 0;
  const lines = RACE.map((p, i) => {
    if (p.arrive > m) return null;
    const s = shown.get(i), d: string[] = [`M${X(p.arrive).toFixed(1)},${Y(0)}`];
    if (m <= SHOW && (s === null || s === undefined)) d.push(`H${X(Math.min(m, SHOW)).toFixed(1)}`);
    else {
      let c = countAt(p, SHOW);
      d.push(`H${X(Math.max(p.arrive, SHOW)).toFixed(1)}`, `V${Y(c).toFixed(1)}`);
      for (const e of p.ev) { if (e.t < SHOW || e.t >= m) continue; c += e.n; d.push(`H${X(e.t).toFixed(1)}`, `V${Y(c).toFixed(1)}`); }
      d.push(`H${X(m).toFixed(1)}`);
    }
    return { p, i, d: d.join(''), s };
  }).filter(Boolean) as { p: (typeof RACE)[number]; i: number; d: string; s: number | null | undefined }[];
  /* the first judge riser on screen carries the one label */
  const judge = RACE.flatMap((p) => p.ev.filter((e) => e.judge && e.t < m && m > SHOW).map((e) => ({ p, e }))).sort((a, b) => a.e.t - b.e.t)[0];
  const you = lines.find((l) => l.p.you), youV = you ? (you.s ?? null) : null, youY = you && youV !== null ? Y(youV) : Y(0);
  const tag = !you ? null : m < OPEN ? 'YOU · 0' : youV === null ? 'YOU · ?' : 'YOU · ' + youV;
  const ticks = RACE.flatMap((p, i) => p.ev.filter((e) => e.t >= OPEN && e.t < Math.min(m, SHOW)).map((e, k) => ({ x: X(e.t), y: bottom - 6 - ((((i * 37 + k * 53) % 97) / 97) * (bottom - top) * 0.55) })));
  const tickOp = Math.max(0, 1 - at.reveal * 3) * (m >= OPEN ? 1 : 0);
  const hatchL = X(OPEN) + (X(SHOW) - X(OPEN)) * lift, hatchOn = m >= OPEN && lift < 1;
  return (
    <svg className={'pv-chart ' + (className ?? '')} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A city's votes over 90 minutes: voting opens at ${OPEN}, counts are hidden until ${SHOW}, then shown live until the close at ${END}.`}>
      <defs>
        <pattern id="pv-hatch" width="15" height="11" patternUnits="userSpaceOnUse"><text x="0" y="9" className="pv-hatch-t">::|</text></pattern>
      </defs>
      {hatchOn ? <rect x={hatchL} y={top - 8} width={Math.max(0, Math.min(X(m), X(SHOW)) - hatchL)} height={bottom - top + 8} fill="url(#pv-hatch)" className="pv-hatch" /> : null}
      <line x1={x0} x2={x1} y1={bottom} y2={bottom} className="pv-base" />
      {axis !== 'none' ? [0, OPEN, SHOW, END].filter((t) => t >= from).map((t) => (
        <g key={t} className="pv-tick" data-on={m >= t ? '' : undefined}>
          <line x1={X(t)} x2={X(t)} y1={bottom} y2={bottom + 5} />
          <text x={X(t)} y={bottom + 18 + (axis === 'long' && t === SHOW ? 12 : 0)} textAnchor={t === from ? 'start' : t === END ? 'end' : 'middle'}>{axis === 'long' ? ({ 0: '0 build', [OPEN]: '45 voting opens', [SHOW]: '60 counts shown', [END]: '90 close' } as Record<number, string>)[t] : t === END ? '90 min' : String(t)}</text>
        </g>
      )) : null}
      {ticks.map((t, k) => <rect key={k} x={t.x - 0.75} y={t.y} width="1.5" height="6" className="pv-blue" opacity={tickOp} />)}
      {lines.map((l) => <path key={l.i} d={l.d} className="pv-line" data-you={l.p.you ? '' : undefined} />)}
      {m < SHOW ? RACE.filter((p) => p.arrive <= m).map((p) => <circle key={p.name} cx={X(p.arrive)} cy={Y(0)} r="2.4" className="pv-blue-dot" />) : null}
      {st.cut !== null ? <g className="pv-cut" data-lock={st.closed ? '' : undefined}>
        <line x1={X(SHOW)} x2={X(m)} y1={Y(st.cut)} y2={Y(st.cut)} />
        {st.closed ? <text x={X(END) + 6} y={Y(st.cut) + 4}>TOP 3</text> : null}
      </g> : null}
      {judge ? <text x={X(judge.e.t) + 4} y={Y(countAt(judge.p, judge.e.t + 0.001)) - 5} className="pv-judge">+5 judge</text> : null}
      {leader && leader.shown !== null ? <circle cx={X(m)} cy={Y(leader.shown)} r="3" className="pv-lead" /> : null}
      {m < END && m >= from ? <line x1={X(m)} x2={X(m)} y1={top - 8} y2={bottom} className="pv-head" /> : null}
      {tag ? <g className="pv-tag" transform={`translate(${Math.min(X(m) + 6, W - 66)},${Math.max(top, youY - 9)})`}><rect width="62" height="17" /><text x="6" y="12">{tag}</text></g> : null}
    </svg>
  );
}

/* the city's board: the top rows, sliding when the order changes */
export function Board({ at, rows = 5, city }: { at: At; rows?: number; city: string }) {
  /* while counts run live the order moves at most every 2 minutes of the clock (~350 ms), so a slide finishes before
     the next one starts; the reveal and the close are read as they are */
  const q = at.min > SHOW && at.min < END ? { ...at, min: Math.floor(at.min / 2) * 2 } : at;
  const st = standing(q), list = st.rows.slice(0, rows), m = q.min;
  return (
    <div className="pv-board" role="group" aria-label={`${city}, top ${rows}`}>
      <p className="pv-board-h"><span>{city}</span><span>{m < OPEN ? 'building' : st.hidden ? 'hidden until ' + SHOW : st.closed ? 'closed' : 'live'}</span></p>
      <ol style={{ height: rows * 30 }}>
        {st.rows.slice(0, Math.max(rows, st.rows.length)).map((r) => {
          const on = list.includes(r), top3 = st.closed && r.rank <= 3;
          return (
            <li key={r.p.name} data-you={r.p.you ? '' : undefined} data-top={top3 ? '' : undefined} style={{ transform: `translateY(${(r.rank - 1) * 30}px)`, opacity: on ? 1 : 0, zIndex: 100 - r.rank }} aria-hidden={on ? undefined : true}>
              <span className="pv-rank">{String(r.rank).padStart(2, '0')}</span><span className="pv-name">{r.p.name}</span>
              <span className="pv-count" data-q={r.shown === null && m >= OPEN ? '' : undefined}>{m < OPEN ? '—' : r.shown === null ? '?' : r.shown}</span>
            </li>
          );
        })}
      </ol>
      <p className="pv-board-f" aria-live="off">{st.closed ? 'Top 3 go to the final' : st.hidden && m >= OPEN ? st.inHidden + ' votes in · counts hidden' : m < OPEN ? 'Voting opens at ' + OPEN : 'Judges in · each vote counts ' + 5}</p>
    </div>
  );
}

/* ---------------- the build take: editor or browser ---------------- */
type Line = { k: 'you' | 'ans' | 'file' | 'diff' | 'cmd' | 'ok' | 'done'; t: string };
const EDITOR: Line[] = [
  { k: 'you', t: 'Map tonight’s gigs that still have tickets.' },
  { k: 'ans', t: 'I’ll read the venues table and leave out the sold-out ones.' },
  { k: 'file', t: 'Edited app/gigs.ts' },
  { k: 'diff', t: '+ return gigs.filter((g) => g.ticketsLeft > 0)' },
  { k: 'cmd', t: '$ npm test' },
  { k: 'ok', t: '✓ skips sold-out venues' },
  { k: 'you', t: 'Submit it to Builder Day.' },
  { k: 'done', t: 'Submitted at minute 34 · you’re on the board' },
];
const FORM: [string, string][] = [['Project', 'Gig map'], ['Link', 'gig-map.vercel.app'], ['Repository', 'github.com/you/gig-map']];
export function BuildTake({ ms, onMode }: { ms: number; onMode?: () => void }) {
  const [mode, setMode] = useState<'browser' | 'editor'>('browser');
  const pickMode = (m: 'browser' | 'editor') => { if (m !== mode) { setMode(m); onMode?.(); } };
  /* both takes last about as long: the form's few words type slower than the editor's lines */
  const cps = mode === 'editor' ? 0.045 : 0.012, gap = 260, texts = mode === 'editor' ? EDITOR.map((l) => l.t) : FORM.map(([, v]) => v);
  /* each line starts when the one before it has finished typing */
  const starts = texts.map((_, k) => texts.slice(0, k).reduce((a, s) => a + s.length / cps + gap, 0));
  const t = starts[texts.length - 1] + texts[texts.length - 1].length / cps + gap;
  const typed = (k: number) => Math.max(0, Math.min(texts[k].length, Math.floor((ms - starts[k]) * cps)));
  return (
    <div className="pv-build">
      <div className="pv-seg" role="group" aria-label="Way to submit">
        <button type="button" aria-pressed={mode === 'browser'} onClick={() => pickMode('browser')}>In the browser</button>
        <button type="button" aria-pressed={mode === 'editor'} onClick={() => pickMode('editor')}>From your editor</button>
      </div>
      {mode === 'editor' ? (
        <div className="pv-term" role="group" aria-label="An editor session that ends with a submit">
          {EDITOR.map((l, k) => { const n = typed(k); return n > 0 ? <p key={k} data-k={l.k}>{l.t.slice(0, n)}{n < l.t.length ? <span className="pv-caret" /> : null}</p> : null; })}
        </div>
      ) : (
        <div className="pv-form" role="group" aria-label="The submit form on your city's page">
          {FORM.map(([k, v], i) => { const n = typed(i); return <p key={k}><span>{k}</span><span>{v.slice(0, n)}{n > 0 && n < v.length ? <span className="pv-caret" /> : null}</span></p>; })}
          <p className="pv-form-go" data-on={ms > t ? '' : undefined}>{ms > t ? 'Submitted at minute 34 · you’re on the board' : 'Submit'}</p>
        </div>
      )}
    </div>
  );
}
export const BUILD_MS = 9200;

/* ---------------- the final ---------------- */
export function FinalGrid({ mine, compact = false }: { mine: string; compact?: boolean }) {
  const ids = [mine, ...CITIES.map((c) => c.id).filter((id) => id !== mine)], F = finalists(ids, mine);
  return (
    <div className="pv-final" data-compact={compact ? '' : undefined}>
      {compact ? (
        /* a narrow panel: every city as its code and three marks, yours with its three names */
        <>
          <ol className="pv-codes" aria-label="The 14 cities, 3 finalists each">
            {ids.map((id) => <li key={id} data-mine={id === mine ? '' : undefined}><b>{CODE[id]}</b><span aria-hidden="true">▪▪▪</span><span className="sr-only">3 finalists</span></li>)}
          </ol>
          <ol className="pv-mine" aria-label={'The 3 finalists from ' + CODE[mine]}>{F[mine].map((n, k) => <li key={n} data-you={n === 'Your project' ? '' : undefined}><span>{String(k + 1).padStart(2, '0')}</span>{n}</li>)}</ol>
        </>
      ) : (
        <div className="pv-grid" role="group" aria-label="The 42 finalists, 3 from each of the 14 cities">
          {ids.map((id) => (
            <div key={id} className="pv-gc" data-mine={id === mine ? '' : undefined}>
              <p className="pv-gc-h">{CODE[id]}</p>
              <ol>{F[id].map((n, k) => <li key={n} data-you={n === 'Your project' ? '' : undefined}><span>{String(k + 1).padStart(2, '0')}</span>{n}</li>)}</ol>
            </div>
          ))}
        </div>
      )}
      <ol className="pv-slots" aria-label="The global places">
        {PRIZE_SHEET.global.map((g) => <li key={g.place}><span>{['1st', '2nd', '3rd'][g.place - 1]}</span>{g.thing}</li>)}
      </ol>
    </div>
  );
}

/* ---------------- prizes, first ---------------- */
export function Prizes({ plain }: { plain?: ReactNode }) {
  const G = PRIZE_SHEET.global, C = PRIZE_SHEET.city;
  return (
    <section id="prizes" className="pf-part pv-prizes" aria-labelledby="prizes-h">
      <h2 id="prizes-h" className="pf-h">Prizes</h2>
      <p className="pv-tier"><b>The global final.</b> {cap(PRIZE_SHEET.picker)} picks 1st, 2nd and 3rd from all 42 finalists, announced {PRIZE_SHEET.announce}.</p>
      <ol className="pv-podium">
        {G.map((g) => (
          <li key={g.place} data-place={g.place}>
            <span className="pv-chip">Global {['1st', '2nd', '3rd'][g.place - 1]}</span>
            <h3 className="pv-thing">{g.thing}</h3>
            <p className="pv-spec" data-empty={g.spec ? undefined : ''}>{g.spec ?? ' '}</p>
            <p className="pv-plus">+ {credits(g)}</p>
          </li>
        ))}
      </ol>
      <p className="pv-tier"><b>In each of the 14 cities.</b> The 3 projects with the most votes are the city’s finalists.</p>
      <ol className="pv-podium pv-city">
        <li><span className="pv-chip">1st in the city</span><h3 className="pv-thing">{C.winner.thing}</h3><p className="pv-spec">{C.winner.spec}</p><p className="pv-plus">+ {credits(C.winner)} and a swag box</p></li>
        <li><span className="pv-chip">2nd and 3rd</span><h3 className="pv-thing">${C.finalist.credits} credits</h3><p className="pv-spec">Supabase credits, each</p><p className="pv-plus">+ a swag box each</p></li>
      </ol>
      {plain}
    </section>
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const PLAIN = 'Pick a city. Build something with Supabase for 90 minutes. The 3 projects with the most votes in each city win prizes and go to the global final.';

export { BEATS, TOTAL, atMs, OPEN, SHOW, END };
