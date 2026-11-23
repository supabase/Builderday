'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { EVENT, CITY_WORD_CAP, FINALIST_COUNT } from '@/lib/day-data';
import { dur, fmtN, hhmm, ord, plural, r2, tz } from '@/lib/format';
import { action, cityHref, localSpan, showNow, type HomeCity, type HomeWorld, type View } from '@/lib/home';
import { sentence, wire, wireTime } from '@/lib/wire';
import { globalPrize, prizeFacts } from '@/lib/prizes';
import type { Top } from '@/lib/day-data';
import { Picture } from '@/components/pictures/picture';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import { play, tokEase, tokMs } from '@/components/shared/motion';
import { MH_ACT, MH_ACT_G, MH_ACT_LINE } from './home-masthead';
import { NOW_TAG } from './timetable';
import { useDay } from './day-context';
import { useLook, type Zoom } from './look';

/* The Sheet's parts: the strip's zoom, the slim masthead, the live sentence and the wire, the facts, a city's top 3
   with the judge mark, the strip's ticks and now line, the trunk and the join, and the one shared hover preview. The
   home's tuning page draws its other directions from these too. */

/* ---------------- the strip's zoom ----------------
   day: the whole day, as today. fitted: from the first start to the last close, half an hour each side. folded: as
   fitted, and every stretch with no session longer than 45 minutes folds to 20, with a break on the axis. With the
   sun schedule the sessions spread across the whole day, so fitted gains little and folded a little more. */
export type Fold = { a: number; b: number };
export type ZView = View & { folds: Fold[]; step: number };
export function zoomView(W: HomeWorld, base: View, zoom: Zoom): ZView {
  if (zoom === 'day') return { ...base, folds: [], step: 180 };
  const S = W.S;
  if (zoom === 'fitted') {
    const v0 = S.first - 30, v1 = S.last + 30, x = (m: number) => (m - v0) / (v1 - v0) * 100;
    return { v0, v1, x, nx: x(Math.min(W.now, v1)), span: v1 - v0, folds: [], step: 120 };
  }
  /* the busy stretches: each session with 15 minutes either side, merged when less than 45 minutes apart */
  const iv = S.cs.map((c) => [c.start - 15, c.end + 15]).sort((a, b) => a[0] - b[0]), segs: number[][] = [];
  iv.forEach((s) => { const l = segs[segs.length - 1]; if (l && s[0] <= l[1] + 45) l[1] = Math.max(l[1], s[1]); else segs.push([s[0], s[1]]); });
  const GAP = 20, folds: Fold[] = []; let len = 0;
  segs.forEach((s, i) => { len += s[1] - s[0]; if (i < segs.length - 1) { folds.push({ a: s[1], b: segs[i + 1][0] }); len += GAP; } });
  const pos = (m: number): number => {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (m <= s[0]) return i === 0 ? acc - (s[0] - m) : acc;
      if (m <= s[1]) return acc + (m - s[0]);
      acc += s[1] - s[0];
      if (i < segs.length - 1) { const nx = segs[i + 1][0]; if (m < nx) return acc + (m - s[1]) / (nx - s[1]) * GAP; acc += GAP; }
      else return acc + (m - s[1]);
    }
    return acc;
  };
  const x = (m: number) => pos(m) / len * 100, v1 = segs[segs.length - 1][1];
  return { v0: segs[0][0], v1, x, nx: x(Math.min(W.now, v1)), span: len, folds, step: 120 };
}
/* how much wider an hour is than on the whole day: the number the hand-back reports */
export function zoomGain(W: HomeWorld, base: View, zoom: Zoom): number {
  const Z = zoomView(W, base, zoom), x = W.S.cs[0];
  return (Z.x(x.end) - Z.x(x.start)) / (base.x(x.end) - base.x(x.start));
}

