'use client';
import type { CSSProperties } from 'react';
import { clamp, hhmm, r2, tz } from '@/lib/format';
import { cityHref, localSpan, slotText, view, type HomeCfg, type HomeCity, type HomeWorld } from '@/lib/home';
import { useDay } from '@/components/home/day-context';
import { CODE } from '@/lib/places';
import { HomeMasthead } from '@/components/home/home-masthead';
import { Axis, Join, NameLink, PhoneNow, Ruler, Slot, Trunk } from '@/components/home/timetable';
import { Picture } from '@/components/pictures/picture';
import { CitySeal, MergedSeal } from '@/components/seal/seal-config';
import { CITY_WORD } from '@/lib/day-data';

/* The home's layouts that were not chosen, kept on the tuning page to compare: Index (the timetable's rows as a
   ruled index), Wall (ten panels and a draw), Dial (the day as a 24-hour ring). They share the home's model. */
export function DayLayouts({ mode }: { mode: string }) {
  if (mode === 'index') return <Index />;
  if (mode === 'wall') return <Wall />;
  if (mode === 'dial') return <Dial />;
  return null;
}

function rowCls(x: HomeCity, W: HomeWorld, c: HomeCfg, extra: string) { const pk = W.picked && W.pick === x; return 'row is-' + x.state + (pk ? ' is-pick' : '') + (c.you === x.i ? ' is-you' : '') + ' ' + extra; }
function Tie({ x, W }: { x: HomeCity; W: HomeWorld }) { return <i className="tie" aria-hidden="true" data-g={W.picked && W.pick === x ? '1' : undefined} />; }
function CityMark({ x, c }: { x: HomeCity; c: HomeCfg }) { return c.seal && x.state === 'done' ? <span className="mark" aria-hidden="true"><CitySeal id={x.id} size={24} /></span> : null; }
function You({ x, c }: { x: HomeCity; c: HomeCfg }) { return c.you === x.i && c.green >= 4 ? <>{' · '}<b className="you" data-g="1">Yours</b></> : null; }

function Index({ compact }: { compact?: boolean }) {
  const { cfg: c, W } = useDay(), V = view(c, W);
  return (
    <>
      {compact ? null : <HomeMasthead cls="mh-poster" />}
      <section className={'ix' + (compact ? ' ix-compact' : '')} aria-label={`The ${CITY_WORD} cities, east to west`}>
        <Axis V={V} W={W} cls="ix-axis" />
        <ol className="rows">
          {W.cs.map((x) => (
            <li key={'r' + x.i} className={rowCls(x, W, c, 'ix-row')} data-k={'r' + x.i} style={{ '--i': x.i } as CSSProperties}>
              <NameLink x={x} cls="name" />
              <span className="ix-ruler"><Ruler x={x} V={V} /><i className="ix-now" style={{ left: r2(V.nx) + '%' }} hidden={W.archived} data-g={W.archived ? undefined : '1'} /></span>
              <Slot x={x} /><Tie x={x} W={W} /><CityMark x={x} c={c} />
            </li>
          ))}
        </ol>
        <PhoneNow W={W} /><Trunk W={W} /><Join W={W} c={c} />
      </section>
    </>
  );
}

function Wall() {
  const { cfg: c, W, carry } = useDay(), V = view(c, W);
  return (
    <>
      <HomeMasthead cls="mh-band" />
      <section className="wl" aria-label={`The ${CITY_WORD} cities, east to west`}>
        <ol className="wl-grid">
          {W.cs.map((x) => {
            const loc = W.now + x.city.offset, lm = ((loc % 1440) + 1440) % 1440, rise = x.city.rise, set = x.city.set, s = Math.max(1, c.soft / 2);
            const f = W.archived ? 0 : clamp((lm - (rise - s)) / (2 * s), 0, 1) * clamp(((set + s) - lm) / (2 * s), 0, 1), t = slotText(x, W);
            const p = x.lead ? x.lead.p : null, pk = W.picked && W.pick === x, g = (x.state === 'build' || x.state === 'vote' || pk) && c.green >= 3;
            return (
              <li key={'r' + x.i} className={rowCls(x, W, c, 'wl-p')} data-k={'r' + x.i} style={{ '--i': x.i, '--dayf': r2(f * c.band) + '%' } as CSSProperties}>
                <a className="name" href={cityHref(x, c, W, carry)} data-city={x.id}>{x.name}</a>
                <p className="wl-meta"><span>{W.archived ? localSpan(x) : hhmm(loc) + ' local'}</span><span>{tz(x.city.offset)}<You x={x} c={c} /></span></p>
                <span className="wl-pic"><Picture p={p} /></span>
                <p className={'wl-tx' + (g ? ' g' : '')}><span className="slot-k">{g ? <i className="gsq" data-g="1" /> : null}{t.k}</span><span className="slot-a">{t.a}</span><span className="slot-b">{t.b}</span></p>
                <span className="wl-ruler"><Ruler x={x} V={V} /><i className="ix-now" style={{ left: r2(V.nx) + '%' }} hidden={W.archived} data-g={W.archived ? undefined : '1'} /></span>
                <CityMark x={x} c={c} />
              </li>
            );
          })}
        </ol>
        <div className={'dr' + (W.allDone ? ' is-full' : '') + (W.picked ? ' is-picked' : '')} style={{ '--pi': W.pick.i } as CSSProperties}>
          <ol>{W.cs.map((x) => <li key={'d' + x.i} className={rowCls(x, W, c, 'dr-s')} data-k={'d' + x.i}><span className="dr-c">{x.name}</span><span className="dr-n">{x.state === 'done' ? x.lead!.p.name : ''}</span><i className="dr-t" aria-hidden="true" /></li>)}</ol>
          <i className="dr-bus" aria-hidden="true" />
          {W.picked ? <i className="dr-bus-g" data-g="1" aria-hidden="true" /> : null}
          <Join W={W} c={c} cls="dr-join" />
        </div>
      </section>
    </>
  );
}

