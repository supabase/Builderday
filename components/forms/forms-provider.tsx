'use client';
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ShareProject } from '@/lib/forms';
import { emit, meKnown, store, useDriver, type Entry } from './store';
import { teamCode, teamCodeOK } from '@/lib/team';
import { token } from './sheet';
import { SignInSheet, type SignInOpts, type Who } from './sign-in-sheet';
import { SubmitSheet, type SubmitOpts } from './submit-sheet';
import { RemindSheet, type RemindOpts } from './remind-sheet';
import { ShareSheet } from './share-sheet';
import { AccountSheet } from '@/components/account/account';

/* The forms a page can open: sign-in, the email step before a vote, submit, remind me, share. Each returns a promise
   that settles when its sheet has closed, so a page asks and waits ("is this person a voter?") without knowing how
   the sheet works. The data goes through store.ts, the one boundary an API replaces later. */
export type Forms = {
  signIn: (o?: SignInOpts) => Promise<Who | null>;
  /* the account sheet (components/account): the place, the editor line, a different email, Sign out */
  account: (here?: string) => Promise<void>;
  ensureVoter: () => Promise<boolean>;
  submit: (o: SubmitOpts) => Promise<Entry | null>;
  remind: (o: RemindOpts) => Promise<boolean>;
  share: (p: ShareProject) => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
};
const FormsContext = createContext<Forms | null>(null);
/* null outside a provider: a page without forms counts a vote locally */
export function useForms(): Forms | null { return useContext(FormsContext); }

type Open = { key: number; el: ReactElement };
/* live: the site has a backend and this is a real page, so the forms talk to the server (store.ts, live driver);
   otherwise they use the stand-in in the browser, as the labs always do */
export function FormsProvider({ children, live = false }: { children: ReactNode; live?: boolean }) {
  useDriver(live);
  const [open, setOpen] = useState<Open[]>([]);
  const seq = useRef(0), signInRun = useRef<Promise<Who | null> | null>(null), submitRun = useRef<Promise<Entry | null> | null>(null);

  /* opens one sheet on top of any already open; settles with what the sheet hands back as it closes */
  const show = useCallback(<T,>(render: (done: (v: T) => void) => ReactElement): Promise<T> => new Promise<T>((resolve) => {
    const key = ++seq.current;
    const done = (v: T) => { setOpen((l) => l.filter((x) => x.key !== key)); resolve(v); };
    setOpen((l) => l.concat({ key, el: render(done) }));
  }), []);

  const forms = useMemo<Forms>(() => {
    const emailStep = (o: SignInOpts): Promise<Who | null> => {
      const s = store.session(); if (s) return Promise.resolve({ handle: s.handle, email: s.email });
      if (signInRun.current) return signInRun.current;
      const run = show<Who | null>((done) => <SignInSheet o={o} done={done} />).then((r) => { signInRun.current = null; return r; });
      signInRun.current = run; return run;
    };
    const share = (p: ShareProject) => show<void>((done) => <ShareSheet p={p} done={() => done()} />);
    const projectOf = (e: Entry): ShareProject => ({ name: e.name, pitch: e.pitch, handle: e.handle, city: e.city, cityName: e.cityName, slug: e.slug });
    const submit = (o: SubmitOpts): Promise<Entry | null> => {
      if (submitRun.current) return submitRun.current;
      /* Edit entry, from the done view: the sheet closes, then opens again on the entry */
      const again = () => { window.setTimeout(() => { submit(o); }, token('--dur-panel-exit')); };
      const run = emailStep({ label: 'Submit', title: 'Sign in to submit your project', reason: 'Use the email you used on Luma: your project is tied to it, so only you can edit it.', city: o.city, cityName: o.cityName, room: true }).then((who) => (who ? show<Entry | null>((done) => <SubmitSheet o={o} who={who} done={done} again={again} share={(e) => { share(projectOf(e)); }} />) : null))
        .then((r) => { submitRun.current = null; return r; });
      submitRun.current = run; return run;
    };
    return {
      signIn: (o?: SignInOpts) => emailStep(o || {}),
      account: (here?: string) => show<void>((done) => <AccountSheet here={here} done={() => done()} />),
      ensureVoter: () => {
        const s = store.session(); if (s && s.voter) return Promise.resolve(true);
        const o: SignInOpts = { label: 'Vote', title: 'Confirm your email to vote', reason: 'One vote per project, so we need an email.', verb: 'Confirm email' };
        /* signed in but not yet confirmed as a voter: the email step runs anyway (emailStep would pass the session through) */
        if (s) return show<Who | null>((done) => <SignInSheet o={o} done={done} />).then((r) => !!r);
        return emailStep(o).then((r) => !!r);
      },
      submit,
      remind: (o) => show<boolean>((done) => <RemindSheet o={o} done={done} />),
      share,
      signOut: () => store.signOut().then(emit),
      reset: () => { store.reset(); emit(); },
    };
  }, [show]);

  /* a team link (/team/KTR482 lands here with ?team=): sign in if need be, then the account, where the join form
     waits with the code (components/account/team.tsx) */
  useEffect(() => {
    if (!live) return;
    let code = '';
    try { code = new URL(window.location.href).searchParams.get('team') || ''; } catch { return; }
    if (!teamCodeOK(code)) return;
    let gone = false;
    meKnown().then(() => {
      if (gone) return;
      if (store.session()) { forms.account(); return; }
      forms.signIn({ title: 'Sign in to join team ' + teamCode(code), reason: 'Use the email you registered with on Luma. Teams are made from the people on a city’s list.' }).then((who) => { if (who) forms.account(); });
    });
    return () => { gone = true; };
  }, [live, forms]);

  return (
    <FormsContext.Provider value={forms}>
      {children}
      {open.length ? createPortal(open.map((x) => <Fragment key={x.key}>{x.el}</Fragment>), document.body) : null}
    </FormsContext.Provider>
  );
}
