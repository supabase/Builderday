'use client';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { RESEND_S, emailOK } from '@/lib/forms';
import { emit, followAgain, store, type Session } from './store';
import { FM_ACT, FM_F, FM_FORM, FM_H, FM_L, FM_NOTE, FM_P, FM_T, ErrBox, Sheet, useSheet } from './sheet';
import * as supa from './supabase';
import { EMAIL_FALLBACK, SIGNIN_ELSEWHERE, SIGNIN_WHY, SIGNIN_WITH } from '@/lib/signin';
import { EVENT } from '@/lib/day-data';
import type { ArtSubject } from './art-config';

/* Sign-in: with a supabase.com account (owner, 2026-11-25). Used on its own and as the step before a first vote or a
   submit. On supabase.com the page shares Supabase's own login (./supabase.ts): signed in there, the sheet offers
   "Continue as …" (and the page has usually signed in already, see follow() in store.ts); signed out there, it opens
   supabase.com's sign-in or sign-up in a new tab and carries on by itself the moment the login appears.
   Elsewhere: a stand-in account on a dev server, the email and six-digit code only while its emergency switch is on,
   and otherwise a line saying where signing in works. Labs and sites without a backend sign in a stand-in at once. */
export type SignInOpts = { label?: string; title?: string; reason?: string; verb?: string; city?: string; cityName?: string; room?: boolean };
export type Who = { handle: string; email: string };

