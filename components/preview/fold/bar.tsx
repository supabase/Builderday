'use client';
import { useEffect, useMemo, useRef } from 'react';
import { flapInto, type FlapOpts } from './flap';
import { once } from './motion';
import { teletextBits } from './teletext';

/* The bar: the blanking bar between the wheel's frame and the day's. Four cells, a label over a value; under them one
   row of dots, which is the cells' own words as a teletext line sends them. Its top shows at the bottom of the first
   screen (the peek), so it is the scroll cue and the first sentence at once. The values turn on flaps once, the first
   time they are in view. */

export function FoldBar({ cells, flap, dot, live }: { cells: [string, string][]; flap: FlapOpts; dot: number; live: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const bits = useMemo(() => teletextBits(cells.map(([k, v]) => k + ' ' + v).join('  ')), [cells]);
  useEffect(() => {
    const el = ref.current; if (!el || !live) return;
    const vals = Array.from(el.querySelectorAll<HTMLElement>('.pf-bar-v [aria-hidden]'));
    let stops: (() => void)[] = [];
    const off = once(el.querySelector('.pf-bar-cells'), 0.6, () => { stops = vals.map((v, i) => flapInto(v, cells[i][1], { ...flap, stagger: flap.stagger }, ' '.repeat(cells[i][1].length))); });
    return () => { off(); stops.forEach((s) => s()); };
  }, [cells, flap, live]);
  const pitch = dot * 2;
  return (
    <section ref={ref} className="pf-bar" aria-label="The day in four facts">
      <dl className="pf-bar-cells">
        {cells.map(([k, v]) => (
          <div key={k} className="pf-bar-c"><dt>{k}</dt><dd className="pf-bar-v"><span className="sr-only">{v}</span><span aria-hidden="true">{v}</span></dd></div>
        ))}
      </dl>
      <svg className="pf-dots" aria-hidden="true" width={bits.length * pitch} height={dot} viewBox={`0 0 ${bits.length * pitch} ${dot}`}>
        {bits.map((b, i) => (b ? <rect key={i} x={i * pitch} y={0} width={dot} height={dot} /> : null))}
      </svg>
    </section>
  );
}