function Dial() {
  const { cfg: c, W } = useDay(), S = W.S, A = (m: number) => (m / 1440) * 360 - 90;
  const Pt = (r: number, m: number): [number, number] => { const a = A(m) * Math.PI / 180; return [r2(Math.cos(a) * r), r2(Math.sin(a) * r)]; };
  const arc = (r: number, m0: number, m1: number) => { const a = Pt(r, m0), b = Pt(r, m1), large = (m1 - m0) % 1440 > 720 ? 1 : 0; return 'M' + a[0] + ' ' + a[1] + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + b[0] + ' ' + b[1]; };
  const R0 = 112, DR = 15, RO = R0 + 9 * DR + 16, hours = [];
  for (let h = 0; h < 24; h++) {
    const a = Pt(RO, h * 60), b = Pt(RO + (h % 3 ? 5 : 10), h * 60);
    hours.push(<line key={'t' + h} className="d-tick" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />);
    if (h % 6 === 0) { const l = Pt(RO + 24, h * 60); hours.push(<text key={'l' + h} className="d-lbl" x={l[0]} y={l[1]}>{hhmm(h * 60) + (h ? '' : ' UTC')}</text>); }
  }
  const tracks = W.cs.map((x) => {
    const r = R0 + x.i * DR, city = x.city, pk = W.picked && W.pick === x, o = [<circle key="tr" className="d-track" r={r} />];
    if (c.band) for (let d = -1; d <= 1; d++) { const s0 = d * 1440 + city.rise - city.offset, s1 = d * 1440 + city.set - city.offset; if (s1 < S.winStart - 1440 || s0 > S.winEnd) continue; o.push(<path key={'d' + d} className="d-day" style={{ opacity: r2(c.band / 100) }} d={arc(r, s0, s1)} />); }
    const fill = x.state === 'build' ? x.start + x.f! * (x.buildEnd - x.start) : x.state === 'vote' ? x.buildEnd + x.f! * (x.end - x.buildEnd) : x.state === 'done' ? x.end : x.start;
    o.push(<path key="n" className="d-bar d-next" d={arc(r, x.start, x.end)} />);
    if (x.state === 'done') o.push(<path key="f" className="d-bar d-done" d={arc(r, x.start, x.end)} />);
    else if (fill > x.start) o.push(<path key="f" className="d-bar d-run" d={arc(r, x.start, fill)} />);
    const e0 = Pt(r, x.end), e1 = Pt(28, x.end), twin = x.i > 0 && W.cs[x.i - 1].start === x.start, lb = Pt(r, twin ? x.end + 16 : x.start - 16);
    o.push(<line key="s" className={'d-spoke' + (x.state === 'done' ? ' on' : '') + (pk ? ' pk' : '')} data-g={pk ? '1' : undefined} x1={e0[0]} y1={e0[1]} x2={e1[0]} y2={e1[1]} />);
    o.push(<text key="c" className={'d-code' + (x.state === 'build' || x.state === 'vote' ? ' live' : '')} x={lb[0]} y={lb[1]}>{CODE[x.id]}</text>);
    return <g key={x.id}>{o}</g>;
  });
  const nowDeg = r2((Math.min(W.now, S.winEnd) / 1440) * 360);
  return (
    <>
      <section className="dl-hero" aria-label="The day as a dial">
        <HomeMasthead cls="mh-dial" />
        <div className="dial">
          <svg className="dial-svg" viewBox="-320 -320 640 640" role="img" aria-label="The day as a 24-hour ring. Each city is one track; the green hand is now.">
            <circle className="d-ring" r={RO} /><circle className="d-ring" r={R0 - 14} />
            {hours}{tracks}
            <circle className={'d-join' + (W.picked ? ' on' : '')} r={26} data-g={W.picked ? '1' : undefined} />
            {W.archived ? null : <g className="d-hand" style={{ transform: 'rotate(' + nowDeg + 'deg)' }} data-g="1"><line x1={0} y1={-30} x2={0} y2={-(RO + 12)} /></g>}
            {W.picked && c.seal ? <foreignObject x={-24} y={-24} width={48} height={48}><div className="d-seal"><MergedSeal ids={W.cs.map((x) => x.id)} size={48} /></div></foreignObject> : null}
          </svg>
        </div>
      </section>
      <Index compact />
    </>
  );
}
