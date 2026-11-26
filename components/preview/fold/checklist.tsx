'use client';
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { away } from '@/lib/routes';
import { EDITORS, RULES, SERVER, checkIt, lineFor } from '@/lib/hackday-server';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { EVENT } from '@/lib/day-data';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import { useForms } from '@/components/forms/forms-provider';
import { meNow, useFormsState } from '@/components/forms/store';
import { useWrite } from './motion';
import { BRING, TOOLS } from './prep';
import './checklist.css';

const PREP_KEY = 'builderday-prep';
/* the ticks live in localStorage (blocked storage: they last until the page closes) and are read as one string, so the
   page and a second tab agree */
let memory = '[]'; const listeners = new Set<() => void>();
const readPrep = () => { try { const v = localStorage.getItem(PREP_KEY); if (v) { const a = JSON.parse(v); if (Array.isArray(a)) return JSON.stringify(a.filter((x) => typeof x === 'string')); } return memory; } catch { return memory; } };
const writePrep = (ids: string[]) => { memory = JSON.stringify(ids); try { localStorage.setItem(PREP_KEY, memory); } catch { /* blocked */ } listeners.forEach((l) => l()); };
const subPrep = (cb: () => void) => { listeners.add(cb); window.addEventListener('storage', cb); return () => { listeners.delete(cb); window.removeEventListener('storage', cb); }; };

/* Get ready as a checklist: three steps in order, each ticking itself from the person's own state.
   1. Sign in with Supabase: done once signed in with a place on a city's list (from Luma, or moved from another email).
   2. Pick how you'll submit: the browser and the editor side by side at equal weight. The browser needs nothing; the
      editor needs the person's own Builder Day line, and the step is done once that editor has called (editorSeen).
   3. On the day: the host's check-in and the rules, the same both ways.
   A tick is an empty square, a ring while it is the next thing to do, filled green once done. The steps are written in
   one a `step` apart as the section arrives (the board's way), and a tick fills over a short fade when its step is done. */

