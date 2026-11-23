'use client';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import { mountDotGlobes } from '@/components/wheel/dot-globes';
import { Ending, type EndCity } from '@/components/day/ending';
import { END_BOUNDS, END_CHOICES, END_DEF, END_LABELS, END_MODES, END_PLAIN, clampEnd, type EndCfg } from '@/components/day/ending-config';
import { DayFooter, lastLine } from '@/components/day/footer';
import { clampFoot, type FootCfg } from '@/components/day/footer-config';
import { dayOf } from '@/components/day/day';
import { homeAt } from '@/components/board/day-model';
import { clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { realMinute } from '@/lib/clock';
import { EPOCH } from '@/lib/day-data';
import { lumaHref } from '@/lib/luma';
import type { OurWheel } from '@/components/preview/facts';
import footSaved from '@/saved/footer.config.json';
import partsSaved from '@/saved/parts.config.json';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import '@/components/board/board.css';
import './ending-lab.css';

/* The ending lab: a generator for how the preview page ends. The ending is a function of its saved config (every mode,
   every knob and the seed), the city list and the page's city. A press on the map away from a city picks a new seed
   and prints it again; Save writes saved/ending.config.json, the file the preview page reads. `board` is today's
   ending, for comparing. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'end', kind: 'select', label: 'The ending' }, { k: 'open', kind: 'select', label: 'How it opens' }, { k: 'mark', kind: 'select', label: 'The mark' }, { k: 'signoff', kind: 'select', label: 'Sign-off' }, { k: 'light', kind: 'select', label: 'Light' }] },
  { name: 'The map', knobs: [{ k: 'rows', kind: 'range', label: 'Rows' }, { k: 'north', kind: 'range', label: 'Cut at north' }, { k: 'south', kind: 'range', label: 'Cut at south' }, { k: 'tag', kind: 'range', label: 'Codes' }, { k: 'rate', kind: 'range', label: 'Print (ms)' }] },
  { name: 'The cells', knobs: [{ k: 'cell', kind: 'range', label: 'Cell height' }, { k: 'reg', kind: 'range', label: 'Register cell' }, { k: 'imprint', kind: 'toggle', label: 'Imprint line' }] },
];
const LISTS: [string, string][] = [['6', 'Six cities'], ['10', 'Ten cities'], ['all', 'The event’s cities'], ['16', 'Sixteen cities']];

function cityLists(ours: OurWheel): Record<string, EndCity[]> {
  const opensAt = (offset: number) => EPOCH + (ours.startHour * 60 - offset) * 60000;
  const one = (id: string, name: string, code: string, lat: number, lon: number, opens: number, zone?: string): EndCity => ({ id, name, code, lat, lon, opens, zone, href: lumaHref(id), action: 'Register for ' + name });
  const all = ours.cities.map((c) => one(c.id, c.name, c.code ?? c.name.slice(0, 3).toUpperCase(), c.lat, c.lon, c.opens));
  /* two test cities that are not the event's, for the longest list */
  const sydney = one('sydney', 'Sydney', 'SYD', -33.87, 151.21, opensAt(660), 'Australia/Sydney'), lagos = one('lagos', 'Lagos', 'LOS', 6.52, 3.38, opensAt(60), 'Africa/Lagos');
  const some = (n: number) => (all.length <= n ? all : Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]));
  const at = all.findIndex((c) => c.lon < lagos.lon);
  return { '6': some(6), '10': some(10), all, '16': [sydney, ...all.slice(0, at < 0 ? all.length : at), lagos, ...all.slice(at < 0 ? all.length : at)] };
}

