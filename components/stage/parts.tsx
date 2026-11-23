'use client';
import { Fragment, useMemo, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { FlapText, type FlapOpts } from '@/components/board/flap';
import { Segment, type Legend } from '@/components/board/segment';
import { clampParts } from '@/components/board/config';
import { Picture } from '@/components/pictures/picture';
import partsSaved from '@/saved/parts.config.json';
import type { Project } from '@/lib/data';
import type { Other } from '@/lib/stage/world';
import { useWall } from './use';

/* The wall's small parts: a step that lands, numbers on the board's flaps, the countdown, the QR with the address and
   the room code, the other nine cities, and a project picture. Every size is in the wall's own pixels (1920 by 1080),
   through the --px unit (stage.css). */

const PARTS = clampParts(partsSaved);
export const FLAP: FlapOpts = { flipMs: PARTS.flipMs, flaps: PARTS.flaps, stagger: PARTS.stagger, mode: PARTS.flap };

/* a step the wall shows: it lands (rises and fades in) only when a press added it; on arrival it is simply there */
export function In({ i, className, children, as: As = 'div' }: { i: number; className?: string; children: ReactNode; as?: 'div' | 'li' | 'p' | 'span' | 'dl' }) {
  const { fresh } = useWall();
  return <As className={(className ? className + ' ' : '') + (fresh(i) ? 'st-in' : '')}>{children}</As>;
}

/* a number the room reads: on the flaps in Tube and Board (a change turns them), plain in Plain */
export function Num({ v, width, className }: { v: string; width?: number; className?: string }) {
  const { cfg } = useWall();
  if (cfg.dir === 'plain') return <span className={'st-num' + (className ? ' ' + className : '')}>{v}</span>;
  /* a count: on the board it keeps its width with blank cells in front (never a gap after the digit); in the tube,
     where blank cells do not show, it takes its own width */
  const count = /^[0-9]+$/.test(v), t = count && width && cfg.dir === 'board' ? v.padStart(width) : v;
  return <FlapText text={t} width={count && cfg.dir !== 'board' ? undefined : width} opts={FLAP} className={'st-num' + (className ? ' ' + className : '')} />;
}
/* words: on the flaps in Board only */
export function Words({ v, className }: { v: string; className?: string }) {
  const { cfg } = useWall();
  if (cfg.dir !== 'board') return <span className={className}>{v}</span>;
  return <FlapText text={v} opts={{ ...FLAP, mode: 'word' }} className={className} />;
}

const p2 = (n: number) => String(n).padStart(2, '0');
/* 59:59, or 1:29:59 past the hour */
export function mmss(secs: number): string {
  const s = Math.max(0, Math.ceil(secs)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? h + ':' + p2(m) + ':' + p2(x) : p2(m) + ':' + p2(x);
}

/* the countdown: the largest thing on the wall. Segment digits in Tube, flaps in Board, plain figures in Plain. It
   steps once a second and never animates between. */
export function Countdown({ secs, lit, also, label }: { secs: number; lit: Legend | null; also?: Legend | null; label: string }) {
  const { cfg } = useWall();
  if (cfg.dir === 'tube') return <div className="st-count" data-sk-skip><Segment secs={secs} lit={lit} also={also} label={label} withSecs /></div>;
  return <div className="st-count" role="timer" aria-label={label}><span className="st-count-n" aria-hidden="true">{mmss(secs)}</span></div>;
}

/* the QR: dark modules on a light square with its quiet zone (a light-on-dark code fails on many phones), glass, so
   no lines cross it */
export function Qr({ url, className }: { url: string; className?: string }) {
  const path = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d, n: n + 8 };
  }, [url]);
  return (
    <svg className={'st-qr' + (className ? ' ' + className : '')} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label={'QR code for ' + url} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} className="st-qr-bg" />
      <path d={path.d} className="st-qr-fg" />
    </svg>
  );
}
export const bare = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

/* the door: the QR, the address under it, and the room code. With no address (a place whose event has no page of
   its own to sign in on) only the room code shows. */
export function Door({ url, code, size = 'big', addr = true }: { url: string; code: string | null; size?: 'big' | 'small'; addr?: boolean }) {
  return (
    <div className={'st-door st-door-' + size}>
      {url ? <Qr url={url} /> : null}
      {addr && url ? <p className="st-addr">{bare(url).split('/').map((x, i) => <Fragment key={i}>{i ? <>/<wbr /></> : null}{x}</Fragment>)}</p> : null}
      {code ? <p className="st-code"><span className="st-k">Room code</span><Num v={code} className="st-code-v" /></p> : null}
    </div>
  );
}

/* the other nine cities, as a board of cells: the code and what each is doing now */
const SHORT: Record<Other['state'], string> = { next: '', build: 'Building', vote: 'Voting', done: 'Top 3 set' };
export function Others({ others }: { others: Other[] }) {
  return (
    <ul className="st-others" aria-label="The other cities">
      {others.map((o) => (
        <li key={o.id} className="st-oc" data-state={o.state} title={o.word}>
          <span className="st-oc-c">{o.code}</span>
          <span className="st-oc-w">{o.state === 'next' ? o.word.replace(/^.* starts /, '') : SHORT[o.state]}</span>
        </li>
      ))}
    </ul>
  );
}

/* a project picture: glass (above the lines); a dashed frame when there is none */
export function Pic({ p, className }: { p: Project | null | undefined; className?: string }) {
  return <span className={'st-pic' + (className ? ' ' + className : '')}><Picture p={p} cls="st-pic-img" /></span>;
}
