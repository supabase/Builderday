'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import './panel.css';
import { at } from '@/lib/routes';

/* The tuning chrome: the knob panel, its toggle, the layout picker, Save and the meters. The tuning pages under /lab
   use it, and the real pages show it under ?admin (moments, the clock and the saved look); without ?admin a real page
   renders none of it. */

export type Knob = { k: string; kind: 'range' | 'select' | 'toggle'; label: string };
export type Group = { name: string; knobs: Knob[] };
type Cfg = Record<string, unknown>;

/* Save: the config goes to the clipboard, to a short local history, and (on the development server) to
   saved/<name>.config.json. A deployed site has no files to write, so there it is only copied. */
const railListeners = new Set<() => void>();
function onRail(f: () => void) { railListeners.add(f); return () => { railListeners.delete(f); }; }

export function useLabSave(name: string, storeKey: string) {
  const [msg, setMsg] = useState('');
  /* the history lives in localStorage: read after hydration, empty on the server */
  const raw = useSyncExternalStore(onRail, () => { try { return localStorage.getItem(storeKey) || '[]'; } catch { return '[]'; } }, () => '[]');
  const rail = useMemo((): Cfg[] => { try { return JSON.parse(raw); } catch { return []; } }, [raw]);
  const save = useCallback((out: Cfg) => {
    const json = JSON.stringify(out, null, 2) + '\n';
    /* the message says what really happened: copied only when the clipboard took it, and the save's own status */
    let copy: Promise<boolean>;
    try { copy = navigator.clipboard.writeText(json).then(() => true, () => false); } catch { copy = Promise.resolve(false); }
    try { const l = rail.filter((s) => JSON.stringify(s) !== JSON.stringify(out)); l.unshift(out); localStorage.setItem(storeKey, JSON.stringify(l.slice(0, 10))); } catch { /* storage blocked */ }
    railListeners.forEach((f) => f());
    return fetch(at('/api/save?name=' + name), { method: 'POST', headers: { 'content-type': 'application/json' }, body: json })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(async (j: { path: string }) => { setMsg('Saved to ' + j.path + ((await copy) ? ' and copied.' : '. Not copied: the clipboard refused.')); })
      .catch(async (e: unknown) => {
        const c = (await copy) ? 'Copied. ' : 'Not copied (the clipboard refused). ';
        setMsg(c + (typeof e === 'number' ? 'The file was not written: the save answered ' + e + '.' : 'There is no dev server here to write the file.'));
      });
  }, [name, storeKey, rail]);
  return { save, msg, rail };
}

/* the share of the viewport painted green ([data-g] marks every green thing); the budget is 5% */
export function greenShare(page: Element | null, weigh: (e: Element, r: DOMRect) => number): number {
  if (!page) return 0;
  const vw = window.innerWidth, vh = window.innerHeight; let sum = 0;
  page.querySelectorAll('[data-g]').forEach((e) => {
    const r = e.getBoundingClientRect(), w = Math.max(0, Math.min(vw, r.right) - Math.max(0, r.left)), h = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
    sum += w * h * weigh(e, r);
  });
  return sum / (vw * vh) * 100;
}
export function meterText(g: number): string { return 'Green: ' + g.toFixed(1) + '% of the viewport' + (g >= 5 ? ' (over budget)' : ''); }

