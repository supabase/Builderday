'use client';
import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { LABEL } from '@/components/shared/page-parts';
import type { ArtSubject } from './art-config';
import { SheetArt, useArtLook } from './sheet-art';

/* The sheet: one <dialog>, opened with showModal(). Every form (sign-in, submit, remind, share) is one of these.
   It animates in and out through data-state (closed, open, closing; forms.css has the motion), keeps Tab inside,
   closes on Escape and on a press on the backdrop (not while busy), sits above the phone's keyboard, locks the page
   behind it and gives focus back to whatever opened it. */

/* timers cannot read CSS variables: a duration is read from its token when it is needed */
export function token(name: string): number { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); const n = parseFloat(v) || 0; return /ms$/.test(v) ? n : n * 1000; }
export function isTouch(): boolean { return window.matchMedia('(pointer: coarse)').matches; }

let openCount = 0;
function lockPage(on: boolean) { openCount += on ? 1 : -1; document.documentElement.classList.toggle('fm-lock', openCount > 0); }
/* on a phone the sheet sits on the bottom edge of the visual viewport, so the keyboard never covers it */
function fitKeyboard(dlg: HTMLDialogElement): () => void {
  const vv = window.visualViewport; if (!vv) return () => {};
  const fit = () => { const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); dlg.style.setProperty('--fm-kb', kb + 'px'); dlg.style.setProperty('--fm-vh', vv.height + 'px'); };
  fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
  return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
}

type SheetValue = { id: string; close: () => void; busy: RefObject<boolean>; focus: (el?: HTMLElement | null) => void; open: RefObject<boolean> };
const SheetContext = createContext<SheetValue | null>(null);
export function useSheet(): SheetValue { const v = useContext(SheetContext); if (!v) throw new Error('useSheet outside a Sheet'); return v; }
/* the sheet's id, for the heading that names it; null outside a sheet (a lab drawing the body on the page) */
export function useSheetId(): string | null { return useContext(SheetContext)?.id ?? null; }

/* the sheets' recurring class strings. The field, the code boxes, the checkbox, the picture drop and the button (fm-i,
   fm-code, fm-chk, fm-pic, fm-b) keep their rules in forms.css: each has too many states to read well inline. */
export const FM_H = 'fm-h text-h2 leading-[1.15] font-regular tracking-tight text-balance wrap-anywhere focus:outline-none phone-window:text-xl';   /* the sheet's heading; also the focus target on touch */
export const FM_P = 'mt-2 text-ink-2 text-pretty wrap-anywhere [&_b]:font-medium [&_b]:text-ink';
export const FM_FORM = 'mt-6 grid gap-y-6';
export const FM_F = 'grid min-w-0 gap-y-2';   /* a field: label, input, error */
export const FM_L = 'type-label flex items-baseline justify-between gap-3 text-ink-2 [&_small]:[font:inherit] [&_small]:text-ink-3';
export const FM_ACT = 'flex flex-wrap items-center gap-2 phone-window:[&>.fm-b]:flex-auto';
export const FM_DONE = 'mt-6 grid gap-y-4';
export const FM_NOTE = 'text-sm text-ink-2 text-pretty';
/* a quiet text action: underlined, with a 44px hit area */
export const FM_T = 'inline-flex min-h-11 cursor-pointer touch-manipulation items-center font-sans text-sm/[1.2] font-regular text-ink underline-link disabled:cursor-default disabled:text-ink-3 disabled:no-underline';
const SVG_LINE = 'fill-none stroke-current stroke-(length:--line-thick)';

