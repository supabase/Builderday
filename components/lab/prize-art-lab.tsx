'use client';
import { useCallback, useState } from 'react';
import { OBJECTS, RAMPS, type Obj } from '@/components/prize/ascii';
import { PRIZE_ART_BOUNDS, clampArt, type PrizeArtCfg } from '@/components/prize/config';
import { PrizeArt } from '@/components/prize/prize-art';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './prize-art-lab.css';

/* The prize art lab: one prize drawn large, the other five under it in the same look. Drag a drawing to turn it;
   the knobs change the look live; Save writes saved/prize-art.config.json, which every prize drawing reads. Press a
   small one to draw it large. */

const GROUPS: Group[] = [
  { name: 'Prize', knobs: [{ k: 'show', kind: 'select', label: 'Drawn large' }] },
  { name: 'Characters', knobs: [{ k: 'ramp', kind: 'select', label: 'Ramp, dark to light' }, { k: 'edges', kind: 'toggle', label: 'Edges by shape (| _ / \\)' }, { k: 'rim', kind: 'toggle', label: 'A dot round the outline' }, { k: 'cols', kind: 'range', label: 'Columns' }, { k: 'rows', kind: 'range', label: 'Rows' }, { k: 'aspect', kind: 'range', label: 'Cell height ÷ width' }] },
  { name: 'Camera', knobs: [{ k: 'pitch', kind: 'range', label: 'Looks down, radians' }, { k: 'span', kind: 'range', label: 'View width' }, { k: 'yaw', kind: 'range', label: 'Rests turned, radians' }] },
  { name: 'Light', knobs: [{ k: 'lightYaw', kind: 'range', label: 'Light from, radians' }, { k: 'ambient', kind: 'range', label: 'Dark side keeps' }, { k: 'gamma', kind: 'range', label: 'Falloff' }] },
  { name: 'Floor', knobs: [{ k: 'floor', kind: 'range', label: 'Dot spacing (0 = none)' }, { k: 'shadow', kind: 'toggle', label: 'Shadow' }] },
  { name: 'Drag', knobs: [{ k: 'drag', kind: 'toggle', label: 'Drag to turn' }, { k: 'coast', kind: 'toggle', label: 'Coasts on release' }, { k: 'dragTurn', kind: 'range', label: 'Turn across the width, radians' }] },
];
const NAME: Record<Obj, string> = { pro: 'MacBook Pro', mini: 'Mac mini', neo: 'MacBook Neo', quest: 'Meta Quest 3', credits: 'Credits card', box: 'Swag box' };
const RAMP_NAME: Record<string, string> = { site: 'Site: . : |', fine: 'Fine: . · : ; |', classic: 'Classic: .:-=+*#%@', blocks: 'Blocks: ░▒▓█' };

export function PrizeArtLab({ saved }: { saved: PrizeArtCfg }) {
  const [cfg, setCfg] = useState<PrizeArtCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampArt({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('prize-art', 'lab-prize-art-saved');
  const out = (k: string) => { const v = Number(cfg[k as keyof PrizeArtCfg]); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  return (
    <>
      <main className="pl">
        <p className="pl-p">The prizes in characters · {NAME[cfg.show]} · {cfg.cols} × {cfg.rows}. Drag a drawing to turn it. Press a small one to draw it large. Save keeps the look for every prize.</p>
        <div className="pl-big"><PrizeArt o={cfg.show} cfg={cfg} alt={NAME[cfg.show] + ', drawn in characters'} /></div>
        <ul className="pl-strip">
          {OBJECTS.map((o) => (
            <li key={o} data-on={o === cfg.show ? '' : undefined}>
              <button type="button" onClick={() => set('show', o)} aria-pressed={o === cfg.show}>{NAME[o]}</button>
              <PrizeArt o={o} cfg={cfg} cols={48} rows={19} alt={NAME[o] + ', drawn in characters'} />
            </li>
          ))}
        </ul>
      </main>
      <LabPanel title="Prize art lab" cfg={cfg as unknown as Record<string, unknown>} bounds={PRIZE_ART_BOUNDS} choices={{ show: [...OBJECTS], ramp: Object.keys(RAMPS) }}
        optionLabel={(k, v) => (k === 'show' ? NAME[v as Obj] : RAMP_NAME[v]) || v} groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...cfg }), true]]} meter={{ text: NAME[cfg.show] + ' · ' + cfg.ramp, bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.ramp) + ' · ' + String(s.show)} apply={(s) => setCfg(clampArt(s as Partial<PrizeArtCfg>))} />
    </>
  );
}
