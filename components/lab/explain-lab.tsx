'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCOPE_BOUNDS, SCOPE_CHOICES, SCOPE_LABELS, beamFrame, clampScope, type DayDir, type PrizeMode, type Scene, type ScopeCfg } from '@/components/day/scope';
import { lineMo, lineScore, lineStills } from '@/components/day/line';
import type { LineClock } from '@/components/day/step-through';
import { Tube, tubeCosts, type TubeCost } from '@/components/day/tube';
import { beamStats, type BeamStats } from '@/components/day/beam';
import { HowItWorks, PrizeBlock, facts } from '@/components/day/explain';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';
import '@/components/day/explain.css';
import './explain-lab.css';

/* The tube lab: the how-it-works and prize drawings as a generator. Click a tube for a new seed, pick the modes, turn
   the knobs; Save writes saved/explain.config.json, which the wheel's sheet, the day home and the city page read.
   X1: today's five scenes, each drawn by both renderers side by side (canvas with a blur, and the beam).
   X2: the four directions, one object for the three steps, each playing the day, with a still of each step under it
   (cover the words: can the step be told from the still alone?). Then the sheet and a page as they look today. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'dir', kind: 'select', label: 'Direction' }, { k: 'renderer', kind: 'select', label: 'Renderer' }, { k: 'accent', kind: 'select', label: 'Accent' }, { k: 'letters', kind: 'select', label: 'Lettering' }, { k: 'lines', kind: 'select', label: 'Scan lines' }, { k: 'prize', kind: 'select', label: 'Prizes' }, { k: 'layout', kind: 'select', label: 'Layout' }, { k: 'build', kind: 'select', label: 'Build' }, { k: 'vote', kind: 'select', label: 'Vote' }, { k: 'final', kind: 'select', label: 'Final' }, { k: 'cash', kind: 'select', label: '$10,000' }, { k: 'neo', kind: 'select', label: 'MacBook Neo' }] },
  { name: 'The morning line', knobs: [{ k: 'turnMode', kind: 'select', label: 'Turn' }, { k: 'panel', kind: 'select', label: 'Panel' }, { k: 'afterglow', kind: 'select', label: 'Afterglow' }, { k: 'smallLayout', kind: 'select', label: 'Small tube' }, { k: 'lGrid', kind: 'select', label: 'Grid' }, { k: 'lMarks', kind: 'select', label: 'Cities' }, { k: 'lBanks', kind: 'select', label: 'Final line-up' }, { k: 'lLand', kind: 'toggle', label: 'Land dots' }, { k: 'lLandA', kind: 'range', label: 'Land light' }, { k: 'pickClick', kind: 'toggle', label: 'A click at the pick (sound on)' },
    { k: 'gR', kind: 'range', label: 'Globe size' }, { k: 'lTilt', kind: 'range', label: 'Tilt, °' }, { k: 'lineAt', kind: 'range', label: 'Where the 09:00 line sits, °' }, { k: 'typeRate', kind: 'range', label: 'Typing, letters/s' }, { k: 'cardLines', kind: 'range', label: 'Lines in the card' }, { k: 'rankRows', kind: 'range', label: 'Rows in the ranking' }, { k: 'beats', kind: 'range', label: 'Vote beats' }, { k: 'beatGap', kind: 'range', label: 'Beat spacing, ms' },
    { k: 'spikeH', kind: 'range', label: 'Spike height' }, { k: 'arcH', kind: 'range', label: 'Arc height' }, { k: 'flyStagger', kind: 'range', label: 'Stagger in a city, ms' }, { k: 'tailLen', kind: 'range', label: 'Tail length' }, { k: 'fadeIn', kind: 'range', label: 'Fade-in floor, ms' }, { k: 'fadeOut', kind: 'range', label: 'Fade-out floor, ms' }, { k: 'farLevel', kind: 'range', label: 'Far side brightness' }, { k: 'rampW', kind: 'range', label: 'Horizon ramp, °' }, { k: 'pickDim', kind: 'range', label: 'The others at the pick' }, { k: 'seam', kind: 'range', label: 'Seam, ms' }] },
  { name: 'Step-through', knobs: [{ k: 'story', kind: 'select', label: 'The tube plays' }, { k: 'jump', kind: 'select', label: 'A press' }, { k: 'tour', kind: 'toggle', label: 'Plays the day once by itself' }, { k: 'tourPhone', kind: 'toggle', label: 'Also on a phone' }, { k: 'bar', kind: 'toggle', label: 'The day bar' }, { k: 'next', kind: 'toggle', label: '“Next: Vote” in the sheet' }] },
  { name: 'Beam', knobs: [{ k: 'bw', kind: 'range', label: 'Spot' }, { k: 'halo', kind: 'range', label: 'Halo size' }, { k: 'haloW', kind: 'range', label: 'Halo share' }, { k: 'dwell', kind: 'range', label: 'Dwell' }, { k: 'speed', kind: 'range', label: 'Long lines dim' }, { k: 'expo', kind: 'range', label: 'Exposure' }, { k: 'hot', kind: 'range', label: 'Hot cores go white' }, { k: 'after', kind: 'range', label: 'Afterglow frames' }, { k: 'fade', kind: 'range', label: 'Afterglow fade' }, { k: 'budget', kind: 'range', label: 'Beam budget' }] },
  { name: 'Depth', knobs: [{ k: 'depth', kind: 'range', label: 'Far lines dim' }, { k: 'gap', kind: 'range', label: 'Gap at crossings' }, { k: 'tilt', kind: 'range', label: 'Vote tilt, °' }, { k: 'turn', kind: 'range', label: 'Globe turn' }] },
  { name: 'Glass', knobs: [{ k: 'gMirror', kind: 'range', label: 'Rim mirrors' }, { k: 'gThrough', kind: 'range', label: 'Seen through' }, { k: 'gFringe', kind: 'range', label: 'Colour split' }, { k: 'gTurn', kind: 'range', label: 'Globe turns' }, { k: 'gSize', kind: 'range', label: 'Type size' }, { k: 'gRow', kind: 'toggle', label: 'Ten small globes under it' }, { k: 'gOn', kind: 'toggle', label: 'Big globe touching the last figure' }, { k: 'gBig', kind: 'range', label: 'Globe size (of the type)' }, { k: 'gTouch', kind: 'range', label: 'Overlaps the 0' }] },
  { name: 'Laptop (MacBook Neo: glass)', knobs: [{ k: 'nLid', kind: 'range', label: 'Lid height' }, { k: 'nDeck', kind: 'range', label: 'Deck depth' }, { k: 'nScreen', kind: 'range', label: 'Screen light' }, { k: 'nRim', kind: 'range', label: 'Rim light' }, { k: 'nStreak', kind: 'range', label: 'Streak on the screen' }, { k: 'nWhite', kind: 'range', label: 'Light, blue to white' }, { k: 'nGlobe', kind: 'range', label: 'Globe size' }, { k: 'nGx', kind: 'range', label: 'Globe across' }, { k: 'nGy', kind: 'range', label: 'Globe down' }] },
  { name: 'Canvas', knobs: [{ k: 'glow', kind: 'range', label: 'Glow' }, { k: 'lw', kind: 'range', label: 'Line' }, { k: 'jitter', kind: 'range', label: 'Wobble' }, { k: 'trail', kind: 'range', label: 'Trail' }, { k: 'decay', kind: 'range', label: 'Trail fade' }, { k: 'scan', kind: 'range', label: 'Tube’s own scan lines' }, { k: 'hover', kind: 'toggle', label: 'Pointing turns the beam up' }] },
  { name: 'Time', knobs: [{ k: 'loop', kind: 'range', label: 'Loop, s' }, { k: 'fps', kind: 'range', label: 'Frames/s' }, { k: 'smooth', kind: 'toggle', label: 'Draw every frame' }, { k: 'hold', kind: 'range', label: 'Hold at end' }, { k: 'still', kind: 'range', label: 'Still (reduced)' }, { k: 'blips', kind: 'range', label: 'Radar votes' }] },
];
const OLD: [Scene, string][] = [['build', 'Build'], ['vote', 'Vote'], ['final', 'Final'], ['cash', 'The global prize'], ['neo', 'The city prize']];
const DIRS: DayDir[] = ['line', 'globe', 'rack', 'plans', 'board'];
const PRIZE_MODES: PrizeMode[] = ['glass', 'flaps', 'nixie', 'tubes', 'docket'];
/* each step's most telling moment, as a phase of the whole day (three steps) */
const STILLS: [string, number][] = [['Build', 0.55 / 3], ['Vote', 1.7 / 3], ['Final', 2.9 / 3]];
const F = facts();
/* each direction's stills: the morning line's three rests, or today's telling moments */
const stillsOf = (cfg: ScopeCfg, d: DayDir): [string, number][] => {
  if (d !== 'line') return STILLS;
  const at = lineStills(lineScore({ ...cfg, dir: 'line' }, F, lineMo()));
  return [['Build', at[0]], ['Vote', at[1]], ['Final', at[2]]];
};
/* the two named looks, first on the saved rail: the drawings as first built, and in the site's own lettering and
   scan lines (what saved/explain.config.json uses until the owner picks). A look sets only these keys. */