export function EndingLab({ saved, wheel, ours, nowMs }: { saved: EndCfg; wheel: WheelCfg; ours: OurWheel; nowMs: number }) {
  const [cfg, setCfg] = useState<EndCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampEnd({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('ending', 'lab-ending-saved');
  const [play, setPlay] = useState(0);
  const lists = useMemo(() => cityLists(ours), [ours]);
  const [list, setList] = useState('all'), [city, setCity] = useState(ours.nearest), [placed, setPlaced] = useState(false);
  const base = lists[list], ci = Math.min(city, base.length - 1);
  /* signed in with a place: the city's Register becomes the person's own (it opens nothing here) */
  const cities = useMemo(() => base.map((c, i) => (placed && i === ci ? { ...c, action: 'Your place in ' + c.name, press: () => {} } : c)), [base, placed, ci]);
  useEffect(() => mountDotGlobes(document, wheel), [wheel]);

  const P = useMemo(() => clampParts(partsSaved as Partial<PartsCfg>), []);
  const day = useMemo(() => dayOf(0), []);
  const minute = realMinute(nowMs);
  const W = useMemo(() => homeAt(day, minute), [day, minute]);
  const board = <DayFooter W={W} day={day} href={(id) => '/city/' + id} sound={P.sound === 'steps'} city={base[ci].id} cfg={clampFoot(footSaved as Partial<FootCfg>)} minute={minute}
    sections={{ how: '#how', prizes: '#prizes' }} style={partsVars(P) as CSSProperties} face={P.face} noCities />;

  const out = (k: string) => {
    const v = cfg[k as keyof EndCfg];
    if (k === 'north') return v + '°N'; if (k === 'south') return Math.abs(Number(v)) + '°S';
    if (k === 'cell') return v + ' px'; if (k === 'rate') return v + ' ms'; if (k === 'reg' || k === 'tag') return '×' + v;
    return String(v);
  };
  const label = (s: Record<string, unknown>) => `${s.end} · ${s.open} · seed ${s.seed}`;
  return (
    <main className="el-lab" aria-label="Ending lab">
      <p className="el-title">The ending: {END_LABELS['end:' + cfg.end]}. Press the map away from a city for a new seed.</p>
      <Ending cfg={cfg} wheel={wheel} cities={cities} start={ci} last={lastLine(W)} date={ours.date} sound={P.sound === 'steps'}
        links={{ how: '#how', prizes: '#prizes', questions: '#questions' }} style={partsVars(P) as CSSProperties} face={P.face} board={board} markMode={wheel.mark}
        play={play} onMapPress={() => { setCfg((c) => clampEnd({ ...c, seed: 1 + Math.floor(Math.random() * 9998) })); setPlay((n) => n + 1); }} />
      <LabPanel title="Ending lab" cfg={cfg} bounds={END_BOUNDS} choices={END_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={out} optionLabel={(k, v) => END_LABELS[k + ':' + v] ?? v} meter={{ text: `${cities.length} cities; page city ${cities[ci].name}`, bad: false }} msg={msg} rail={rail} railLabel={label} apply={(s) => setCfg(clampEnd(s))}
        buttons={[['Save', () => save({ ...cfg }), true], ['Play again', () => setPlay((n) => n + 1)], ['Plain', () => setCfg((c) => clampEnd({ ...c, ...END_PLAIN }))], ['Plan’s picks', () => setCfg((c) => clampEnd({ ...c, ...Object.fromEntries(END_MODES.map((k) => [k, END_DEF[k]])) }))]]}>
        <fieldset><legend>Look at</legend>
          <label className="sel"><span>Cities</span><select value={list} onChange={(e) => { setList(e.target.value); setCity(0); }}>{LISTS.map(([v, n]) => <option key={v} value={v}>{v === 'all' ? `${n} (${lists.all.length})` : n}</option>)}</select></label>
          <div className="el-step">
            <button type="button" aria-label="Previous city" onClick={() => setCity((ci - 1 + base.length) % base.length)}>‹</button>
            <span>Page city: {base[ci].name}</span>
            <button type="button" aria-label="Next city" onClick={() => setCity((ci + 1) % base.length)}>›</button>
          </div>
          <label className="tog"><input type="checkbox" checked={placed} onChange={(e) => setPlaced(e.target.checked)} /><span>Signed in with a place</span></label>
        </fieldset>
      </LabPanel>
    </main>
  );
}
