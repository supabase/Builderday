'use client';
import type { CSSProperties, ReactNode, Ref } from 'react';
import familySaved from '@/saved/family.config.json';
import { clampFamily, type FamilyCfg } from '@/lib/family';
import { MARK, type MarkState } from '@/components/air/devices';
import './kit.css';

/* The kit (family plan): the parts the three public pages share, each built once. The looks are in kit.css and the
   family tokens; the modes come from saved/family.config.json, or from the specimen lab through `fam`. */

export const FAMILY: FamilyCfg = clampFamily(familySaved);

/* ---------- the Key: primary (the one per screen), second, quiet ---------- */
export type KeyKind = 'primary' | 'second' | 'quiet';
export function Key({ kind = 'primary', size, href, onClick, children, label, popup, className, ref, disabled }: {
  kind?: KeyKind; size?: 'cell'; href?: string; onClick?: () => void; children: ReactNode; label?: string; popup?: boolean; className?: string;
  ref?: Ref<HTMLAnchorElement & HTMLButtonElement>; disabled?: boolean;
}) {
  const p = { className: 'k-key' + (className ? ' ' + className : ''), 'data-kind': kind, 'data-size': size, 'aria-label': label, ref };
  return href && !disabled
    ? <a {...p} href={href} onClick={onClick}>{children}</a>
    : <button {...p} type="button" onClick={onClick} disabled={disabled} aria-haspopup={popup ? 'dialog' : undefined}>{children}</button>;
}

/* ---------- the Label ---------- */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={'k-label' + (className ? ' ' + className : '')}>{children}</span>;
}

/* ---------- the Chip: one state, its glyph (the globe's mark) and its word. open: this is open to you now (the
   one mint). The words are one set for the three pages. ---------- */
export type ChipState = MarkState | 'open' | 'soon' | 'full' | 'picked';
export const CHIP_WORD: Record<ChipState, string> = {
  open: 'Open', soon: 'Opens soon', full: 'Waiting list', next: 'Not open yet', build: 'Building', vote: 'Last votes', hidden: 'Votes hidden', done: 'Closed', final: 'Finalists in', picked: 'Picked',
};
const GLYPH: Record<ChipState, string> = { ...MARK, open: '[+]', soon: '+', full: '[-]', picked: '[*]' };
const QUIET = new Set<ChipState>(['next', 'soon', 'done']);
export function Chip({ s, word, open, look = FAMILY.chip, className }: { s: ChipState; word?: string; open?: boolean; look?: FamilyCfg['chip']; className?: string }) {
  const isOpen = open ?? (s === 'open' || s === 'build' || s === 'vote' || s === 'hidden');
  return (
    <span className={'k-chip' + (className ? ' ' + className : '')} data-look={look} data-s={s} data-open={isOpen ? '' : undefined} data-q={QUIET.has(s) ? '' : undefined}>
      <span className="k-chip-g" aria-hidden="true">{GLYPH[s]}</span><span>{word ?? CHIP_WORD[s]}</span>
    </span>
  );
}

/* ---------- the Cells: a strip of facts, a label over each value ---------- */
export type Cell = { k: string; v: ReactNode; live?: boolean };
export function Cells({ cells, className, label }: { cells: Cell[]; className?: string; label?: string }) {
  return (
    <dl className={'k-cells' + (className ? ' ' + className : '')} aria-label={label} style={{ ['--k-n' as string]: cells.length } as CSSProperties}>
      {cells.map((c) => <div key={c.k}><dt>{c.k}</dt><dd aria-live={c.live ? 'off' : undefined}>{c.v}</dd></div>)}
    </dl>
  );
}

/* ---------- the Section head ---------- */
export function SectionHead({ id, children, lede, className }: { id: string; children: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <>
      <h2 id={id} className={'k-h2 pf-h' + (className ? ' ' + className : '')}>{children}</h2>
      {lede ? <p className="k-lede pf-lede">{lede}</p> : null}
    </>
  );
}

/* ---------- the Notice: a rule or a state, said once ---------- */
export function Notice({ children, live, className }: { children: ReactNode; live?: boolean; className?: string }) {
  return <p className={'k-notice' + (className ? ' ' + className : '')} role={live ? 'status' : undefined}>{children}</p>;
}
