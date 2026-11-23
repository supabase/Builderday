'use client';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { EDITOR_ROOM, HOW_TO_SUBMIT } from '@/lib/event/rule';
import { EDITORS, RULES, SERVER, SUPABASE_MCP, checkIt, lineFor, sayIt } from '@/lib/hackday-server';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { meNow, useFormsState } from '@/components/forms/store';
import { useFlapText } from '@/components/preview/fold/flap';
import './get-ready.css';

/* Get ready: what to do before the day, and the two ways to submit on it. Step 0 of How it works.
   - before: register; the two ways (the browser first, since it needs nothing set up); Supabase's server; then, only
     for the editor way, the Builder Day line and the sentence to say; the rules, for both.
   - building: the same, with the two ways first in weight and a key that opens the browser form.
   While the server is not open (SERVER.live false) no address is shown: the command cell is dashed and says so.
   The lab passes live and url to see the open state with a marked stand-in address. */

export type ReadyState = 'before' | 'building';
const H = ({ level, id, children }: { level: 2 | 3; id: string; children: string }) => (level === 3 ? <h3 id={id} className="ex-h">{children}</h3> : <h2 id={id} className="ex-h">{children}</h2>);

/* a copy key: the line goes to the clipboard and the key says so for a moment. Where the clipboard is blocked the
   line is selected instead and the key says which keys copy it. The words are read out once, from the live region. */
export function CopyKey({ text, label, from }: { text: string; label: string; from?: RefObject<HTMLElement | null> }) {
  const [said, setSaid] = useState(''), [wide, setWide] = useState('Copied'), t = useRef(0), word = useRef<HTMLSpanElement>(null);
  /* the key's word turns on flaps to "Copied" and back */
  useFlapText(word, said || 'Copy');
  useEffect(() => () => window.clearTimeout(t.current), []);
  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* clipboard blocked: select the line instead */ }
    if (!ok) {
      const el = from?.current, sel = window.getSelection();
      if (el && sel) { sel.selectAllChildren(el); }
    }
    const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    const msg = ok ? 'Copied' : 'Press ' + (mac ? '⌘C' : 'Ctrl+C');
    /* the key is sized once for its longest word, so it never narrows again under a flap */
    if (msg.length > wide.length) setWide(msg);
    setSaid(msg);
    window.clearTimeout(t.current); t.current = window.setTimeout(() => setSaid(''), 1600);
  };
  return (
    <button type="button" className="gr-copy" onClick={copy} aria-label={label}>
      <span aria-hidden="true" className="gr-copy-w"><span ref={word}>Copy</span><span className="gr-copy-g">{wide}</span></span>
      <span className="gr-live" aria-live="polite">{said}</span>
    </button>
  );
}

/* the sentence to say, with its copy key */
export function Say({ say }: { say: string }) {
  const q = useRef<HTMLQuoteElement>(null);
  return <div className="gr-cmd gr-say"><q ref={q}>{say}</q><CopyKey text={say} label="Copy the sentence" from={q} /></div>;
}

