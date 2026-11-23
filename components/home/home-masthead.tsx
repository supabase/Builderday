'use client';
import clsx from 'clsx';
import { EVENT, CITY_WORD_CAP } from '@/lib/day-data';
import { action, cityHref, status } from '@/lib/home';
import { MastheadMark } from '@/components/shared/page-parts';
import { useDay } from './day-context';

/* the masthead's one main action: green when the config says so */
export const MH_ACT = 'mh-act inline-flex h-9 pointer-coarse:h-11 items-center justify-self-end px-4 font-sans text-sm/none font-medium whitespace-nowrap [transition:background-color_var(--dur-hover)_var(--ease-out),scale_var(--dur-press)_var(--ease-out)] active:scale-(--press) phone:h-11';
export const MH_ACT_G = 'bg-accent text-accent-ink [box-shadow:none] hover:bg-[color-mix(in_oklch,var(--c-accent)_90%,var(--c-ink))]';
export const MH_ACT_LINE = 'edge-ink text-ink hover:bg-tint-1';
/* the masthead: a grid on the page's margins; the band is one 64px row over the table (its columns are in day.css) */
export const MH = 'mh relative z-3 grid items-center gap-x-(--g) px-(--m) phone:h-auto phone:gap-y-4 phone:pt-4 phone:pb-6';
export const MH_BAND = 'mh-band h-16 rule-b';

/* cls: the layout's masthead (the home's is the band; the tuning page's other layouts use their own) */
export function HomeMasthead({ cls = 'mh-band' }: { cls?: string }) {
  const { cfg, W, carry } = useDay(), act = action(W, cfg, (x) => cityHref(x, cfg, W, carry)), g = cfg.green >= 2, band = cls === 'mh-band';
  return (
    <header className={clsx(MH, band ? MH_BAND : cls)}>
      <MastheadMark href="#top" label={EVENT.name + ', top of the page'} />
      <p className={clsx('mh-date grid leading-none font-medium whitespace-nowrap phone:text-h1', band ? 'text-[length:min(calc(var(--fact)*1px),var(--t-h1))] tracking-tight tablet:hidden' : 'text-[length:calc(var(--fact)*1px)] tracking-d48')}>
        <span>{EVENT.date}</span><span className="mh-sub type-label mt-2 text-ink-2">{CITY_WORD_CAP} cities, one day</span>
      </p>
      <p className="mh-status max-w-[40ch] text-xl leading-[1.25] tracking-snug text-pretty text-ink phone:min-h-[2.5em] phone:text-md">{status(W)}</p>
      <a className={clsx(MH_ACT, g ? MH_ACT_G : MH_ACT_LINE)} href={act.href} data-g={g ? '1' : undefined}>{act.t}</a>
    </header>
  );
}
