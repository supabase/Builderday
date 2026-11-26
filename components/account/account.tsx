'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { emailOK } from '@/lib/forms';
import { CODE } from '@/lib/places';
import { EVENT } from '@/lib/day-data';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { SERVER, checkIt } from '@/lib/hackday-server';
import { Picker, Say } from '@/components/day/get-ready';
import { meKnown, meLoaded, meNow, store, useFormsState, type Me } from '@/components/forms/store';
import { useForms } from '@/components/forms/forms-provider';
import { token, ErrBox, FM_F, FM_FORM, FM_H, FM_L, FM_NOTE, FM_P, FM_T, Sheet, useSheet, useSheetId } from '@/components/forms/sheet';
import '@/components/forms/forms.css';
import type { ArtSubject } from '@/components/forms/art-config';
import './account.css';
import { at, away } from '@/lib/routes';

/* The account: a cell in the header of every page, and the sheet it opens.
   - The cell. Signed out it says "Sign in". Signed in with a place it shows the place's city code; with no place,
     "Account". Its width is kept for the longest of these, so the header never moves when /api/me answers. The first
     answer swaps the label at once (the page is still arriving); a sign-in or sign-out after that fades the new label
     in over the hover duration.
   - The sheet: the city, the date and the local start; the editor line with
     its picker and Copy, and whether the editor has called yet; "Registered on Luma with a different email?" (add it
     by a code) when there is no place; the desk for a host or a judge; Sign out. Signing in is a supabase.com account.
   Everything is drawn from /api/me after the page loads, so the first paint is the signed-out page. On a site
   without the backend the cell still signs in through the stand-in, and the sheet says there is no list here. */