/* one editor choice for the page's lines: Supabase's and Builder Day's follow the same pick */
function useEditor() { return useState(EDITORS[0]?.id ?? 'other'); }
export function Picker({ live, url, name: server = SERVER.name, choice, chooser = true, docs, signedIn = false }: {
  live: boolean; url: string | null; name?: string; choice?: [string, (v: string) => void]; chooser?: boolean; docs?: string;
  /** signed in with no line: the line comes with a place, not with signing in */
  signedIn?: boolean;
}) {
  const own = useEditor(), [pick, setPick] = choice || own, name = useId(), pre = useRef<HTMLPreElement>(null);
  const ed = EDITORS.find((e) => e.id === pick), line = live && url ? lineFor(ed, url, server) : '';
  /* while the server is not open there is nothing to pick: the editors are named, and the line comes later */
  if (live && !url) return (
    <div className="gr-pick">
      <p className="gr-cmd" data-off="">{signedIn
        ? 'Your own line comes with a place on a city’s list. Registered on Luma with another email? Your account moves the place to this one.'
        : 'Sign in and your own line appears here. Open the link in your email, or sign in with your email on this page.'}</p>
      <p className="gr-note">It works in any editor that can add a remote MCP server. Keep the line to yourself. It signs in as you.</p>
    </div>
  );
  if (!live || !url) return (
    <div className="gr-pick">
      <p className="gr-cmd" data-off="">The server is not open yet. The line for your editor appears here when it is.</p>
      <p className="gr-note">It works in any editor that can add a remote MCP server.</p>
    </div>
  );
  return (
    <div className="gr-pick">
      {chooser ? <fieldset className="gr-eds">
        <legend className="ex-k">Your editor</legend>
        {[...EDITORS.map((e) => [e.id, e.name] as const), ['other', 'Other'] as const].map(([id, nm]) => (
          <label key={id} className="gr-ed"><input type="radio" name={name} value={id} checked={pick === id} onChange={() => setPick(id)} /><span>{nm}</span></label>
        ))}
      </fieldset> : null}
      <div className="gr-cmd" data-kind={ed?.kind}><pre ref={pre} tabIndex={ed?.kind === 'file' ? 0 : undefined} role={ed?.kind === 'file' ? 'region' : undefined} aria-label={ed?.kind === 'file' ? 'The lines for ' + ed.name : undefined}><code>{ed?.kind === 'command' ? words(line) : line}</code></pre><CopyKey text={line} label={ed ? 'Copy the line for ' + ed.name : 'Copy the address'} from={pre} /></div>
      <p className="gr-note">
        {ed ? <>{ed.kind === 'command' ? 'Run it in a terminal.' : <>Add it to <code>{ed.where}</code> and save. If your editor asks to allow or start the server, say yes.</>} <a href={docs || ed.docs} target="_blank" rel="noreferrer">{docs ? 'Supabase’s guide' : ed.name + '’s guide'}</a></> : 'Give this address to any editor that can add a remote MCP server.'}
      </p>
    </div>
  );
}

