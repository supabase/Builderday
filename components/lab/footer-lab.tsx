'use client';
import { useCallback, useEffect, useState } from 'react';
import { CITIES, EVENT, nowOf, sched } from '@/lib/day-data';
import { moments as homeMoments, DEF as HOME_DEF, type HomeCfg } from '@/lib/home';
import { dayOf } from '@/components/day/day';
import { DayHome, type DayHomeCfg } from '@/components/day/day-home';
import { DayCity, type DayCityCfg } from '@/components/day/day-city';
import { FOOT_BOUNDS, FOOT_CHOICES, FOOT_LABELS, clampFoot, type FootCfg } from '@/components/day/footer-config';
import { DATE } from '@/components/day/home-parts';
import { HackMark } from '@/components/wheel/mark';
import type { PartsCfg } from '@/components/board/config';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './footer-lab.css';

/* The footer lab: the real day home or a city page, at a moment of the day, scrolled to its end, with the footer's
   directions, switches and knobs in the panel. Save writes saved/footer.config.json, which both pages read. The
   preview sheet's end board (idea 11) is a view of its own here and goes nowhere else: the sheet stays as it is. */

type View = { page: 'home' | 'city' | 'sheet'; city: string; moment: string };
const MOMENTS = ['announced', 'first', 'mid', 'closed', 'picked', 'archived'];
const SHORT: Record<string, string> = { before: 'announced', during: 'mid', after: 'picked' };
const GROUPS: Group[] = [
  { name: 'View', knobs: [{ k: 'page', kind: 'select', label: 'Page' }, { k: 'city', kind: 'select', label: 'City' }, { k: 'moment', kind: 'select', label: 'Moment' }] },
  { name: 'Direction', knobs: [{ k: 'dir', kind: 'select', label: 'Direction' }, { k: 'phone', kind: 'select', label: 'On a phone' }, { k: 'dot', kind: 'toggle', label: 'White dot (Screen off)' }, { k: 'last', kind: 'toggle', label: 'The last line' }, { k: 'clocks', kind: 'toggle', label: 'Local time in each city' }, { k: 'tail', kind: 'toggle', label: 'Tail leader on a city page' }, { k: 'spin', kind: 'toggle', label: 'Turn the globe by hand' }, { k: 'credit', kind: 'toggle', label: 'Credit line' }] },
  { name: 'The horizon', knobs: [{ k: 'size', kind: 'range', label: 'Globe, px' }, { k: 'rise', kind: 'range', label: 'How much rises' }, { k: 'gap', kind: 'range', label: 'Names from the globe, px' }, { k: 'spread', kind: 'range', label: 'Ring opens (least gap = ÷20), °' }, { k: 'tilt', kind: 'range', label: 'Names lean with the arc' }, { k: 'nameSize', kind: 'range', label: 'Name size, px' }, { k: 'cellH', kind: 'range', label: 'Cell height, px' }] },
];
const LABELS: Record<string, string> = { ...FOOT_LABELS, home: 'The day home', city: 'A city page', sheet: 'The preview sheet (idea 11)', index: 'The index', announced: 'Before the day', first: 'The first city opens', mid: 'During the day', closed: 'Every city closed', picked: 'After the pick', archived: 'A week later', ...Object.fromEntries(CITIES.map((c) => [c.id, c.name])) };

