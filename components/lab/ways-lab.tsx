'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SubmitWays, type Way } from '@/components/preview/fold/ways';
import { WAYS_BOUNDS, WAYS_CHECKS, WAYS_CHROMES, clampWays, type WaysLook } from '@/components/preview/fold/ways-config';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import '@/components/preview/fold/fold.css';
import './build-lab.css';

/* The ways lab: Build as the two ways to submit, at the panel's width on a wide window and on a phone, both ways side by
   side. The knobs change it live; the progress scrubs the clock and Play runs it as the page does (neither is saved).
   Save writes saved/ways.config.json, which How Builder Day works reads when "Build draws" is ways. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'chrome', kind: 'select', label: 'Window' }, { k: 'checks', kind: 'select', label: 'Checks' }] },
  { name: 'When (of the drawing)', knobs: [{ k: 'lead', kind: 'range', label: 'Clock reaches the submit' }, { k: 'type1', kind: 'range', label: 'Repo typed by' }, { k: 'type2', kind: 'range', label: 'Link typed by' }, { k: 'check', kind: 'range', label: 'Checks start' }, { k: 'checkStep', kind: 'range', label: 'Between checks' }, { k: 'send', kind: 'range', label: 'Sent' }] },
  { name: 'Clock and swap', knobs: [{ k: 'from', kind: 'range', label: 'Submit starts at minute' }, { k: 'at', kind: 'range', label: 'Sent at minute' }, { k: 'swapMs', kind: 'range', label: 'Swap between ways, ms' }, { k: 'swapRise', kind: 'range', label: 'Swap rise, px' }] },
];
const LABELS: Record<string, string> = { window: 'In a window', bare: 'Bare, no window', three: 'The three checks', none: 'No checks' };
const YOU = { id: 'london', code: 'LON', name: 'London' };

export function WaysLab({ saved, p: p0 = 1, way: way0 = 'browser' }: { saved: WaysLook; p?: number; way?: Way }) {
  const [cfg, setCfg] = useState<WaysLook>(saved), [p, setP] = useState(p0), [way, setWay] = useState<Way>(way0);
  const set = useCallback((k: string, v: unknown) => { if (k === 'p') setP(Number(v)); else setCfg((c) => clampWays({ ...c, [k]: v })); }, []);
  const { save, msg, rail } = useLabSave('ways', 'lab-ways-saved');
  const raf = useRef(0);
  const play = () => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now(), len = 4200;
    const tick = (now: number) => { const t = Math.min(1, (now - t0) / len); setP(t); if (t < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const out = (k: string) => { const v = Number(k === 'p' ? p : cfg[k as keyof WaysLook]); return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''); };
  return (
    <>
      <main className="bl pf">
        <h1 className="bl-h">Build · two ways to submit · {LABELS[cfg.chrome]}</h1>
        <p className="bl-p">Knobs change it live. Play runs the clock. The toggle under each swaps the way. Save keeps it.</p>
        <div className="pf-how">
          <div className="bl-sizes">
            <figure><figcaption>In its panel at 1440 (385px)</figcaption><div className="how-panel-bg" style={{ width: 385 }}><SubmitWays p={p} look={cfg} way={way} setWay={setWay} you={YOU} /></div></figure>
            <figure><figcaption>The other way</figcaption><div className="how-panel-bg" style={{ width: 385 }}><SubmitWays p={p} look={cfg} way={way === 'browser' ? 'editor' : 'browser'} you={YOU} /></div></figure>
            <figure><figcaption>On a phone (346px)</figcaption><div className="how-panel-bg" style={{ width: 346 }}><SubmitWays p={p} look={cfg} way={way} setWay={setWay} you={YOU} /></div></figure>
          </div>
        </div>
      </main>
      <LabPanel title="Ways lab" cfg={{ ...cfg, p }} bounds={{ ...WAYS_BOUNDS, p: [0, 1, 0.005] }} choices={{ chrome: WAYS_CHROMES, checks: WAYS_CHECKS }} optionLabel={(_k, v) => LABELS[v] || v}
        groups={[...GROUPS, { name: 'Preview only (not saved)', knobs: [{ k: 'p', kind: 'range', label: 'Progress' }] }]} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...cfg }), true], ['Play', play]]} meter={{ text: cfg.chrome + ' · ' + cfg.checks, bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.chrome) + ' · ' + String(s.checks)} apply={(s) => setCfg(clampWays(s as Partial<WaysLook>))} />
    </>
  );
}