/* the sheet's picture: what the sheet is for, in characters (SIGN IN, VOTE, SUBMIT), the globe on the city when there is one */
export function signInArt(o: SignInOpts): ArtSubject {
  return { word: o.label || 'Sign in', city: o.city || null, lines: [EVENT.short, DAY_SHORT, o.cityName || 'Fourteen cities'] };
}
const DAY_SHORT = new Date(Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/* the email fallback applies only on a live site where the shared login cannot reach */
const useEmail = () => store.isLive() && EMAIL_FALLBACK && supa.mode() === 'away';

export function SignInSheet({ o, done }: { o: SignInOpts; done: (who: Who | null) => void }) {
  const result = useRef<Who | null>(null);
  const [email] = useState(useEmail);
  /* a code sent in the last ten minutes picks up where the person left off */
  const [start] = useState(() => { const sent = store.codeSent(); return sent && Date.now() - sent.at < 600000 ? { step: 'code' as const, email: sent.email } : { step: 'email' as const, email: store.lastEmail() || '' }; });
  const emRef = useRef<HTMLInputElement>(null), firstDigit = useRef<HTMLInputElement>(null), first = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const onSignedIn = (s: Session) => { result.current = { handle: s.handle, email: s.email }; };
  return (
    <Sheet label={o.label || 'Sign in'} art={signInArt(o)} focusRef={email ? (start.step === 'code' ? firstDigit : emRef) : first} onDone={() => done(result.current)}>
      {email ? <EmailBody o={o} start={start} emRef={emRef} firstDigit={firstDigit} onSignedIn={onSignedIn} /> : <SignInBody o={o} firstRef={first} onSignedIn={onSignedIn} />}
    </Sheet>
  );
}

/* the Supabase account: Continue as …, or Sign in / Create an account on supabase.com */
export function SignInBody({ o, firstRef, onSignedIn }: { o: SignInOpts; firstRef?: React.RefObject<HTMLButtonElement | HTMLInputElement | null>; onSignedIn: (s: Session) => void }) {
  const { id, close, busy: busyRef, open: openRef } = useSheet();
  const live = store.isLive();
  const [m] = useState<supa.Mode | 'standin'>(() => (live ? supa.mode() : 'standin'));
  /* undefined while looking, null: nobody signed in on supabase.com */
  const [acct, setAcct] = useState<supa.Account | null | undefined>(m === 'shared' || m === 'fake' ? undefined : null);
  const [waiting, setWaiting] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [typed, setTyped] = useState(''), [typedErr, setTypedErr] = useState('');

  useEffect(() => {
    if (m !== 'shared' && m !== 'fake') return;
    let on = true;
    const look = () => { supa.current().then((a) => { if (on) setAcct(a); }); };
    look();
    const off = supa.watch(look);
    return () => { on = false; off(); };
  }, [m]);

  const finish = (a: supa.Account) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr(''); followAgain();
    store.supabaseIn(a).then((r) => {
      busyRef.current = false; setBusy(false); if (!openRef.current) return;
      if (!r.ok || !r.session) { setWaiting(false); setErr(r.error || 'Signing in did not go through. Try again.'); return; }
      onSignedIn(r.session); emit(); close();
    });
  };
  /* back from supabase.com's tab: the login is there, so finish without another press */
  useEffect(() => { if (waiting && acct) finish(acct); });

  const go = (kind: 'in' | 'up') => { setErr(''); supa.openSupabase(kind); setWaiting(true); };
  const stand = (e: FormEvent) => {
    e.preventDefault();
    const t = typed.trim().toLowerCase();
    if (!emailOK(t)) { setTypedErr('Check the email. It needs an @ and a domain.'); (firstRef?.current as HTMLInputElement | null)?.focus(); return; }
    setTypedErr(''); supa.fakeSignIn(t); finish({ email: t, token: 'fake.' + t });
  };
  const lede = (o.reason ? o.reason + ' ' : '');
  const setFirst = (el: HTMLButtonElement | HTMLInputElement | null) => { if (firstRef) firstRef.current = el; };

  if (m === 'away') return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{o.title || SIGNIN_WITH}</h2>
      <p className={FM_P} id={id + '-p'}>{lede}{SIGNIN_ELSEWHERE}</p>
      <div className={FM_FORM}><div className={FM_ACT}><button ref={setFirst} className="fm-b w-full" type="button" onClick={close}>Close</button></div></div>
    </>
  );

  if (m === 'standin') return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{o.title || SIGNIN_WITH}</h2>
      <p className={FM_P} id={id + '-p'}>{lede}{SIGNIN_WHY}</p>
      <div className={FM_FORM}>
        <button ref={setFirst} className="fm-b g w-full" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => finish({ email: 'builder@example.com', token: '' })}>{busy ? 'Signing in…' : SIGNIN_WITH}</button>
        <div className={FM_ACT}><button className={FM_T} type="button" onClick={() => finish({ email: 'builder@example.com', token: '' })}>No account? Create one on supabase.com</button></div>
      </div>
    </>
  );

  if (m === 'fake' && !acct) return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{o.title || SIGNIN_WITH}</h2>
      <p className={FM_P} id={id + '-p'}>{lede}On the dev server a stand-in plays your Supabase account: type any email.</p>
      <form className={FM_FORM} noValidate onSubmit={stand}>
        <div className={FM_F}>
          <label className={FM_L} htmlFor={id + '-fe'}>Stand-in Supabase email</label>
          <input ref={setFirst} className="fm-i" id={id + '-fe'} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="you@example.com"
            aria-describedby={id + '-fee'} aria-invalid={typedErr ? true : undefined} value={typed} readOnly={busy} onChange={(e) => { setTyped(e.target.value); if (typedErr) setTypedErr(''); }} />
          <ErrBox id={id + '-fee'} msg={typedErr || err} live />
        </div>
        <button className="fm-b g w-full" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Signing in…' : SIGNIN_WITH}</button>
      </form>
    </>
  );

  /* on supabase.com, or the stand-in with an account */
  return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{o.title || SIGNIN_WITH}</h2>
      <p className={FM_P} id={id + '-p'}>{lede}{acct ? <>You are signed in on supabase.com as <b>{acct.email}</b>.</> : SIGNIN_WHY}</p>
      <div className={FM_FORM}>
        {acct ? (
          <>
            <button ref={setFirst} className="fm-b g w-full" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => finish(acct)}>{busy ? 'Signing in…' : 'Continue as ' + acct.email}</button>
            <p className={FM_NOTE}>Not you? Sign out on supabase.com, then sign in there with your own account.</p>
          </>
        ) : (
          <>
            <button ref={setFirst} className="fm-b g w-full" type="button" disabled={acct === undefined || busy} aria-busy={busy || undefined} onClick={() => go('in')}>{busy ? 'Signing in…' : SIGNIN_WITH}</button>
            <div className={FM_ACT}><button className={FM_T} type="button" onClick={() => go('up')}>No account? Create one on supabase.com</button></div>
          </>
        )}
        <ErrBox id={id + '-se'} msg={m === 'fake' ? '' : err} live />
        <p className={FM_NOTE + (waiting && !acct ? '' : ' sr-only')} role="status">{waiting && !acct ? 'Finish on supabase.com in the new tab. This sheet carries on by itself once you are signed in.' : ''}</p>
      </div>
    </>
  );
}

