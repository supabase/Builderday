'use client';
import { useCallback, useEffect, useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { OurWheel } from '@/components/preview/facts';
import { clampFold, type FoldCfg } from '@/components/preview/fold/config';
import { FoldPage } from '@/components/preview/fold/fold';
import type { HeroCfg } from '@/components/wheel/hero-config';
import { LAUNCH_BOUNDS, LAUNCH_CHOICES, clampLaunch, type LaunchCfg } from '@/components/wheel/launch-config';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';

/* /lab/launch: the preview's first screen, where pressing the ticket's Register plays the launch (the ticket folds into a
   paper rocket and flies to its city) without opening Luma. Turn the wheel to launch from another city; the knobs
   change the next press; Launch plays it again; Save writes saved/launch.config.json, which the preview plays.
   Keys: \ the panel, S save, L launch. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'on', kind: 'select', label: 'Register plays it' }, { k: 'open', kind: 'select', label: 'Luma opens' }, { k: 'trail', kind: 'select', label: 'Behind the ship' }, { k: 'back', kind: 'select', label: 'The ticket comes back' }] },
  { name: 'Press and fold', knobs: [{ k: 'pressMs', kind: 'range', label: 'Press, ms' }, { k: 'press', kind: 'range', label: 'Press gives to (scale)' }, { k: 'foldMs', kind: 'range', label: 'Fold, ms' }, { k: 'shipW', kind: 'range', label: 'Ship length, px' }, { k: 'shipH', kind: 'range', label: 'Ship height (of its length)' }] },
  { name: 'Flight', knobs: [{ k: 'flightMs', kind: 'range', label: 'Flight, ms' }, { k: 'arc', kind: 'range', label: 'Arc (of the distance)' }, { k: 'shrink', kind: 'range', label: 'Size at the globe' }, { k: 'turn', kind: 'range', label: 'On course by (share)' }, { k: 'sway', kind: 'range', label: 'Sway, deg' }] },
  { name: 'Trail and landing', knobs: [{ k: 'trailN', kind: 'range', label: 'Trail marks per 100 px' }, { k: 'trailMs', kind: 'range', label: 'Trail mark stays, ms' }, { k: 'landMs', kind: 'range', label: 'Landing, ms' }, { k: 'ring', kind: 'range', label: 'Rings reach (× mark)' }] },
  { name: 'Back', knobs: [{ k: 'backDelay', kind: 'range', label: 'Waits after landing, ms' }, { k: 'backMs', kind: 'range', label: 'Comes back, ms' }] },
];
const LABELS: Record<string, string> = {
  on: 'Yes', off: 'No, the link only', land: 'As it lands', press: 'At the press (rocket behind)',
  chars: 'The globe’s characters', dots: 'A dotted line', none: 'Nothing', print: 'Printed from the left', fade: 'Faded in',
};

export function LaunchLab({ saved, hero, wheel, launch, ours, q, nowMs }: { saved: Partial<FoldCfg>; hero: HeroCfg; wheel: WheelCfg; launch: LaunchCfg; ours: OurWheel; q: Record<string, string | undefined>; nowMs: number }) {
  const [cfg] = useState<FoldCfg>(() => ({ ...clampFold(saved), arrival: 'none', page: 'hero' }));
  const [l, setL] = useState<LaunchCfg>(launch);
  const set = useCallback((k: string, v: unknown) => setL((c) => clampLaunch({ ...c, [k]: v })), []);
  const noGl = q.gl === '0';
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  const { save, msg, rail } = useLabSave('launch', 'lab-launch-saved');
  const doSave = useCallback(() => save({ ...l }), [l, save]);
  /* press the ticket on screen, as a visitor would */
  const fire = useCallback(() => {
    const a = Array.from(document.querySelectorAll<HTMLAnchorElement>('.wh-ticket a.wh-reg')).find((x) => x.getClientRects().length && x.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false);
    a?.click();
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); else if (e.key === 'l' || e.key === 'L') fire(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, fire]);
  const out = (k: string) => String(l[k as keyof LaunchCfg]);
  const total = l.pressMs + l.foldMs + l.flightMs;
  const panel = (
    <LabPanel title="Launch: Register folds the ticket into a rocket" cfg={l as unknown as Record<string, unknown>} bounds={LAUNCH_BOUNDS} choices={LAUNCH_CHOICES as Record<string, string[]>} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
      out={out} optionLabel={(_k, v) => LABELS[v] || v} meter={{ text: `Press to landing: ${total} ms${l.open === 'land' ? ' (Luma opens then)' : ''}. Press Register or L; Luma does not open here.`, bad: l.open === 'land' && total > 1000 }}
      msg={msg} rail={rail} railLabel={(s) => `${s.trail}, ${s.foldMs}/${s.flightMs} ms, arc ${s.arc}`} apply={(s) => setL(clampLaunch(s as Partial<LaunchCfg>))}
      buttons={[['Save', doSave, true], ['Launch', fire]]} />
  );
  return <FoldPage cfg={cfg} wheel={wheel} ours={ours} forced={forced} noGl={noGl} nowMs={nowMs} hero={hero} launch={l} dry>{panel}</FoldPage>;
}
