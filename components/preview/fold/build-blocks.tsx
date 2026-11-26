'use client';
import { memo, useMemo, type CSSProperties } from 'react';
import { END_MIN, RECEIPT, SUBMIT_AT, YOURS } from './how-data';
import { drawBuild, type BuildLook, type Run } from './build-art';

/* 1 Build in How Builder Day works: the project going up block by block (build-art.ts), with the steps under it as rows
   in the votes' grammar (minute, swatch, name). A pure function of its progress p (0 to 1), finished at
   p = 1, so the server's HTML is the finished picture. The reader picks the way in (browser or editor): the last row says
   which. Nothing below the drawing moves as the clock runs: every row holds its place from the first frame. */

type City = { id: string; code: string; name: string };
export type Way = 'browser' | 'editor';
const pad = (n: number) => String(n).padStart(2, '0');
/* the steps that add blocks: the receipt without its empty folder (the ground is the empty folder) */
const STEPS = RECEIPT.slice(1);
const CW = 6, CH = 12;

/* a face's ink: the page's ink at the face's value over the panel, green mixed in as the block is new or sent */
const shadeOf = (look: BuildLook) => ({ top: 1, left: look.left, right: look.right });
function fill(r: Run, v: Record<'top' | 'left' | 'right', number>, ghost: number): string | undefined {
  if (r.ink === 'none') return undefined;
  if (r.ink === 'ground') return 'var(--bb-ground)';
  if (r.ink === 'ghost') return `color-mix(in oklch, var(--bb-ground) ${Math.round(ghost * 100)}%, transparent)`;
  const base = r.g > 0 ? `color-mix(in oklch, var(--how-1) ${Math.round(r.g * 100)}%, var(--pf-ink))` : 'var(--pf-ink)';
  const k = v[r.ink];
  return k >= 1 ? base : `color-mix(in oklch, ${base} ${Math.round(k * 100)}%, var(--how-panel))`;
}

export const BuildBlocks = memo(function BuildBlocks({ p, look, way, setWay, you, list = true }: { p: number; look: BuildLook; way: Way; setWay?: (w: Way) => void; you?: City; list?: boolean }) {
  const m = p * END_MIN, sent = m >= SUBMIT_AT;
  const pic = useMemo(() => drawBuild(look, m, STEPS, SUBMIT_AT), [look, m]);
  const v = shadeOf(look), W = pic.cols * CW, H = look.rows * CH;
  const now = sent ? STEPS.length : [...STEPS.keys()].reverse().find((i) => m >= STEPS[i].at) ?? -1;
  const label = `Your project going up block by block on an empty ground: a Supabase project at minute ${STEPS[0].at}, ${STEPS.slice(1, -1).map((s) => `${s.what.toLowerCase()} at ${s.at}`).join(', ')}, deployed at ${STEPS[STEPS.length - 1].at}, then submitted at minute ${SUBMIT_AT} ${way === 'browser' ? 'in the browser' : 'from the editor'}.`;
  return (
    <div className="bb" style={{ ['--bb-font' as string]: look.font + 'px' } as CSSProperties}>
      <div className="how-vh"><span>{YOURS}</span><span className="how-st" data-s={sent ? 'live' : m > 0 ? 'hidden' : undefined}>Min {pad(Math.floor(Math.min(m, SUBMIT_AT)))} · {sent ? 'Submitted' : m > 0 ? 'Building' : 'Empty folder'}</span></div>
      <svg className="bb-art" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {pic.rows.map((row, r) => (
          <text key={r} x={0} y={r * CH + CH * 0.78} textLength={W} lengthAdjust="spacing" xmlSpace="preserve" style={{ fontSize: look.font }}>
            {row.map((run, j) => <tspan key={j} style={{ fill: fill(run, v, look.ghost) }}>{run.text}</tspan>)}
          </text>
        ))}
      </svg>
      {list ? (
        <ol className="bb-steps" aria-label="The steps, an example">
          {STEPS.map((s, i) => (
            <li key={s.at} className="bb-row" data-on={m >= s.at ? '' : undefined} data-now={i === now ? '' : undefined}>
              <span className="rk">{pad(s.at)}</span><i aria-hidden="true" /><span className="nm">{s.what}</span><span className="ct" />
            </li>
          ))}
          <li className="bb-row bb-sub" data-on={sent ? '' : undefined} data-now={sent ? '' : undefined}>
            <span className="rk">{pad(SUBMIT_AT)}</span><i aria-hidden="true" /><span className="nm" key={way}>Submitted <em>{way === 'browser' ? 'in the browser' : 'from your editor'}</em></span><span className="ct">{you ? you.code : ''}</span>
          </li>
        </ol>
      ) : null}
      {setWay ? (
        <div className="how-ways" role="group" aria-label="Two ways to submit">
          <span className="wk">Submit</span>
          {(['browser', 'editor'] as const).map((w) => (
            <button key={w} type="button" aria-pressed={way === w} onClick={() => setWay(w)}>{w === 'browser' ? 'In your browser' : 'From your editor'}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
