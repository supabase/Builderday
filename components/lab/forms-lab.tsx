'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { isGround } from '@/lib/palette';
import { FormsProvider, useForms, type Forms } from '@/components/forms/forms-provider';
import { useFormsState } from '@/components/forms/store';
import { applyGround } from '@/components/ground/apply-ground';
import '@/components/forms/forms.css';
import './forms-lab.css';
import { EVENT } from '@/lib/day-data';

const SEC = 'py-6 [box-shadow:inset_0_calc(-1*var(--line-hair))_0_var(--c-line)]';
const K = 'type-label mb-2 text-ink-2';
const MONO = 'font-mono text-xs/[1.6] font-medium whitespace-pre-wrap wrap-anywhere text-ink-2';
/* The forms tuning page: open each sheet, see the state the pages read, clear what is stored. */
const inHours = (h: number) => new Date(Date.now() + h * 3600000);
const SAMPLE = { name: 'Sentry Pup', pitch: 'A watchdog for your Edge Functions that barks in Slack before your users notice.', handle: 'mira_k', city: 'london', cityName: 'London', slug: 'sentry-pup', votes: 45, rank: 1 };
const GROUNDS = [['night', 'Night'], ['paper', 'Paper'], ['mint', 'Mint']];

export function FormsLab({ ground }: { ground: string | null }) {
  return <FormsProvider><Lab ground={ground && isGround(ground) ? ground : 'night'} /></FormsProvider>;
}

function Lab({ ground: g0 }: { ground: string }) {
  const F = useForms() as Forms, st = useFormsState(), [log, setLog] = useState('Nothing yet.'), [ground, setGround] = useState(g0);
  useEffect(() => { applyGround(ground); const u = new URL(location.href); if (ground === 'night') u.searchParams.delete('ground'); else u.searchParams.set('ground', ground); history.replaceState(null, '', u); }, [ground]);
  /* Berlin: building for three more hours; Tokyo starts at midnight UTC today */
  const RUN: Record<string, () => Promise<unknown>> = {
    signIn: () => F.signIn(),
    ensureVoter: () => F.ensureVoter(),
    submit: () => F.submit({ city: 'london', cityName: 'London', deadline: inHours(3) }),
    submitClosed: () => F.submit({ city: 'london', cityName: 'London', deadline: inHours(-1 / 60) }),
    remind: () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return F.remind({ city: 'seoul', cityName: 'Seoul', when: d }); },
    share: () => F.share(SAMPLE),
    shareMine: () => { const e = st.entry; return F.share(e ? { name: e.name, pitch: e.pitch, handle: e.handle, city: e.city, cityName: e.cityName, slug: e.slug } : SAMPLE); },
    signOut: () => F.signOut(),
    reset: () => { F.reset(); return Promise.resolve('cleared'); },
  };
  const run = (n: string) => RUN[n]().then((v) => {
    const o = v && typeof v === 'object' && (v as { picture?: string }).picture ? { ...(v as object), picture: '(data URL)' } : v;
    setLog((n === 'submitClosed' ? 'submit' : n) + ' → ' + (v === undefined ? 'done' : typeof o === 'string' ? o : JSON.stringify(o)));
  });
  const e = st.entry ? { name: st.entry.name, city: st.entry.city, slug: st.entry.slug, picture: st.entry.picture ? 'yes' : 'no' } : null;
  const B = (n: string, t: string, g?: boolean) => <button key={n} className={'fm-b' + (g ? ' g' : '')} type="button" onClick={() => run(n)}>{t}</button>;
  return (
    <main className="mx-auto box-content max-w-[960px] px-6 pt-8 pb-18">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 [box-shadow:inset_0_calc(-1*var(--line-hair))_0_var(--c-line)]">
        <div><p className={K}>{EVENT.name}</p><h1 className="text-h1 leading-[1.1] font-regular tracking-tight">Forms lab</h1></div>
        <div className="lab-seg inline-flex" role="group" aria-label="Ground">{GROUNDS.map(([k, t]) => <button key={k} className="fm-b" type="button" aria-pressed={ground === k} onClick={() => setGround(k)}>{t}</button>)}</div>
      </header>
      <section className={SEC} aria-labelledby="k-flows">
        <p className={K} id="k-flows">Flows</p>
        <div className="flex flex-wrap gap-2">
          {B('signIn', 'Sign in')}{B('ensureVoter', 'Vote (email step)')}{B('submit', 'Submit project', true)}{B('submitClosed', 'Submit after the deadline')}
          {B('remind', 'Remind me')}{B('share', 'Share a project')}{B('shareMine', 'Share your entry')}
        </div>
        <p className="mt-3 max-w-[60ch] text-sm text-ink-2">Any six digits work as the code. Submit opens sign-in first when no one is signed in. The network takes about 0.6{' '}s.</p>
      </section>
      <section className={SEC} aria-labelledby="k-state">
        <p className={K} id="k-state">Forms state</p>
        <p className={clsx(MONO, '[&_b]:font-medium [&_b]:text-ink')} id="state" aria-live="polite">signedIn <b>{String(st.signedIn)}</b> · handle <b>{st.handle || 'null'}</b> · email <b>{st.email || 'null'}</b> · voter <b>{String(st.voter)}</b>{'\n'}entry <b>{e ? JSON.stringify(e) : 'null'}</b></p>
        <p className={clsx(K, 'mt-4')}>Last result</p>
        <p className={MONO} id="log">{log}</p>
      </section>
      <section className={SEC} aria-labelledby="k-data">
        <p className={K} id="k-data">Stored data</p>
        <div className="flex flex-wrap gap-2">{B('signOut', 'Sign out')}{B('reset', 'Reset stored data')}</div>
      </section>
    </main>
  );
}
