'use client';
import { useEffect, useRef, useState } from 'react';
import { votesAtMin } from '@/lib/day-data';
import type { CityWorld, Row } from '@/lib/city';
import { fmtN, hhmm, ord } from '@/lib/format';
import { Thumb } from './rank-pictures';

/* The ranking over time: the top ten's votes as steps from the city's opening to now, zoomed to the ten, each line
   ending in its place, picture and name. Votes come one at a time, so the lines are steps, never curves.
   - 1st is orange (on air), 2nd blue, 3rd ink: the three that go to the final today; 4th to 10th are thin grey.
   - The x axis is the city's local time: opening, entries close (a dashed rule), the end of voting; "now" while it runs.
   - Pointing at a line, a name or a row of the top ten beside it lights that one and dims the rest; the names are
     buttons that open the project, so the chart works from the keyboard too.
   - The lines draw in once when the view opens (--dur-draw, a step of --stagger apart); not under reduced motion. */

export const LINE = ['#3ecf8e', '#4d6bff', '#f4f4f2'];
export const lineOf = (rank: number) => LINE[rank - 1] ?? '#6b6c6b';
const PAD = { l: 44, r: 16, t: 16, b: 34 }, LABEL_W = 300, GAP = 26, H = 460;

/* n: how many lines (the top n); tall: the chart's height in px; pic: the pictures' width by the names, in px */
export function RankTime({ W, open, hot, setHot, draw = false, n = 10, tall = H, pic = 40 }: { W: CityWorld; open: (o: Row) => void; hot: number | null; setHot: (id: number | null) => void; draw?: boolean; n?: number; tall?: number; pic?: number }) {
  const H = tall, rowH = Math.max(24, Math.round(pic * 0.5625) + 4), GAP_N = Math.max(GAP, rowH + 8);
  const box = useRef<HTMLDivElement>(null), [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = w < 560, labelW = narrow ? 0 : Math.min(LABEL_W + pic - 40, w * 0.4), top = W.ranked.slice(0, n);
  const a = W.x.start, b = Math.min(W.now, W.x.end), plotW = w - PAD.l - PAD.r - labelW, plotH = H - PAD.t - PAD.b;
  const vmax = Math.max(10, ...top.map((o) => o.v)) * 1.08;
  const X = (m: number) => PAD.l + ((m - a) / (W.x.end - a)) * plotW, Y = (v: number) => PAD.t + plotH - (v / vmax) * plotH;
  const step = Math.max(10, niceStep(vmax / 4)), ticks: number[] = []; for (let v = 0; v < vmax; v += step) ticks.push(v);
  const hours: number[] = []; for (let m = Math.ceil(a / 30) * 30; m <= W.x.end; m += 30) hours.push(m);
  /* each line, minute by minute from its arrival, as steps */
  const paths = top.map((o) => {
    const from = Math.max(a, Math.floor(o.arrive)); let d = '', last = -1;
    for (let m = from; m <= b; m++) {
      const v = votesAtMin(o.r, W.x, m), x = X(m).toFixed(1), y = Y(v).toFixed(1);
      if (!d) d = 'M' + x + ' ' + y; else if (v !== last) d += 'H' + x + 'V' + y;
      last = v;
    }
    return d + 'H' + X(b).toFixed(1);
  });
  /* the names at the right: at their line's end, pushed apart so they never overlap, held inside the chart */
  const ends = top.map((o, k) => ({ o, k, y: Y(o.v) })).sort((p, q) => p.y - q.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + GAP_N);
  const over = ends.length ? ends[ends.length - 1].y - (PAD.t + plotH) : 0;
  if (over > 0) { ends[ends.length - 1].y -= over; for (let k = ends.length - 2; k >= 0; k--) ends[k].y = Math.min(ends[k].y, ends[k + 1].y - GAP_N); }
  const lit = (id: number) => hot == null || hot === id;
  const label = 'Votes over time for the top ' + (n === 10 ? 'ten' : n) + ' in ' + W.city.name + ', from ' + hhmm(a + W.off) + ' to ' + hhmm(b + W.off) + ' local.';
  return (
    <div className="rt" ref={box} style={{ ['--rt-row' as string]: rowH + 'px', ['--rt-pic' as string]: pic + 'px' }} data-hot={hot == null ? undefined : ''} data-draw={draw ? '' : undefined}>
      <p className="rt-key bd-k"><span>Votes · the top {n === 10 ? 'ten' : n}</span><span>Local time</span></p>
      <div className="rt-plot" style={{ height: H }}>
        {/* nothing until the width is measured, so a phone never gets a desktop-wide chart for a frame */}
        {w ? <svg className="rt-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label}>
          <g className="rt-grid">
            {ticks.map((v) => <g key={v}><line x1={PAD.l} x2={PAD.l + plotW} y1={Y(v)} y2={Y(v)} /><text x={PAD.l - 10} y={Y(v) + 4} textAnchor="end">{fmtN(v)}</text></g>)}
            <line className="rt-base" x1={PAD.l} x2={PAD.l + plotW} y1={PAD.t + plotH} y2={PAD.t + plotH} />
            {hours.map((m) => <text key={m} x={X(m)} y={H - 10} textAnchor={X(m) > PAD.l + plotW - 24 ? 'end' : X(m) < PAD.l + 24 ? 'start' : 'middle'}>{hhmm(m + W.off)}</text>)}
            <line className="rt-close" x1={X(W.x.buildEnd)} x2={X(W.x.buildEnd)} y1={PAD.t} y2={PAD.t + plotH} />
            <text className="rt-mk" x={X(W.x.buildEnd) - 6} y={PAD.t + 12} textAnchor="end">Entries close</text>
            {W.voting ? <><line className="rt-now" x1={X(b)} x2={X(b)} y1={PAD.t} y2={PAD.t + plotH} /><text className="rt-mk" x={X(b) + (X(b) > PAD.l + plotW - 36 ? -6 : 6)} y={PAD.t + (X(b) - X(W.x.buildEnd) < 90 ? 28 : 12)} textAnchor={X(b) > PAD.l + plotW - 36 ? 'end' : 'start'}>Now</text></> : null}
          </g>
          {top.map((o, k) => (
            <g key={o.p.id} className="rt-line" data-k={k < 3 ? 'top' : 'rest'} data-lit={lit(o.p.id) ? '' : undefined} style={{ ['--i' as string]: 9 - k }}
              onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHot(o.p.id); }} onPointerLeave={() => setHot(null)}>
              <path d={paths[k]} stroke={lineOf(o.rank)} pathLength={1} />
              <path className="rt-hit" d={paths[k]} />
              <circle cx={X(b)} cy={Y(o.v)} r={k < 3 ? 3.5 : 2.5} fill={lineOf(o.rank)} />
              {narrow ? null : <line className="rt-tie" x1={X(b) + 4} x2={PAD.l + plotW + 14} y1={Y(o.v)} y2={ends.find((e) => e.o === o)!.y} />}
            </g>
          ))}
        </svg> : null}
        {narrow || !w ? null : (
          <ol className="rt-names" style={{ left: PAD.l + plotW + 16 }}>
            {ends.map(({ o, y }) => (
              <li key={o.p.id} style={{ top: y }} data-lit={lit(o.p.id) ? '' : undefined} data-k={o.rank <= 3 ? 'top' : 'rest'}>
                <button type="button" onClick={() => open(o)} onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHot(o.p.id); }} onPointerLeave={() => setHot(null)} onFocus={() => setHot(o.p.id)} onBlur={() => setHot(null)}
                  aria-label={ord(o.rank) + ', ' + o.p.name + ', ' + fmtN(o.v) + ' votes'}>
                  <span className="rt-pl">{o.rank}</span><i style={{ background: lineOf(o.rank) }} /><Thumb p={o.p} w={pic} /><span className="rt-nm">{o.p.name}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* on a phone the names sit under the chart, in place order */}
      {narrow ? (
        <ol className="rt-under">
          {top.map((o) => (
            <li key={o.p.id} data-lit={lit(o.p.id) ? '' : undefined}>
              <button type="button" onClick={() => open(o)} onFocus={() => setHot(o.p.id)} onBlur={() => setHot(null)}>
                <span className="rt-pl">{o.rank}</span><i style={{ background: lineOf(o.rank) }} /><Thumb p={o.p} w={40} /><span className="rt-nm">{o.p.name}</span><span className="rt-v">{fmtN(o.v)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function niceStep(x: number): number { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
