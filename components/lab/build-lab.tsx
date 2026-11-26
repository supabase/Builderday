'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BuildBlocks, type Way } from '@/components/preview/fold/build-blocks';
import { BUILD_ARRIVES, BUILD_BOUNDS, BUILD_SHADES, BUILD_SHAPES, clampBuild, type BuildLook } from '@/components/preview/fold/build-art';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import '@/components/preview/fold/fold.css';
import './build-lab.css';

/* The Build lab: the drawing large, then at the panel's width on a wide window and on a phone, each with the steps under
   it. Click the big drawing for a new seed (the heap's skyline and the print order); the knobs change it live; the
   minute scrubs the clock and Play runs it as the page does (neither is saved). Save writes saved/build.config.json,
   which How Builder Day works reads when "Build draws" is blocks. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'shape', kind: 'select', label: 'What goes up' }, { k: 'shade', kind: 'select', label: 'Characters' }, { k: 'arrive', kind: 'select', label: 'A block arrives' }] },
  { name: 'Grid', knobs: [{ k: 'cols', kind: 'range', label: 'Columns' }, { k: 'rows', kind: 'range', label: 'Rows' }, { k: 'font', kind: 'range', label: 'Font size' }] },
  { name: 'Blocks', knobs: [{ k: 'cube', kind: 'range', label: 'Cube, half width in cells' }, { k: 'tall', kind: 'range', label: 'Cube height' }, { k: 'ground', kind: 'range', label: 'Ground beyond the build' }] },
  { name: 'Ink', knobs: [{ k: 'left', kind: 'range', label: 'Left face' }, { k: 'right', kind: 'range', label: 'Right face' }, { k: 'ghost', kind: 'range', label: 'Plan of blocks to come' }, { k: 'edge', kind: 'range', label: 'Edges as | (over 0.5)' }] },
  { name: 'Motion', knobs: [{ k: 'fill', kind: 'range', label: 'A step’s blocks start over (of the gap)' }, { k: 'fall', kind: 'range', label: 'A block lands in, min' }, { k: 'drop', kind: 'range', label: 'Fall, cubes' }, { k: 'settle', kind: 'range', label: 'New stays green, min' }, { k: 'sweep', kind: 'range', label: 'Submit turns green, min' }] },
];
const LABELS: Record<string, string> = {
  mark: 'The Builder Day cross', stack: 'Stepped stack', heap: 'Seeded skyline',
  hatch: 'Globe hatch ::|, faces by ink', ramp: 'One character a face | : .', dots: 'Dots, the small globe',
  drop: 'Falls into place', print: 'Prints cell by cell',
};

export function BuildLab({ saved, min: min0 = 90 }: { saved: BuildLook; min?: number }) {
  const [cfg, setCfg] = useState<BuildLook>(saved), [min, setMin] = useState(min0), [way, setWay] = useState<Way>('browser');
  const set = useCallback((k: string, v: unknown) => { if (k === 'min') setMin(Number(v)); else setCfg((c) => clampBuild({ ...c, [k]: v })); }, []);
  const { save, msg, rail } = useLabSave('build', 'lab-build-saved');
  const reseed = () => setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) }));
  const raf = useRef(0);
  const play = () => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now(), len = 4200;
    const tick = (now: number) => { const t = Math.min(1, (now - t0) / len); setMin(t * 90); if (t < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const out = (k: string) => { const v = Number(k === 'min' ? min : cfg[k as keyof BuildLook]); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, ''); };
  const p = min / 90;
  return (
    <>
      <main className="bl pf">
        <h1 className="bl-h">Build · {LABELS[cfg.shape]} · {LABELS[cfg.shade]}</h1>
        <p className="bl-p">Click the drawing for a new seed. Knobs change it live. Play runs the clock. Save keeps it.</p>
        <div className="pf-how">
          <div className="bl-big how-panel-bg" onClick={reseed} title="New seed"><BuildBlocks p={p} look={cfg} way={way} list={false} /></div>
          <div className="bl-sizes">
            <figure><figcaption>In its panel at 1440 (385px)</figcaption><div className="how-panel-bg" style={{ width: 385 }}><BuildBlocks p={p} look={cfg} way={way} setWay={setWay} you={{ id: 'london', code: 'LON', name: 'London' }} /></div></figure>
            <figure><figcaption>On a phone (346px)</figcaption><div className="how-panel-bg" style={{ width: 346 }}><BuildBlocks p={p} look={cfg} way={way} setWay={setWay} you={{ id: 'london', code: 'LON', name: 'London' }} /></div></figure>
          </div>
        </div>
      </main>
      <LabPanel title="Build lab" cfg={{ ...cfg, min }} bounds={{ ...BUILD_BOUNDS, min: [0, 90, 0.5] }} choices={{ shape: BUILD_SHAPES, shade: BUILD_SHADES, arrive: BUILD_ARRIVES }} optionLabel={(_k, v) => LABELS[v] || v}
        groups={[...GROUPS, { name: 'Preview only (not saved)', knobs: [{ k: 'min', kind: 'range', label: 'Minute' }] }]} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...cfg }), true], ['Play', play], ['New seed', reseed]]} meter={{ text: 'Seed ' + cfg.seed + ' · ' + cfg.shape + ' · ' + cfg.shade, bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.shape) + ' · ' + String(s.shade) + ' · ' + String(s.seed)} apply={(s) => setCfg(clampBuild(s as Partial<BuildLook>))} />
    </>
  );
}
