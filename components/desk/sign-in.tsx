'use client';
/* Signing in to the desk: an email, then the six-digit code from it. Only the code opens the desk (a personal link or
   the room code does not), so this card never offers either. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Status } from './parts';
import { RESEND_S } from '@/lib/forms';

export function DeskSignIn({ onIn, why, mail }: { onIn: () => void; why?: string; mail: 'resend' | 'outbox' }) {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false), [said, setSaid] = useState<{ key: string; text: string; error: boolean } | null>(why ? { key: 'in', text: why, error: false } : null);
  const codeRef = useRef<HTMLInputElement>(null), emailRef = useRef<HTMLInputElement>(null);
  /* a new code may go out once every RESEND_S seconds per address; the key counts down to it */
  const [until, setUntil] = useState(0), [cool, setCool] = useState(0);
  useEffect(() => {
    const tick = () => { const n = Math.max(0, Math.ceil((until - Date.now()) / 1000)); setCool(n); return n; };
    if (!tick()) return;
    const iv = window.setInterval(() => { if (!tick()) clearInterval(iv); }, 250);
    return () => clearInterval(iv);
  }, [until]);
  /* focus the step's field, except on a touch screen, where it would open the keyboard unasked */
  useEffect(() => { if ('ontouchstart' in window) return; (step === 'code' ? codeRef : emailRef).current?.focus(); }, [step]);

  const post = async (url: string, b: object) => {
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }
    catch { return { status: 0, j: { error: 'The desk could not be reached. Check the connection and try again.' } }; }
  };
  const send = async (e?: FormEvent) => {
    e?.preventDefault(); setBusy(true); setSaid(null);
    const { status, j } = await post('/api/auth/code', { email, next: '/desk' });
    setBusy(false);
    const wait = typeof j.wait === 'number' && j.wait > 0 ? j.wait : 0;
    if (status === 200) { setStep('code'); setCode(''); setUntil(Date.now() + (wait || RESEND_S) * 1000); setSaid({ key: 'in', text: mail === 'outbox' ? 'Email is not connected yet, so nothing was sent. On the development server the code is printed in its terminal.' : 'The code is on its way to ' + email.trim() + '.', error: false }); }
    /* a code went to this address moments ago: it still works, so ask for it rather than wait to send another */
    else if (status === 429 && wait) { setStep('code'); setUntil(Date.now() + wait * 1000); setSaid({ key: 'in', text: 'We sent a code to ' + email.trim() + ' a moment ago. It still works.' + (mail === 'outbox' ? ' On the development server it is printed in its terminal.' : ''), error: false }); }
    else setSaid({ key: 'in', text: j.error || 'The code was not sent. Try again.', error: true });
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setSaid(null);
    const { status, j } = await post('/api/auth/verify', { email, code: code.replace(/\D/g, '') });
    setBusy(false);
    if (status === 200) onIn(); else setSaid({ key: 'in', text: j.error || 'That code does not match.', error: true });
  };

  return (
    <div className="dk"><main className="dk-in">
      <div className="dk-in-card">
        <p className="dk-kicker">Supabase events · Desk</p>
        <div>
          <h1 className="dk-h">{step === 'email' ? 'Sign in to the desk' : 'Enter the code'}</h1>
          <p className="dk-p">{step === 'email' ? 'For the people who run an event: admins, hosts and judges. We email you a six-digit code.' : <>Sent to <b>{email.trim()}</b>. It works for one hour.</>}</p>
        </div>
        {step === 'email' ? (
          <form className="dk-form" onSubmit={send}>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-in-e">Email</label><input id="dk-in-e" className="fm-i" type="email" required autoComplete="email" spellCheck={false} ref={emailRef} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button type="submit" className="fm-b" disabled={busy} aria-busy={busy}>{busy ? 'Sending…' : 'Send the code'}</button>
            <Status said={said} k="in" />
          </form>
        ) : (
          <form className="dk-form" onSubmit={verify}>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-in-c">Six-digit code</label>
              <input id="dk-in-c" ref={codeRef} className="fm-i fm-room" style={{ maxWidth: 'none' }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} data-1p-ignore /></div>
            <button type="submit" className="fm-b" disabled={busy || code.replace(/\D/g, '').length < 6} aria-busy={busy}>{busy ? 'Checking…' : 'Open the desk'}</button>
            <Status said={said} k="in" />
            <div className="dk-acts-row">
              <button type="button" className="dk-t" onClick={() => { setStep('email'); setCode(''); setSaid(null); setUntil(0); }}>Use another email</button>
              <button type="button" className="dk-t" disabled={busy || cool > 0} onClick={() => send()}>{cool > 0 ? 'Send a new code in ' + cool + ' s' : 'Send a new code'}</button>
            </div>
          </form>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{said?.text || ''}</p>
    </main></div>
  );
}
