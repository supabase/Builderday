'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as PEvent } from 'react';
import { PRIZE_SHEET } from '@/lib/prizes';
import { EXAMPLES, END_MIN, HISTORY, OPEN_MIN, PEAK, PROJECTS, RECEIPT, SHOW_MIN, SUBMIT_AT, VOTE_FROM, YOURS, clockAt, hatchRows, order, smooth } from './how-data';
import { COUNTRY, FLAG_H, FLAG_W, flagPaths } from './flags';
import type { FoldCfg } from './config';
import { BuildTerm } from './how-panels';

/* How Builder Day works. The manager's layout: three panels joined edge to edge, each with its tab on the top left,
   under one clock. The drawings are ours, and every one is finished before anything moves:
   - the clock above the panels: two slim lanes on one axis, build and submit for the whole block, votes from the
     opening (hatched while hidden, green once live);
   - 1 Build: a receipt printing at the minutes the project grows, ending on the submit and a torn-off stub. The
     reader can switch the way in (browser or editor): the receipt's last line and the stub follow;
   - 2 Compete for votes: the hatch over the hidden stretch; at the reveal it lifts so the whole chart shows, the
     counts land from the bottom up and the rows settle; at the close the city prizes land on the top 3;
   - 3 Final: the city picked on the wheel first with its 3, the other cities fading out at the edge (no scroll),
     then the Supabase team's three picks.
   The project followed is Gig map, all the way: printed in Build, a row in the votes, a row in your city's column.
   Hairlines join the top 3 to your city's 3, which line up with them.
   Motion only adds. Each panel is complete at rest (the server's HTML, reduced motion, no script). On coming into view
   it plays from a frame that is already drawn; Replay plays it from the start. The numbers are an illustration
   (how-data.ts); the page never says who casts the votes. */

const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);

export const VOTE_ROW = 32, CUT_GAP = 40;
type City = { id: string; code: string; name: string };
type Done = [number, number, number];
type Way = 'browser' | 'editor';
/* where each drawing starts when it plays on coming into view */
const FROM: Done = [0.28, VOTE_FROM, 0.3];
/* how far through a drawing the next one starts */
const HANDOFF = 0.6;

const pad = (n: number) => String(n).padStart(2, '0');
const TOP = PROJECTS.slice(0, 3);
const credit = (n: number) => '$' + n.toLocaleString('en-US') + ' credits';
const HATCH_SVG = hatchRows(15, 140, 311);

