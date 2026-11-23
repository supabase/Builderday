'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { MONO, PHONE_WHEEL, SANS, fitWheel, type WheelCfg, type WheelMark } from './config';
import { createWheel, type WheelCity, type WheelEngine, type WheelFlow } from './engine';
import { mountDotGlobes } from './dot-globes';
import { HackMark } from './mark';
import familySaved from '@/saved/family.config.json';
import { clampFamily, showPeople } from '@/lib/family';
const FAMILY = clampFamily(familySaved);
/* the first screen's one Key: the family's square primary (rule 2), or the Luma pill it was (the lab's other mode) */
const PILL = FAMILY.key === 'pill' ? 'wh-pill' : 'wh-pill k-key';
import { BuilderLogo } from './builder-logo';
import { EVENT } from '@/lib/day-data';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import { tokEase, tokMs } from '@/components/shared/motion';
import type { WheelStatus } from './click';
import './wheel.css';
import { at, away } from '@/lib/routes';

/* The city wheel as a page: the canvas, the mark, the link with its small globe, and the facts of the active city as
   a row of cells before its name. The screen lines are drawn over all of it, with holes for the two globes.
   A screen reader gets the cities as a table, and hears the city once the wheel stops on it. */

export type WheelFact = WheelCity & { id: string; session: string; count: string; href: string; action: string; soon?: string;
  /* people as a number: the count cell shows only from the family's threshold up (an empty room reads as a dead one) */
  people?: number;
  /* a page's own press in place of the link (the preview: the person's own city opens their account) */
  press?: () => void };
/* hack: the mark alone; both: the Supabase mark beside it; name: the mark with the event's name written beside it;
   builder: the pixel globe from the Builder Day logo, with the name in the page's own face */
export type MarkMode = WheelMark;

/* the mark and the name, as the mode says: the wheel's own top line and the preview's header both draw it */
export function MarkFace({ mark, id }: { mark: MarkMode; id?: string }) {
  if (mark === 'builder') return <><BuilderLogo className="wh-builder" /><span className="wh-name">{EVENT.short}</span></>;
  return <>{mark === 'both' ? <SupabaseMark /> : null}<HackMark id={id} label={mark === 'both' ? EVENT.name : mark === 'name' ? '' : EVENT.short} />{mark === 'name' ? <span className="wh-name">{EVENT.name}</span> : null}</>;
}
export const STATUS_LABEL: Record<WheelStatus, string> = { open: 'Open', nearing: 'Filling up', full: 'Waiting list', sold: 'Sold out', soon: 'Opens soon' };

/* each state has its words and its own shape, a ring that fills up, so it does not read by colour alone */
export function StatusIcon({ status }: { status: WheelStatus }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      {status === 'full' || status === 'sold' ? <circle cx="6" cy="6" r="5" fill="currentColor" /> : <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={status === 'soon' ? '2 2' : undefined} />}
      {status === 'nearing' ? <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" /> : null}
    </svg>
  );
}

/* The Luma link as a pill. When its words change they fade in and the pill eases from its old width to the new one,
   so nothing is stretched. With reduced motion both just change. */
function Pill({ ref, href, press, text }: { ref: RefObject<(HTMLAnchorElement & HTMLButtonElement) | null>; href: string; press?: () => void; text: string }) {
  const [seen, setSeen] = useState({ text, n: 0 }), was = useRef(0);
  if (seen.text !== text) setSeen({ text, n: seen.n + 1 });
  useLayoutEffect(() => {
    const a = ref.current; if (!a) return;
    const to = a.offsetWidth, from = was.current; was.current = to;
    if (!from || from === to) return;
    const ms = tokMs('--dur-slide'); if (!ms) return;
    const run = a.animate([{ width: from + 'px' }, { width: to + 'px' }], { duration: ms, easing: tokEase('--ease-out') });
    return () => run.cancel();
  }, [ref, seen.n]);
  const words = <span key={seen.n} className={'wh-pill-text' + (seen.n ? ' is-fresh' : '')}>{text}</span>;
  return press
    ? <button ref={ref} type="button" className={PILL} aria-haspopup="dialog" onClick={press}>{words}</button>
    : <a ref={ref} className={PILL} href={at(href)} {...away(href)}>{words}</a>;
}

