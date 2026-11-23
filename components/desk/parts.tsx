'use client';
/* The desk's small parts: a press that says how it went, the question before a step that cannot be undone, copying a
   link, and the status line under a control. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeskAct, DeskResult } from '@/lib/event/desk';

/* One polite live region for the whole desk, so a list of rows does not carry a live region each. Every press's
   line is spoken through it; the visible line stays under its own control. */
let speak: (t: string) => void = () => {};
export function Announcer() {
  const [t, setT] = useState('');
  useEffect(() => { speak = (x) => { setT(''); requestAnimationFrame(() => setT(x)); }; return () => { speak = () => {}; }; }, []);
  return <p className="sr-only" role="status" aria-live="polite">{t}</p>;
}

/* one control's press: busy while it runs, then a line saying what happened (or why not) */
export function usePress(act: DeskAct) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ key: string; text: string; error: boolean } | null>(null);
  const run = useCallback(async (key: string, action: string, p: Record<string, unknown>, done?: (r: DeskResult) => string | void): Promise<DeskResult> => {
    /* the pressed key is disabled while it works, which drops focus to the page; it gets focus back after */
    const from = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setBusy(key); setSaid(null);
    let r: DeskResult;
    try { r = await act(action, p); } catch { r = { ok: false, error: 'The desk could not be reached. Check the connection and try again.' }; }
    setBusy(null);
    if (from) requestAnimationFrame(() => { if (from.isConnected && (document.activeElement === document.body || document.activeElement == null)) from.focus({ preventScroll: true }); });
    if (!r.ok) { const t = r.error || 'That did not work. Try again.'; setSaid({ key, text: t, error: true }); speak(t); }
    else { const t = done?.(r); if (t) { setSaid({ key, text: t, error: false }); speak(t); } }
    return r;
  }, [act]);
  const say = useCallback((key: string, text: string, error = false) => { setSaid({ key, text, error }); speak(text); }, []);
  return { busy, said, run, say };
}

/* the line under a control; spoken once through the Announcer, so it carries no live region of its own */
export function Status({ said, k }: { said: { key: string; text: string; error: boolean } | null; k: string }) {
  const s = said && said.key === k ? said : null;
  return <p className={'dk-status' + (s?.error ? ' is-error' : '')}>{s ? s.text : ''}</p>;
}

/* The question before a step that cannot be undone, on a native modal <dialog>: focus moves into it and comes back
   to the key that opened it. It appears without motion. */
export type Ask = { title: string; text: string; yes: string; danger?: boolean; run: () => void };
export function useAsk() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const ref = useRef<HTMLDialogElement>(null), back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (ask && !d.open) { back.current = document.activeElement as HTMLElement | null; d.showModal(); }
    if (!ask && d.open) d.close();
  }, [ask]);
  /* focus goes back to the key that asked; when that key is gone (its row was removed), to the section's heading */
  const close = () => {
    setAsk(null);
    const from = back.current, sec = from?.closest('.dk-sec')?.querySelector<HTMLElement>('.dk-h2');
    requestAnimationFrame(() => {
      if (from && from.isConnected) return from.focus();
      if (sec && sec.isConnected) { sec.tabIndex = -1; sec.focus(); }
    });
  };
  const node = (
    <dialog ref={ref} className="dk-ask" aria-labelledby="dk-ask-h" aria-describedby="dk-ask-p" onClose={() => { if (ask) close(); }} onCancel={(e) => { e.preventDefault(); close(); }}>
      {ask ? (
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); const r = ask.run; close(); r(); }}>
          <h2 id="dk-ask-h">{ask.title}</h2>
          <p id="dk-ask-p">{ask.text}</p>
          <div className="dk-acts-row">
            <button type="submit" className={'fm-b' + (ask.danger ? ' is-danger' : '')}>{ask.yes}</button>
            <button type="button" className="fm-b" autoFocus onClick={close}>Cancel</button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
  return { ask: setAsk, node };
}

/* copy a link; when the clipboard is refused, the link is shown to copy by hand */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function Sec({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="dk-sec" aria-labelledby={id}>
      <h2 className="dk-h2" id={id}>{title}{aside ? <small>{aside}</small> : null}</h2>
      {children}
    </section>
  );
}

export const IconGo = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>;
export const IconOut = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4h8v8M16 4 5 15" /></svg>;

/* how long ago, in plain words */
export function ago(ms: number | null, now: number): string {
  if (ms == null) return '';
  const m = Math.round((now - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  return Math.round(h / 24) + ' d ago';
}

/* Unsaved work on a form (Format, a place's settings): the form says so while it has edits, and the desk asks before
   another tab or level would throw them away. One form at a time is open, so one name is enough. */
let unsavedName: string | null = null;
export const unsavedNow = () => unsavedName;
/* a form that has just saved lets go at once, before the move it makes next */
export const clearUnsaved = () => { unsavedName = null; };
export function useUnsaved(name: string, changed: boolean) {
  useEffect(() => {
    if (!changed) return;
    unsavedName = name;
    const stay = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', stay);
    return () => { if (unsavedName === name) unsavedName = null; window.removeEventListener('beforeunload', stay); };
  }, [name, changed]);
}