/* the day, in words: "Thursday 10 December" */
const DAY = new Date(Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/* the start in the city's own clock, from the place's planned start and the city's offset */
function localStart(p: NonNullable<Me['pass']>): string {
  const t = Date.parse(p.start || '');
  if (isNaN(t)) return '';
  const d = new Date(t + (p.offset || 0) * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
function clockOf(iso: string | null | undefined): string {
  const t = Date.parse(iso || '');
  if (isNaN(t)) return '';
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export type CellState = 'out' | 'place' | 'none';
export const cellState = (signedIn: boolean, me: Me | null): CellState => (!signedIn ? 'out' : me && me.pass ? 'place' : 'none');

/* the header cell. `look` lets the lab show a state without a session. */
export function AccountCell({ here, look, onOpen }: { here?: string; look?: { state: CellState; city?: string }; onOpen?: () => void }) {
  const s = useFormsState(), forms = useForms(), me = meNow(), btn = useRef<HTMLButtonElement>(null);
  const state = look ? look.state : cellState(s.signedIn, me);
  const city = look ? look.city : me?.pass?.city;
  /* once the person is known, a later change fades the new label in. data-ready is set once, outside React, and the
     label showing then is marked seen, so only a label that arrives after it plays. */
  const loaded = meLoaded();
  useEffect(() => {
    if (look || !loaded || btn.current?.dataset.ready != null) return;
    /* two frames after the answer is drawn: the label it brought is on screen, and only a later one fades */
    let r = window.requestAnimationFrame(() => { r = window.requestAnimationFrame(() => {
      const b = btn.current; if (!b) return;
      b.querySelector<HTMLElement>('.ac-l')?.setAttribute('data-seen', '');
      b.dataset.ready = '';
    }); });
    return () => window.cancelAnimationFrame(r);
  }, [look, loaded, state]);
  /* a page without the forms (an old lab) has nothing to sign in to */
  if (!forms && !look && !onOpen) return null;
  const code = city ? CODE[city] || city.slice(0, 3).toUpperCase() : '';
  const label = state === 'out' ? 'Sign in' : state === 'place' ? code : 'Account';
  const aria = state === 'out' ? 'Sign in' : state === 'place' ? code + ', your account, on the list for ' + (me?.pass?.cityName || look?.city || code) : 'Your account';
  const open = () => {
    if (onOpen) { onOpen(); return; }
    if (forms) openAccount(forms, here);
  };
  return (
    <button ref={btn} className="ac-cell" type="button" data-state={state} aria-label={aria} aria-haspopup="dialog" onClick={open}>
      <span key={state} className="ac-l"><Person on={state !== 'out'} /><span className={state === 'place' ? undefined : 'ac-w'}>{label}</span></span>
    </button>
  );
}

/* the account's one way in, for the cell and for the preview's own presses: until /api/me has answered, wait for it,
   then sign in or open the account, whichever the person needs */
export function openAccount(forms: NonNullable<ReturnType<typeof useForms>>, here?: string) {
  meKnown().then(() => {
    if (store.session()) forms.account(here);
    else forms.signIn({ title: 'Sign in to ' + EVENT.short }).then((who) => { if (who) forms.account(here); });
  });
}

/* on a phone the cell is a 44px press with a figure, as the sound and screen keys are: an outline signed out, filled
   when signed in; a place still shows its city code */
export const Person = ({ on }: { on: boolean }) => (
  <svg className="ac-i" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="7" r="3.25" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" /><path d="M3.75 17c.6-3.3 3.1-5.25 6.25-5.25s5.65 1.95 6.25 5.25" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" /></svg>
);

/* the sheet's picture: a place prints its city's code with the globe on the city, and the stub carries the city, the
   day and the start; signed in with no place, or signed out, it prints YOU */
export function accountArt(me: Me | null): ArtSubject {
  const p = me?.pass;
  if (!p) return { word: 'You', lines: [EVENT.short, DAY_SHORT] };
  const start = localStart(p);
  return { word: CODE[p.city] || p.city.slice(0, 3), city: p.city, lines: [p.cityName, DAY_SHORT].concat(start ? [start + ' local'] : []) };
}
const DAY_SHORT = new Date(Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/* the account sheet, opened by the cell */
export function AccountSheet({ here, done }: { here?: string; done: () => void }) {
  /* Sign out closes the sheet first and signs out once it is gone, so the sheet leaves with what it showed */
  const forms = useForms(), outRef = useRef(false), st = useFormsState(), me = meNow();
  return (
    <Sheet label="Your account" wide art={accountArt(st.signedIn ? me : null)} onDone={() => { if (outRef.current) forms?.signOut(); done(); }}>
      <AccountLive here={here} outRef={outRef} />
    </Sheet>
  );
}
function AccountLive({ here, outRef }: { here?: string; outRef: RefObject<boolean> }) {
  const s = useFormsState(), me = meNow(), { close } = useSheet();
  const [moved, setMoved] = useState<Moved | null>(null);
  const forms = useForms();
  /* signed out (a sign-out elsewhere, or a session that ended): the sheet closes, gives focus back to what opened it,
     and then sign-in opens in its place, so sign-in hands focus back to the header cell too */
  if (!s.signedIn) return <AccountBody me={null} here={here} onSignOut={() => close()} onSignIn={forms ? () => { close(); window.setTimeout(() => { openAccount(forms, here); }, token('--dur-panel-exit') + 20); } : undefined} />;
  return <AccountBody me={me} email={s.email} here={here} moved={moved} onClaimed={setMoved} onSignOut={() => { outRef.current = true; close(); }} />;
}

/* a place just moved here by a claim: said once, under the heading of the place */
export type Moved = { cityName: string; replaced?: string | null };

/* the body, from a person: the lab draws it with a made-up one */
export function AccountBody({ me, email, here, onSignOut, onSignIn, claimLook, moved, onClaimed }: { me: Me | null; email?: string | null; here?: string; onSignOut: () => void; onSignIn?: () => void; claimLook?: 'closed' | 'email' | 'code' | 'done'; moved?: Moved | null; onClaimed?: (m: Moved) => void }) {
  const id = useId().replace(/[^a-z0-9]/gi, ''), sid = useSheetId(), hid = sid ? sid + '-h' : id + '-h';
  /* the claim swaps the body for the place's: focus goes to its heading, which the status line follows */
  const head = useRef<HTMLHeadingElement>(null), was = useRef(moved), city = me?.pass?.city;
  useEffect(() => { if (moved && moved !== was.current && city) head.current?.focus(); was.current = moved; }, [moved, city]);
  const who = me?.email || email || '';
  const p = me?.pass || null, desk = !!me?.roles?.length;
  const Out = <div className="ac-foot"><p className={FM_NOTE}>Signed in with Supabase as <b className="font-medium text-ink">{who}</b></p><button className={FM_T} type="button" onClick={onSignOut}>Sign out here</button></div>;
  if (!me && !who) return <><h2 id={hid} className={FM_H} tabIndex={-1}>Signed out</h2><p className={FM_P}>Sign in with your Supabase account.</p>{onSignIn ? <div className={FM_FORM}><button className="fm-b g w-full" type="button" onClick={onSignIn}>Sign in</button></div> : null}</>;

  if (!p) return (
    <>
      <h2 id={hid} className={FM_H} tabIndex={-1}>You’re signed in</h2>
      <p className={FM_P}>This account has no place on a city’s list yet, so you can vote on the day but not submit.</p>
      <p className={FM_P}>Registered on Luma and still pending or on the waitlist? Your place shows here once Luma approves you.</p>
      {store.isLive() || claimLook ? <Claim look={claimLook} onClaimed={onClaimed} /> : <p className={FM_NOTE + ' mt-6'}>This site has no lists yet, so there is no place to find.</p>}
      {LUMA_LIVE ? <p className={FM_P}><a className="underline-link" href={lumaHref()} {...away(lumaHref())}>Register for your city on Luma</a></p> : null}
      {desk ? <Desk /> : null}
      {Out}
    </>
  );

  const start = localStart(p), other = here && here !== p.city;
  return (
    <>
      <h2 ref={head} id={hid} className={FM_H} tabIndex={-1} aria-describedby={moved ? id + '-mv' : undefined}>You’re on the list for {p.cityName}</h2>
      {moved ? <p id={id + '-mv'} className={FM_P + ' mt-2'} role="status">Your place in <b>{moved.cityName}</b> is on this account now{moved.replaced ? <>, in place of {moved.replaced}</> : null}.</p> : null}
      <p className={FM_P}>{DAY}{start ? <>. Building starts at <b>{start}</b>, {p.cityName} time.</> : '.'}{p.checkedIn ? ' A host has checked you in.' : ' On the day, a host checks you in at the door.'}</p>
      {p.listedAs ? <p className={FM_NOTE + ' mt-2'}>On Luma as {p.listedAs}, added to this account.</p> : null}
      {me?.open && (other || !here) ? <p className={FM_P}><a className="underline-link" href={at('/city/' + p.city)}>Go to {p.cityName}’s page</a></p> : null}


      <section className="ac-ed gr" aria-labelledby={id + '-ed'}>
        <h3 id={id + '-ed'} className="ac-k type-label">Your editor line</h3>
        <Picker live={SERVER.live || !!me?.editor} url={me?.editor?.url || null} />
        {me?.editor ? (p.editorSeen
          ? <p className="ac-st" data-on="">Editor connected · last call {clockOf(p.editorSeen)}</p>
          : <><p className="ac-st">Not connected yet. Once the line is in your editor, say this in it to check:</p><Say say={checkIt()} /></>) : null}
      </section>
      {desk ? <Desk /> : null}
      {Out}
    </>
  );
}

const Desk = () => <p className={FM_P}><a className="underline-link" href={at('/desk')}>Open the desk</a></p>;

/* "Registered on Luma with a different email?": the address on Luma gets six digits; typed here, that email's place
   joins this Supabase account. The same answer whether or not the address is on a list (rule 7). */
function Claim({ look, onClaimed }: { look?: 'closed' | 'email' | 'code' | 'done'; onClaimed?: (m: Moved) => void }) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  const [open, setOpen] = useState(!!look && look !== 'closed'), [step, setStep] = useState<'email' | 'code' | 'done'>(look && look !== 'closed' ? look : 'email');
  const [email, setEmail] = useState(look ? 'ana@example.com' : ''), [code, setCode] = useState('');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [said, setSaid] = useState<ReactNode>('');
  const em = useRef<HTMLInputElement>(null), cd = useRef<HTMLInputElement>(null);

  const send = (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    const t = email.trim();
    if (!emailOK(t)) { setErr('Check the email. It needs an @ and a domain.'); em.current?.focus(); return; }
    setBusy(true); setErr('');
    store.claim(t).then((r) => {
      setBusy(false);
      if (!r.ok) { setErr(r.error); em.current?.focus(); return; }
      setStep('code'); setCode(''); window.setTimeout(() => cd.current?.focus(), 0);
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) { setErr('Enter all six digits from the email.'); cd.current?.focus(); return; }
    setBusy(true); setErr('');
    store.claimVerify(email.trim(), c).then((r) => {
      setBusy(false);
      if (!r.ok) { setErr(r.error); cd.current?.focus(); return; }
      /* the sheet has already swapped to the place (the store reloaded the person); it says so there */
      if (onClaimed) { onClaimed({ cityName: r.data.cityName, replaced: r.data.replaced }); return; }
      setSaid(<>Your place in <b>{r.data.cityName}</b> is on this account now{r.data.replaced ? <>, in place of {r.data.replaced}</> : null}.</>);
      setStep('done');
    });
  };

  if (!open) return <p className="mt-6"><button className={FM_T} type="button" onClick={() => { setOpen(true); window.setTimeout(() => em.current?.focus(), 0); }}>Registered on Luma with a different email? Add it</button></p>;
  if (step === 'done') return <p className={FM_P + ' mt-6'} role="status">{said || <>Your place in <b>Berlin</b> is on this account now.</>}</p>;
  if (step === 'code') return (
    <form className={FM_FORM} onSubmit={verify} noValidate>
      <p id={id + '-s'} className={FM_P + ' mt-0'} role="status">If <b>{email.trim()}</b> is on a city’s list, we sent it a six-digit code. It works for 15 minutes.</p>
      <div className={FM_F}>
        <label className={FM_L} htmlFor={id + '-c'}>Code from that email</label>
        <input ref={cd} className="fm-i ac-code" id={id + '-c'} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} enterKeyHint="go" value={code} aria-invalid={!!err || undefined} aria-describedby={id + '-s ' + id + '-e'} onChange={(e) => { setCode(e.target.value); if (err) setErr(''); }} />
        <ErrBox id={id + '-e'} msg={err} live />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className="fm-b g" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Checking…' : 'Add this email'}</button>
        <button className={FM_T} type="button" onClick={() => { setStep('email'); setErr(''); window.setTimeout(() => em.current?.focus(), 0); }}>Use a different email</button>
      </div>
    </form>
  );
  return (
    <form className={FM_FORM} onSubmit={send} noValidate>
      <div className={FM_F}>
        <label className={FM_L} htmlFor={id + '-m'}>The email you registered with on Luma</label>
        <input ref={em} className="fm-i" id={id + '-m'} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" value={email} aria-invalid={!!err || undefined} aria-describedby={id + '-e'} onChange={(e) => { setEmail(e.target.value); if (err) setErr(''); }} />
        <ErrBox id={id + '-e'} msg={err} />
        <p className={FM_NOTE}>We send a code there. Typing it adds that email’s place to your Supabase account.</p>
      </div>
      <div><button className="fm-b g" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Sending code…' : 'Send a code'}</button></div>
    </form>
  );
}
