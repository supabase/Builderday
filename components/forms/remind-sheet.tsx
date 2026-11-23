'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cityLabel, emailOK, atCity } from '@/lib/forms';
import { emit, store } from './store';
import { FM_ACT, FM_DONE, FM_F, FM_FORM, FM_H, FM_L, FM_P, ErrBox, Sheet, useSheet } from './sheet';

/* Remind me: one email, for one city's start */
export type RemindOpts = { city: string; cityName?: string; when?: Date | string; off?: number };

export function RemindSheet({ o, done }: { o: RemindOpts; done: (ok: boolean) => void }) {
  const ok = useRef(false), emRef = useRef<HTMLInputElement>(null);
  return (
    <Sheet label="Remind me" focusRef={emRef} onDone={() => done(ok.current)}>
      <RemindBody o={o} emRef={emRef} onSaved={() => { ok.current = true; }} />
    </Sheet>
  );
}

function RemindBody({ o, emRef, onSaved }: { o: RemindOpts; emRef: React.RefObject<HTMLInputElement | null>; onSaved: () => void }) {
  const { id, busy: busyRef, open: openRef } = useSheet(), cityName = o.cityName || cityLabel(o.city), when = o.when ? atCity(o.when, o.off) : '';
  const [init] = useState(() => { const s = store.session(), already = store.reminders()[o.city]; return { already, email: (s && s.email) || already || store.lastEmail() || '' }; });
  const [value, setValue] = useState(init.email), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [doneAddr, setDoneAddr] = useState('');
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (doneAddr) h.current?.focus(); }, [doneAddr]);
  const checkEmail = (v = value) => { const t = v.trim(), m = !t ? 'Enter your email so we can remind you.' : emailOK(t) ? '' : 'Check the email. It needs an @ and a domain.'; setErr(m); return !m; };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault(); if (busyRef.current) return; if (!checkEmail()) { emRef.current?.focus(); return; }
    busyRef.current = true; setBusy(true);
    const addr = value.trim();
    /* a refused or failed request keeps the form, with the reason, instead of saying it worked */
    store.remind(addr, o.city).then((ok) => {
      busyRef.current = false;
      if (!ok) { if (!openRef.current) return; setBusy(false); setErr('We could not save your reminder. Check your connection and try again.'); emRef.current?.focus(); return; }
      onSaved(); emit(); if (!openRef.current) return; setDoneAddr(addr);
    });
  };
  if (doneAddr) return (
    <>
      <h2 ref={h} className={FM_H} id={id + '-h'} tabIndex={-1}>You are on the list.</h2>
      <p className={FM_P} role="status">We will email <b>{doneAddr}</b> when {cityName} starts{when ? ' at ' + when : ''}.</p>
      <div className={FM_DONE}><div className={FM_ACT}><button className="fm-b" type="button" data-close>Done</button></div></div>
    </>
  );
  return (
    <>
      <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>{cityName}{when ? ' starts at ' + when + '.' : ' starts soon.'}</h2>
      <p className={FM_P}>We will email you when {cityName} starts.{init.already ? <> You are already on the list as <b>{init.already}</b>.</> : null}</p>
      <form className={FM_FORM} noValidate onSubmit={onSubmit}>
        <div className={FM_F}>
          <label className={FM_L} htmlFor={id + '-em'}>Email</label>
          <input ref={emRef} className="fm-i" id={id + '-em'} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" placeholder="you@example.com" aria-describedby={id + '-ee'}
            value={value} readOnly={busy} aria-invalid={err ? true : undefined}
            onChange={(e) => { setValue(e.target.value); if (err) checkEmail(e.target.value); }} onBlur={() => { if (value.trim()) checkEmail(); }} />
          <ErrBox id={id + '-ee'} msg={err} />
        </div>
        <button className="fm-b g w-full" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Saving reminder…' : 'Remind me'}</button>
      </form>
    </>
  );
}