/* the arrival again: forget that this session has seen it and play it once more (it runs on <html>, as on load) */
export function replayArrival(key: string, speed: number, reduced: boolean) {
  try { sessionStorage.removeItem(key); } catch { /* storage blocked */ }
  if (reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const h = document.documentElement; h.classList.remove('arrive'); void h.offsetWidth; h.classList.add('arrive');
  try { sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  window.setTimeout(() => h.classList.remove('arrive'), 1400 / speed);
}
export function togglePanel() {
  const open = !document.documentElement.classList.toggle('lab-closed');
  document.querySelector('.lab-toggle')?.setAttribute('aria-expanded', String(open));
}

export function LabPanel({ tab = 'Lab', title, cfg, bounds, choices, groups, set, moments, momentIdx, out, optionLabel, buttons, meter, msg, rail, railLabel, apply, children, closed = false }: {
  /* closed: start closed on every screen (the sample day, where the page is the point and the tab opens the moments) */
  closed?: boolean; tab?: string; title: string; cfg: Cfg; bounds: Record<string, [number, number, number]>; choices: Record<string, string[]>; groups: Group[];
  set: (k: string, v: unknown) => void; moments: [string, string, number][]; momentIdx: number;
  out: (k: string) => string; optionLabel?: (k: string, v: string) => string;
  buttons: [string, () => void, boolean?][]; meter: { text: string; bad: boolean }; msg: string; rail: Cfg[]; railLabel: (s: Cfg) => string; apply: (s: Cfg) => void; children?: ReactNode;
}) {
  /* on a phone the panel would cover the page: it starts closed there, and the toggle opens it */
  /* a panel that starts closed is held hidden until the page's class says so, so it never shows for a frame */
  const aside = useRef<HTMLElement>(null);
  useEffect(() => {
    if (closed || window.matchMedia('(max-width: 640px)').matches) {
      document.documentElement.classList.add('lab-closed');
      document.querySelector('.lab-toggle')?.setAttribute('aria-expanded', 'false');
    }
    aside.current?.removeAttribute('hidden');
  }, [closed]);
  return (
    <>
      <aside ref={aside} className="lab" aria-label={title} hidden={closed}>
        <div className="lab-h"><h2>{title}</h2>{cfg.seed === undefined || cfg.seed === '–' ? null : <span className="lab-seed">Seed {String(cfg.seed)}</span>}</div>
        <div className="lab-moments">{moments.map((m, i) => <button key={m[0]} type="button" aria-pressed={i === momentIdx} onClick={() => set('t', m[2])}>{m[1]}</button>)}</div>
        {groups.map((g) => (
          <fieldset key={g.name}><legend>{g.name}</legend>
            {g.knobs.map((n) => {
              if (n.kind === 'range') { const b = bounds[n.k]; return <label key={n.k}><span>{n.label}</span><input type="range" min={b[0]} max={b[1]} step={b[2]} value={Number(cfg[n.k])} onChange={(e) => set(n.k, +e.target.value)} /><output>{out(n.k)}</output></label>; }
              if (n.kind === 'select') return <label key={n.k} className="sel"><span>{n.label}</span><select value={String(cfg[n.k])} onChange={(e) => set(n.k, e.target.value)}>{choices[n.k].map((v) => <option key={v} value={v}>{optionLabel ? optionLabel(n.k, v) : v}</option>)}</select></label>;
              return <label key={n.k} className="tog"><input type="checkbox" checked={!!cfg[n.k]} onChange={(e) => set(n.k, e.target.checked ? 1 : 0)} /><span>{n.label}</span></label>;
            })}
          </fieldset>
        ))}
        {children}
        <div className="lab-btns">{buttons.map(([t, fn, pri]) => <button key={t} type="button" className={pri ? 'pri' : undefined} onClick={fn}>{t}</button>)}</div>
        <p className={'lab-meter' + (meter.bad ? ' bad' : '')}>{meter.text}</p>
        <p className="lab-msg">{msg}</p>
        <div className="lab-rail">{rail.map((s, i) => <button key={i} type="button" title="Apply this saved config" onClick={() => apply(s)}>{railLabel(s)}</button>)}</div>
      </aside>
      <button type="button" className="lab-toggle" aria-expanded={!closed} onClick={togglePanel}>{tab}</button>
    </>
  );
}

/* the layout picker: a segmented control pinned to the bottom of the page; its highlight slides to the chosen one */
export function LayoutPicker({ modes, mode, setMode, replay }: { modes: [string, string][]; mode: string; setMode: (m: string) => void; replay: () => void }) {
  const ref = useRef<HTMLElement>(null), hl = useRef<HTMLSpanElement>(null), [ready, setReady] = useState(false);
  const sync = useCallback(() => {
    const b = ref.current?.querySelector<HTMLElement>('[data-active]'); if (!b || !hl.current) return;
    hl.current.style.width = b.offsetWidth + 'px'; hl.current.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  }, []);
  useLayoutEffect(() => { sync(); }, [mode, sync]);
  useEffect(() => {
    window.addEventListener('resize', sync);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => { window.removeEventListener('resize', sync); cancelAnimationFrame(id); };
  }, [sync]);
  return (
    <nav ref={ref} className="proto-picker" aria-label="Layouts" data-ready={ready ? '' : undefined}>
      <span ref={hl} className="proto-picker-highlight" aria-hidden="true" />
      {modes.map(([m, name]) => <button key={m} type="button" className="proto-picker-item" data-m={m} data-active={m === mode ? '' : undefined} aria-current={m === mode ? 'true' : undefined} onClick={() => setMode(m)}>{name}</button>)}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay arrival (R)" onClick={replay}>↻</button>
    </nav>
  );
}