/* when the editor last called, in the visitor's clock: "18 Nov, 16:54" */
const lastCall = (iso: string) => { const t = Date.parse(iso); return isNaN(t) ? '' : new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

/* a command wraps between its words, never inside a flag ("--header" would split at its hyphens); the address and
   the key are long, so they may still break anywhere. The text is the same, so a copy by hand reads the same. */
function words(line: string) {
  return line.split(/( )/).map((t, i) => (t === ' ' || t.length > 24 ? t : <span key={i} className="gr-tok">{t}</span>));
}

export function GetReady({ state = 'before', city, cityId, live = SERVER.live, url: url0, compact = false, id = 'ready', level = 2, onBrowser, register = true, onSignIn }: {
  state?: ReadyState; city?: string; cityId?: string; live?: boolean; url?: string | null; compact?: boolean; id?: string; level?: 2 | 3; onBrowser?: () => void;
  /** where the page can sign a person in: "Sign in to get your line" under the empty line */
  onSignIn?: () => void;
  /** the register step; off where the page already has its own register link just above */
  register?: boolean;
}) {
  /* the address: the one a lab passes, or the person's own once signed in (never the bare base: it needs their key) */
  const forms = useFormsState(), mine = forms.editor, url = url0 !== undefined ? url0 : mine, signedIn = url0 === undefined && forms.signedIn;
  /* a person with a place: their own city in the first step, and whether their editor has called */
  const pass = url0 === undefined ? meNow()?.pass ?? null : null;
  const say = sayIt(city), now = state === 'building', reg = register && !now, n = (i: number) => i + (reg ? 1 : 0), choice = useEditor();
  const where = city ? city + '’s page' : 'your city’s page';
  return (
    <section className="ex gr" data-compact={compact ? '' : undefined} data-state={state} aria-labelledby={id + '-h'}>
      <div className="ex-top"><H level={level} id={id + '-h'}>{now ? 'Submit your project' : 'Get ready'}</H></div>
      <ol className="gr-steps">
        {reg ? (
          <li className="gr-step"><span className="gr-n" aria-hidden="true">1</span>
            {pass
              ? <div className="gr-body"><p className="ex-t">You’re on the list for {pass.cityName}</p><p className="gr-note">On the day, type the code on the screen in the room, and you can submit.</p></div>
              : <div className="gr-body"><p className="ex-t">Register for {city ?? 'your city'} on Luma</p>
                  {LUMA_LIVE ? <a className="gr-a" href={lumaHref(cityId)}>Register</a> : <p className="gr-cmd" data-off="">The Luma pages are not open yet.</p>}
                  <p className="gr-note">{HOW_TO_SUBMIT}</p></div>}
          </li>
        ) : null}
        {/* the two ways in, side by side and the browser first: it needs nothing set up, so the editor never reads as the only way */}
        <li className="gr-step" data-now={now ? '' : undefined}><span className="gr-n" aria-hidden="true">{n(1)}</span>
          <div className="gr-body"><p className="ex-t">{now ? 'Submit in your browser or from your editor' : 'On the day, submit in your browser or from your editor'}</p>
            <ul className="gr-ways">
              <li className="gr-way"><p className="ex-k">In the browser</p>
                <p className="gr-note">On {where}, type the code on the screen in the room, then your project’s name, a one-line pitch and its GitHub repository. Nothing to set up.</p>
                {now && onBrowser ? <button type="button" className="gr-a" onClick={onBrowser}>Submit in the browser</button> : null}</li>
              <li className="gr-way"><p className="ex-k">From your editor</p>
                <p className="gr-note">Say one sentence and your editor sends the name, the pitch and the repository for you. It needs the Builder Day server{now ? ', below.' : ', added below before the day.'}</p></li>
            </ul>
            <p className="gr-note">Both ask for the code on the screen in the room, and both run the same checks.</p></div>
        </li>
        <li className="gr-step"><span className="gr-n" aria-hidden="true">{n(2)}</span>
          <div className="gr-body"><p className="ex-t">Add Supabase’s server so your editor can set up your database</p>
            <Picker live url={SUPABASE_MCP.url} name={SUPABASE_MCP.name} choice={choice} docs={SUPABASE_MCP.docs} />
            <p className="gr-note">The first time, it opens Supabase in your browser to sign in.</p></div>
        </li>
        <li className="gr-step"><span className="gr-n" aria-hidden="true">{n(3)}</span>
          <div className="gr-body"><p className="ex-k">Only to submit from your editor</p><p className="ex-t">{url && pass ? 'Add your own Builder Day line' : 'Add the Builder Day server'}</p><Picker live={live} url={url} choice={choice} chooser={false} signedIn={signedIn} />
            {live && !url && onSignIn ? <p className="gr-note"><button type="button" className="gr-link" aria-haspopup="dialog" onClick={onSignIn}>{signedIn ? 'Open your account' : 'Sign in to get your line'}</button></p> : null}
            {url && pass ? (pass.editorSeen
              ? <p className="gr-note gr-seen" data-on="">Editor connected · last call {lastCall(pass.editorSeen)}</p>
              : <><p className="gr-note gr-seen">Not connected yet. Once the line is in your editor, say this in it to check:</p><Say say={checkIt()} /></>) : null}</div>
        </li>
        <li className="gr-step"><span className="gr-n" aria-hidden="true">{n(4)}</span>
          <div className="gr-body">
            <p className="ex-k">Only to submit from your editor</p>
            <p className="ex-t">{now ? 'Say it now' : 'On the day, say it'}</p>
            <Say say={say} />
            <p className="gr-note">Your editor takes the name, the pitch and the repository from the project it’s in and sends them. It answers with your project’s link, where you can add a picture.</p>
          </div>
        </li>
        <li className="gr-step"><span className="gr-n" aria-hidden="true">{n(5)}</span>
          <div className="gr-body"><p className="ex-t">What is checked, both ways</p><ul className="gr-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul></div>
        </li>
      </ol>
    </section>
  );
}

/* The submit sheet's second part, under the browser form: from your editor. */
export function FromEditor({ city, live = SERVER.live, rules = true, label = 'From your editor' }: { city?: string; live?: boolean; rules?: boolean; label?: string | null }) {
  const say = sayIt(city), mine = useFormsState().editor;
  return (
    <div className="ex gr gr-door">
      {label ? <p className="ex-k">{label}</p> : null}
      {live
        ? <><Say say={say} />
            <p className="gr-note">Say it in your editor with the Builder Day server added. {EDITOR_ROOM} It checks your repository against the rules and sends your entry, then answers with your project’s link, where you add a picture.</p>
            {mine ? <details className="gr-add"><summary>Not added yet? Your line</summary><Picker live url={mine} /></details> : null}</>
        : <p className="gr-cmd" data-off="">The server is not open yet. Submit in the browser below.</p>}
      {rules ? <p className="gr-note">The rules, for both ways in: {RULES.join(' ')}</p> : null}
    </div>
  );
}
