'use client';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { EVENT, CITY_WORD } from '@/lib/day-data';
import { clamp, hhmm, r2, tz } from '@/lib/format';
import { cityHref, dayOf, localSpan, showNow, slotText, view, type HomeCfg, type HomeCity, type HomeWorld, type View } from '@/lib/home';
import { Picture } from '@/components/pictures/picture';
import { CitySeal, MergedSeal } from '@/components/seal/seal-config';
import { useDay, type Ages } from './day-context';

/* The timetable: ten cities, east to west, one fixed row each: name | strip | slot. Time runs across in UTC. */
export function Timetable() {
  const { cfg: c, W, ages } = useDay(), V = view(c, W);
  return (
    <section className="tt relative px-(--m) pb-18 phone:pb-16" aria-label={`The ${CITY_WORD} cities, east to west`}>
      <Axis V={V} W={W} cls="tt-axis ml-[calc(var(--nameW)+var(--g))] w-(--stripW)" />
      <ol className="rows phone:relative">{W.cs.map((x) => <Row key={'r' + x.i} x={x} V={V} ages={ages} />)}</ol>
      <PhoneNow W={W} />
      <NowLine V={V} W={W} extra="tt-now phone:hidden left-[calc(var(--m)+var(--nameW)+var(--g))] top-0 h-[calc(var(--ah)+var(--rowh)*10)] w-(--stripW)" />
      <Trunk W={W} />
      <Join W={W} c={c} />
    </section>
  );
}

function Row({ x, V, ages }: { x: HomeCity; V: View; ages: Ages }) {
  const { cfg: c, W } = useDay(), pk = W.picked && W.pick === x;
  const s = ages['s' + x.i], l = ages['l' + x.i], age = l != null ? l : s;
  const cls = clsx('row tt-row relative grid h-(--rowh) gap-x-(--g) hover:bg-tint-1 phone:h-28 phone:content-center phone:gap-x-3 phone:pr-6 phone:rule-t',
    'is-' + x.state, pk && 'is-pick', c.you === x.i && 'is-you', s != null && 'swap', l != null && 'land');
  const style = { '--i': x.i, ...(age != null ? { '--age': '-' + age + 'ms' } : {}) } as CSSProperties;
  return (
    <li className={cls} style={style}>
      <NameLink x={x} cls="name" />
      <Ruler x={x} V={V} />
      <Slot x={x} />
      <i className={clsx('tie absolute top-1/2 right-[calc(var(--tx)-var(--m))] w-[calc(var(--m)-var(--tx)+var(--s-3))] origin-left phone:w-[calc(var(--m)-var(--tx)+var(--s-5))]',
        pk ? 'h-(--line-thick) bg-accent' : x.state === 'done' ? 'h-(--hair) bg-ink-3' : 'h-(--hair) dash-x')} aria-hidden="true" data-g={pk ? '1' : undefined} />
      {c.seal && x.state === 'done' ? <span className={clsx('mark pointer-events-none absolute top-1/2 right-[calc(var(--tx)-var(--m)-12px)] size-6 bg-ground [transform:translateY(-50%)] phone:hidden', pk ? 'text-accent' : 'text-ink-2')} aria-hidden="true"><CitySeal id={x.id} size={24} /></span> : null}
    </li>
  );
}

/* " · Yours" after the time zone, on the person's own city */
function You({ x, c }: { x: HomeCity; c: HomeCfg }) {
  return c.you === x.i && c.green >= 4 ? <>{' · '}<b className="you type-label text-accent" data-g="1">Yours</b></> : null;
}
export function NameLink({ x, cls }: { x: HomeCity; cls: string }) {
  const { cfg: c, W, carry } = useDay(), live = x.state === 'build' || x.state === 'vote';
  /* once the pick is made, the nine other names step back one ink; the picked city keeps full ink (rule 16) */
  const back = W.picked && W.pick !== x;
  return (
    <a className={clsx(cls, 'relative block whitespace-nowrap tracking-d96', live ? 'font-semibold' : 'font-regular', back ? 'text-ink-2' : 'text-ink')} href={cityHref(x, c, W, carry)} data-city={x.id}>
      {x.name}<span className="loc absolute right-0 gap-0.5 text-right font-sans text-xs/[1.3] font-regular tracking-[0] text-ink-2 tabular-nums"><span>{localSpan(x)}</span><span className="type-label">{tz(x.city.offset)}<You x={x} c={c} /></span></span>
    </a>
  );
}