type S = 'done' | 'now' | 'later';
const TOP = ['claude', 'cursor', 'vscode', 'codex'];
const lastCall = (iso: string) => { const t = Date.parse(iso); return isNaN(t) ? '' : new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

export function FoldList({ city, cityId, auto, step }: { city: string; cityId: string; auto: boolean; step: number }) {
  const forms = useForms(), fs = useFormsState(), pass = meNow()?.pass ?? null;
  const root = useRef<HTMLElement>(null);
  useWrite(root, auto ? step : 0, 0.15, auto);
  /* the editor line was copied: the page waits for the editor's call (the store asks again when the window is back) */
  const [waiting, setWaiting] = useState(false);
  /* the tools the person has ticked: kept in this browser only, so a return visit shows what is left */
  const raw = useSyncExternalStore(subPrep, readPrep, () => '[]');
  const ticked = useMemo(() => new Set<string>(JSON.parse(raw) as string[]), [raw]);
  const tick = (id: string) => { const n = new Set(ticked); if (!n.delete(id)) n.add(id); writePrep([...n]); };
  const allTools = TOOLS.every((t) => ticked.has(t.id));
  const placed = fs.signedIn && !!pass, seen = pass?.editorSeen ?? null;
  const s1: S = placed ? 'done' : 'now', s2: S = seen ? 'done' : placed ? 'now' : 'later';
  /* the place on the list wins over the city picked on the page */
  const mine = pass?.cityName || city;
  const signIn = () => { forms?.signIn({ title: 'Sign in to ' + EVENT.short }); };
  const account = () => { forms?.account('ready'); };
  const wait = auto ? '' : undefined;
  return (
    <section ref={root} id="ready" className="pf-part rd" data-part="ready" data-still="" data-sk-skip="" aria-labelledby="ready-h">
      <h2 id="ready-h" className="pf-h">Get ready</h2>
      <p className="rd-lede">Set up before {EVENT.date.replace(/ \d{4}$/, '')}, so on the day you only build.</p>
      <ol className="rd-steps">
        <li data-s={s1} data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>Sign in with Supabase<span className="rd-vh">{s1 === 'done' ? ', done' : ', next'}</span></h3>
            {!fs.signedIn
              ? <><p>It finds your place in {city} from your Luma registration.</p>
                  {forms ? <button type="button" className="rd-sb" onClick={signIn} aria-haspopup="dialog"><span className="rd-sb-mark"><SupabaseMark /></span>Continue with Supabase</button> : null}</>
              : placed
              ? <p className="rd-who">Signed in as <b>{fs.email}</b>. Your place: <b>{pass!.cityName}</b>. <button type="button" className="rd-link" onClick={account} aria-haspopup="dialog">Your account</button></p>
              : <><p className="rd-who">Signed in as <b>{fs.email}</b>. No place on a list for this email yet.</p>
                  <p className="rd-row">
                    {LUMA_LIVE ? <a className="rd-key" href={lumaHref(cityId)} {...away(lumaHref(cityId))}>Register for {city}<span className="rd-vh"> (opens in a new tab)</span></a> : null}
                    <button type="button" className="rd-link" onClick={account} aria-haspopup="dialog">Registered with another email?</button>
                  </p></>}
          </div>
        </li>
        <li data-s={s2} data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>Pick how you’ll submit<span className="rd-vh">{s2 === 'done' ? ', done: your editor is connected' : s2 === 'now' ? ', next' : ''}</span></h3>
            <p>Both work the same on the day. You can switch any time.</p>
            <div className="rd-ways">
              <article className="rd-way" data-ready={placed ? '' : undefined}>
                <header><h4>In your browser</h4><span className="rd-state">{placed ? 'Ready' : 'Nothing to set up'}</span></header>
                <p>On the day, open {mine}’s page and press Submit. Add a name, a one-line pitch and the GitHub repo.</p>
                {/* what that form asks, drawn as the editor's line is: the three fields and the key, nothing to press here */}
                <div className="rd-form" aria-hidden="true">
                  <span><i>Name</i><b>Your project</b></span>
                  <span><i>Pitch</i><b>What it does</b></span>
                  <span><i>Repo</i><b>github.com/you/project</b></span>
                  <span className="rd-form-k">Submit</span>
                </div>
              </article>
              <article className="rd-way" data-ready={seen ? '' : undefined}>
                <header><h4>From your editor</h4><span className="rd-state">{seen ? 'Connected' : 'Add the server'}</span></header>
                <EditorLine url={fs.editor} signedIn={fs.signedIn} onCopy={() => setWaiting(true)} />
                {fs.editor ? <Live s={seen ? 'on' : waiting ? 'wait' : 'idle'} seen={seen} city={mine} /> : null}
              </article>
            </div>
          </div>
        </li>
        <li data-s={allTools ? 'done' : 'now'} data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>Get your tools ready<span className="rd-vh">{allTools ? ', done' : ', next'}</span></h3>
            <p>Make these three accounts now and tick them off. On the day there is no time for sign-ups.</p>
            <ul className="rd-tools">
              {TOOLS.map((t) => (
                <li key={t.id} className="rd-tool" data-done={ticked.has(t.id) ? '' : undefined}>
                  <h4>{t.name}</h4>
                  <p>{t.why}</p>
                  <div className="rd-tool-k">
                    <a className="rd-key" href={t.href} {...away(t.href)}>{t.label}<span aria-hidden="true"> ↗</span><span className="rd-vh"> (opens in a new tab)</span></a>
                    <button type="button" className="rd-mark" aria-pressed={ticked.has(t.id)} onClick={() => tick(t.id)}><span className="rd-mark-b" aria-hidden="true" />I have this<span className="rd-vh">: {t.name}</span></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </li>
        <li data-s="later" data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>On the day</h3>
            <p>A host checks you in at the door. Then submit either way; both check the same three things:</p>
            <ul className="rd-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="rd-ex-k">Bring</p>
            <ul className="rd-rules">{BRING.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </li>
      </ol>
    </section>
  );
}

/* the person's own Builder Day line, written for the editor they pick. Signed out (or with no place) there is no line
   yet; while the server is not open, none for anyone. */
export function EditorLine({ url, signedIn, onCopy }: { url: string | null; signedIn: boolean; onCopy: () => void }) {
  const [pick, setPick] = useState('claude'), ed = EDITORS.find((e) => e.id === pick) ?? EDITORS[0];
  const [copied, setCopied] = useState<'no' | 'yes' | 'sel'>('no'), [mac, setMac] = useState(true), back = useRef(0), code = useRef<HTMLElement>(null);
  useEffect(() => () => window.clearTimeout(back.current), []);
  if (!SERVER.live) return <p className="rd-off">The server isn’t open yet. Your line shows here when it is.</p>;
  if (!url) return <p className="rd-off">{signedIn ? 'Your line comes with a place on a city’s list.' : 'Your own line shows here once you sign in.'}</p>;
  const full = lineFor(ed, url, SERVER.name);
  const LABEL = { no: 'Copy', yes: 'Copied', sel: mac ? 'Press ⌘C' : 'Press Ctrl+C' } as const;
  const copy = async () => {
    window.clearTimeout(back.current);
    let ok = false;
    try { await navigator.clipboard.writeText(full); ok = true; } catch { /* blocked: select the line instead */ }
    if (!ok) {
      const r = document.createRange(), s = window.getSelection();
      if (code.current && s) { r.selectNodeContents(code.current); s.removeAllRanges(); s.addRange(r); }
      setMac(/Mac|iP(hone|ad)/.test(navigator.platform));
    }
    setCopied(ok ? 'yes' : 'sel'); back.current = window.setTimeout(() => setCopied('no'), ok ? 1600 : 4000); onCopy();
  };
  return (
    <div className="rd-line">
      <div className="rd-eds" role="group" aria-label="Your editor">
        {TOP.map((id) => { const e = EDITORS.find((x) => x.id === id)!; return <button key={id} type="button" className="rd-ed" aria-pressed={pick === id} onClick={() => setPick(id)}>{e.name}</button>; })}
        <label className="rd-ed rd-ed-more" data-on={TOP.includes(pick) ? undefined : ''}>
          <span className="rd-vh">Another editor</span>
          <select value={TOP.includes(pick) ? '' : pick} onChange={(e) => e.target.value && setPick(e.target.value)}>
            <option value="">Other…</option>
            {EDITORS.filter((e) => !TOP.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      </div>
      <p className="rd-where">{ed.kind === 'command' ? 'Run this once in your terminal:' : 'Add this to ' + ed.where + ':'}</p>
      <div className="rd-code">
        {/* a flag never splits at its hyphens: short arguments stay whole, so a line breaks between them; the address and
            the key are long, so they may still break anywhere */}
        <pre><code ref={code}>{full.split(' ').map((t, i) => <Fragment key={i}>{i ? ' ' : ''}{t.length > 24 ? t : <span className="rd-tok">{t}</span>}</Fragment>)}</code></pre>
        <div className="rd-code-k">
          <span className="rd-priv">Private: it signs in as you.</span>
          <button type="button" className="rd-copy" onClick={copy}>
            {/* every label in one cell, the widest holding the width, so the key never grows under the cursor */}
            {(['no', 'yes', 'sel'] as const).map((k) => <span key={k} data-on={copied === k ? '' : undefined} aria-hidden={copied !== k || undefined}>{LABEL[k]}</span>)}
          </button>
          <span className="rd-vh" role="status">{copied === 'yes' ? 'Copied' : copied === 'sel' ? 'Selected. ' + LABEL.sel + ' to copy.' : ''}</span>
        </div>
      </div>
    </div>
  );
}

/* the practice call: what to ask, then the page seeing it arrive (when the person comes back to it). One region that
   stays put and holds its height, so nothing under it moves. */
export function Live({ s, seen, city }: { s: 'idle' | 'wait' | 'on'; seen: string | null; city: string }) {
  return (
    <div className="rd-live" data-s={s} role="status">
      <span className="rd-dot" aria-hidden="true" />
      <span className="rd-live-t">
        <span data-on={s === 'on' ? '' : undefined} aria-hidden={s !== 'on' || undefined}><b>Connected</b> · last call {seen ? lastCall(seen) : ''}. On the day it submits to {city}.</span>
        <span data-on={s === 'wait' ? '' : undefined} aria-hidden={s !== 'wait' || undefined}><b>Waiting for your editor.</b> Ask it: <q>{checkIt()}</q> This page sees the call when you come back to it.</span>
        <span data-on={s === 'idle' ? '' : undefined} aria-hidden={s !== 'idle' || undefined}>Then ask your editor: <q>{checkIt()}</q> It runs the whole path and enters nothing.</span>
      </span>
    </div>
  );
}