export function FooterLab({ saved, home, city, parts, q, nowMs }: {
  saved: FootCfg; home: Partial<DayHomeCfg>; city: Partial<DayCityCfg>; parts: Partial<PartsCfg>; q: Record<string, string | undefined>; nowMs: number;
}) {
  const [cfg, setCfg] = useState<FootCfg>(() => clampFoot({ ...saved, ...(q.dir && FOOT_CHOICES.dir.includes(q.dir) ? { dir: q.dir as FootCfg['dir'] } : {}) }));
  const [view, setView] = useState<View>(() => {
    const m = q.moment ? SHORT[q.moment] ?? q.moment : 'mid';
    return { page: q.page === 'city' || q.page === 'sheet' ? q.page : 'home', city: CITIES.some((c) => c.id === q.city) ? q.city! : 'london', moment: MOMENTS.includes(m) ? m : 'mid' };
  });
  const set = useCallback((k: string, v: unknown) => {
    if (k === 'page' || k === 'city' || k === 'moment') setView((w) => ({ ...w, [k]: String(v) }));
    else if (k === 't') setView((w) => ({ ...w, moment: MOMENTS[Number(v)] }));
    else setCfg((c) => clampFoot({ ...c, [k]: v }));
  }, []);
  const { save, msg, rail } = useLabSave('footer', 'lab-footer-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const bare = q.bare !== undefined;
  useEffect(() => { if (!bare) return; const h = document.documentElement; h.classList.add('lab-closed', 'no-lab'); return () => h.classList.remove('lab-closed', 'no-lab'); }, [bare]);
  /* the lab opens at the end of the page, where the footer is */
  const key = view.page + view.city + view.moment;
  useEffect(() => {
    if (q.top === '1') return;
    const id = window.setTimeout(() => document.querySelector('footer.ft, .fl-sheet')?.scrollIntoView({ block: 'end' }), 400);
    return () => window.clearTimeout(id);
  }, [key, q.top]);

  /* both pages get the home's moment as a minute, so the home and a city page are at the same moment of the day */
  const day = dayOf(0), hm = homeMoments({ ...HOME_DEF, ...day } as HomeCfg).find((m) => m[0] === view.moment);
  const pq = { m: hm ? nowOf(hm[2], sched(day)).toFixed(2) : undefined, still: '1' };
  const out = (k: string) => { const v = cfg[k as keyof FootCfg]; return k === 'rise' || k === 'tilt' ? Number(v).toFixed(2) : String(v); };
  const choices = { ...FOOT_CHOICES, page: ['home', 'city', 'sheet'], city: CITIES.map((c) => c.id), moment: MOMENTS };
  const ms: [string, string, number][] = [['before', 'Before', 0], ['during', 'During', 2], ['after', 'After', 4]];
  const meter = useChecks(key + JSON.stringify(cfg));
  return (
    <>
      {view.page === 'sheet' ? <SheetEnd /> : view.page === 'city'
        ? <DayCity key={key} saved={city} parts={parts} q={pq} page={{ nowMs, city: view.city }} foot={cfg} />
        : <DayHome key={key} saved={home} parts={parts} q={pq} page={{ nowMs }} foot={cfg} />}
      {bare ? null : (
        <LabPanel title="Footer lab" cfg={{ ...cfg, ...view }} bounds={FOOT_BOUNDS} choices={choices} groups={GROUPS} set={set} moments={ms} momentIdx={ms.findIndex((m) => MOMENTS[m[2]] === view.moment)} out={out}
          optionLabel={(_k, v) => LABELS[v] || v} meter={meter} msg={msg} rail={rail}
          railLabel={(s) => (LABELS[String(s.dir)] || String(s.dir)) + (s.phone === 'same' ? ', same on a phone' : '')} apply={(s) => setCfg(clampFoot(s as Partial<FootCfg>))} buttons={[['Save', doSave, true]]} />
      )}
    </>
  );
}

/* the checks, measured on the page as it is drawn and again on a resize: one footer landmark, the footer's height
   against this window's height on a phone (a phone browser's own bars leave less), the shortest link as laid out
   before any turn (offsetHeight; the floor is 44px), and how many things in it are green, by colour, fill, stroke or
   border (at most one: the lit city) */
function useChecks(key: string): { text: string; bad: boolean } {
  const [m, setM] = useState({ text: 'Checks: measuring…', bad: false });
  useEffect(() => {
    let id = 0;
    const run = () => {
      const fs = document.querySelectorAll('footer.ft, footer.fl-end'), f = fs[0] as HTMLElement | undefined;
      if (!f) { setM({ text: 'Checks: no footer on this view.', bad: true }); return; }
      const phone = window.innerWidth <= 640, tall = f.getBoundingClientRect().height, fits = !phone || tall <= window.innerHeight, vh = window.innerHeight;
      const links = Array.from(f.querySelectorAll<HTMLElement>('a, button')).filter((a) => a.offsetParent !== null);
      const low = links.length ? Math.min(...links.map((a) => a.offsetHeight)) : 0;
      const isGreen = (c: string) => { const v = c.match(/[\d.]+/g)?.map(Number) ?? []; return v.length >= 3 && v[1] > v[0] + 40 && v[1] > v[2] + 20 && (v[3] ?? 1) > 0.2; };
      const greens = Array.from(f.querySelectorAll<HTMLElement>('*')).filter((e) => { const s = getComputedStyle(e); return isGreen(s.color) && e.textContent?.trim() || isGreen(s.backgroundColor) || isGreen(s.fill) || isGreen(s.stroke) || (parseFloat(s.borderTopWidth) > 0 && isGreen(s.borderTopColor)); });
      const own = greens.filter((e) => !greens.some((o) => o !== e && o.contains(e))).length;
      const bad = fs.length !== 1 || !fits || (low > 0 && low < 44) || own > 1;
      setM({ bad, text: 'Checks: ' + fs.length + ' footer landmark' + (fs.length === 1 ? '' : 's') + '; footer ' + Math.round(tall) + 'px' + (phone ? (fits ? ', fits ' + vh + 'px' : ', taller than ' + vh + 'px') : '') + '; shortest link ' + low + 'px (floor 44); green ' + own + '×.' });
    };
    const later = () => { window.clearTimeout(id); id = window.setTimeout(run, 700); };
    later(); window.addEventListener('resize', later);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', later); };
  }, [key]);
  return m;
}

/* idea 11: a small end board at the bottom of the preview's sheet, shown on its own at the sheet's width */
function SheetEnd() {
  return (
    <div className="fl-wrap">
      <div className="fl-sheet">
        <p className="fl-tail">…the last of the questions sits here, then the sheet ends on this board.</p>
        <footer className="fl-end">
          <HackMark id="fl-mark" label="" className="fl-mark" />
          <p className="fl-sig">{EVENT.name} · {DATE}</p>
          <nav className="fl-cells" aria-label="Supabase">
            <a href="https://supabase.com">supabase.com</a><a href="https://supabase.com/docs">Docs</a><a href="https://supabase.com/privacy">Privacy</a><a href="https://supabase.com/terms">Terms</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
