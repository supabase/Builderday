'use client';
import { useEffect, useRef } from 'react';
import type { SceneRow, StageAction } from '@/lib/stage/types';

/* The keys a laptop drives the wall with, the ones people already know from slides:
   Right, Space, Page Down or N for next (so a clicker works); Left, Page Up or P for back; a number then Enter to jump;
   B to blank; Q for the QR; ? for the list; F for full screen (anyone may press F, even on a wall that is not driven).
   A press that asks first (Start building, Close voting) waits for Enter, and Esc cancels it. Keys are never animated:
   each one is a cut or a step. In a framed wall (the lab) the keys are taken only while nothing else has focus. */

export function useStageKeys(o: {
  on: boolean; framed: boolean; deck: SceneRow[];
  onAction: (a: StageAction) => void; onList: () => void;
  ask: unknown; onConfirm: () => void; onCancel: () => void;
  /* the number typed so far ('' when none), for the wall to show */
  onNum?: (n: string) => void;
}) {
  const ref = useRef(o), num = useRef(''), drop = useRef(0);
  useEffect(() => { ref.current = o; });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const c = ref.current;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      /* a field, a select or a button of the lab keeps its own keys */
      if (t && t.closest('input, textarea, select, [contenteditable], .lab, .rm')) return;
      if ((e.key === 'f' || e.key === 'F') && !c.framed) {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {});
        return;
      }
      if (!c.on) return;
      if (c.ask) {
        if (e.key === 'Enter') { e.preventDefault(); c.onConfirm(); }
        /* a clicker has no Esc: its Back cancels the question too */
        else if (['Escape', 'ArrowLeft', 'PageUp', 'p', 'P'].includes(e.key)) { e.preventDefault(); c.onCancel(); }
        return;
      }
      const setNum = (v: string) => { num.current = v; window.clearTimeout(drop.current); if (v) drop.current = window.setTimeout(() => setNum(''), 2000); ref.current.onNum?.(v); };
      if (/^[0-9]$/.test(e.key)) { setNum((num.current + e.key).slice(-2)); return; }
      if (e.key === 'Enter' && num.current) { e.preventDefault(); c.onAction({ t: 'jump', i: Number(num.current) - 1 }); setNum(''); return; }
      if (num.current) setNum('');
      if (e.repeat) return;
      switch (e.key) {
        case 'ArrowRight': case ' ': case 'PageDown': case 'n': case 'N': e.preventDefault(); c.onAction({ t: 'next' }); break;
        case 'ArrowLeft': case 'PageUp': case 'p': case 'P': e.preventDefault(); c.onAction({ t: 'back' }); break;
        case 'b': case 'B': case '.': e.preventDefault(); c.onAction({ t: 'blank' }); break;
        case 'q': case 'Q': e.preventDefault(); c.onAction({ t: 'qr' }); break;
        case '?': e.preventDefault(); c.onList(); break;
        case 'Escape': c.onCancel(); break;
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); window.clearTimeout(drop.current); };
  }, []);
}
