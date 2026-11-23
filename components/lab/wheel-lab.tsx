'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WHEEL_BOUNDS, WHEEL_CHOICES, WHEEL_DEF, clampWheel, type WheelCfg } from '@/components/wheel/config';
import type { WheelEngine } from '@/components/wheel/engine';
import { LabPanel, LayoutPicker, togglePanel, useLabSave } from './lab-kit';
import { WHEEL_GROUPS as GROUPS, WHEEL_INT as INT, wheelLabel } from '@/components/wheel/knobs';
import type { OurWheel } from './wheel/our-facts';
import { Directions } from './wheel/directions';
import { DIRECTIONS, type Direction } from './wheel/direction-list';

/* The wheel lab. The baseline is the study as anthony built it, with its own facts, rebuilt here; the other three
   are directions with our facts from the model. Every number of the wheel, the glass and the screen is a knob, and
   Save writes saved/wheel.config.json. The lab can also turn WebGL off, to check the flat fallback, and shows how
   often the picture is drawn: at rest it should be never. */


export function WheelLab({ saved, forced, noGl: noGl0, bare, dir: dir0, ours }: { saved: WheelCfg; forced: number | null; noGl: boolean; bare: boolean; dir: Direction; ours: OurWheel }) {
  const [cfg, setCfg] = useState<WheelCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampWheel({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('wheel', 'lab-wheel-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const [noGl, setNoGl] = useState(noGl0), [dir, setDir] = useState<Direction>(dir0);
  const eng = useRef<WheelEngine | null>(null);
  const [meter, setMeter] = useState('');

  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);
  /* how often the picture and the shader ran in the last second */
  useEffect(() => {
    let last = eng.current?.stats();
    const t = window.setInterval(() => {
      const s = eng.current?.stats(); if (!s) return;
      if (last) setMeter(`${eng.current?.gl() ? 'WebGL' : 'No WebGL, flat globe'}. Last second: ${s.frames - last.frames} frames, ${s.pictures - last.pictures} picture draws, ${s.glDraws - last.glDraws} shader passes.`);
      last = s;
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave();
    };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave]);

  const out = (k: string) => { const v = cfg[k as keyof WheelCfg]; return typeof v === 'number' ? (INT.has(k) ? String(v) : String(+v.toFixed(3))) : String(v); };
  const label = (s: Record<string, unknown>) => `Step ${s.step}, size ${s.labelSize}, lines ${s.lineAlpha}, ${s.font}`;

  return (
    <>
      <Directions key={dir + (noGl ? '-2d' : '')} dir={dir} cfg={cfg} noGl={noGl} mark={cfg.mark} engineRef={eng} ours={ours} forced={forced} />
      <LabPanel title="Wheel lab" cfg={{ ...cfg, seed: 'none' }} bounds={WHEEL_BOUNDS} choices={WHEEL_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={out} optionLabel={wheelLabel} meter={{ text: meter, bad: false }}
        msg={msg} rail={rail} railLabel={label} apply={(s) => setCfg(clampWheel(s))}
        buttons={[['Save', doSave, true], ['Study values', () => setCfg({ ...WHEEL_DEF })]]}>
        <fieldset><legend>Check</legend>
          <label className="tog"><input type="checkbox" checked={noGl} onChange={(e) => setNoGl(e.target.checked)} /><span>No WebGL (flat globe)</span></label>
        </fieldset>
      </LabPanel>
      <LayoutPicker modes={DIRECTIONS} mode={dir} setMode={(m) => setDir(m as Direction)} replay={() => eng.current?.go(forced ?? 0)} />
    </>
  );
}
