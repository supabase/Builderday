'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CITIES, EPOCH, EVENT, sched } from '@/lib/day-data';
import { slugOf, type CityWorld, type Row, type Votes } from '@/lib/city';
import { realMinute } from '@/lib/clock';
import { hhmm } from '@/lib/format';
import { clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { HeaderRow } from '@/components/board/header-row';
import { AccountCell } from '@/components/account/account';
import { Announce } from '@/components/board/announce';
import { SoundKey, step } from '@/components/board/prefs';
import { useTick } from '@/components/board/clock';
import { cityAt, cityWord, homeAt, wireItems, CODE } from '@/components/board/day-model';
import { useForms } from '@/components/forms/forms-provider';
import { store, useVotes } from '@/components/forms/store';
import { YouLine } from '@/components/forms/you-line';
import { liveCityWorld, liveHome, useSnapshots } from '@/lib/source';
import type { CitySnap, DaySnap } from '@/lib/event/snapshot';
import { LabPanel, LayoutPicker, togglePanel, useLabSave, type Group } from '@/components/admin/kit';
import { measure, type Contrast } from '@/components/admin/contrast';
import screenCfg from '@/saved/screen.config.json';
import { clampScreen } from '@/components/screen/config';
import { DayScreen, dayOf, useLabClock } from './shared';
import { HowItWorks, PrizeBlock } from './explain';
import { GetReady } from './get-ready';
import { dayFinalOf } from './home-parts';
import { DayFooter } from './footer';
import { clampFoot, type FootCfg } from './footer-config';
import footSaved from '@/saved/footer.config.json';
import { CityHero, ProjectSheet, Pylon, Ranking, TopWall, Two, type CLook, type RankView } from './city-parts';
import { PIC_BOUNDS, PIC_DEF, PIC_MODES, clampPics, type PicCfg, type PicMode } from './rank-pictures';
import { pageQuery, useRealClock } from './page-clock';
import '@/components/board/board.css';
import './day-home.css';
import './day-city.css';
import './rank-pictures.css';
import './rank-view.css';
import './explain.css';
import '@/components/forms/forms.css';
import { AirCity, AIR_CITY_CHOICES, AIR_CITY_DEF, type AirCityCfg } from '@/components/air/city';
import { clampAir, type AirParts } from '@/components/air/devices';
import { clampWheel } from '@/components/wheel/config';
import { routes, projectSlugIn } from '@/lib/routes';
import { DEMO } from '@/lib/demo';
import wheelSaved from '@/saved/wheel.config.json';
import partsSaved from '@/saved/parts.config.json';

const WHEEL = clampWheel(wheelSaved);
const AIR = clampAir((partsSaved as { air?: Partial<AirParts> }).air);

/* A city's page on the day: the header row, the wire, the opening, the ranking beside the pylon, how it works and the
   prizes, and a project as a sheet over the page (/city/<id>, and /city/<id>/p/<slug> with that project open).
   It follows the real clock; ?moment=, ?m= or ?t= move it, ?still=1 stops it, ?admin shows the panel. Votes go
   through the forms (an email confirmed once) and are kept per city and seed, Remind me and Submit open their
   sheets, and an open project has its own address: opening pushes it, Back closes it.
   Every number is the city's world at the board's minute, from the same day the home draws. Your votes count at once;
   the order waits for the board's tick. The look comes from saved/day-city.config.json and saved/parts.config.json. */

export type CityDir = 'mix' | 'facing' | 'board' | 'scope' | 'wall';
export type DayCityCfg = { dir: CityDir; pylon: number; spark: number; rows: number; how: number } & PicCfg & Partial<Omit<AirCityCfg, 'first' | 'rank'>>;
type State = DayCityCfg & { city: string; t: number; live: number; speed: number; worst: number };
const DIRS_ALL: [string, string][] = [['mix', 'Board, pylon and facing'], ['facing', 'Facing'], ['board', 'Board and pylon'], ['scope', 'Scope'], ['wall', 'Wall']];
const MOMENTS: [string, string][] = [['before', 'Before'], ['build', 'Building'], ['hidden', 'Votes hidden'], ['vote', 'Votes shown'], ['last', 'Last minutes'], ['reveal', 'Reveal'], ['closed', 'Closed'], ['picked', 'Picked']];
const momentsOf = (city: string, worst: number): [string, string, number][] => {
  const d = dayOf(worst), S = sched(d), x = S.cs[CITIES.findIndex((c) => c.id === city)];
  /* build: before voting opens; hidden: voting open, counts hidden (45 to 60); vote: counts shown, judges in (60 on);
     reveal: five seconds before everything closes, so a running clock plays it */
  const show = x.start + (EVENT.showAt ?? 60), open = x.start + (EVENT.publicAt ?? 0);
  const at: Record<string, number> = { before: x.start - 30, build: x.start + Math.min(open - x.start - 5, d.buildMin * 0.45), hidden: Math.min(show - 5, (open + show) / 2), vote: Math.min(x.end - 10, show + 10), last: x.end - 2, reveal: x.end - 5 / 60, closed: x.end + Math.max(10, (S.pickAt - x.end) / 3), picked: S.pickAt + 10 };
  return MOMENTS.map(([id, label]) => [id, label, at[id]]);
};
const rowBySlug = (W: CityWorld, slug: string | null | undefined): Row | null => (slug ? W.rows.find((r) => slugOf(r.p) === slug) ?? null : null);
const at = (min: number) => new Date(EPOCH + min * 60000);

/* page: the server's time and the city; slug: the project open in the address */
export function DayCity({ saved, parts, q, page, live }: {
  saved: Partial<DayCityCfg>; parts: Partial<PartsCfg>; q: Record<string, string | undefined>;
  /* the real page with a backend: the first snapshots, read by the server, so the page arrives with real numbers;
     the page then reads them again every few seconds (lib/source.ts). Absent: the seeded day. */
  live?: { day: DaySnap | null; city: CitySnap | null };
  page: { nowMs: number; city: string; slug?: string };
}) {
  /* demo: the sample day (lib/demo.ts); the page draws the seeded day, opens the panel and keeps the switch on its links */
  const P = clampParts(parts), demo = q[DEMO] !== undefined, admin = demo || q.admin !== undefined;
  const DIRS = DIRS_ALL;
  const CHOICES: Record<string, string[]> = { dir: DIRS.map(([d]) => d), city: CITIES.map((c) => c.id), pics: PIC_MODES.map(([m]) => m), ...AIR_CITY_CHOICES };
  const LABELS: Record<string, string> = { ...Object.fromEntries(DIRS_ALL), ...Object.fromEntries(CITIES.map((c) => [c.id, c.name])), ...Object.fromEntries(PIC_MODES), hatch: 'Hatch', blocks: 'Block eighths', none: 'None', header: 'In the header', pylon: 'The pylon', equator: 'The equator', rule: 'A rule', decay: 'Decays', on: 'On', off: 'Off', dock: 'Docked', row: 'In its row' };
  const GROUPS: Group[] = [
    { name: 'Time', knobs: [{ k: 't', kind: 'range', label: 'Time' }, { k: 'live', kind: 'toggle', label: 'Clock runs' }, { k: 'speed', kind: 'range', label: 'Seconds a second' }, { k: 'worst', kind: 'toggle', label: 'Worst content' }] },
    { name: 'On air (Facing)', knobs: [{ k: 'bars', kind: 'select', label: 'Vote bars' }, { k: 'top', kind: 'select', label: 'Top three' }, { k: 'cut', kind: 'select', label: 'The cut' }, { k: 'trail', kind: 'select', label: 'Trail after a move' }, { k: 'gauge', kind: 'select', label: 'Votes to the final, on 4th' }, { k: 'you', kind: 'select', label: 'Your own row' }, { k: 'rowsFirst', kind: 'range', label: 'Rows before “Print all”' }] },
    { name: 'Direction', knobs: [{ k: 'dir', kind: 'select', label: 'First screen' }, { k: 'pylon', kind: 'toggle', label: 'Pylon' }, { k: 'spark', kind: 'toggle', label: 'A spark per board row' }, { k: 'rows', kind: 'range', label: 'Rows before “Show all”' }, { k: 'how', kind: 'toggle', label: 'How it works and the prize block' }] },
    { name: 'Pictures', knobs: [{ k: 'pics', kind: 'select', label: 'Pictures' }, { k: 'thumbW', kind: 'range', label: 'Picture width (rows, strip)' }, { k: 'picRows', kind: 'range', label: 'Rows with a picture' }, { k: 'cols', kind: 'range', label: 'Monitors across (multiviewer)' }, { k: 'tally', kind: 'toggle', label: 'Tally lamps' }, { k: 'dim', kind: 'range', label: 'Picture brightness at rest' }] },
  ];
  const [cfg, setCfg] = useState<State>(() => {
    const c: State = { dir: 'mix', pylon: 1, spark: 0, rows: 30, how: 1, ...PIC_DEF, ...AIR_CITY_DEF, ...saved, ...clampPics(saved), city: page.city, t: 0, live: 1, speed: 1, worst: 0 };
    if (!CHOICES.dir.includes(c.dir)) c.dir = 'mix';
    for (const k of Object.keys(AIR_CITY_CHOICES)) if (q[k] && AIR_CITY_CHOICES[k].includes(q[k]!)) (c as Record<string, unknown>)[k] = q[k];
    if (q.pics && CHOICES.pics.includes(q.pics)) c.pics = q.pics as PicMode;
    if (q.dir && CHOICES.dir.includes(q.dir)) c.dir = q.dir as CityDir;
    if (q.worst === '0') c.worst = 0; else if (q.worst === '1') c.worst = 1;
    const ms = momentsOf(c.city, c.worst);
    /* the sample day opens with the counts shown and the judges in */
    c.t = page && !demo ? realMinute(page.nowMs) : page ? ms[3][2] : ms[2][2];
    if (q.m && isFinite(+q.m)) c.t = +q.m;
    if (q.moment) { const m = ms.find((x) => x[0] === q.moment); if (m) c.t = m[2]; }
    if (q.still === '1') c.live = 0;
    if (q.speed && +q.speed >= 1 && +q.speed <= 120) c.speed = Math.round(+q.speed);
    return c;
  });
  const bare = !admin;
  const set = (k: string, v: unknown) => setCfg((c) => ({ ...c, [k]: k === 'rows' || k === 'thumbW' || k === 'picRows' || k === 'cols' || k === 'rowsFirst' ? Math.round(Number(v)) : v }));
  const day = dayOf(cfg.worst), S = sched(day), i = CITIES.findIndex((c) => c.id === cfg.city);
  const ms = momentsOf(cfg.city, cfg.worst);
  const clock = useLabClock(cfg.t, !!cfg.live, cfg.speed), bm = useTick(clock, cfg.t, P.tick), moved = useRealClock(clock, !demo, q);
  const [view, setView] = useState<RankView>(q.view === 'time' ? 'time' : 'list'), [hot, setHot] = useState<number | null>(null);

  /* votes: kept in the forms' store per city and seed (the same key the old page used) */
  const forms = useForms(), voteKey = cfg.city + ':' + day.seed, voted = useVotes(voteKey);
  const [more, setMore] = useState(false), [reminded, setReminded] = useState(false);
  /* live: the snapshots; your own press shows at once and until the next snapshot counts it (adj) */
  const snaps = useSnapshots(!!live, cfg.city), dSnap = snaps.day || live?.day || null, cSnap = snaps.city || live?.city || null;
  const [presses, setPresses] = useState<Record<string, [number, number]>>({});
  const adj: Record<string, number> = {};
  if (cSnap) Object.entries(presses).forEach(([id, [d, t]]) => { if (t > cSnap.at) adj[id] = d; });
  const homeOf = (m: number) => { const H0 = homeAt(day, m); return live && dSnap ? liveHome(H0, dSnap, m) : H0; };
  const worldOf = (m: number, v: Votes, H0: ReturnType<typeof homeAt>) => { const W0 = cityAt(day, cfg.city, m, v); return live && cSnap && dSnap ? liveCityWorld(W0, cSnap, H0, m, v, undefined, adj) : W0; };
  const H = homeOf(bm), W = worldOf(bm, voted, H), W10 = worldOf(bm - 10, voted, homeOf(bm - 10)), hx = H.cs[i], word = cityWord(hx, H, day);
  const vote = (id: number) => {
    if (!W.voting) return;
    const mine = store.votes(voteKey);
    if (mine[id]) { const n = { ...mine }; delete n[id]; setPresses((o) => ({ ...o, [id]: [-1, Date.now()] })); store.setVotes(voteKey, n); step(P.sound === 'steps'); return; }
    (forms ? forms.ensureVoter() : Promise.resolve(true)).then((ok) => { if (ok) { setPresses((o) => ({ ...o, [id]: [1, Date.now()] })); store.setVotes(voteKey, { ...store.votes(voteKey), [id]: 1 }); step(P.sound === 'steps'); } });
  };
  const remind = () => {
    if (!forms) { setReminded((r) => !r); return; }
    forms.remind({ city: W.city.id, cityName: W.city.name, when: at(W.x.start), off: W.off }).then((ok) => { if (ok) setReminded(true); });
  };
  const submit = forms ? () => { forms.submit({ city: W.city.id, cityName: W.city.name, deadline: at(W.x.buildEnd), off: W.off }); } : undefined;

  /* the open project: on the real page its address is /city/<id>/p/<slug>; opening pushes it, Back and Close close it */
  const [open, setOpen] = useState<Row | null>(() => (page.slug ? rowBySlug(worldOf(cfg.t, {}, homeOf(cfg.t)), page.slug) : null));
  const openRef = useRef(open), pushed = useRef(false), Wref = useRef(W);
  useEffect(() => { openRef.current = open; Wref.current = W; });
  const show = useCallback((r: Row) => {
    setOpen(r);
    window.history.pushState({ hackdayP: 1 }, '', routes.project(Wref.current.city.id, slugOf(r.p)) + window.location.search); pushed.current = true;
  }, []);
  const close = useCallback(() => {
    if (!openRef.current) return;
    setOpen(null);
    if (pushed.current) { pushed.current = false; window.history.back(); }
    else window.history.replaceState(null, '', routes.city(Wref.current.city.id) + window.location.search);
  }, []);
  useEffect(() => {
    const on = () => { const slug = projectSlugIn(window.location.pathname); pushed.current = false; setOpen(slug ? rowBySlug(Wref.current, slug) : null); };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  /* the one the Supabase team picked, when it is from this city */
  const pk = H.picked && H.final.city.i === i ? { id: H.final.p.id, name: H.final.p.name, place: H.final.place } : null;
  const { save, msg, rail } = useLabSave('day-city', 'lab-day-city-saved');
  const doSave = useCallback(() => save({ dir: cfg.dir, pylon: cfg.pylon, spark: cfg.spark, rows: cfg.rows, how: cfg.how ? 1 : 0, ...clampPics(cfg), bars: cfg.bars, top: cfg.top, cut: cfg.cut, trail: cfg.trail, gauge: cfg.gauge, you: cfg.you, rowsFirst: cfg.rowsFirst }), [cfg, save]);
  const [res, setRes] = useState<Contrast | null>(null);

  useEffect(() => {
    if (bare) return;
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, bare]);
  useEffect(() => {
    if (bare) return;
    const id = window.setTimeout(() => setRes(measure(document, clampScreen(screenCfg))), 700);
    return () => window.clearTimeout(id);
  }, [cfg.dir, cfg.city, cfg.worst, bare]);

  const carry = (m: number) => pageQuery({ m: moved || admin || !cfg.live ? m.toFixed(2) : null, still: cfg.live ? null : '1', worst: cfg.worst ? '1' : null, admin: admin && !demo ? '' : null, [DEMO]: demo ? '' : null });
  const href = (id: string) => '/city/' + id + carry(bm);
  const flap = { flipMs: P.flipMs, flaps: P.flaps, stagger: P.stagger, mode: P.flap, onStep: () => step(P.sound === 'steps') };
  const look: CLook = { mark: P.mark, cardBars: P.cardBars, cardPalette: P.cardPalette, cards: P.cards, segSecs: P.segSecs, bugCorner: P.bugCorner, flap };
  let cur = -1; ms.forEach((m, k) => { if (Math.abs(cfg.t - m[2]) < 0.6) cur = k; });
  const out = (k: string) => k === 't' ? hhmm(cfg.t) + ' UTC · ' + hhmm(cfg.t + W.off) + ' local' : k === 'speed' ? cfg.speed + '×' : k === 'thumbW' ? cfg.thumbW + ' px' : k === 'picRows' ? (cfg.picRows >= 60 ? 'all' : String(cfg.picRows)) : k === 'dim' ? Math.round(cfg.dim * 100) + '%' : String((cfg as Record<string, unknown>)[k]);
  const bounds = { t: [Math.min(S.cs[i].start - 90, Math.floor(cfg.t)), Math.max(S.pickAt + 60, Math.ceil(cfg.t)), 1] as [number, number, number], speed: [1, 120, 1] as [number, number, number], rows: [10, 60, 5] as [number, number, number], rowsFirst: [5, 40, 1] as [number, number, number], ...PIC_BOUNDS };
  const meter = res ? { text: `Small text: ${res.n} pieces, lowest ${res.min.toFixed(1)}:1, ${res.under} under 7:1 with the lines on${res.under ? ': ' + res.worst.filter((w) => w.ratio < 7).slice(0, 4).map((w) => '“' + w.text.slice(0, 24) + '” ' + w.ratio.toFixed(1)).join(', ') : ''}.`, bad: res.under > 0 } : { text: 'Measuring…', bad: false };
  const pylon = cfg.pylon && cfg.dir !== 'wall' ? <Pylon W={W} W10={W10} hot={hot} setHot={setHot} swatch={view === 'time'} /> : null;
  const rankProps = { W, look, vote, open: show, spark: !!cfg.spark, rows: cfg.rows, more, setMore, pick: pk?.id, pics: clampPics(cfg), view, setView, hot, setHot };

  return (
    <>
      {cfg.dir === 'facing' || cfg.dir === 'mix' ? (
        <AirCity W={W} W10={W10} H={H} day={day} clock={clock} first={cfg.t} bm={bm} vote={vote} show={show} open={open} close={close} remind={remind} reminded={reminded} submit={submit}
          pick={pk} elsewhere={H.picked && !pk ? { name: H.final.p.name, city: H.final.city.name } : null} homeHref={routes.home() + carry(bm)} href={href}
          wheel={WHEEL} air={AIR} wire={wireItems(H, 12, i, W.off)} live={!!cfg.live}
          cfg={{ ...AIR_CITY_DEF, first: cfg.dir === 'mix' ? 'mix' : 'facing', rank: 'print', bars: cfg.bars ?? AIR_CITY_DEF.bars, top: cfg.top ?? AIR_CITY_DEF.top, cut: cfg.cut ?? AIR_CITY_DEF.cut, trail: cfg.trail ?? AIR_CITY_DEF.trail, gauge: cfg.gauge ?? AIR_CITY_DEF.gauge, you: cfg.you ?? AIR_CITY_DEF.you, rowsFirst: cfg.rowsFirst ?? AIR_CITY_DEF.rowsFirst }} />
      ) : (
        <>
          <DayScreen />
          <main className="bd dl dc" style={partsVars(P) as CSSProperties} data-face={P.face} data-dir={cfg.dir} data-view={view}>
            <HeaderRow title={W.city.name} state={word} clock={clock} first={cfg.t} offset={W.off} zone={'Local · ' + CODE[cfg.city]} homeHref={'/' + carry(bm)} right={<><AccountCell here={W.city.id} /><span className="hr-keys">{P.sound === 'steps' ? <SoundKey /> : null}</span></>} />
            <YouLine city={W.city.id} cityName={W.city.name} date="10 December" start={hhmm(W.x.start + W.off)} state={W.state} />
            <Announce items={wireItems(H, 12, i, W.off)} mode={P.announce} dwell={P.dwell} crawl={P.crawl} flap={flap} startPaused={!cfg.live} label={'Announcements in ' + W.city.name} empty={'Nothing yet. ' + W.city.name + ' opens at ' + hhmm(W.x.start + W.off) + ' local.'} />
            <CityHero W={W} hx={hx} mon={cfg.dir !== 'wall'} clock={clock} first={cfg.t} look={look} onRemind={remind} reminded={reminded} onSubmit={submit} pick={pk} elsewhere={H.picked && !pk ? { name: H.final.p.name, city: H.final.city.name } : null} />
            {cfg.dir === 'wall' ? (
              <>
                <TopWall W={W} look={look} vote={vote} open={show} pick={pk?.id} />
                <Ranking {...rankProps} mode="rest" from={3} title={W.ranked.length > 3 ? 'The rest' : 'The ranking'} />
              </>
            ) : <Two main={<Ranking {...rankProps} mode={cfg.dir === 'scope' ? 'scope' : 'board'} title="The ranking" />} side={pylon} />}
            {/* before its doors open, a city page says how to get ready; once building, the submit sheet holds both ways in */}
            {cfg.how || W.state === 'next' ? <div className="dl-ex">
              {W.state === 'next' ? <GetReady id="dc-ready" city={W.city.name} cityId={W.city.id} /> : null}
              {cfg.how ? <><HowItWorks f={day} id="dc-how" day={{ ...dayFinalOf(H), city: W.city.id }} /><PrizeBlock id="dc-prize" day={dayFinalOf(H)} winner={H.picked ? H.final.p.name + ', ' + H.final.city.name : null} /></> : null}
            </div> : null}
            <ProjectSheet o={open} W={W} look={look} vote={vote} close={close} />
          </main>
          <DayFooter W={H} day={day} href={href} sound={P.sound === 'steps'} city={cfg.city} cfg={clampFoot(footSaved as Partial<FootCfg>)} minute={bm}
            sections={{ how: cfg.how ? '#dc-how' : '/#dl-how', prizes: cfg.how ? '#dc-prize' : '/#day-prizes' }} style={partsVars(P) as CSSProperties} face={P.face} />
        </>
      )}
      {bare ? null : (
        <>
          <LabPanel closed={demo} tab={demo ? 'Sample day' : 'Admin'} title={demo ? W.city.name + ': sample day' : W.city.name + ': admin'} cfg={{ ...cfg, seed: day.seed }} bounds={bounds} choices={CHOICES} groups={GROUPS} set={set} moments={ms} momentIdx={cur} out={out}
            optionLabel={(_k, v) => LABELS[v] || v} meter={meter} msg={msg} rail={rail} railLabel={(s) => LABELS[String(s.dir)] + (s.pylon ? ', pylon' : '') + ', ' + String(s.pics ?? 'none')}
            apply={(s) => setCfg((c) => ({ ...c, ...(s as Partial<DayCityCfg>) }))} buttons={demo ? [] : [['Now', () => set('t', realMinute(Date.now()))], ['Save', doSave, true]]} />
          {demo ? null : <LayoutPicker modes={DIRS} mode={cfg.dir} setMode={(m) => set('dir', m)} replay={() => clock.set(cfg.t)} />}
        </>
      )}
    </>
  );
}
