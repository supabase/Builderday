import type { ReactNode } from 'react';
import { FM_H, FM_P } from './sheet';
import './forms.css';
import { EVENT } from '@/lib/day-data';

/* The small pages around signing in (/in, /in/confirm): one card in the middle of the night ground, in the sheets'
   type, so a link from an email lands somewhere that looks like the site. */
export function InCard({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ground p-4 text-ink">
      <div className="grid w-full max-w-[26rem] gap-y-6">
        <p className="m-0 type-label text-ink-3">{EVENT.name}</p>
        <div>
          <h1 className={FM_H}>{title}</h1>
          <p className={FM_P}>{text}</p>
        </div>
        {children ? <div className="grid gap-y-4">{children}</div> : null}
      </div>
    </main>
  );
}
