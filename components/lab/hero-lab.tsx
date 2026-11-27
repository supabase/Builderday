'use client';
import { useCallback, useEffect, useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { OurWheel } from '@/components/preview/facts';
import { clampFold, type FoldCfg } from '@/components/preview/fold/config';
import { FoldPage } from '@/components/preview/fold/fold';
import { HERO_BOUNDS, HERO_CHOICES, clampHero, type HeroCfg } from '@/components/wheel/hero-config';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';

/* /lab/hero: the preview's first screen with every mode and knob of its left side (the words, then the city's row on
   the wheel's line). Turn the wheel to see the row change; New seed prints new ticket numbers; Save writes
   saved/hero.config.json, which the preview reads. Keys: \ the panel, S save. */

const GROUPS: Group[] = [
  { name: 'Mode', knobs: [{ k: 'mode', kind: 'select', label: 'The row' }, { k: 'hand', kind: 'select', label: 'The name gets into the box' }, { k: 'width', kind: 'select', label: 'The box’s width' }, { k: 'reach', kind: 'select', label: 'The row meets the wheel' }, { k: 'state', kind: 'select', label: 'The state (row)' }, { k: 'zone', kind: 'select', label: 'The time' }] },
  { name: 'Words', knobs: [{ k: 'words', kind: 'select', label: 'Groups' }, { k: 'screen', kind: 'select', label: 'Screen lines on' }, { k: 'sub', kind: 'select', label: 'Line under the headline' }, { k: 'weekday', kind: 'toggle', label: 'Weekday in the date' }, { k: 'rsvp', kind: 'toggle', label: 'RSVP line' }, { k: 'titleK', kind: 'range', label: 'Headline, × name size' }, { k: 'bodyK', kind: 'range', label: 'Body, × name size' }, { k: 'gapK', kind: 'range', label: 'Gap before the date, × name size' }, { k: 'liftK', kind: 'range', label: 'Words to the row, × name size' }] },
  { name: 'Row', knobs: [{ k: 'dock', kind: 'select', label: 'No room beside the wheel (phone)' }, { k: 'stubPhone', kind: 'range', label: 'Phone: stub width, px' }, { k: 'namePhone', kind: 'range', label: 'Phone: name size, px' }, { k: 'cellK', kind: 'range', label: 'Row height, × name size' }, { k: 'min', kind: 'range', label: 'Smallest name before docking, px' }, { k: 'grow', kind: 'range', label: 'Grow past the wheel’s name size, ×' }, { k: 'tall', kind: 'range', label: 'Largest name, × window height' }, { k: 'widthMs', kind: 'range', label: 'Width ease, ms (hug)' }] },
  { name: 'Ticket', knobs: [{ k: 'stubK', kind: 'range', label: 'Stub width, × name size' }, { k: 'perf', kind: 'range', label: 'Perforation dot gap, px' }, { k: 'notch', kind: 'range', label: 'Notch radius, px' }, { k: 'seed', kind: 'range', label: 'Seed (ticket numbers)' }] },
];
const REACH: Record<string, string> = { row: 'Names come in to the row', wheel: 'Names stay; the row reaches them' };
const LABELS: Record<string, string> = {
  row: 'Row: three boxes', ticket: 'Ticket: stub and body', spoke: 'Spoke: the box alone, facts over it',
  fade: 'Fade in at rest', roll: 'Roll the turn’s way', none: 'Just change',
  line: 'On the wheel’s line, taking its name', foot: 'Docked at the foot of the screen', hug: 'Hug the name', fixed: 'Fixed: the longest name', block: 'Filled cell', ink: 'Ink on the ground',
  wheel: 'The wheel only', words: 'The wheel and the headline', all: 'Everything (the ticket too)', utc: 'With the zone (UTC−5)', local: '“local”', stack: 'Two groups', tight: 'One group, date under',
  off: 'None', facts: '14 cities · one day · in person', reach: 'In person, in 14 cities, local time',
};

export function HeroLab({ saved, hero, wheel, ours, q, nowMs }: { saved: Partial<FoldCfg>; hero: HeroCfg; wheel: WheelCfg; ours: OurWheel; q: Record<string, string | undefined>; nowMs: number }) {
  const [cfg] = useState<FoldCfg>(() => ({ ...clampFold(saved), dir: 'line', arrival: 'none' }));
  const [h, setH] = useState<HeroCfg>(hero);
  const set = useCallback((k: string, v: unknown) => setH((c) => clampHero({ ...c, [k]: v })), []);
  const bare = q.bare !== undefined, noGl = q.gl === '0';
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  const { save, msg, rail } = useLabSave('hero', 'lab-hero-saved');
  const doSave = useCallback(() => save({ ...h }), [h, save]);
  const reseed = useCallback(() => setH((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) })), []);
  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);
  useEffect(() => {
    if (bare) return;
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, bare]);
  const out = (k: string) => String(h[k as keyof HeroCfg]);
  const panel = bare ? null : (
    <LabPanel title="Hero: the first screen’s left side" cfg={h as unknown as Record<string, unknown>} bounds={HERO_BOUNDS} choices={HERO_CHOICES as Record<string, string[]>} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
      out={out} optionLabel={(k, v) => (k === 'reach' ? REACH[v] : LABELS[v]) || v} meter={{ text: `${LABELS[h.mode]} · seed ${h.seed}. Turn the wheel to see the row change.`, bad: false }}
      msg={msg} rail={rail} railLabel={(s) => `${s.mode}, ${s.hand}, ${s.width}, ${s.seed}`} apply={(s) => setH(clampHero(s as Partial<HeroCfg>))}
      buttons={[['Save', doSave, true], ['New seed', reseed]]} />
  );
  return <FoldPage cfg={cfg} wheel={wheel} ours={ours} forced={forced} noGl={noGl} nowMs={nowMs} hero={h}>{panel}</FoldPage>;
}