export const IconX = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>;
export const IconErr = () => <svg className={clsx('mt-0.5 size-3.5 flex-none', SVG_LINE)} viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" /><path d="M7 3.8v3.8M7 9.9v.2" /></svg>;
export const IconOut = () => <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3h6v6M11 3 3 11" /></svg>;
/* a field's error line: hidden while there is nothing to say */
export function ErrBox({ id, msg, live }: { id: string; msg: string; live?: boolean }) {
  const box = <p className="flex items-start gap-2 text-sm leading-[1.4] text-ink text-pretty" id={id} hidden={!msg}><IconErr /><span>{msg}</span></p>;
  /* live: for a field that usually already has focus when the error comes (a code typed and sent with Enter), so
     focusing it again would say nothing; the wrapper stays in the page and reads the message out when it appears */
  return live ? <div aria-live="assertive" aria-atomic="true">{box}</div> : box;
}

/* focusRef: what takes focus when the sheet opens; onDone runs once, after the sheet has closed */
export function Sheet({ label, wide, art, focusRef, onDone, children }: { label: string; wide?: boolean; art?: ArtSubject; focusRef?: RefObject<HTMLElement | null>; onDone: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), id = 'fm-' + useId().replace(/[^a-z0-9]/gi, '');
  const busy = useRef(false), isOpen = useRef(false), st = useRef({ closing: false, done: false, tm: 0, unfit: null as null | (() => void), opener: null as Element | null });
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  /* one clean-up, whichever way the sheet ends: the exit timer, the 'close' event, or an uncancelable Escape */
  const finish = useCallback(() => {
    const s = st.current, dlg = ref.current; if (s.done) return; s.done = true; isOpen.current = false;
    clearTimeout(s.tm); if (s.unfit) s.unfit(); lockPage(false);
    if (dlg && dlg.open) dlg.close();
    const o = s.opener as HTMLElement | null;
    if (o && o.isConnected && typeof o.focus === 'function') o.focus({ preventScroll: true });
    doneRef.current();
  }, []);
  /* close(): animate out, then dialog.close() */
  const close = useCallback(() => {
    const s = st.current, dlg = ref.current; if (!dlg || s.closing || !dlg.open) return;
    s.closing = true; dlg.dataset.state = 'closing';
    s.tm = window.setTimeout(finish, token('--dur-panel-exit'));
  }, [finish]);
  /* modals take focus: the given field on a pointer device; the heading on touch, so the keyboard does not jump up */
  const focus = useCallback((el?: HTMLElement | null) => {
    const dlg = ref.current; if (!dlg) return;
    const h = dlg.querySelector<HTMLElement>('.fm-h');
    if (el && !isTouch()) el.focus({ preventScroll: true }); else if (h) h.focus({ preventScroll: true }); else dlg.focus();
  }, []);

  useLayoutEffect(() => {
    const dlg = ref.current, s = st.current; if (!dlg) return;
    s.opener = document.activeElement; s.done = false; s.closing = false;
    dlg.dataset.state = 'closed'; dlg.showModal(); isOpen.current = true; lockPage(true); s.unfit = fitKeyboard(dlg);
    /* commit the closed pose (a style read forces it), then transition to open. No rAF: it stalls in a background tab. */
    void getComputedStyle(dlg).transform; void getComputedStyle(dlg, '::backdrop').opacity; dlg.dataset.state = 'open';
    focus(focusRef?.current);
    /* unmounted while open (a page change, or the development double mount): close without the clean-up callback */
    return () => { if (!s.done) { s.done = true; clearTimeout(s.tm); if (s.unfit) s.unfit(); lockPage(false); isOpen.current = false; if (dlg.open) dlg.close(); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- opens once, when the sheet mounts
  }, []);

  /* Escape. Chrome makes a second Escape (or one with no user activation) uncancelable and closes at once: then only clean up. */
  const onCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => { if (!e.cancelable) { setTimeout(finish, 0); return; } e.preventDefault(); if (!busy.current) close(); };
  /* a close event queued before a remount arrives while the dialog is open again: only a real close counts */
  const onClose = () => { if (!ref.current || !ref.current.open) finish(); };
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const t = e.target as Element, dlg = ref.current!;
    if (t.closest('[data-close]')) { close(); return; }
    /* a press on the backdrop (the dialog box itself, outside its content) dismisses */
    if (t === dlg && !busy.current) { const r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
  };
  /* Tab stays inside the sheet: from the last control it wraps to the first, and back */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const dlg = ref.current!;
    const f = Array.prototype.filter.call(dlg.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'), (n: HTMLButtonElement) => !n.disabled && !n.closest('[hidden]') && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden') as HTMLElement[];
    if (!f.length) return; const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || a === dlg || !dlg.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !dlg.contains(a))) { e.preventDefault(); first.focus(); }
  };

  const value = useMemo(() => ({ id, close, busy, focus, open: isOpen }), [id, close, focus]);
  const look = useArtLook(), mode = art ? look.mode : 'none';
  return (
    <dialog ref={ref} className={shellClass(mode, wide)} style={shellStyle(mode, look)} aria-labelledby={id + '-h'} onCancel={onCancel} onClose={onClose} onClick={onClick} onKeyDown={onKeyDown}>
      <SheetShell label={label} art={mode === 'none' ? undefined : art} value={value}>{children}</SheetShell>
    </dialog>
  );
}