export function FoldHow({ cfg, cities, mine, finalists, buildMin, date }: { cfg: FoldCfg; cities: City[]; mine: number; finalists: number; buildMin: number; date: string }) {
  const reduced = useReduced(), auto = cfg.howAuto === 'view' && !reduced;
  const durs = [cfg.howBuildMs, cfg.howVoteMs, cfg.howFinalMs];
  const [p, setP] = useState<Done>([1, 1, 1]);
  const [hl, setHl] = useState<number | null>(null);
  const [way, setWay] = useState<Way>('browser');
  /* the link draws itself only when a drawing has played in this visit, never on the page's first paint */
  const [played, setPlayed] = useState(false);
  const raf = useRef<number[]>([0, 0, 0]), figs = useRef<(HTMLElement | null)[]>([null, null, null]), grid = useRef<HTMLDivElement>(null);
  const set = useCallback((i: number, v: number) => setP((a) => { const n = [...a] as Done; n[i] = v; return n; }), []);
  const stop = useCallback((i: number) => cancelAnimationFrame(raf.current[i]), []);
  /* The play order, shared by the queue and Replay: each drawing's state, the ones playing now (in the order they
     started; the clock above follows the newest that has a clock), the ones waiting their turn, and the one the queue
     is waiting on. The next drawing starts once the current one is HANDOFF through, so one leads and the eye follows
     it, but a reader of three panels side by side is not left waiting. */
  const [, setOn] = useState<number[]>([]), [waiting, setWaiting] = useState<number[]>([]);
  const state = useRef<('new' | 'armed' | 'queued' | 'done')[]>(['new', 'new', 'new']);
  const playing = useRef<number[]>([]), queue = useRef<number[]>([]), busy = useRef(-1), nextRef = useRef<() => void>(() => {});
  /* from: where the drawing starts (0 for Replay); the time it takes is the share of its length that is left */
  const run = useCallback((i: number, from = 0) => {
    stop(i); set(i, from); setPlayed(true);
    playing.current = [...playing.current.filter((x) => x !== i), i]; setOn([...playing.current]);
    const t0 = performance.now(), len = Math.max(1, durs[i] * (1 - from));
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / len)); set(i, from + (1 - from) * t);
      if (busy.current === i && (t >= 1 || from + (1 - from) * t >= HANDOFF)) { busy.current = -1; nextRef.current(); }
      if (t < 1) { raf.current[i] = requestAnimationFrame(tick); return; }
      playing.current = playing.current.filter((x) => x !== i); setOn([...playing.current]);
    };
    raf.current[i] = requestAnimationFrame(tick);
  }, [durs[0], durs[1], durs[2], set, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the queue: a drawing waiting its turn sits at its start frame, dimmed */
  const next = useCallback(() => {
    /* how much of a drawing's panel is in the window, against most of it (or most of the window for a tall one) */
    const seen = (i: number) => { const f = figs.current[i]; if (!f) return 1; const r = f.getBoundingClientRect(), vh = window.innerHeight; return (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.min(r.height, vh); };
    /* the queue does not wait on a drawing the reader has scrolled past (stacked panels, a quick reader) */
    if (busy.current >= 0 && seen(busy.current) < 0.25) busy.current = -1;
    while (busy.current < 0 && queue.current.length) {
      const i = queue.current.shift()!;
      /* one whose panel has left the window by its turn is not played: it stays finished */
      if (seen(i) < 0.25) { state.current[i] = 'done'; set(i, 1); continue; }
      busy.current = i; state.current[i] = 'done'; run(i, FROM[i]);
    }
    setWaiting([...queue.current]);
  }, [run, set]);
  useEffect(() => { nextRef.current = next; }, [next]);
  const dequeue = useCallback((i: number) => { queue.current = queue.current.filter((x) => x !== i); setWaiting([...queue.current]); }, []);
  /* Replay: plays now from the start and is never played again by the queue */
  const replay = useCallback((i: number) => {
    state.current[i] = 'done'; dequeue(i);
    if (busy.current < 0) busy.current = i;
    run(i);
  }, [dequeue, run]);

  /* One watcher per drawing, over the window and a margin below it. On its first report a drawing already in view (a
     reload, a link to #how) is left finished and never plays; one above the window too. Otherwise it is set to its start
     frame as it comes near (or into view by a jump), and joins the queue once most of it is in view (most of the window
     for a tall one). A drawing still waiting its turn when it leaves the window drops out, finished. */
  useEffect(() => {
    if (!auto) return;
    const st = state.current, at = (t: Element) => figs.current.indexOf(t as HTMLElement), told = [false, false, false];
    const io = new IntersectionObserver((es) => { for (const e of es) {
      const i = at(e.target); if (i < 0) continue;
      const r = e.boundingClientRect, vh = window.innerHeight, shown = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      /* the one the queue waits on has been scrolled past: the next may start */
      if (i === busy.current && shown < Math.min(r.height, vh) * 0.25) next();
      if (!told[i]) { told[i] = true; if (e.isIntersecting && r.top < vh || r.bottom < 0) { st[i] = 'done'; continue; } }
      if (st[i] === 'done') continue;
      if (st[i] === 'queued') { if (shown <= 0) { st[i] = 'done'; dequeue(i); set(i, 1); } continue; }
      if (!e.isIntersecting) continue;
      if (st[i] === 'new') { if (r.top < 0) { st[i] = 'done'; continue; } st[i] = 'armed'; set(i, FROM[i]); }
      if (shown >= Math.min(r.height, vh) * 0.6) { st[i] = 'queued'; queue.current = [...queue.current, i].sort((a, b) => a - b); next(); }
    } }, { rootMargin: '0px 0px 30% 0px', threshold: Array.from({ length: 21 }, (_, k) => k / 20) });
    figs.current.forEach((f) => { if (f) io.observe(f); });
    return () => {
      io.disconnect(); [0, 1, 2].forEach(stop);
      state.current = ['new', 'new', 'new']; queue.current = []; busy.current = -1; playing.current = [];
      setWaiting([]); setOn([]); setP([1, 1, 1]);
    };
  }, [auto, dequeue, next, set, stop]);

  /* the link from the three rows above the cut to your city's three, once the votes have closed. Your city's column
     is lowered so its rows sit level with the top 3 (the lines then run straight); it is never raised. */
  const [link, setLink] = useState<{ d: string; lane: number }[]>([]);
  const linkMode = cfg.howLink, linked = linkMode !== 'none' && p[1] >= 1 && p[2] >= FROM[2];
  useEffect(() => {
    const g = grid.current; if (!g) return;
    const cols = g.querySelector<HTMLElement>('.how-cols');
    const draw = () => {
      const wide = window.matchMedia('(min-width: 1101px)').matches;
      if (cols) { const want = wide && linkMode !== 'none'; if (!want) cols.style.setProperty('--how-align', '0px'); }
      if (!linked || !wide || !cols) { setLink([]); return; }
      const ol = g.querySelector<HTMLElement>('.how-board'), first = g.querySelector<HTMLElement>('[data-final-rank="0"]');
      if (!ol || !first) return;
      const was = parseFloat(getComputedStyle(cols).paddingTop) || 0;
      const natural = first.getBoundingClientRect().top - was, lift = Math.max(0, Math.min(240, Math.round(ol.getBoundingClientRect().top - natural)));
      if (lift !== was) cols.style.setProperty('--how-align', lift + 'px');
      const gb = g.getBoundingClientRect(), ob = ol.getBoundingClientRect(), out: { d: string; lane: number }[] = [];
      const ends: { x1: number; y1: number; x2: number; y2: number; y2b: number }[] = [];
      for (let lane = 0; lane < 3; lane++) {
        const t = g.querySelector<HTMLElement>(`[data-final-rank="${lane}"]`); if (!t) return;
        const tb = t.getBoundingClientRect(), y1 = ob.top - gb.top + lane * VOTE_ROW;
        ends.push({ x1: ob.right - gb.left, y1, x2: tb.left - gb.left, y2: tb.top - gb.top, y2b: tb.bottom - gb.top });
      }
      if (linkMode === 'ribbon') {
        for (const [lane, e] of ends.entries()) {
          const xm = (e.x1 + e.x2) / 2, y1b = e.y1 + VOTE_ROW;
          out.push({ lane, d: `M${e.x1} ${e.y1}C${xm} ${e.y1} ${xm} ${e.y2} ${e.x2} ${e.y2}L${e.x2} ${e.y2b}C${xm} ${e.y2b} ${xm} ${y1b} ${e.x1} ${y1b}Z` });
        }
      } else if (linkMode === 'bus') {
        /* three stubs merge into one line across the gap, which splits again into your city's three */
        const a = ends[0].x1 + 14, b = ends[0].x2 - 14, mid = (ends[1].y1 + VOTE_ROW / 2 + (ends[1].y2 + ends[1].y2b) / 2) / 2;
        for (const [lane, e] of ends.entries()) {
          const ya = e.y1 + VOTE_ROW / 2, yb = (e.y2 + e.y2b) / 2;
          out.push({ lane, d: `M${e.x1} ${ya}H${a}V${mid}M${b} ${mid}V${yb}H${e.x2 - 4}` });
        }
        out.push({ lane: 3, d: `M${a} ${mid}H${b}` });
      } else {
        /* straight hairlines, rank to rank; an elbow only if the column could not be lowered far enough */
        for (const [lane, e] of ends.entries()) {
          const ya = Math.round(e.y1 + VOTE_ROW / 2) + 0.5, yb = Math.round((e.y2 + e.y2b) / 2) + 0.5, xm = Math.round((e.x1 + e.x2) / 2) + 0.5;
          out.push({ lane, d: Math.abs(ya - yb) < 1 ? `M${e.x1} ${ya}H${e.x2 - 4}` : `M${e.x1} ${ya}H${xm}V${yb}H${e.x2 - 4}` });
        }
      }
      setLink(out);
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(g);
    /* a new city rolls its column in; measure again once it has landed */
    const landed = (e: AnimationEvent) => { if ((e.target as HTMLElement).matches?.('.how-col[data-swap]')) draw(); };
    cols?.addEventListener('animationend', landed);
    let live = true; document.fonts?.ready.then(() => { if (live) draw(); });
    return () => { live = false; ro.disconnect(); cols?.removeEventListener('animationend', landed); };
  }, [linked, linkMode, mine]);

  const you = cities[mine] ?? cities[0];
  const caps = [
    `Start from nothing and build with Supabase. Submit before minute ${buildMin}, in your browser or from your editor.`,
    `Voting is open from the start. The counts stay hidden until minute ${SHOW_MIN}, then the ranking is live until ${END_MIN}. The top 3 in your city go through.`,
    `Every city sends its top 3, ${finalists} projects in all. The Supabase team picks the global 1st, 2nd and 3rd and announces them ${PRIZE_SHEET.announce}.`,
  ];
  const titles = ['Build', 'Compete for votes', 'Global final'];
  const hover = (i: number | null) => (e: PEvent) => { if (e.pointerType === 'mouse') setHl(i); };

  return (
    <section id="how" className="pf-part pf-how" data-part="how" aria-labelledby="how-h" data-hl={hl ?? undefined} style={{ ['--how-step' as string]: cfg.howStep + 'ms' }}>
      <h2 id="how-h" className="pf-h">How Builder Day works</h2>
      <p className="pf-lede">You get {buildMin} minutes in your city on {date}. Here is what happens in them.</p>
      <div ref={grid} className="how-grid" data-link={linkMode}>
        {[0, 1, 2].map((i) => (
          <figure key={i} ref={(el) => { figs.current[i] = el; }} className="how-fig" data-i={i} aria-label={titles[i]} onPointerEnter={hover(i)} onPointerLeave={hover(null)}>
            <div className="how-tab"><span className="how-n" aria-hidden="true">{i + 1}</span><h3>{titles[i]}</h3></div>
            <figcaption>
              <p>{caps[i]}</p>
              <Replay onPress={() => replay(i)} title={titles[i]} />
            </figcaption>
            <div className="how-art" data-wait={waiting.includes(i) ? '' : undefined}>
              {i === 0 ? (cfg.howBuild === 'chat' ? <ChatArt p={p[0]} /> : cfg.howBuild === 'receipt' ? <ReceiptArt p={p[0]} way={way} setWay={setWay} you={you} /> : <BuildTerm p={p[0]} way={way} setWay={setWay} you={you} />)
                : i === 1 ? <VoteArt p={p[1]} hatch={cfg.howHatch} prize={cfg.howPrize === 'tags'} />
                : <FinalArt p={p[2]} cities={cities} top={TOP} you={you} total={finalists} colW={cfg.howColW} fade={cfg.howFade} />}
            </div>
          </figure>
        ))}
        <svg className="how-links" data-mode={linkMode} data-draw={played ? '' : undefined} aria-hidden="true" focusable="false">
          {link.map((r) => <path key={r.lane} d={r.d} className="how-rib" data-lane={r.lane} pathLength={linkMode === 'ribbon' ? undefined : 1} />)}
        </svg>
      </div>
    </section>
  );
}

/* Replay: the arrow turns once on a press */
function Replay({ onPress, title }: { onPress: () => void; title: string }) {
  const [spin, setSpin] = useState(0);
  return (
    <button type="button" className="how-play" onClick={() => { setSpin((n) => n + 1); onPress(); }} aria-label={`Replay ${title}`}>
      <span key={spin} aria-hidden="true" data-spin={spin ? '' : undefined}>↻</span> Replay
    </button>
  );
}

/* ---------- 1 Build: a receipt printing as the project grows ---------- */
const ReceiptArt = memo(function ReceiptArt({ p, way, setWay, you }: { p: number; way: Way; setWay: (w: Way) => void; you: City }) {
  /* the last line rewrites itself only when the reader switches the way, never on the first paint */
  const [sw, setSw] = useState(false);
  const m = p * END_MIN, sent = m >= SUBMIT_AT, torn = p >= 1 || m >= SUBMIT_AT + 2;
  const via = way === 'browser' ? { what: 'Submitted in the browser', note: 'supabase.com/builderday' } : { what: 'Submitted from the editor', note: 'builder-day › submit' };
  return (
    <div className="how-rcpt" data-way={way} data-sw={sw ? '' : undefined}>
      <div className="how-paper" role="img" aria-label={`A receipt of the build: an empty folder at minute 0, a Supabase project, a table, sign in, a map, deployed at minute ${RECEIPT[RECEIPT.length - 1].at}, then submitted at minute ${SUBMIT_AT}, ${way === 'browser' ? 'in the browser' : 'from the editor'}`}>
        <div className="how-ph"><span className="ttl">{YOURS}</span><span className="clk">Min <b>{pad(Math.min(END_MIN, Math.floor(sent ? SUBMIT_AT : m)))}</b><span className="of"> / {END_MIN}</span></span></div>
        <ol className="how-pl">
          {RECEIPT.map((l) => (
            <li key={l.at} data-on={m >= l.at ? '' : undefined}><span className="t">{pad(l.at)}</span><i aria-hidden="true" /><span className="w">{l.what}</span>{l.note ? <span className="n">{l.note}</span> : null}</li>
          ))}
          <li className="sub" data-on={sent ? '' : undefined}><span className="t">{pad(SUBMIT_AT)}</span><i aria-hidden="true" /><span className="w" key={way}>{via.what}</span><span className="n" key={way + 'n'}>{via.note}</span></li>
        </ol>
      </div>
      <div className="how-stub" data-on={torn ? '' : undefined}>
        <span className="how-stamp"><b>Submitted</b><span>min {SUBMIT_AT}</span></span>
        <span className="how-sc"><b>{you.code}</b><span>{YOURS}</span></span>
      </div>
      <div className="how-ways" role="group" aria-label="Two ways to submit">
        <span className="wk">Submit</span>
        {(['browser', 'editor'] as const).map((w) => (
          <button key={w} type="button" aria-pressed={way === w} onClick={() => { if (w !== way) { setSw(true); setWay(w); } }}>{w === 'browser' ? 'In your browser' : 'From your editor'}</button>
        ))}
      </div>
    </div>
  );
});

/* ---------- 1 Build (before): a chat in your editor, then the browser way ---------- */
const ChatArt = memo(function ChatArt({ p }: { p: number }) {
  const at = (from: number, w = 0.06) => smooth((p - from) / w);
  const st = (from: number) => { const v = at(from); return { opacity: v, transform: `translateY(${(1 - v) * 4}px)` }; };
  const test = at(0.26 + 0.1, 0.04) > 0.5, sent = at(0.56 + 0.12, 0.04) > 0.5;
  return (
    <div className="how-build">
      <div className="how-chat" role="img" aria-label="A chat in your editor: you ask for a feature, the editor changes a file, runs the tests and submits the project to Builder Day">
        <div className="how-ch"><span className="ttl">{YOURS}</span><span className="srv"><i className="dot" />builder-day</span></div>
        <div className="how-msgs">
          <p className="me" style={st(0)}>Map tonight’s gigs with tickets left.</p>
          <p className="re" style={st(0.07)}>I’ll filter out sold-out venues before mapping.</p>
          <div className="how-tool" style={st(0.14)}>
            <div className="th"><span>Edited <code>src/gigs.ts</code></span><span className="df"><b className="a">+1</b><b className="d">−1</b></span></div>
            <div className="dl del"><i>−</i><code>.select(&apos;*&apos;)</code></div>
            <div className="dl add"><i>+</i><code>.select(&apos;venue, starts_at&apos;).gt(&apos;tickets_left&apos;, 0)</code></div>
          </div>
          <div className="how-tool" style={st(0.26)}>
            <div className="th"><span>Ran <code>npm test</code></span>{test ? <span className="ok">✓ 3 passed</span> : <span className="run" aria-hidden="true">:::</span>}</div>
          </div>
          <p className="re" style={st(0.44)}>It works. I can submit it to Builder Day for you.</p>
          <div className="how-tool" style={st(0.56)}>
            <div className="th"><span>builder-day › <code>submit</code></span>{sent ? <span className="ok">✓ Submitted</span> : <span className="run" aria-hidden="true">:::</span>}</div>
          </div>
        </div>
        <div className="how-comp"><span>Ask for changes</span><i aria-hidden="true">↑</i></div>
      </div>
      <div className="how-way" data-on={sent ? '' : undefined} aria-hidden="true">
        <span className="wk">Or in your browser</span>
        <span className="how-url"><i aria-hidden="true" />supabase.com/builderday</span>
        <span className="how-key">Submit</span>
      </div>
    </div>
  );
});

/* ---------- 2 Votes ---------- */
/* The chart is drawn at its real width in pixels (one unit a pixel), so its words keep their size however wide the
   panel is; its height is fixed, so measuring never moves the page. Before the first measure it is drawn at 300 wide. */
const H = 184, L = 30, T = 22, B = 162, STRIP = 5;
const xAt = (w: number) => { const R = w - 8; return (m: number) => L + ((m - OPEN_MIN) / (END_MIN - OPEN_MIN)) * (R - L); };
const Y = (v: number) => B - (v / PEAK) * (B - T);
const LANE = ['var(--how-1)', 'var(--how-2)', 'var(--how-3)', 'var(--how-4)', 'var(--how-5)'];
const TICKS = [OPEN_MIN, SHOW_MIN, Math.round((SHOW_MIN + END_MIN) / 2), END_MIN].filter((t, i, a) => a.indexOf(t) === i);
/* a line from minute a to minute k, then the step towards the next minute at m */
const path = (X: (m: number) => number, lane: number, a: number, k: number, m: number) => {
  let d = '';
  for (let j = a; j <= k; j++) d += (j > a ? 'L' : 'M') + X(j).toFixed(1) + ' ' + Y(HISTORY[lane][j]).toFixed(1);
  if (k < END_MIN && m > k) { const f = m - k; d += 'L' + X(m).toFixed(1) + ' ' + Y(HISTORY[lane][k] + (HISTORY[lane][k + 1] - HISTORY[lane][k]) * f).toFixed(1); }
  return d;
};
/* at the reveal: the hatch lifts in the first part, then each count lands from the lowest to the leader, then the rows settle */
const LIFT = 0.4, LAND = 0.86;
const VoteArt = memo(function VoteArt({ p, hatch, prize }: { p: number; hatch: 'lift' | 'stay'; prize: boolean }) {
  const box = useRef<HTMLDivElement>(null), [w, setW] = useState(300), [measured, setMeasured] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { setW(Math.max(240, Math.round(e.contentRect.width))); setMeasured(true); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const X = useMemo(() => xAt(w), [w]);
  const hidden = useMemo(() => HISTORY.map((_, lane) => path(X, lane, OPEN_MIN, SHOW_MIN, SHOW_MIN)), [X]);
  const { m, reveal } = clockAt(p), k = Math.min(END_MIN, Math.floor(m)), open = m >= OPEN_MIN;
  const lifting = hatch === 'lift' && reveal > 0, lift = hatch === 'lift' ? smooth(reveal / LIFT) : 0;
  const at60 = order(SHOW_MIN), live = reveal >= 1, closed = m >= END_MIN;
  /* where each row stands: the order they came in while hidden, the ranking once the counts have landed */
  const shown = live ? order(m) : [0, 1, 2, 3, 4];
  /* a count has landed: lowest at 60 first, the leader last */
  const landed = (lane: number) => reveal >= 1 || (reveal > LIFT && (reveal - LIFT) / (LAND - LIFT) >= (4 - at60.indexOf(lane)) / 5);
  const state = closed ? 'Closed' : live || reveal > LIFT ? 'Live' : open ? 'Hidden' : 'Not open';
  /* the hatch: grows with the clock while hidden, then (lift) rolls up from the bottom into a strip along the top,
     leaving a faint ground over the hidden stretch so the finished chart still says those minutes were not shown */
  const x0 = X(OPEN_MIN), x60 = X(SHOW_MIN), R = w - 8;
  const hx = Math.max(0, X(Math.min(m, SHOW_MIN)) - x0), hh = (B - T) - ((B - T) - STRIP) * lift;
  const city = PRIZE_SHEET.city, tag = [`${city.winner.thing} + $${city.winner.credits}`, credit(city.finalist.credits), credit(city.finalist.credits)];
  const short = [`${(city.winner.thing ?? '').replace('Meta ', '')} + $${city.winner.credits}`, `$${city.finalist.credits}`, `$${city.finalist.credits}`];
  return (
    <div className="how-vote" data-rest={p >= 1 ? '' : undefined}>
      <div className="how-vh"><span>Project votes</span><span className="how-st" data-s={state.toLowerCase().replace(' ', '-')}>Min {pad(Math.round(m))} · {state}</span></div>
      <div ref={box} className="how-chart-box" data-m={measured ? '' : undefined}>
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} className="how-chart" role="img" aria-label={`Votes from minute ${OPEN_MIN} to ${END_MIN}: hidden until minute ${SHOW_MIN}, then the whole chart is shown and stays live to the close`}>
          <defs>
            <clipPath id="how-clip"><rect x={x0} y={T} width={hx} height={hh} /></clipPath>
            <clipPath id="how-under"><rect x={x0} y={T + hh} width={x60 - x0} height={Math.max(0, B - T - hh + 2)} /></clipPath>
          </defs>
          {lifting ? <rect x={x0} y={T} width={x60 - x0} height={B - T} className="how-was" style={{ opacity: lift }} /> : null}
          {[0, 20, 40, 60].map((v) => (
            <g key={v}><path d={`M${L} ${Y(v)}H${R}`} className="how-grid-l" /><text x={L - 6} y={Y(v) + 3} textAnchor="end" className="how-ax">{v}</text></g>
          ))}
          {/* a narrow chart drops the midpoint tick when it would run into "90 min" */}
          {TICKS.filter((t) => t === OPEN_MIN || t === SHOW_MIN || t === END_MIN || X(END_MIN) - X(t) >= 64).map((t) => <text key={t} x={X(t)} y={B + 17} textAnchor={t === OPEN_MIN ? 'start' : t === END_MIN ? 'end' : 'middle'} className="how-ax">{t === END_MIN ? t + ' min' : t}</text>)}
          {!open ? <text x={(L + R) / 2} y={(T + B) / 2 + 4} textAnchor="middle" className="how-wait">Voting opens at minute {OPEN_MIN}</text> : null}
          {open ? <g clipPath="url(#how-clip)">{HATCH_SVG.map((r, y) => <text key={y} x={x0 + 1} y={T + 8 + y * 9.4} className="how-hx" xmlSpace="preserve">{r}</text>)}</g> : null}
          {hatch === 'stay' && live ? <text x={(x0 + x60) / 2} y={(T + B) / 2 + 3} textAnchor="middle" className="how-hid">Not shown</text> : null}
          {/* the labels over the two stretches */}
          {open ? <text x={x0} y={T - 9} className="how-ax how-ax-h">{lift >= 1 && x60 - x0 > 110 ? 'Hidden till ' + SHOW_MIN : 'Hidden'}</text> : null}
          <path d={`M${x60} ${T - 6}V${B}`} className="how-shown" /><text x={x60 + 5} y={T - 9} className="how-ax how-ax-g">Live</text>
          <g>{reveal > 0 ? [4, 3, 2, 1, 0].map((lane) => (
            <g key={lane}>
              {lifting ? <path d={hidden[lane]} stroke={LANE[lane]} className="how-line" data-lane={lane} data-was="" clipPath={lift < 1 ? 'url(#how-under)' : undefined} /> : null}
              {k >= SHOW_MIN ? <path d={path(X, lane, SHOW_MIN, k, m)} stroke={LANE[lane]} className="how-line" data-lane={lane} /> : null}
            </g>
          )) : null}</g>
          {open && m < END_MIN ? <path d={`M${X(m)} ${T}V${B}`} className="how-now" /> : null}
        </svg>
      </div>
      <ol className="how-board" style={{ height: VOTE_ROW * 5 + CUT_GAP }} aria-label="Ranking, an example">
        {PROJECTS.map((name, lane) => {
          const rank = shown.indexOf(lane), up = landed(lane), top3 = rank < 3 && live;
          return (
            <li key={name} className="how-row" data-lane={lane} data-top={top3 ? '' : undefined} data-you={lane === 0 ? '' : undefined} data-rank={live ? rank : undefined} style={{ transform: `translateY(${rank * VOTE_ROW + (rank >= 3 ? CUT_GAP : 0)}px)` }}>
              <span className="rk">{live ? pad(rank + 1) : '··'}</span><i style={{ background: LANE[lane] }} /><span className="nm">{name}{lane === 0 ? <em> yours</em> : null}</span>
              {prize ? <span className="pz" data-on={closed && rank < 3 ? '' : undefined} style={{ ['--k' as string]: 2 - Math.min(2, rank) }}>{rank < 3 ? <><span className="lg">{tag[rank]}</span><span className="sh">{short[rank]}</span></> : null}</span> : <span />}
              <span className="ct">{up ? <span key="n" className="how-n2">{HISTORY[lane][k]}<span className="sr-only"> votes</span></span> : <span key="q" className="how-q2">?<span className="sr-only"> votes, hidden</span></span>}</span>
            </li>
          );
        })}
        <li className="how-cut" aria-hidden="true" style={{ top: VOTE_ROW * 3 + 8, opacity: live ? 1 : 0.35 }}><span>↑ Top 3 go through</span>{prize ? <span className="r">City prizes</span> : null}</li>
      </ol>
    </div>
  );
});

/* ---------- 3 Final ---------- */
/* the count, drawn: one dot a finalist, a column of 3 for each city, yours first in the lanes' colours */
function Count({ p, n, total }: { p: number; n: number; total: number }) {
  return (
    <div className="how-count">
      <span className="how-dots2" aria-hidden="true">
        {Array.from({ length: n }, (_, j) => (
          <span key={j} data-you={j === 0 ? '' : undefined} data-on={p >= j * 0.03 + 0.02 ? '' : undefined}>{[0, 1, 2].map((r) => <i key={r} data-lane={j === 0 ? r : undefined} />)}</span>
        ))}
      </span>
      <span className="big">{total}</span>
      <span className="lbl">Finalists<br />{n} cities × top 3</span>
    </div>
  );
}
const Flag = memo(function Flag({ id }: { id: string }) {
  const paths = flagPaths(COUNTRY[id] ?? '');
  return <svg className="how-flag" viewBox={`0 0 ${FLAG_W} ${FLAG_H}`} aria-hidden="true" focusable="false">{paths.map((x) => <path key={x.ink} d={x.d} stroke={x.ink} />)}</svg>;
});
const FinalArt = memo(function FinalArt({ p, cities, top, you, total, colW, fade }: { p: number; cities: City[]; top: readonly string[]; you: City; total: number; colW: number; fade: number }) {
  const g = PRIZE_SHEET.global;
  const rest = cities.filter((c) => c !== you);
  /* the first column changes city when the wheel does: it rolls over, but never on the first paint */
  const [shownId, setShownId] = useState(you.id), [swap, setSwap] = useState(false);
  if (shownId !== you.id) {
    setShownId(you.id);
    setSwap(typeof navigator !== 'undefined' && !!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive);
  }
  const col = (c: City, j: number) => {
    const v = smooth((p - j * 0.03) / 0.1), mineCol = j === 0;
    const names = mineCol ? top : EXAMPLES[Math.max(0, cities.indexOf(c)) % EXAMPLES.length];
    return (
      <div key={mineCol ? 'you-' + c.id : c.id} className="how-col" data-you={mineCol ? '' : undefined} data-swap={mineCol && swap ? '' : undefined} aria-hidden={j > 2 ? true : undefined}
        style={{ opacity: Math.max(v, 0.0001), transform: `translateY(${(1 - v) * 4}px)` }}>
        <div className="how-ch2"><Flag id={c.id} /><span className="how-code">{c.code}</span><span className="how-cn">{c.name}</span></div>
        {names.map((n, r) => <p key={n} className="how-q" data-final-rank={mineCol ? r : undefined} data-lane={mineCol ? r : undefined}><b>{pad(r + 1)}</b><i />{n}</p>)}
      </div>
    );
  };
  return (
    <div className="how-final">
      <Count p={p} n={cities.length} total={total} />
      <div className="how-cols" role="group" aria-label={`The finalists: ${you.name}'s top 3 first, then the other ${rest.length} cities'`} style={{ ['--how-col' as string]: colW + 'px', ['--how-fade' as string]: fade + 'px' }}>
        {[you, ...rest].map(col)}
      </div>
      <div className="how-pick">
        {/* the heading arrives with the first pick, so a drawing waiting its turn shows no empty box */}
        <div className="how-vh" style={{ opacity: Math.max(smooth((p - 0.5) / 0.1), 0.0001) }}><span>Picked by the Supabase team</span><span>From all {total}</span></div>
        {g.map((x, r) => {
          const v = smooth((p - (0.5 + (2 - r) * 0.14)) / 0.14);
          return (
            <p key={x.place} className="how-gl" data-place={x.place} style={{ opacity: Math.max(v, 0.0001), transform: `translateY(${(1 - v) * 4}px)` }}>
              <b>{['1st', '2nd', '3rd'][r]}</b><span>{x.thing}{x.spec ? <small>{x.spec.replace(/-/g, '\u2011')}</small> : null}</span><em>{credit(x.credits)}</em>
            </p>
          );
        })}
      </div>
    </div>
  );
});
