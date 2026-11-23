/* The parts the home and a city page draw the same way: the masthead's mark, How it works and the footer. Server
   components; the class strings that recur are the constants below. */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { SupabaseMark } from './supabase-mark';

/* a section's mono caps heading */
/* the page frame: the container every width rule queries (the phone: and tablet: variants) */
export const FRAME = 'dl-frame @container/day relative mx-auto';
export const LABEL = 'type-label text-ink-2';
/* a section below the drawing: on the page's margins, a hairline on top */
export const BELOW = 'relative mx-(--m) rule-t';

/* the mark: home on the home page, the whole day on a city page */
export function MastheadMark({ href, label }: { href: string; label: string }) {
  return (
    <a className="mh-mark inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-lg tracking-snug" href={href} aria-label={label}>
      <SupabaseMark /><span className="font-semibold">supabase <b className="font-regular text-ink-2 phone:hidden">builder day</b></span>
    </a>
  );
}

/* three steps, each a label and a sentence. first: the label column (the home's two columns, the city's name column) */
export function HowItWorksList({ id, title, steps, first, cls }: { id: string; title: string; steps: [string, string][]; first: 'c2' | 'name'; cls?: string }) {
  return (
    <section className={clsx(BELOW, 'py-8', cls)} aria-labelledby={id}>
      <h2 className={clsx(LABEL, first === 'c2' && 'mb-4')} id={id}>{title}</h2>
      <ol>
        {steps.map((s, j) => (
          <li key={s[0]} className={clsx('grid items-baseline gap-x-(--g) py-3 text-xl leading-[1.3] tracking-snug phone:grid-cols-[minmax(0,1fr)] phone:gap-y-1',
            first === 'c2' ? 'grid-cols-[var(--c2)_minmax(0,1fr)] phone:text-lg' : 'grid-cols-[var(--nameW)_minmax(0,1fr)] phone:text-lg', j > 0 && 'rule-t')}>
            <span className={LABEL}>{s[0]}</span><span className="max-w-[65ch]">{s[1]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PageFooter({ children }: { children: ReactNode }) {
  return <footer className={clsx(BELOW, 'flex justify-between gap-4 pt-8 pb-18 text-xs text-ink-2 phone:flex-col')}>{children}</footer>;
}