/* ---------------- the strip's ticks and now line, over a whole table ---------------- */
/* a hairline per tick down the whole table, its time in the axis row on top; a fold is a gap with dashed edges */
export function StripAxis({ V, W, cls }: { V: ZView; W: HomeWorld; cls?: string }) {
  const live = showNow(W), first = Math.ceil(V.v0 / V.step) * V.step, out: ReactNode[] = [];
  const inFold = (m: number) => V.folds.some((f) => m > f.a - 10 && m < f.b + 10);
  for (let m = first; m <= V.v1; m += V.step) {
    if (inFold(m)) continue;
    const x = V.x(m); if (x < 0 || x > 100) continue;
    const hide = x < 4 || x > 96 || (live && Math.abs(x - V.nx) < 7);
    const lbl = ((m % 1440) + 1440) % 1440 === 0 ? 'Dec ' + (EVENT.day + Math.floor(m / 1440)) : hhmm(m);
    out.push(<i key={m} className="absolute top-0 bottom-0 w-(--hair) bg-tint-2" style={{ left: r2(x) + '%' }}>{hide ? null : <span className="type-label absolute top-2 left-0 whitespace-nowrap text-ink-2 [transform:translateX(-50%)]">{lbl}</span>}</i>);
  }
  V.folds.forEach((f) => { const a = V.x(f.a), b = V.x(f.b); out.push(<i key={'f' + f.a} className="hs-fold absolute top-0 bottom-0" style={{ left: r2(a) + '%', width: r2(b - a) + '%' }} />); });
  return (
    <div className={clsx('pointer-events-none absolute phone:hidden', cls)} aria-hidden="true">
      {out}
      <span className="type-label absolute top-2 right-[calc(100%+var(--s-3))] text-ink-2" style={live && V.nx < 8 ? { opacity: 0 } : undefined}>UTC</span>
    </div>
  );
}
export function StripNow({ V, W, cls }: { V: ZView; W: HomeWorld; cls?: string }) {
  if (!showNow(W)) return null;
  return (
    <div className={clsx('now pointer-events-none absolute z-4 phone:hidden', cls)} aria-hidden="true" data-g="1">
      <b className="absolute inset-0 block" style={{ transform: 'translateX(' + r2(V.nx) + '%)' }}>
        <i className="absolute top-0 bottom-0 -left-px w-0.5 bg-accent" />
        <span className={NOW_TAG + ' top-1.5 left-0 [transform:translateX(-50%)]'}>{hhmm(W.now)}</span>
      </b>
    </div>
  );
}
/* phone: time runs down, so now is a line between the cities that have started and those that have not. It is a list
   item of no height, placed by the rows that render it. */
export function PhoneNow() {
  const { W } = useDay();
  if (!showNow(W)) return null;
  return (
    <li className="relative z-4 hidden h-6 phone:block" aria-hidden="true">
      <i className="absolute top-0 right-0 left-0 h-0.5 bg-accent" data-g="1" /><span className={NOW_TAG + ' top-0.5 left-0'}>Now {hhmm(W.now)} UTC</span>
    </li>
  );
}
/* where PhoneNow goes: before the first city that has not started */
export function nowIndex(W: HomeWorld): number { return W.cs.filter((x) => x.start <= W.now).length; }

/* ---------------- the slim masthead: the mark, the anchors, the one action ---------------- */
const ANCHORS: [string, string][] = [['#cities', 'Cities'], ['#final', 'The final'], ['#prizes', 'Prizes'], ['#questions', 'Questions']];
/* the main action. Once every city has closed it points at the final, not at "the ten winners" */
export function useAction(): { t: string; href: string } {
  const { cfg, W, carry } = useDay();
  if (W.picked) return { t: 'See the pick', href: '#final' };
  if (W.allDone || W.archived) return { t: `See the ${FINALIST_COUNT} finalists`, href: '#final' };
  return action(W, cfg, (x) => cityHref(x, cfg, W, carry));
}
export function ActionLink({ cls, line }: { cls?: string; line?: boolean }) {
  const a = useAction();
  return <a className={clsx(MH_ACT, line ? MH_ACT_LINE : MH_ACT_G, cls)} href={a.href} data-g={line ? undefined : '1'}>{a.t}</a>;
}
export function SheetMasthead({ quiet, cls }: { quiet?: boolean; cls?: string }) {
  return (
    <header className={clsx('relative z-6 flex h-13 items-center gap-x-(--g) px-(--m) rule-b phone:h-14', cls)}>
      <a className="inline-flex min-h-11 items-center gap-2 text-lg tracking-snug whitespace-nowrap" href="#top" aria-label={EVENT.name + ', top of the page'}>
        <SupabaseMark /><span className="font-semibold">supabase <b className="font-regular text-ink-2">builder day</b></span>
      </a>
      <nav className="ml-auto flex items-center phone:hidden" aria-label="On this page">
        {ANCHORS.map((a) => <a key={a[0]} className="inline-flex min-h-11 items-center px-3 text-sm text-ink-2 hover:text-ink" href={a[0]}>{a[1]}</a>)}
      </nav>
      <ActionLink cls="ml-3 phone:ml-auto" line={quiet} />
    </header>
  );
}

