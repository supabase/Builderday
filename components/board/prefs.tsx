'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { click, unlock } from '@/components/wheel/click';

/* The visitor's two switches, remembered per browser: sound (a click for a step, after a press only) and the screen
   (off gives the same page plain: no lines, grain, colour edges or sound). Both start on. */

const KEYS = { sound: 'hackday-sound', screen: 'hackday-screen' } as const;
type Key = keyof typeof KEYS;
const subs = new Set<() => void>();
const read = (k: Key) => { try { return localStorage.getItem(KEYS[k]) !== 'off'; } catch { return true; } };
function write(k: Key, on: boolean) { try { localStorage.setItem(KEYS[k], on ? 'on' : 'off'); } catch { /* storage blocked */ } subs.forEach((f) => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function usePref(k: Key): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => read(k), () => true);
  return [on, useCallback((v: boolean) => write(k, v), [k])];
}

/* a step's click: at most one in `gap` ms, only when sound is on in the config and for the visitor, and only once a
   press has unlocked audio (the browser's rule, and ours) */
let last = 0;
export function step(allowed: boolean, gap = 220) {
  if (!allowed || !read('sound') || !read('screen')) return;
  const t = performance.now(); if (t - last < gap) return; last = t; click();
}
/* call from a press: from then on, steps can be heard. With sound or the screen off there is nothing to hear, so no
   audio is set up (making it costs a long frame on the first press) */
export function wake() { if (read('sound') && read('screen')) unlock(); }

/* the same sound switch, small, for the header row: the mute sits where the clicks are heard, not only in the footer */
export function SoundKey() {
  const [snd, setSnd] = usePref('sound'), [scr] = usePref('screen');
  if (!scr) return null;
  /* words on a wide screen; on a phone a speaker, struck through when off, in the same 44px press */
  return (
    <button type="button" className="hr-snd" aria-label="Sound" aria-pressed={snd} onClick={() => { wake(); setSnd(!snd); }}>
      <span className="hr-snd-w" aria-hidden="true">Sound<span className="hr-snd-s">{snd ? 'on' : 'off'}</span></span>
      <svg className="hr-snd-i" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />{snd ? <path d="M13 7a4 4 0 0 1 0 6M15.5 4.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.5" /> : <path d="M13 7l5 6M18 7l-5 6" fill="none" stroke="currentColor" strokeWidth="1.5" />}</svg>
    </button>
  );
}

/* the Screen switch's change can be dressed (the footer's white dot): the dresser calls commit when the screen is dark */
type ScreenFx = (next: boolean, commit: () => void) => void;
let screenFx: ScreenFx | null = null;
export function setScreenFx(fx: ScreenFx | null) { screenFx = fx; }

export function Switches({ sound }: { sound: boolean }) {
  const [snd, setSnd] = usePref('sound'), [scr] = usePref('screen');
  if (!sound) return null;
  return (
    <div className="sw" role="group" aria-label="Page settings">
      {sound ? <button type="button" className="sw-b" aria-label="Sound" aria-pressed={snd && scr} disabled={!scr} title={scr ? undefined : 'Sound needs the screen on'} onClick={() => { wake(); setSnd(!snd); }}>Sound<span className="sw-s">{scr ? (snd ? 'on' : 'off') : 'needs Screen'}</span></button> : null}
    </div>
  );
}