/* A cell as a block that turns on its long axis when `k` changes, like a drum of cards: the face that was there rolls
   away and the next comes round from below when the wheel turns forward, from above when it turns back. A turn is never
   cut short: if the city changes again mid-turn it finishes, then makes one quicker turn to the latest city. */
type Face = { k: string; node: ReactNode; status?: WheelStatus };
function Prism({ k, dir, status, width, children }: { k: string; dir: number; status?: WheelStatus; width?: string; children: ReactNode }) {
  const [shown, setShown] = useState<Face>({ k, node: children, status });
  const [turn, setTurn] = useState<{ old: Face; dir: number; quick: boolean } | null>(null);
  if (shown.k !== k && !turn) { setTurn({ old: shown, dir, quick: false }); setShown({ k, node: children, status }); }
  else if (shown.k === k && (shown.node !== children || shown.status !== status)) setShown({ k, node: children, status });
  const face = (f: Face, cls: string) => <span className={'wh-face ' + cls} data-status={f.status} style={width ? { width } : undefined}>{f.node}</span>;
  /* the city moved on during the turn: the quick turn starts in the same render, with no still frame between */
  const end = (e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (shown.k !== k) { setTurn({ old: shown, dir, quick: true }); setShown({ k, node: children, status }); } else setTurn(null);
  };
  return (
    <span className="wh-prism" data-dir={(turn?.dir ?? dir) > 0 ? 'up' : 'down'}>
      <span key={shown.k} className={'wh-drum' + (turn ? ' is-turning' : '') + (turn?.quick ? ' is-quick' : '')} onAnimationEnd={end}>
        {turn ? face(turn.old, 'is-old') : null}
        {face(shown, 'is-new')}
      </span>
    </span>
  );
}

export function wheelVars(c: WheelCfg): CSSProperties {
  return {
    '--wh-paper': `rgb(${c.paper} ${c.paper + 1} ${c.paper + 1})`, '--wh-line-a': c.lineAlpha, '--wh-line-p': c.linePeriod + 'px',
    /* the words in the page are Geist, as everywhere else (the family's sans); the canvas names keep the study's face */
    '--wh-sans': FAMILY.sans === 'geist' ? SANS.geist : SANS[c.font], '--wh-mono': FAMILY.sans === 'geist' ? MONO.geist : MONO[c.font], '--wh-vig': c.vignette,
  } as CSSProperties;
}

/* flow: the wheel as the first part of a page that scrolls (off unless given; see WheelFlow in engine.ts). The page
   draws the mark (its header) and the table of cities (its board), so the wheel leaves both out; the globe is a
   slider a keyboard can turn. The options are read every frame, so a page may change them in place. Changing
   `fixed` needs a new wheel (give it a new key). */
