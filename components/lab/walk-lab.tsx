'use client';
import { useCallback, useState } from 'react';
import { Walk, type WalkCity } from '@/components/preview/walk/walk';
import { WALK_BOUNDS, WALK_MODES, WALK_SIDES, clampWalk, type WalkCfg } from '@/components/preview/walk/config';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './walk-lab.css';

/* The walk lab: How it works as a walk through one city's 90 minutes, at full size, with the page scrolling as the
   preview's does. Click the stage for a new sample race (a new seed); the knobs change it live; Save writes
   saved/walk.config.json, which the preview's walkthrough reads. */

const GROUPS: Group[] = [
  { name: 'Mode', knobs: [{ k: 'mode', kind: 'select', label: 'How the stage draws the race' }] },
  { name: 'The race', knobs: [{ k: 'projects', kind: 'range', label: 'Projects in the city' }, { k: 'youArrive', kind: 'range', label: 'Yours goes in at minute' }, { k: 'youPlace', kind: 'range', label: 'Yours ends at place' }, { k: 'judges', kind: 'range', label: 'Judges' }] },
  { name: 'Scroll', knobs: [{ k: 'stepH', kind: 'range', label: 'Step height × window' }, { k: 'scrubTo', kind: 'range', label: 'Minute ends at, × step' }, { k: 'line', kind: 'range', label: 'Reading line × window (wide)' }] },
  { name: 'Motion', knobs: [{ k: 'beatMs', kind: 'range', label: 'A step’s change, ms' }, { k: 'revealMs', kind: 'range', label: 'The reveal at 60, ms' }] },
  { name: 'Layout', knobs: [{ k: 'side', kind: 'select', label: 'Stage side' }, { k: 'stageShare', kind: 'range', label: 'Stage width, %' }, { k: 'rows', kind: 'range', label: 'Board rows' }, { k: 'rowsPhone', kind: 'range', label: 'Board rows, phone' }, { k: 'chartH', kind: 'range', label: 'Chart height, px' }, { k: 'chartHPhone', kind: 'range', label: 'Chart height, phone, px' }] },
];
const LABELS: Record<string, string> = {
  race: 'Race: a line per project over the board', tower: 'Tower: the board leads, distance to the cut', ledger: 'Ledger: a ::| bar per project',
  left: 'Stage on the left', right: 'Stage on the right',
};
/* a sample city: Nouakchott builds from 11:30 */
const CITY: WalkCity = { id: 'nouakchott', name: 'Nouakchott', opens: Date.UTC(2026, 11, 10, 11, 30), offset: 0 };

export function WalkLab({ saved }: { saved: WalkCfg }) {
  const [cfg, setCfg] = useState<WalkCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampWalk({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('walk', 'lab-walk-saved');
  const reseed = () => setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) }));
  const out = (k: string) => { const v = Number(cfg[k as keyof WalkCfg]); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  return (
    <>
      <main className="wl">
        <p className="wl-p">How it works, walked · {LABELS[cfg.mode]} · seed {cfg.seed}. Scroll through it. Click the stage for a new race; knobs change it live; Save keeps it.</p>
        <Walk cfg={cfg} city={CITY} onStage={reseed} />
        <p className="wl-end">The end of the section.</p>
      </main>
      <LabPanel title="Walk lab" cfg={cfg as unknown as Record<string, unknown>} bounds={WALK_BOUNDS} choices={{ mode: [...WALK_MODES], side: [...WALK_SIDES] }} optionLabel={(_k, v) => LABELS[v] || v}
        groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...cfg }), true], ['New race', reseed]]} meter={{ text: 'Seed ' + cfg.seed + ' · ' + cfg.mode, bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.mode) + ' · ' + String(s.seed)} apply={(s) => setCfg(clampWalk(s as Partial<WalkCfg>))} />
    </>
  );
}