/* ---------------- the live sentence and the wire ---------------- */
export function Sentence({ cls }: { cls?: string }) {
  const { W } = useDay();
  /* two lines held open whatever the moment, so the table under it never moves when the sentence wraps (rule 4) */
  return <p className={clsx('min-h-[2lh] text-pretty text-ink', cls)}>{sentence(W)}</p>;
}
/* n lines, newest first: the time, then the event. Before the day, one line says when it starts.
   A new line slides in from the top (the others move down one line, in --dur-slide) and stays lit for --dur-flash.
   Not on the first draw, and not while the pointer is on the list (it would move under the reader). */
export function WireList({ n, cls, city }: { n: number; cls?: string; city?: number }) {
  const { W } = useDay(), ev = wire(W, n, city), ref = useRef<HTMLOListElement>(null), seen = useRef<string | null>(null);
  const head = ev.length ? ev[0].m + ev[0].text : '';
  useLayoutEffect(() => {
    const ol = ref.current, was = seen.current; seen.current = head;
    if (!ol || was == null || !head || was === head || ol.matches(':hover')) return;
    const d = tokMs('--dur-slide'), f = tokMs('--dur-flash'), e = tokEase('--ease-out'), items = Array.from(ol.children);
    items.forEach((li) => play(li, [{ transform: 'translateY(-24px)' }, { transform: 'none' }], d, { ease: e }));
    if (items[0]) play(items[0], [{ opacity: 0 }, { opacity: 1 }], d, { ease: e });
    if (items[0] && f > 0) items[0].classList.add('hs-new');
  }, [head]);
  return (
    <ol ref={ref} className={clsx('grid content-start overflow-clip', cls)} style={{ minHeight: n * 24 + 'px' }} aria-label="What just happened" aria-live="polite">
      {ev.length ? ev.map((e, j) => (
        <li key={e.m + e.text} className="grid h-6 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 text-sm/none rule-t">
          <span className={clsx('text-xs/none tabular-nums', j === 0 ? 'text-ink' : 'text-ink-2')}>{wireTime(e)}</span>
          <span className={clsx('min-w-0 truncate', j === 0 ? 'text-ink' : 'text-ink-2')} title={e.text}>{e.text}</span>
        </li>
      )) : <li className="flex h-6 items-center text-sm/none text-ink-2 rule-t">Nothing yet. The first city opens at {hhmm(W.S.first)} UTC.</li>}
    </ol>
  );
}
/* the sentence, the sentence and the list, or neither, as the knob says */
export function Live({ sCls, lCls, n }: { sCls: string; lCls?: string; n: number }) {
  const { wire: mode } = useLook();
  if (mode === 'off') return null;
  return <><Sentence cls={sCls} />{mode === 'list' ? <WireList n={n} cls={lCls} /> : null}</>;
}

/* ---------------- the facts: the format and the prizes; the date stands on its own ---------------- */
export function factCells(W: HomeWorld, prizes = true): [string, string][] {
  const fin = W.cs.reduce((t, x) => t + (x.state === 'done' ? Math.min(EVENT.finalists, x.entries) : EVENT.finalists), 0);
  return [['Cities', '10, one day'], ['Finalists', fin + ', top 3 each'], ...(prizes ? prizeFacts() : [])];
}
/* the facts; the prizes join them when the look says so (the final below names them too) */
export function Facts({ cls, vCls }: { cls?: string; vCls?: string }) {
  const { W } = useDay(), { factPrizes } = useLook();
  return (
    <dl className={clsx('grid', cls)}>
      {factCells(W, factPrizes).map((f) => <div key={f[0]} className="min-w-0"><dt className="type-label truncate text-ink-2">{f[0]}</dt><dd className={clsx('mt-1 truncate tabular-nums', vCls)}>{f[1]}</dd></div>)}
    </dl>
  );
}
export function DateLine({ cls }: { cls?: string }) {
  return <p className={clsx('tabular-nums', cls)}>{EVENT.date}. {CITY_WORD_CAP} cities, each at its own local time.</p>;
}