export function Wheel({ cities, cfg, start = 0, noGl = false, cells = true, mark = 'hack', date, caption, engineRef, onCity, foot, lead, children, className, flow }: {
  cities: WheelFact[]; cfg: WheelCfg; start?: number; noGl?: boolean; cells?: boolean; mark?: MarkMode; date: string; caption: string; foot?: ReactNode;
  /* the page's words over the cells, in the column layout */
  lead?: ReactNode;
  engineRef?: RefObject<WheelEngine | null>; onCity?: (i: number) => void; children?: ReactNode; className?: string; flow?: WheelFlow;
}) {
  const pin = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), cellsEl = useRef<HTMLDListElement & HTMLDivElement>(null);
  const footEl = useRef<HTMLDivElement>(null), grip = useRef<HTMLSpanElement>(null), flowRef = useRef(flow);
  useEffect(() => { if (flowRef.current && flow) Object.assign(flowRef.current, flow); }, [flow]);
  const lens = useRef<HTMLSpanElement>(null), cta = useRef<HTMLAnchorElement & HTMLButtonElement>(null), eng = useRef<WheelEngine | null>(null);
  const [cur, setCur] = useState(start), [said, setSaid] = useState('');
  const onCityRef = useRef(onCity);
  useEffect(() => { onCityRef.current = onCity; }, [onCity]);
  const first = useRef({ cfg, cities, start });

  useEffect(() => {
    if (!pin.current || !canvas.current) return;
    const e = createWheel({ pin: pin.current, canvas: canvas.current, cells: cellsEl.current, foot: footEl.current, grip: grip.current,
      /* read when used: the link and its lens are new elements when the city's press changes (a link or a button) */
      get lens() { return lens.current; }, get cta() { return cta.current; } },
      { ...first.current, cfg: fitWheel(first.current.cfg, window.matchMedia(PHONE_WHEEL).matches), noGl, onCity: (i) => { setCur(i); onCityRef.current?.(i); }, flow: flowRef.current });
    eng.current = e; if (engineRef) engineRef.current = e;
    return () => { e.destroy(); eng.current = null; if (engineRef) engineRef.current = null; };
  }, [noGl, engineRef]);
  /* the phone's own spacing, kept when the window crosses 640 px */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const mq = window.matchMedia(PHONE_WHEEL), on = () => setNarrow(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  useEffect(() => { eng.current?.setCfg(fitWheel(cfg, window.matchMedia(PHONE_WHEEL).matches)); }, [cfg, narrow]);
  /* the text globe's small globe by the link; in a page's flow the page draws every small globe itself */
  const text = cfg.globe === 'ascii', hasFlow = !!flow;
  useEffect(() => (text && !hasFlow && pin.current ? mountDotGlobes(pin.current, cfg) : undefined), [text, hasFlow, cfg]);
  useEffect(() => { eng.current?.setCities(cities); }, [cities]);
  useEffect(() => { eng.current?.jump(start); }, [start]);

  const city = cities[cur] ?? cities[0];
  const column = cfg.layout === 'column';
  /* which way the wheel last turned, the short way round, so the cells turn the same way */
  const [last, setLast] = useState(cur), [dir, setDir] = useState(1);
  if (last !== cur) {
    const n = cities.length; let d = cur - last; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
    setDir(d > 0 ? -1 : 1); setLast(cur);
  }
  /* each cell is as wide as its longest words in any city, so the column keeps one width */
  const widest = (f: (c: WheelFact) => string, icon = false) => `calc(${cities.reduce((a, c) => Math.max(a, f(c).length), 0)}ch + ${icon ? 45 : 26}px)`;
  const dot = text ? { 'data-dot': '', 'data-lat': city.lat, 'data-lon': city.lon } : {};
  /* the cells' and the link's words changed: measure them again before the next frame */
  useLayoutEffect(() => { eng.current?.measure(); }, [cur, cities, cells, cfg.font, cfg.layout, mark, foot, lead]);
  /* a screen reader hears the city after the wheel comes to rest, not each city on the way */
  useEffect(() => {
    const t = window.setTimeout(() => setSaid(`${city.name}, ${city.session}, ${city.count}, ${STATUS_LABEL[city.status]}`), cfg.statusDelay);
    return () => window.clearTimeout(t);
  }, [city, cfg.statusDelay]);

  return (
    <div ref={pin} role="region" aria-label="Choose your city" className={'wh-pin' + (flow ? ' wh-flow' + (flow.fixed ? ' wh-fixed' : '') : '') + (className ? ' ' + className : '')} style={flow ? { ...wheelVars(cfg), '--wh-peek': flow.peek + 'px' } as CSSProperties : wheelVars(cfg)}>
      {/* the text globe is a picture of its own: one image, named by the city it is turned to */}
      <canvas key={noGl ? '2d' : 'gl'} ref={canvas} className="wh-canvas" {...(text ? { role: 'img', 'aria-label': `The world drawn in characters, turned to ${city.name}` } : { 'aria-hidden': true })} />
      {flow ? null : <h1 className="wh-wordmark" data-mark={mark}><MarkFace mark={mark} /></h1>}
      {flow ? <span ref={grip} className="wh-grip" role="slider" tabIndex={0} aria-label="City wheel: the left and right arrows turn it" aria-valuemin={1} aria-valuemax={cities.length} aria-valuenow={cur + 1} aria-valuetext={city.name} /> : null}
      {column ? (
        /* the column: the page's words, the cells on the active name's line, then the Luma pill. The engine moves the
           whole column (it is the element it places), so the words and the pill keep to the cells. */
        <div ref={cellsEl} className="wh-col">
          {lead ? <div className="wh-lead">{lead}</div> : null}
          {cells ? (
            <dl className="wh-cells" data-placed="">
              <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
              <div><dt className="sr-only">Session, local time</dt><dd><Prism k={city.id} dir={dir} width={widest((c) => c.session)}>{city.session}</Prism></dd></div>
              {city.people == null || showPeople(FAMILY, city.people) ? <div><dt className="sr-only">People</dt><dd><Prism k={city.id} dir={dir} width={widest((c) => c.count)}>{city.count}</Prism></dd></div> : null}
              <div className="wh-status"><dt className="sr-only">Status</dt><dd><Prism k={city.id} dir={dir} status={city.status} width={widest((c) => STATUS_LABEL[c.status], true)}><StatusIcon status={city.status} /><span>{STATUS_LABEL[city.status]}</span></Prism></dd></div>
            </dl>
          ) : null}
          <div className="wh-col-foot">
            <Pill ref={cta} href={city.href} press={city.press} text={city.press ? city.action : city.status === 'full' ? 'Join the waiting list on Luma' : city.status === 'sold' ? 'Sold out on Luma' : city.status === 'soon' ? 'Opens soon on Luma' : 'Register on Luma'} />
            {foot}
          </div>
        </div>
      ) : (
        <>
          <div ref={footEl} className="wh-foot">
            {city.press ? (
              /* a press of the page's own (the person's account) is a button; the lens stays one element, so the engine's measure holds */
              <button ref={cta} type="button" className="wh-cta" aria-haspopup="dialog" onClick={city.press}>
                <span ref={lens} className="wh-lens" aria-hidden="true" {...dot} />
                <span className="wh-cta-text"><span className="wh-cta-action">{city.action}</span> <span>{date}</span></span>
              </button>
            ) : (
              <a ref={cta} className="wh-cta" href={at(city.href)} {...away(city.href)}>
                <span ref={lens} className="wh-lens" aria-hidden="true" {...dot} />
                <span className="wh-cta-text"><span className="wh-cta-action">{city.action}</span> <span>{date}</span></span>
              </a>
            )}
            {foot}
          </div>
          {cells ? (
            <dl ref={cellsEl} className="wh-cells" data-status={city.status}>
              <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
              <div><dt className="sr-only">Session, local time</dt><dd>{city.session}</dd></div>
              {city.people == null || showPeople(FAMILY, city.people) ? <div><dt className="sr-only">People</dt><dd>{city.count}</dd></div> : null}
              {city.soon ? <div className="wh-soon"><dt className="sr-only">Opens</dt><dd>{city.soon}</dd></div> : null}
              <div className="wh-status"><dt className="sr-only">Status</dt><StatusIcon status={city.status} /><dd>{STATUS_LABEL[city.status]}</dd></div>
            </dl>
          ) : null}
        </>
      )}
      <p className="sr-only" role="status">{said}</p>
      {flow ? null : (
        <table className="sr-only">
          <caption>{caption}</caption>
          <thead><tr><th scope="col">City</th><th scope="col">Session, local time</th><th scope="col">People</th><th scope="col">Status</th></tr></thead>
          <tbody>{cities.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.session}</td><td>{c.count}</td><td>{STATUS_LABEL[c.status]}</td></tr>)}</tbody>
        </table>
      )}
      {children}
    </div>
  );
}