/* the emergency fallback (EMAIL_SIGNIN=on): an email, then six digits */
function EmailBody({ o, start, emRef, firstDigit, onSignedIn }: { o: SignInOpts; start: { step: 'email' | 'code'; email: string }; emRef: React.RefObject<HTMLInputElement | null>; firstDigit: React.RefObject<HTMLInputElement | null>; onSignedIn: (s: Session) => void }) {
  const { id, close, busy: busyRef, open: openRef } = useSheet();
  const [step, setStep] = useState(start.step), [email, setEmail] = useState(start.email), [value, setValue] = useState(start.email);
  const [emErr, setEmErr] = useState(''), [sending, setSending] = useState(false);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']), [bad, setBad] = useState<boolean[]>([false, false, false, false, false, false]);
  const [codeErr, setCodeErr] = useState(''), [checking, setChecking] = useState(false), [status, setStatus] = useState('');
  const [cool, setCool] = useState(0), [coolKey, setCoolKey] = useState(0);
  const ins = useRef<(HTMLInputElement | null)[]>([]);
  /* the resend countdown runs while the code step shows */
  useEffect(() => {
    if (step !== 'code') return;
    const sent = store.codeSent(), end = (sent ? sent.at : Date.now()) + RESEND_S * 1000;
    const tick = () => { const n = Math.ceil((end - Date.now()) / 1000); setCool(Math.max(0, n)); if (n <= 0) clearInterval(iv); };
    const iv = window.setInterval(tick, 1000); tick();
    return () => clearInterval(iv);
  }, [step, coolKey]);

  /* email: checked on submit and on blur; once wrong, it clears the moment it is right */
  const checkEmail = (v = value) => { const t = v.trim(), m = !t ? 'Enter your email so we can send the code.' : emailOK(t) ? '' : 'Check the email. It needs an @ and a domain.'; setEmErr(m); return !m; };
  const showCode = () => { setDigits(['', '', '', '', '', '']); setBad([false, false, false, false, false, false]); setCodeErr(''); setStep('code'); setCoolKey((k) => k + 1); };
  const onEmail = (e: FormEvent) => {
    e.preventDefault(); if (busyRef.current) return;
    if (!checkEmail()) { emRef.current?.focus(); return; }
    const addr = value.trim(); setEmail(addr);
    busyRef.current = true; setSending(true);
    Promise.resolve(store.sendCode(addr)).then((r) => {
      busyRef.current = false; setSending(false); if (!openRef.current) return;
      const res = r as { ok: boolean; error?: string; wait?: number } | undefined;
      /* a code went to this address moments ago: it still works, so ask for it; the countdown runs from when it was sent */
      if (res && res.ok === false && res.wait) { showCode(); setStatus('We sent a code to ' + addr + ' a moment ago. It still works.'); requestFocus(0); return; }
      if (res && res.ok === false) { setEmErr(res.error || 'We could not send a code. Try again.'); emRef.current?.focus(); return; }
      showCode(); requestFocus(0);
    });
  };
  /* focus after the step has rendered */
  const focusNext = useRef<number | null>(null);
  const requestFocus = (i: number) => { focusNext.current = i; };
  useEffect(() => { if (focusNext.current != null) { ins.current[focusNext.current]?.focus(); focusNext.current = null; } });

  const verify = (d: string[]) => {
    if (busyRef.current) return;
    const code = d.join('');
    if (code.length < 6) { setBad(d.map((x) => !x)); setCodeErr('Enter all six digits from the email.'); const k = d.findIndex((x) => !x); ins.current[k < 0 ? 0 : k]?.focus(); return; }
    busyRef.current = true; setChecking(true);
    store.verifyCode(email, code).then((r: { ok: boolean; session?: Session; error?: string }) => {
      busyRef.current = false; setChecking(false);
      if (!r.ok || !r.session) { setDigits(['', '', '', '', '', '']); setBad([true, true, true, true, true, true]); setCodeErr(r.error || 'That code does not match. Check the email and try again, or send a new code.'); ins.current[0]?.focus(); return; }
      onSignedIn(r.session); emit(); close();
    });
  };
  /* code: one digit per box, auto-advance; a paste or the keyboard's suggested code fills all six */
  const fill = (from: number, ds: string, base: string[]) => { const d = base.slice(); ds.slice(0, 6 - from).split('').forEach((ch, k) => { d[from + k] = ch; }); ins.current[Math.min(5, from + ds.length)]?.focus(); return d; };
  const clearErr = () => { setBad([false, false, false, false, false, false]); setCodeErr(''); };
  const onDigit = (i: number, raw: string) => {
    if (busyRef.current) return;
    const ds = raw.replace(/\D/g, ''); clearErr();
    let d = digits.slice();
    if (ds.length > 1) d = fill(i, ds, d); else { d[i] = ds; if (ds && i < 5) ins.current[i + 1]?.focus(); }
    setDigits(d);
    if (d.join('').length === 6) verify(d);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); const d = digits.slice(); d[i - 1] = ''; setDigits(d); ins.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); ins.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); ins.current[i + 1]?.focus(); }
  };
  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const ds = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, ''); if (!ds) return;
    e.preventDefault(); if (busyRef.current) return; clearErr();
    const d = fill(ds.length >= 6 ? 0 : i, ds, digits); setDigits(d); if (d.join('').length === 6) verify(d);
  };
  const resend = () => {
    if (busyRef.current || cool > 0) return; setCool(1);
    store.sendCode(email).then((r) => {
      if (!openRef.current) return;
      const res = r as { ok: boolean; error?: string; wait?: number } | undefined;
      if (res && res.ok === false) { setCoolKey((k) => k + 1); if (res.wait) setStatus('The last code sent to ' + email + ' still works.'); else setCodeErr(res.error || 'We could not send a code. Try again.'); return; }
      setDigits(['', '', '', '', '', '']); clearErr(); setStatus('We sent a new code to ' + email + '.'); setCoolKey((k) => k + 1); ins.current[0]?.focus(); });
  };
  const back = () => { if (busyRef.current) return; store.forgetCode(); setStep('email'); window.setTimeout(() => { emRef.current?.focus(); emRef.current?.select(); }, 0); };

  return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{step === 'email' ? (o.title || 'Sign in with your email') : 'Enter the code'}</h2>
      <p className={FM_P} id={id + '-p'}>{step === 'email' ? (o.reason ? o.reason + ' ' : '') + 'We email you a six-digit code. No password.' : <>We sent a six-digit code to <b>{email}</b>.</>}</p>
      <form className={FM_FORM} data-step="email" hidden={step !== 'email'} noValidate onSubmit={onEmail}>
        <div className={FM_F}>
          <label className={FM_L} htmlFor={id + '-em'}>Email</label>
          <input ref={emRef} className="fm-i" id={id + '-em'} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" placeholder="you@example.com" aria-describedby={id + '-ee'}
            value={value} readOnly={sending} aria-invalid={emErr ? true : undefined}
            onChange={(e) => { setValue(e.target.value); if (emErr) checkEmail(e.target.value); }} onBlur={() => { if (value.trim()) checkEmail(); }} />
          <ErrBox id={id + '-ee'} msg={emErr} />
        </div>
        <button className="fm-b g w-full" type="submit" disabled={sending} aria-busy={sending || undefined}>{sending ? 'Sending code…' : 'Send code'}</button>
      </form>
      <form className={FM_FORM} data-step="code" hidden={step !== 'code'} noValidate onSubmit={(e) => { e.preventDefault(); verify(digits); }}>
        <fieldset className="fm-code" id={id + '-cd'} aria-describedby={id + '-p ' + id + '-ce'} aria-busy={checking || undefined}>
          <legend className="sr-only">Six-digit code</legend>
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { ins.current[i] = el; if (i === 0) firstDigit.current = el; }} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={i ? 'off' : 'one-time-code'} autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              aria-label={'Digit ' + (i + 1) + ' of 6'} aria-describedby={id + '-ce'} data-1p-ignore data-lpignore="true" value={d} readOnly={checking} aria-invalid={bad[i] ? true : undefined}
              onChange={(e) => onDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)} onFocus={(e) => e.target.select()} />
          ))}
        </fieldset>
        <ErrBox id={id + '-ce'} msg={codeErr} live />
        <p className="sr-only" role="status" id={id + '-st'}>{status}</p>
        <button className="fm-b g w-full" type="submit" disabled={checking} aria-busy={checking || undefined}>{checking ? 'Checking code…' : (o.verb || 'Sign in')}</button>
        <div className={FM_ACT}>
          <button className={FM_T + ' tabular-nums'} type="button" data-resend disabled={cool > 0} onClick={resend}>{cool > 0 ? 'Send a new code in ' + cool + ' s' : 'Send a new code'}</button>
          <button className={FM_T} type="button" data-back onClick={back}>Use a different email</button>
        </div>
      </form>
    </>
  );
}