/* ---------------- a city's top 3 ---------------- */
/* a judge's mark: a small outlined square and how many of the votes are judges' */
export function JudgeMark({ j, long }: { j: number; long?: boolean }) {
  if (!j) return null;
  return (
    <span className="inline-flex flex-none items-center gap-1 text-ink-2 tabular-nums" title={j + ' from judges'}>
      <i className="inline-block size-[7px] edge-ink-2" aria-hidden="true" />
      {long ? <span>{j} from judges</span> : <><span aria-hidden="true">{j}</span><span className="sr-only">{j} from judges</span></>}
    </span>
  );
}
export function liveOf(x: HomeCity): boolean { return x.state === 'build' || x.state === 'vote'; }
/* the picked finalist's place in this city, or 0 */
export function pickedPlace(x: HomeCity, W: HomeWorld): number { return W.picked && W.final.city.i === x.i ? W.final.place : 0; }
/* what the three are now */
export function topLabel(x: HomeCity, W: HomeWorld): string {
  if (x.state === 'next') return 'Opens in';
  if (!x.top.length) return x.state === 'done' ? 'Closed' : 'Building';
  if (x.state === 'build') return 'Leading · building, ' + dur(x.left!, true) + ' left';
  if (x.state === 'vote') return 'Leading · voting, ' + dur(x.left!, true) + ' left';
  return pickedPlace(x, W) ? 'Finalists · the pick' : 'Finalists';
}
/* the label line: green with a square while the city is live, or once it holds the pick */
export function TopKey({ x, cls }: { x: HomeCity; cls?: string }) {
  const { W } = useDay(), g = (liveOf(x) && x.top.length > 0) || pickedPlace(x, W) > 0;
  return <span className={clsx('type-label flex items-center gap-1.5 truncate', g ? 'text-accent' : 'text-ink-2', cls)}>{g ? <i className="size-1.5 flex-none bg-accent" data-g="1" /> : null}{topLabel(x, W)}</span>;
}
/* up to three lines: place, name, judge mark and votes. tie: a short line out to the trunk, once the city has closed */
export function TopLines({ x, cls, line, tie }: { x: HomeCity; cls?: string; line?: string; tie?: boolean }) {
  const { W } = useDay(), pk = pickedPlace(x, W);
  if (x.state === 'next') return <p className={clsx('grid content-start', cls)}><span className={clsx('font-medium tabular-nums', line)}>{dur(x.wait!, true)}</span><span className={clsx('text-ink-2', line)}>Entries open then</span></p>;
  if (!x.top.length) return <p className={clsx('grid content-start text-ink-2', cls)}><span className={line}>{x.state === 'done' ? 'No entries came in.' : 'No entries yet.'}</span></p>;
  return (
    <ol className={clsx('grid content-start', cls)}>
      {x.top.map((t: Top) => (
        <li key={t.p.id} className={clsx('relative grid grid-cols-[1em_minmax(0,1fr)_auto] items-baseline gap-x-2 tabular-nums', line)}>
          <span className={clsx(t.place === 1 && liveOf(x) ? 'text-accent' : 'text-ink-2')}>{t.place}</span>
          <span className={clsx('min-w-0 truncate', t.place === 1 && 'font-medium', pk === t.place ? 'text-accent' : 'text-ink')} title={t.p.name} data-g={pk === t.place ? '1' : undefined}>{t.p.name}</span>
          <span className="flex items-baseline gap-2 text-ink-2"><JudgeMark j={t.j} />{fmtN(t.v)}</span>
          {tie && x.state === 'done' ? <i className={clsx('hs-tie absolute top-1/2 left-[calc(100%+var(--s-2))] phone:hidden', pk === t.place ? 'h-(--line-thick) bg-accent' : 'h-(--hair) bg-ink-3')} aria-hidden="true" data-g={pk === t.place ? '1' : undefined} /> : null}
        </li>
      ))}
    </ol>
  );
}
/* the picture of first place, or a dashed frame while there is none */
export function LeadPic({ x, cls }: { x: HomeCity; cls?: string }) {
  return <span className={clsx('block aspect-video', cls)}><Picture p={x.top[0]?.p || null} /></span>;
}
/* a city's name, the row's link. Heavier while live; once the pick is made the other nine step back one ink. */
export function CityName({ x, cls }: { x: HomeCity; cls?: string }) {
  const { cfg, W, carry } = useDay(), back = W.picked && W.final.city.i !== x.i;
  return <a className={clsx('stretched block w-fit max-w-full overflow-x-clip text-ellipsis whitespace-nowrap', liveOf(x) ? 'font-semibold' : 'font-regular', back ? 'text-ink-2' : 'text-ink', cls)} href={cityHref(x, cfg, W, carry)} data-city={x.id}>{x.name}</a>;
}
/* the city's session in its own time, and " · Yours" on the person's city */
export function LocalTime({ x, cls }: { x: HomeCity; cls?: string }) {
  const { cfg } = useDay();
  return (
    <span className={clsx('grid text-right text-xs/[1.35] text-ink-2 tabular-nums', cls)}>
      <span>{localSpan(x)}</span>
      <span className="type-label">{tz(x.city.offset)}{cfg.you === x.i ? <>{' · '}<b className="font-medium text-accent" data-g="1">Yours</b></> : null}</span>
    </span>
  );
}
/* a city's state in a few words, for a row with room for one more line */
export function stateLine(x: HomeCity, W: HomeWorld): string {
  if (x.state === 'next') return 'Opens in ' + dur(x.wait!, true);
  if (x.state === 'build') return 'Building · ' + dur(x.left!, true) + ' left · ' + plural(x.n!, 'project');
  if (x.state === 'vote') return 'Voting closes in ' + dur(x.left!, true) + ' · ' + plural(x.n!, 'project');
  return pickedPlace(x, W) ? 'Closed · the pick came from here' : 'Closed · ' + plural(x.entries, 'project');
}

