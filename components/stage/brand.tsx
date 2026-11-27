import type { ReactNode } from 'react';
import { BuilderLogo } from '@/components/wheel/builder-logo';
import { EVENT } from '@/lib/day-data';
import { at } from '@/lib/routes';

/* The Builder Day cover's parts, on the wall: the mark (the globe logo and the name in green, never recoloured), the
   cells (mono, a strong rule, shared borders), the hosted-by line along the bottom and the dashed line down the
   middle. Sizes are the cover's, in the wall's pixels. */

export function Mark({ size = 'big' }: { size?: 'big' | 'small' }) {
  return (
    <p className={'stc-mark' + (size === 'small' ? ' stc-mark-s' : '')}>
      <BuilderLogo className="stc-logo" />
      <span>{EVENT.short}</span>
    </p>
  );
}

/* a row of cells; a cell can be lit (green rule) or quiet */
export function Cells({ items, className }: { items: (ReactNode | { v: ReactNode; on?: boolean })[]; className?: string }) {
  return (
    <ul className={'stc-cells' + (className ? ' ' + className : '')}>
      {items.map((x, i) => {
        const c = x && typeof x === 'object' && 'v' in x ? x : { v: x as ReactNode };
        return <li key={i} className="stc-cell" data-on={c.on ? '' : undefined}>{c.v}</li>;
      })}
    </ul>
  );
}

/* Hosted by supabase × the partner: the logos as the cover has them, white versions */
export function Hosted() {
  return (
    <p className="stc-hosted">
      <span>Hosted by</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand lockup, drawn at the wall's size */}
      <img className="stc-sb" src={at('/stage/supabase.svg')} alt="Supabase" />
      <span className="stc-x" aria-hidden="true">×</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- the partner's one-colour logo */}
      <img className="stc-pt" src={at('/stage/partner.svg')} alt="Claude" />
    </p>
  );
}

export function Guide() {
  return <span className="stc-guide" aria-hidden="true" />;
}
