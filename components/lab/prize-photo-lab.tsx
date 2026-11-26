'use client';
import { useCallback, useState } from 'react';
import { INKS, MODES, PHOTOS, SCREENS, PHOTO_BOUNDS, clampPhoto, type Mode, type Photo, type PhotoLook } from '@/components/prize/photo';
import { PrizePhoto } from '@/components/prize/prize-photo';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './prize-art-lab.css';

/* The prize photo lab: one prize large, the four under it in the same look, and the large one in every mode. Hover
   a print to see the photo under it. Save writes saved/prize-photo.config.json, which every prize photo reads. */

const GROUPS: Group[] = [
  { name: 'Prize', knobs: [{ k: 'show', kind: 'select', label: 'Shown large' }, { k: 'screen', kind: 'select', label: 'Laptop screens show' }] },
  { name: 'Print', knobs: [{ k: 'mode', kind: 'select', label: 'Printed as' }, { k: 'ink', kind: 'select', label: 'Ink' }, { k: 'cell', kind: 'range', label: 'Cell, px' }, { k: 'gap', kind: 'range', label: 'Gap in a cell' }, { k: 'round', kind: 'toggle', label: 'Round dots' }, { k: 'ordered', kind: 'toggle', label: 'Ordered pattern (off: error spread)' }, { k: 'accent', kind: 'range', label: 'Brightest share in green' }] },
  { name: 'Tone', knobs: [{ k: 'auto', kind: 'toggle', label: 'Level each photo first' }, { k: 'contrast', kind: 'range', label: 'Contrast' }, { k: 'lift', kind: 'range', label: 'Lift' }, { k: 'gamma', kind: 'range', label: 'Curve' }, { k: 'edge', kind: 'range', label: 'Outline' }] },
  { name: 'Each photo', knobs: [{ k: 'expPro', kind: 'range', label: 'MacBook Pro exposure' }, { k: 'expMini', kind: 'range', label: 'Mac mini exposure' }, { k: 'expNeo', kind: 'range', label: 'MacBook Neo exposure' }, { k: 'expQuest', kind: 'range', label: 'Quest 3 exposure' }] },
  { name: 'Key and fit', knobs: [{ k: 'tol', kind: 'range', label: 'Ground tolerance' }, { k: 'feather', kind: 'range', label: 'Soft edge, px' }, { k: 'pad', kind: 'range', label: 'Space round it' }] },
  { name: 'Duotone and photo', knobs: [{ k: 'lines', kind: 'range', label: 'Duotone lines' }, { k: 'sat', kind: 'range', label: 'Photo colour kept' }, { k: 'reveal', kind: 'toggle', label: 'Hover shows the photo' }] },
];
const NAME: Record<Photo, string> = { pro: 'MacBook Pro', mini: 'Mac mini', neo: 'MacBook Neo', quest: 'Meta Quest 3' };
const MODE_NAME: Record<Mode, string> = { dither: '1-bit dither', halftone: 'Halftone', ascii: 'Characters', duotone: 'Grey duotone', photo: 'Photo' };
type LabCfg = PhotoLook & { show: Photo };

export function PrizePhotoLab({ saved, show: show0 }: { saved: PhotoLook; show: Photo }) {
  const [look, setLook] = useState<PhotoLook>(saved), [show, setShow] = useState<Photo>(show0);
  const set = useCallback((k: string, v: unknown) => { if (k === 'show') setShow(v as Photo); else setLook((c) => clampPhoto({ ...c, [k]: v })); }, []);
  const { save, msg, rail } = useLabSave('prize-photo', 'lab-prize-photo-saved');
  const cfg: LabCfg = { ...look, show };
  const out = (k: string) => { const v = Number(cfg[k as keyof LabCfg]); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  return (
    <>
      <main className="pl">
        <p className="pl-p">The prizes as their press photos, printed in the site&apos;s look · {NAME[show]} · {MODE_NAME[look.mode]}. Hover a print to see the photo under it. Save keeps the look for every prize.</p>
        <div className="pl-big"><PrizePhoto p={show} look={look} alt={NAME[show]} /></div>
        <ul className="pl-strip">
          {PHOTOS.map((p) => (
            <li key={p} data-on={p === show ? '' : undefined}>
              <button type="button" onClick={() => setShow(p)} aria-pressed={p === show}>{NAME[p]}</button>
              <PrizePhoto p={p} look={look} alt={NAME[p]} />
            </li>
          ))}
        </ul>
        <ul className="pl-strip">
          {MODES.map((m) => (
            <li key={m} data-on={m === look.mode ? '' : undefined}>
              <button type="button" onClick={() => set('mode', m)} aria-pressed={m === look.mode}>{MODE_NAME[m]}</button>
              <PrizePhoto p={show} look={{ ...look, mode: m }} alt={NAME[show] + ', ' + MODE_NAME[m]} />
            </li>
          ))}
        </ul>
      </main>
      <LabPanel title="Prize photo lab" cfg={cfg as unknown as Record<string, unknown>} bounds={PHOTO_BOUNDS} choices={{ show: [...PHOTOS], mode: [...MODES], ink: Object.keys(INKS), screen: [...SCREENS] }}
        optionLabel={(k, v) => (k === 'show' ? NAME[v as Photo] : k === 'mode' ? MODE_NAME[v as Mode] : k === 'screen' ? ({ code: 'A Builder Day terminal', dark: 'Dark glass', photo: 'The press photo' } as Record<string, string>)[v] : v)} groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...look }), true]]} meter={{ text: NAME[show] + ' · ' + MODE_NAME[look.mode], bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.mode) + ' · ' + String(s.cell)} apply={(s) => setLook(clampPhoto(s as Partial<PhotoLook>))} />
    </>
  );
}
