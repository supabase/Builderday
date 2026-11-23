'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SCREEN_BOUNDS, SCREEN_CHOICES, SCREEN_DEF, clampScreen, type Depth, type ScreenCfg } from '@/components/screen/config';
import { applyScreen, type ScreenHandle } from '@/components/screen/apply';
import { mountGlobes } from '@/components/screen/globe';
import { LabPanel, LayoutPicker, togglePanel, useLabSave, type Group } from './lab-kit';
import { measure, type Contrast } from './screen/contrast';
import { PLACE } from './wheel/our-facts';
import './motion-lab.css';

/* The screen lab: the real home and a real city page, framed, with the screen kit put on them from here, so the real
   pages stay as they are. The depth picker at the bottom is the question of the round; every value of the kit is a
   knob, and Save writes saved/screen.config.json. The meter reads the contrast of every piece of small text with
   the lines on, and lists the worst. */

const GROUPS: Group[] = [
  { name: 'Ground', knobs: [{ k: 'ground', kind: 'select', label: 'Ground' }, { k: 'lift', kind: 'toggle', label: 'Lift the faint ink to 7:1' }] },
  { name: 'Lines', knobs: [{ k: 'lineAlpha', kind: 'range', label: 'Darkness' }, { k: 'linePitch', kind: 'range', label: 'Pitch' }] },
  { name: 'Colour edges', knobs: [{ k: 'fringe', kind: 'range', label: 'Step' }, { k: 'fringeAlpha', kind: 'range', label: 'Strength' }, { k: 'bigFrom', kind: 'range', label: 'Big type from' }] },
  { name: 'Grain and corners', knobs: [{ k: 'grain', kind: 'range', label: 'Grain' }, { k: 'grainCell', kind: 'range', label: 'Grain cell' }, { k: 'corners', kind: 'range', label: 'Corners' }] },
  { name: 'Glass', knobs: [{ k: 'globe', kind: 'toggle', label: 'Lens globe by the city name' }] },
];
const DEPTHS: [string, string][] = [['big', 'Big type only'], ['all', 'Everything'], ['none', 'Wheel only']];
const PAGES: [string, string, string][] = [['home', 'Home', '/?moment=mid'], ['city', 'City page', '/city/berlin?moment=vote'], ['project', 'Project open', '/city/berlin?moment=vote&open']];
const LABELS: Record<string, string> = { wheel: "The wheel's (#0c0d0d)", site: "The site's night" };

export function ScreenLab({ saved, page: page0, bare }: { saved: ScreenCfg; page: string; bare: boolean }) {
  const [cfg, setCfg] = useState<ScreenCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampScreen({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('screen', 'lab-screen-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const [page, setPage] = useState(page0);
  const frame = useRef<HTMLIFrameElement>(null), kit = useRef<ScreenHandle | null>(null), globes = useRef<(() => void) | null>(null);
  const [res, setRes] = useState<Contrast | null>(null);
  const src = (PAGES.find((p) => p[0] === page) ?? PAGES[0])[2];

  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);

  /* the lens globe by the city page's name: a placeholder over the page, beside the h1 */
  const placeGlobe = useCallback((doc: Document, on: boolean) => {
    let g = doc.getElementById('sk-lens');
    if (!on) { g?.remove(); globes.current?.(); globes.current = null; return; }
    const h1 = doc.querySelector('h1'); if (!h1) return;
    if (!g) { g = doc.createElement('span'); g.id = 'sk-lens'; g.setAttribute('data-globe', ''); g.setAttribute('aria-hidden', 'true'); doc.body.appendChild(g); }
    const r = h1.getBoundingClientRect(), win = doc.defaultView!, s = Math.min(64, Math.max(40, r.height));
    const [lat, lon] = PLACE[doc.location.pathname.split('/')[2] ?? 'london'] ?? PLACE.london;
    g.dataset.lat = String(lat); g.dataset.lon = String(lon);
    Object.assign(g.style, { position: 'absolute', left: r.right + win.scrollX + 20 + 'px', top: r.top + win.scrollY + r.height / 2 - s / 2 + 'px', width: s + 'px', height: s + 'px', pointerEvents: 'none' });
    if (!globes.current) globes.current = mountGlobes(doc);
  }, []);

  const run = useCallback((c: ScreenCfg) => {
    const doc = frame.current?.contentDocument; if (!doc?.body) return;
    if (!kit.current) kit.current = applyScreen(doc, c); else kit.current.update(c);
    placeGlobe(doc, !!c.globe && page !== 'home');
    window.setTimeout(() => { const d = frame.current?.contentDocument; if (d?.body) setRes(measure(d, c)); }, 400);
  }, [page, placeGlobe]);
  useEffect(() => { run(cfg); }, [cfg, run]);
  const onLoad = () => {
    kit.current = null; globes.current = null;
    /* wait until the framed page has hydrated: attributes put on its nodes before that would not match its server
       HTML. React marks a node it has hydrated with a __reactFiber key. */
    let tries = 0;
    const wait = () => {
      const d = frame.current?.contentDocument;
      const fibre = (e: Element) => Object.keys(e).some((k) => k.startsWith('__reactFiber'));
      const parts = d ? Array.from(d.querySelectorAll('main, h1, footer')) : [];
      const done = parts.length > 0 && parts.every(fibre);
      if (!done && tries++ < 100) { window.setTimeout(wait, 100); return; }
      /* the project stage opens the first project in the list, as a press would */
      if (page === 'project') d?.querySelector<HTMLElement>('a[data-pid]')?.click();
      window.setTimeout(() => run(cfg), page === 'project' ? 900 : 400);
    };
    wait();
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave();
    };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave]);

  const out = (k: string) => { const v = cfg[k as keyof ScreenCfg]; return k === 'linePitch' || k === 'bigFrom' ? v + 'px' : k === 'fringe' ? v + 'px' : String(v); };
  const meter = res ? { text: `Small text: ${res.n} pieces, lowest ${res.min.toFixed(1)}:1, ${res.under} under 7:1 with the lines on.`, bad: res.under > 0 } : { text: 'Measuring…', bad: false };

  return (
    <>
      <iframe ref={frame} key={src} className="ml-frame" src={src} title="The real page under the screen kit" onLoad={onLoad} />
      <LabPanel title="Screen lab" cfg={{ ...cfg, seed: 'none' }} bounds={SCREEN_BOUNDS} choices={SCREEN_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={out} optionLabel={(_k, v) => LABELS[v] || v} meter={meter} msg={msg} rail={rail}
        railLabel={(s) => `${s.depth}, lines ${s.lineAlpha}, step ${s.fringe}`} apply={(s) => setCfg(clampScreen(s))}
        buttons={[['Save', doSave, true], ['Wheel values', () => setCfg({ ...SCREEN_DEF, depth: cfg.depth })]]}>
        <fieldset><legend>Page</legend>
          <div className="ml-row">{PAGES.map(([k, t]) => <button key={k} type="button" aria-pressed={page === k} onClick={() => setPage(k)}>{t}</button>)}</div>
          {res && res.worst.length ? <p className="ml-note">Lowest: {res.worst.slice(0, 5).map((w) => `“${w.text}” ${w.ratio.toFixed(1)}`).join(' · ')}</p> : null}
        </fieldset>
      </LabPanel>
      <LayoutPicker modes={DEPTHS} mode={cfg.depth} setMode={(m) => set('depth', m as Depth)} replay={() => run(cfg)} />
    </>
  );
}