/* ---------------- the trunk and the join: thirty become one ---------------- */
/* the trunk runs down the right edge, beside the rows: dashed until every city has closed, then solid, and green from
   the picked city down once the pick is made. cls places it; pickTop is where the green starts. */
export function Trunk({ pickTop, cls }: { pickTop?: string; cls?: string }) {
  const { W } = useDay();
  return (
    <>
      <i className={clsx('absolute right-[calc(-1*var(--m)/2)] w-(--hair) phone:hidden', W.allDone ? 'bg-ink-3' : 'dash-y', cls)} aria-hidden="true" />
      {W.picked && pickTop ? <i className="absolute right-[calc(-1*var(--m)/2-1px)] bottom-0 w-(--line-thick) bg-accent phone:hidden" style={{ top: pickTop }} data-g="1" aria-hidden="true" /> : null}
    </>
  );
}
export function JoinLine({ cls }: { cls?: string }) {
  const { W } = useDay(), { round } = useLook(), f = W.final;
  const lbl = W.picked ? EVENT.pickers + ' picked ' + f.p.name + ', ' + ord(f.place) + ' in ' + f.city.name + '.' : EVENT.pickers + ' pick one of the ' + FINALIST_COUNT + ' at ' + hhmm(W.S.pickAt) + ' UTC.';
  return (
    <p className={clsx('flex items-center justify-end gap-3', cls)} id={round === 'final' ? undefined : 'final'}>
      <span className={clsx('min-w-0 truncate text-sm', W.picked ? 'text-ink' : 'text-ink-2')}>{lbl}{round === 'final' ? null : <> <span className="text-ink-2">{globalPrize(W.picked)}</span></>}</span>
      <i className={clsx('relative size-5 flex-none rounded-round', W.picked ? 'bg-accent' : 'outline-(length:--line-thin) outline-ink-2 outline-dashed -outline-offset-1')} data-g={W.picked ? '1' : undefined} aria-hidden="true" />
    </p>
  );
}