type Look = { look: string } & Partial<ScopeCfg>;
const FIRST: Look = { look: 'As first built: stroke letters, the tube’s own scan lines', letters: 'stroke', lines: 'tube' };
const SITE: Look = { look: 'The site’s mono and the page’s scan lines', letters: 'mono', lines: 'page' };
const LOOKS = [SITE, FIRST];
const lookOf = (s: Record<string, unknown>): Partial<ScopeCfg> => { const o = { ...s }; delete o.look; return o as Partial<ScopeCfg>; };
const DAY = { buildMin: 90, voteAfter: 30, startHour: 9 };

/* the costs and the context, read once a second; the page renders again only when what it shows has changed */
function useCosts(on: boolean): { rows: TubeCost[]; stats: BeamStats } {
  const [s, setS] = useState<{ rows: TubeCost[]; stats: BeamStats }>({ rows: [], stats: { contexts: 0, format: 'none', lost: 0 } });
  useEffect(() => {
    if (!on) return;
    let was = '';
    const t = window.setInterval(() => {
      const next = { rows: tubeCosts().map((r) => ({ ...r, ms: Math.round(r.ms * 100) / 100, frames: Math.min(r.frames, 3) })), stats: beamStats() }, k = JSON.stringify(next);
      if (k !== was) { was = k; setS(next); }
    }, 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return s;
}
function costTable(rows: TubeCost[]) {
  const by = new Map<string, { beam: number[]; canvas: number[]; len: number }>();
  for (const r of rows) {
    if (r.frames < 3) continue;
    const e = by.get(r.scene) ?? { beam: [], canvas: [], len: 0 }; e[r.renderer].push(r.ms); if (r.renderer === 'beam') e.len = Math.max(e.len, r.len); by.set(r.scene, e);
  }
  const avg = (a: number[]) => (a.length ? (a.reduce((p, q) => p + q, 0) / a.length).toFixed(2) + ' ms' : '–');
  return [...by.entries()].sort().map(([k, v]) => ({ scene: k, canvas: avg(v.canvas), beam: avg(v.beam), len: v.len ? Math.round(v.len) : 0 }));
}

export function ExplainLab({ saved, bare, only, at, r, compare, look }: { saved: ScopeCfg; bare: boolean; only?: string; at?: number; r?: string; compare?: boolean; look?: string }) {
  /* the lab opens on the beam; the real pages keep what is saved until Save */
  const [cfg, setCfg] = useState<ScopeCfg>(() => clampScope({ ...saved, renderer: 'beam' }));
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampScope({ ...c, [k]: v })), []);
  const reseed = useCallback(() => setCfg((c) => clampScope({ ...c, seed: 1 + Math.floor(Math.random() * 99998) })), []);
  const { save, msg, rail } = useLabSave('explain', 'lab-explain-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  useEffect(() => { if (!bare) return; const h = document.documentElement; h.classList.add('lab-closed', 'no-lab'); return () => h.classList.remove('lab-closed', 'no-lab'); }, [bare]);
  const out = (k: string) => { const v = cfg[k as keyof ScopeCfg]; return k === 'loop' ? v + 's' : String(v); };
  const { rows, stats } = useCosts(!only), table = costTable(rows);
  const over = table.filter((r) => r.len > cfg.budget).length;
  const canvasCfg = { ...cfg, renderer: 'canvas' as const }, beamCfg = { ...cfg, renderer: 'beam' as const };
  if (only?.startsWith('prize:')) {
    const m = only.slice(6) as PrizeMode;
    return <div className="xl xl-only xl-only-prize"><PrizeBlock id="only-prize" scope={clampScope({ ...cfg, prize: m })} compact={r === 'compact'} /></div>;
  }
  if (only === 'tour' || only === 'tour-sheet') {
    const sheet = only === 'tour-sheet';
    return <div className={'xl xl-only xl-only-prize' + (sheet ? ' xl-only-sheet' : '')}><HowItWorks f={DAY} compact={sheet} id="only-how" scope={cfg} /></div>;
  }
  if (compare) return <Compare cfg={cfg} bare={bare} />;
  if (only) {
    const isDir = (DIRS as string[]).includes(only), one = clampScope({ ...cfg, ...(look === 'first' ? lookOf(FIRST) : {}), ...(isDir ? { dir: only as DayDir } : {}), renderer: r === 'canvas' ? 'canvas' : 'beam' });
    return <div className="xl xl-only"><Tube scene={isDir ? 'day' : (only as Scene)} cfg={one} f={F} at={at !== undefined && Number.isFinite(at) ? at : undefined} /></div>;
  }
  return (
    <div className="xl">
      <header className="xl-h">
        <h1>Tubes</h1>
        <p>How it works and the prizes, drawn the way a vector monitor draws. Click a tube for a new seed. Seed {cfg.seed}.</p>
        <p className="xl-gl" data-bad={stats.contexts > 1 ? '' : undefined}>WebGL contexts on this page: <b>{stats.contexts}</b> · buffer: <b>{stats.format}</b>{stats.lost ? ' · lost ' + stats.lost : ''}</p>
      </header>

      <LineBench cfg={cfg} />

      <section className="xl-sec" aria-labelledby="x1-h">
        <h2 id="x1-h">X1 · The beam</h2>
        <p className="xl-note">Left: today’s canvas renderer, a blur after each line. Right: the beam, light worked out along each line and added up, the afterglow from earlier phases.</p>
        <ul className="xl-pairs">
          {OLD.map(([s, name]) => (
            <li key={s}>
              <p className="xl-cap">{name}: {SCOPE_LABELS[cfg[s as keyof ScopeCfg] as string]}</p>
              <div className="xl-two">
                <button type="button" className="xl-hit" tabIndex={-1} onClick={reseed} aria-label={'New seed (' + name + ', canvas)'}><Tube scene={s} cfg={canvasCfg} f={F} /></button>
                <button type="button" className="xl-hit" tabIndex={-1} onClick={reseed} aria-label={'New seed (' + name + ', beam)'}><Tube scene={s} cfg={beamCfg} f={F} /></button>
              </div>
            </li>
          ))}
        </ul>
        <table className="xl-cost">
          <caption>Frame cost on the main thread (scene and draw calls; the GPU’s own time is not measured), averaged over the frames drawn so far. Budget {cfg.budget} units of beam.</caption>
          <thead><tr><th scope="col">Scene</th><th scope="col">Canvas</th><th scope="col">Beam</th><th scope="col">Beam length</th></tr></thead>
          <tbody>{table.map((r) => <tr key={r.scene}><th scope="row">{r.scene}</th><td>{r.canvas}</td><td>{r.beam}</td><td data-bad={r.len > cfg.budget ? '' : undefined}>{r.len || '–'}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="xl-sec" aria-labelledby="x2-h">
        <h2 id="x2-h">X2 · The directions</h2>
        <p className="xl-note">One object carries all three steps. Each tube plays the day (Build, Vote, Final); the stills under it are each step’s telling moment. Real places, times and votes from the model. Accent: {cfg.accent}.</p>
        <ul className="xl-dirs">
          {DIRS.map((d) => (
            <li key={d} data-picked={cfg.dir === d ? '' : undefined}>
              <p className="xl-cap">{SCOPE_LABELS[d]}{cfg.dir === d ? ' · picked' : ''}</p>
              <button type="button" className="xl-hit" tabIndex={-1} onClick={reseed} aria-label={'New seed (' + SCOPE_LABELS[d] + ')'}><Tube scene="day" cfg={{ ...cfg, dir: d }} f={F} /></button>
              <ol className="xl-stills">
                {stillsOf(cfg, d).map(([k, at]) => <li key={k}><Tube scene="day" cfg={{ ...cfg, dir: d }} f={F} at={at} /><span className="xl-cap">{k}</span></li>)}
              </ol>
            </li>
          ))}
        </ul>
      </section>

      <section className="xl-sec" aria-labelledby="x3-h">
        <h2 id="x3-h">X3 · The step-through</h2>
        <p className="xl-note">The tube plays the day once (Build, Vote, Final), each step at least the motion lab’s “Each step” (12 s), then rests on Final and the key becomes Play the day. The first press, drag or key stops the tour for good; pointing at the section or focus inside holds it. A step’s heading is a button; arrow keys move between them. The bar takes a click, a drag, arrows, Page Up and Down (a step), Home and End. On a phone it waits for a press. Reduced motion: stills, no tour.</p>
        <div className="xl-in">
          <div className="xl-sheet">
            <p className="xl-cap">In the preview home’s sheet (400 wide)</p>
            <HowItWorks f={DAY} compact id="xl-how" scope={cfg} />
          </div>
          <div className="xl-page">
            <p className="xl-cap">On a day page</p>
            <HowItWorks f={DAY} id="xl-how2" scope={cfg} />
          </div>
        </div>
      </section>

      <section className="xl-sec" aria-labelledby="x4-h">
        <h2 id="x4-h">X4 · The prizes</h2>
        <p className="xl-note">Five ways to show the two prizes, each with the amount as real text. Under glass is picked: the amount as type with the wheel’s glass globe in front of its last figures, and ten small globes, one lit at each city. Orange only as light inside glass.</p>
        <ul className="xl-prizes">
          {PRIZE_MODES.map((m) => (
            <li key={m} data-picked={m === 'glass' ? '' : undefined}>
              <p className="xl-cap">{SCOPE_LABELS[m]}{m === 'glass' ? ' · picked' : ''}{cfg.prize === m ? ' · on the pages after Save' : ''}</p>
              <PrizeBlock id={'x4-' + m} level={3} scope={{ ...cfg, prize: m }} />
            </li>
          ))}
        </ul>
      </section>

      <LabPanel title="Tube lab" cfg={cfg} bounds={SCOPE_BOUNDS} choices={SCOPE_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
        optionLabel={(k, v) => (k === 'renderer' ? (v === 'beam' ? 'Beam (WebGL)' : 'Canvas with a blur (today)') : SCOPE_LABELS[v] ?? v)}
        buttons={[['Save', doSave, true], ['New seed', reseed], ['Hide panel', togglePanel]]}
        meter={{ text: (stats.contexts === 1 ? 'One WebGL context.' : stats.contexts === 0 ? 'No WebGL2: the beam tubes are drawing with the canvas pen.' : 'WebGL contexts: ' + stats.contexts + ', should be one.') + ' ' + (over ? over + ' scene(s) over the beam budget.' : 'Every scene within the beam budget.') + ' Tubes run only on screen.', bad: stats.contexts !== 1 || over > 0 }} msg={msg} rail={[...LOOKS, ...rail]}
        railLabel={(s) => (s.look ? String(s.look) : s.dir + ' · ' + s.renderer + ' · ' + s.accent + ' · ' + (s.letters ?? 'stroke') + ' · ' + s.seed)} apply={(s) => setCfg((c) => clampScope({ ...c, ...lookOf(s) }))} />
    </div>
  );
}

/* ?compare: the picked direction as first built (left) and in the site's lettering and scan lines (right), at the
   same size and the same moments; then the same pair in the step-through, in the sheet (400 wide) and on a day page */
function Compare({ cfg, bare }: { cfg: ScopeCfg; bare: boolean }) {
  const L = clampScope({ ...cfg, ...lookOf(FIRST), renderer: 'beam' }), R = clampScope({ ...cfg, ...lookOf(SITE), renderer: 'beam' });
  const side: [string, ScopeCfg, string][] = [['l', L, FIRST.look], ['r', R, SITE.look]];
  /* no panel here: the page takes the full width */
  useEffect(() => { const h = document.documentElement; h.classList.add('lab-closed', 'no-lab'); return () => h.classList.remove('lab-closed', 'no-lab'); }, []);
  return (
    <div className="xl xl-cmp" data-bare={bare ? '' : undefined}>
      <header className="xl-h">
        <h1>Compare the two looks</h1>
        <p>{SCOPE_LABELS[cfg.dir]}, beam renderer, seed {cfg.seed}. Left: {FIRST.look.toLowerCase()}. Right: {SITE.look.toLowerCase()}. Both play from the top when they come into view; the stills under them are the same moments.</p>
      </header>
      <section className="xl-sec" aria-label="The drawing">
        <div className="xl-two">
          {side.map(([k, c, name]) => <figure key={k} className="xl-fig"><Tube scene="day" cfg={c} f={F} /><figcaption className="xl-cap">{name}</figcaption></figure>)}
        </div>
        {STILLS.map(([name, at]) => (
          <div key={name} className="xl-two xl-cmp-row">
            {side.map(([k, c]) => <figure key={k} className="xl-fig"><Tube scene="day" cfg={c} f={F} at={at} /><figcaption className="xl-cap">{name}, still</figcaption></figure>)}
          </div>
        ))}
      </section>
      <section className="xl-sec" aria-label="In the sheet, 400 wide">
        <h2>In the preview home’s sheet (400 wide)</h2>
        <div className="xl-cmp-sheets">
          {side.map(([k, c, name]) => <div key={k} className="xl-sheet"><p className="xl-cap">{name}</p><HowItWorks f={DAY} compact id={'cmp-s-' + k} scope={c} /></div>)}
        </div>
      </section>
      <section className="xl-sec" aria-label="On a day page">
        <h2>On a day page</h2>
        {side.map(([k, c, name]) => <div key={k} className="xl-page xl-cmp-page"><p className="xl-cap">{name}</p><HowItWorks f={DAY} id={'cmp-p-' + k} scope={c} /></div>)}
      </section>
    </div>
  );
}

/* X0: the morning line on a page and in the sheet, with what it takes to read its motion: a speed switch, frame keys
   (a sixtieth of a second each way, holding the drawing), a strip with a tick at every beat of the score above the
   day bar, and the meter: beam time (length times brightness, what a real beam spends) now and at its highest in the
   loop, against the budget. */
const SPEEDS = [1, 0.5, 0.25, 0.1];
function LineBench({ cfg }: { cfg: ScopeCfg }) {
  const line = clampScope({ ...cfg, dir: 'line' }), S = useMemo(() => lineScore(line, F, lineMo()), [line]);
  const [speed, setSpeed] = useState(1), [clock, setClock] = useState<LineClock | null>(null), [peak, setPeak] = useState<[number, number]>([0, 0]), [now, setNow] = useState(0);
  const head = useRef<HTMLSpanElement>(null), key = JSON.stringify(line);
  /* the highest beam time in the loop, worked out at ten frames a second, after the page has drawn */
  useEffect(() => {
    const c = JSON.parse(key) as ScopeCfg, id = window.setTimeout(() => {
      let t = 0, l = 0; const n = Math.round(S.loop * 10);
      for (let i = 0; i < n; i++) { const fr = beamFrame('day', i / n, { ...c, after: 0 }, F); t = Math.max(t, fr.time); l = Math.max(l, fr.len); }
      setPeak([t, l]);
    }, 200);
    return () => window.clearTimeout(id);
  }, [key, S]);
  /* the strip's playhead every frame; the meter's reading four times a second */
  useEffect(() => {
    if (!clock) return;
    let raf = 0, last = 0; const c = JSON.parse(key) as ScopeCfg;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (head.current) head.current.style.transform = 'translateX(' + ((100 * clock.t) / clock.max).toFixed(3) + '%)';
      if (t - last > 250) { last = t; setNow(Math.round(beamFrame('day', clock.t / clock.max, { ...c, after: 0 }, F).time)); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock, key]);
  const frame = (d: number) => { if (!clock) return; clock.setPaused(true); clock.scrub(clock.t + d / 60); };
  const strip = (
    <div className="xl-strip" aria-hidden="true">
      {S.beats.map((b, i) => <span key={i} className="xl-beat" style={{ left: ((100 * b) / S.loop).toFixed(3) + '%' }} />)}
      {S.acts.map((a, i) => <span key={'a' + i} className="xl-beat xl-act" style={{ left: ((100 * a) / S.loop).toFixed(3) + '%' }} />)}
      <span className="xl-head-w"><span ref={head} className="xl-head" /></span>
    </div>
  );
  const pct = Math.round((100 * peak[0]) / line.budget);
  return (
    <section className="xl-sec" aria-labelledby="x0-h">
      <h2 id="x0-h">X0 · The morning line</h2>
      <p className="xl-note">The globe turns at one speed under a fixed 09:00 line; one project, yours, is followed in the panel: Build, Vote, Final. Loop {S.loop.toFixed(1)} s ({S.turns} turns of {S.turn.toFixed(1)} s): Build {S.B.toFixed(1)} s, Vote {S.V.toFixed(1)} s, Final {(S.loop - S.Fs).toFixed(1)} s. Press a step to turn there; arrow keys cut; drag the bar to scrub.</p>
      <div className="xl-bench" role="group" aria-label="Reading the motion">
        <span className="xl-speeds" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((v) => <button key={v} type="button" role="radio" aria-checked={speed === v} className="xl-k" onClick={() => setSpeed(v)}>{v}×</button>)}
        </span>
        <button type="button" className="xl-k" onClick={() => frame(-1)} aria-label="One frame back">◀ Frame</button>
        <button type="button" className="xl-k" onClick={() => frame(1)} aria-label="One frame on">Frame ▶</button>
        <button type="button" className="xl-k" onClick={() => clock?.setPaused(false)}>Play</button>
        <span className="xl-meter" data-bad={peak[0] > line.budget * 0.85 ? '' : undefined}>Beam time now <b>{now.toLocaleString('en-US')}</b> · highest in the loop <b>{peak[0] ? Math.round(peak[0]).toLocaleString('en-US') : '…'}</b> of {line.budget.toLocaleString('en-US')} ({peak[0] ? pct : '…'}%) · plain length at most {peak[1] ? Math.round(peak[1]).toLocaleString('en-US') : '…'}</span>
      </div>
      <div className="xl-in">
        <div className="xl-page">
          <p className="xl-cap">On a day page</p>
          <HowItWorks f={DAY} id="x0-how" scope={line} speed={speed} onClock={setClock} strip={strip} />
        </div>
        <div className="xl-sheet">
          <p className="xl-cap">In the preview home’s sheet (400 wide)</p>
          <HowItWorks f={DAY} compact id="x0-how-s" scope={line} speed={speed} />
        </div>
      </div>
    </section>
  );
}