const CloseKey = () => <button className="fm-x -mr-3 grid size-11 cursor-pointer touch-manipulation place-items-center text-ink transition-[background-color] duration-hover ease-[ease-out] [-webkit-tap-highlight-color:transparent] hover:bg-tint-1" type="button" data-close aria-label="Close"><IconX className={clsx('size-4', SVG_LINE)} /></button>;
/* the sheet's frame, shared by the dialog and the lab's still frames */
function shellClass(mode: string, wide?: boolean) { return 'fm' + (wide ? ' is-wide' : '') + (mode !== 'none' ? ' has-art is-' + mode : ''); }
function shellStyle(mode: string, look: { band: number; side: number }) { return mode === 'none' ? undefined : ({ '--fm-band': look.band + 'px', '--fm-side': look.side + 'px' } as React.CSSProperties); }
function SheetShell({ label, art, value, children }: { label: string; art?: ArtSubject; value: SheetValue; children: ReactNode }) {
  /* with a picture the small label gives way to it (the heading still names the sheet); the close key sits over it */
  const body = (
    <div className="fm-in px-8 pt-6 pb-8 phone-window:px-4 phone-window:pt-3 phone-window:pb-[calc(var(--s-5)+env(safe-area-inset-bottom))]">
        <div className="fm-top sticky top-0 z-1 -mt-2 mb-3 flex min-h-11 items-center justify-between bg-ground"><p className={LABEL}>{label}</p>
          {art ? null : <CloseKey />}</div>
        <div data-body><SheetContext.Provider value={value}>{children}</SheetContext.Provider></div>
    </div>
  );
  if (!art) return body;
  /* with a picture the sheet's face is a card inside the dialog: the card carries the ground, the hairline and (pass)
     the notches cut through it, and it scrolls with the content, so the cuts stay on the perforation */
  return <div className="fm-card"><div className="fm-xr"><CloseKey /></div><SheetArt subject={art} />{body}</div>;
}
/* a sheet drawn open on the page, for the labs: the same frame and picture, no dialog, nothing to close */
export function StillSheet({ label, wide, art, children }: { label: string; wide?: boolean; art?: ArtSubject; children: ReactNode }) {
  const look = useArtLook(), mode = art ? look.mode : 'none', id = 'fm-' + useId().replace(/[^a-z0-9]/gi, '');
  const busy = useRef(false), open = useRef(true);
  const value = useMemo<SheetValue>(() => ({ id, close: () => {}, busy, focus: () => {}, open }), [id]);
  return <div className={shellClass(mode, wide) + ' is-still'} style={shellStyle(mode, look)} data-state="open" role="group" aria-labelledby={id + '-h'}><SheetShell label={label} art={mode === 'none' ? undefined : art} value={value}>{children}</SheetShell></div>;
}