/* ---------------- a small day: ten bars on one strip, for the front page's first viewport ---------------- */
export function MiniDay({ V, cls }: { V: ZView; cls?: string }) {
  const { W } = useDay();
  return (
    <div className={clsx('relative grid grid-cols-[96px_minmax(0,1fr)] gap-x-3', cls)} aria-hidden="true">
      {W.cs.map((x) => (
        <div key={x.i} className="contents">
          <span className={clsx('truncate text-xs/[16px]', liveOf(x) ? 'font-medium text-ink' : 'text-ink-2')}>{x.name}</span>
          <span className="relative block h-4">
            <i className={clsx('absolute top-1/2 h-1 -translate-y-1/2', liveOf(x) ? 'bg-ink' : x.state === 'done' ? (pickedPlace(x, W) ? 'bg-accent' : 'bg-ink-3') : 'dash-frame')}
              style={{ left: r2(V.x(x.start)) + '%', width: r2(V.x(x.end) - V.x(x.start)) + '%' }} data-g={pickedPlace(x, W) ? '1' : undefined} />
          </span>
        </div>
      ))}
      {showNow(W) ? <i className="absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: 'calc(96px + var(--s-3) + (100% - 96px - var(--s-3)) * ' + r2(V.nx / 100) + ')' }} data-g="1" /> : null}
    </div>
  );
}

/* ---------------- the hover preview: one picture that moves between rows ----------------
   strip: in the hovered row's own strip, at its right end. pointer: it follows the pointer. docked: one place on the
   screen. Pointer devices only; touch never sees it. Rows carry data-ci (the city's index); listen on the rows' box. */
type At = { i: number; top: number; h: number; x: number; y: number } | null;
export function useHoverPreview(boxRef: RefObject<HTMLElement | null>) {
  const [at, setAt] = useState<At>(null), { hover } = useLook(), follow = hover === 'pointer';
  const fine = useRef(false);
  useEffect(() => { fine.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches; }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!fine.current || e.pointerType !== 'mouse') return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-ci]'), box = boxRef.current;
    if (!row || !box) { setAt(null); return; }
    const i = +row.dataset.ci!;
    /* the sheet re-renders only when the row changes, unless the picture follows the pointer */
    setAt((prev) => {
      if (prev && prev.i === i && !follow) return prev;
      const rr = row.getBoundingClientRect(), br = box.getBoundingClientRect();
      return { i, top: rr.top - br.top, h: rr.height, x: e.clientX, y: e.clientY };
    });
  }, [boxRef, follow]);
  const onPointerLeave = useCallback(() => setAt(null), []);
  return { at, handlers: { onPointerMove, onPointerLeave } };
}
export function HoverPreview({ at, cls }: { at: At; cls?: string }) {
  const { hover } = useLook(), { W } = useDay();
  const x = at ? W.cs[at.i] : null, p = x?.top[0]?.p || null, on = !!(x && p);
  /* the last picture shown stays where it was while it fades out, so leaving the rows never flashes an empty box */
  const [held, setHeld] = useState<{ at: NonNullable<At>; p: NonNullable<typeof p> } | null>(null);
  if (on && (!held || held.at !== at || held.p !== p)) setHeld({ at: at!, p: p! });
  const h = on ? { at: at!, p: p! } : held;
  if (hover === 'off') return null;
  /* it grows from --preview-scale as it fades in; moving to another row swaps the picture inside in --dur-press */
  const SHOW = '[transition:opacity_var(--dur-hover)_var(--ease-out),scale_var(--dur-hover)_var(--ease-out)]', OFF = 'scale-(--preview-scale) opacity-0';
  const pic = <span key={h ? h.p.id : 'none'} className="hs-swap block size-full"><Picture p={h ? h.p : null} /></span>;
  if (hover === 'strip') {
    return (
      <div className={clsx('pointer-events-none absolute z-5 phone:hidden', cls)} style={{ top: h ? h.at.top + 6 : 0, height: h ? Math.max(36, h.at.h - 12) : 0 } as CSSProperties} aria-hidden="true">
        <span className={clsx('absolute top-0 right-0 block aspect-video h-full origin-right bg-ground', SHOW, on ? 'opacity-100' : OFF)}>{pic}</span>
      </div>
    );
  }
  if (hover === 'pointer') {
    return <div className={clsx('pointer-events-none fixed z-50 aspect-video w-72 origin-top-left bg-ground phone:hidden', SHOW, on ? 'opacity-100' : OFF)} style={{ left: h ? h.at.x + 16 : 0, top: h ? h.at.y - 81 : 0 }} aria-hidden="true">{pic}</div>;
  }
  return (
    <div className={clsx('pointer-events-none fixed bottom-20 left-8 z-50 w-80 bg-ground p-2 edge-line transition-opacity duration-hover phone:hidden', at ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
      <span className="block aspect-video"><Picture p={p} /></span>
      <span className="mt-2 block truncate text-sm">{on ? p!.name : x ? 'No entries yet' : ''}</span>
      <span className="block truncate text-xs text-ink-2">{x ? x.name + ' · ' + topLabel(x, W) : ''}</span>
    </div>
  );
}