/* the daylight band: drawn whole, the strip clips it, so its soft edge never moves */
function Band({ x, V, c }: { x: HomeCity; V: View; c: HomeCfg }) {
  const out = [];
  for (let d = -1; d <= 2; d++) {
    const a = d * 1440 + x.city.rise - x.city.offset, b = d * 1440 + x.city.set - x.city.offset;
    if (b <= V.v0 || a >= V.v1) continue;
    const s = r2(clamp(c.soft / (b - a) * 100, 0, 49));
    out.push(<i key={d} className="day" style={{ left: r2(V.x(a)) + '%', width: r2(V.x(b) - V.x(a)) + '%', '--s': s + '%' } as CSSProperties} />);
  }
  return <>{out}</>;
}
export function Bar({ x, V }: { x: HomeCity; V: View }) {
  const { cfg: c } = useDay();
  const l = V.x(x.start), w = V.x(x.end) - l, bf = (x.buildEnd - x.start) / (x.end - x.start) * 100;
  let fill = 0;
  if (x.state === 'build') fill = x.f! * bf; else if (x.state === 'vote') fill = bf + x.f! * (100 - bf); else if (x.state === 'done') fill = 100;
  return (
    <i className="bar" style={{ left: r2(l) + '%', width: r2(w) + '%', '--bf': r2(bf) + '%', '--fill': r2(fill) + '%' } as CSSProperties} data-i={x.i}>
      <i className="bar-b" /><i className="bar-v" /><i className="bar-run" />
      <span className={clsx('bar-t absolute bottom-[calc(100%+6px)] font-sans text-xs/none font-regular whitespace-nowrap tabular-nums', l + w > 72 ? 'right-0' : 'left-0', x.state === 'build' || x.state === 'vote' ? 'text-ink' : 'text-ink-2')}>{localSpan(x)} <span className="font-mono text-label/none font-medium tracking-label">{tz(x.city.offset)}<You x={x} c={c} /></span></span>
    </i>
  );
}
export function Ruler({ x, V }: { x: HomeCity; V: View }) {
  const { cfg: c, W } = useDay(), pk = W.picked && W.pick === x;
  return (
    <span className="strip" aria-hidden="true">
      <Band x={x} V={V} c={c} />
      <i className={clsx('wire absolute top-1/2 right-[calc(-1*var(--g))] h-(--hair) origin-left phone:hidden', x.state === 'done' ? 'block' : 'hidden', pk ? 'bg-accent' : 'bg-ink-3')} style={{ left: r2(V.x(x.end)) + '%' }} />
      <Bar x={x} V={V} />
    </span>
  );
}
export function Axis({ V, W, cls }: { V: View; W: HomeWorld; cls: string }) {
  const first = Math.ceil(V.v0 / 180) * 180, live = showNow(W), ticks = [];
  for (let m = first; m <= V.v1; m += 180) {
    const x = V.x(m); if (x < 0 || x > 100) continue;
    const lbl = ((m % 1440) + 1440) % 1440 === 0 ? dayOf(m) : hhmm(m), hide = x < 4 || x > 97 || (live && Math.abs(x - V.nx) < 8);
    ticks.push(<i key={m} className="tick absolute bottom-0 w-0" style={{ left: r2(x) + '%' }}>{hide ? null : <span className="absolute bottom-2 left-0 whitespace-nowrap [transform:translateX(-50%)]">{lbl}</span>}</i>);
  }
  return (
    <div className={clsx('axis type-label relative h-(--ah) text-ink-2 phone:hidden', cls)} aria-hidden="true">
      {ticks}
      <span className="axis-utc absolute right-[calc(100%+var(--s-3))] bottom-2" style={live && V.nx < 8 ? { opacity: 0 } : undefined}>UTC</span>
    </div>
  );
}
/* the now line shows only while the clock is inside the strip */
export function NowLine({ V, W, extra }: { V: View; W: HomeWorld; extra: string }) {
  if (!showNow(W)) return null;
  return <div className={clsx('now pointer-events-none absolute z-4', extra)} aria-hidden="true" data-g="1"><b className="absolute inset-0 block" style={{ transform: 'translateX(' + r2(V.nx) + '%)' }}><i className="absolute top-0 bottom-0 -left-px w-0.5 bg-accent" /><span className={NOW_TAG + ' top-1 left-0 [transform:translateX(-50%)]'}>{hhmm(W.now)}</span></b></div>;
}
/* the slot's three lines: a label (green while the city is live), the main fact, a detail */
export const SLOT_A = 'slot-a truncate text-sm leading-[1.35] font-medium tabular-nums';
export const SLOT_B = 'slot-b truncate text-xs leading-[1.35] text-ink-2 tabular-nums';
export function SlotText({ k, a, b, g, kCls, aCls, bCls }: { k: string; a: string; b: string; g: boolean; kCls?: string; aCls?: string; bCls?: string }) {
  return (
    <>
      <span className={clsx('slot-k type-label flex items-center gap-1.5 truncate', g ? 'text-accent' : 'text-ink-2', kCls)}>{g ? <i className="size-1.5 flex-none bg-accent" data-g="1" /> : null}{k}</span>
      <span className={clsx(SLOT_A, aCls)}>{a}</span><span className={clsx(SLOT_B, bCls)}>{b}</span>
    </>
  );
}
/* the now line's time tag */
export const NOW_TAG = 'type-label absolute bg-accent px-1 pt-[3px] pb-0.5 text-accent-ink';
export function Slot({ x }: { x: HomeCity }) {
  const { cfg: c, W } = useDay(), t = slotText(x, W), p = x.lead ? x.lead.p : null, pk = W.picked && W.pick === x;
  const g = ((x.state === 'build' || x.state === 'vote') && c.green >= 3) || (pk && c.green >= 3);
  return (
    <div className="slot min-w-0 content-center items-center gap-x-3">
      <span className="slot-pic"><Picture p={p} />{c.peek && p ? <Picture p={p} cls="peek" /> : null}</span>
      <SlotText k={t.k} a={t.a} b={t.b} g={g} />
    </div>
  );
}
/* phone: time runs down, so now sits on the boundary between the cities that have started and those that have not */
export function PhoneNow({ W }: { W: HomeWorld }) {
  if (!showNow(W)) return null;
  const ny = W.cs.filter((x) => x.start <= W.now).length;
  return <i className="pnow pointer-events-none absolute right-(--m) left-(--m) z-4 -mt-px hidden h-0.5 bg-accent phone:block top-[calc(var(--rh)*var(--ny))]" style={{ '--ny': ny } as CSSProperties} aria-hidden="true" data-g="1"><span className={NOW_TAG + ' bottom-0.5 left-0'}>Now {hhmm(W.now)} UTC</span></i>;
}
export function Trunk({ W }: { W: HomeWorld }) {
  return (
    <>
      <i className={clsx('trunk absolute top-[calc(var(--ah)+var(--rh)/2)] right-(--tx) h-[calc(var(--rh)*9.5+12px)] w-(--hair) origin-top', W.allDone ? 'bg-ink-3' : 'dash-y')} aria-hidden="true" />
      {W.picked ? <i className="trunk-g absolute top-[calc(var(--ah)+var(--rh)*(var(--pi)+0.5))] right-(--tx) h-[calc(var(--rh)*(9.5-var(--pi))+12px)] w-(--line-thick) origin-top bg-accent" data-g="1" aria-hidden="true" style={{ '--pi': W.pick.i } as CSSProperties} /> : null}
    </>
  );
}
export function Join({ W, c, cls }: { W: HomeWorld; c: HomeCfg; cls?: string }) {
  const pc = W.pick, lbl = W.picked ? 'Picked: ' + pc.win.p.name + ', ' + pc.name : EVENT.pickers + ' pick one at ' + hhmm(W.S.pickAt) + ' UTC';
  return (
    <div className={clsx('join absolute top-[calc(var(--ah)+var(--rh)*10+12px)] right-[calc(var(--tx)-var(--jo)/2)] flex items-center gap-3', cls, W.picked && 'is-picked', W.allDone && 'is-full')}>
      <span className={clsx('join-lbl type-label whitespace-nowrap', W.picked ? 'text-accent' : 'text-ink-2')}>{lbl}</span>
      <i className={clsx('join-o relative grid size-(--jo) flex-none place-items-center rounded-round text-accent -outline-offset-1', W.picked ? 'outline-(length:--line-thick) outline-accent' : 'outline-(length:--line-thin) outline-ink-2 outline-dashed')} data-g={W.picked ? '1' : undefined}>{W.picked && c.seal ? <MergedSeal ids={W.cs.map((x) => x.id)} size={40} /> : null}</i>
    </div>
  );
}
