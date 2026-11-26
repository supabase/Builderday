'use client';
import { useRef, useState, type MouseEvent } from 'react';
import { away } from '@/lib/routes';
import { RULES } from '@/lib/hackday-server';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { EVENT } from '@/lib/day-data';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import { useForms } from '@/components/forms/forms-provider';
import { meNow, useFormsState } from '@/components/forms/store';
import { useWrite } from './motion';
import { stillPage, tokEase, tokMs } from '@/components/shared/motion';
import { Away, EditorLine, Live } from './checklist';
import { TOOLS } from './prep';
import './checklist.css';

/* Get ready, short: one thing is needed before the day (a place on Luma's list), the day itself in two lines, and
   everything else folded into one optional head start. Signing in can wait for the door; the accounts and the editor
   line are there for whoever wants them, never as homework. `more` opens the head start from the start. With `signin`
   false the page offers no way to sign in: the head start keeps only the accounts, and everyone reads the signed-out page. */

export function FoldShort({ city, cityId, auto, step, more, signin = true }: { city: string; cityId: string; auto: boolean; step: number; more: 'closed' | 'open'; signin?: boolean }) {
  const forms = useForms(), fs = useFormsState(), signedIn = signin && fs.signedIn, pass = signin ? meNow()?.pass ?? null : null;
  const root = useRef<HTMLElement>(null);
  useWrite(root, auto ? step : 0, 0.15, auto);
  const [waiting, setWaiting] = useState(false);
  const placed = signedIn && !!pass, seen = pass?.editorSeen ?? null, mine = pass?.cityName || city;
  const signIn = () => { forms?.signIn({ title: 'Sign in to ' + EVENT.short }); };
  const account = () => { forms?.account('ready'); };
  const wait = auto ? '' : undefined;
  const more$ = useRef<HTMLDetailsElement>(null), body = useRef<HTMLDivElement>(null);
  const onMore = (e: MouseEvent<HTMLElement>) => { e.preventDefault(); fold(more$.current, body.current); };
  return (
    <section ref={root} id="ready" className="pf-part rd rd-short" data-part="ready" aria-labelledby="ready-h">
      <h2 id="ready-h" className="pf-h">Get ready</h2>
      <p className="rd-lede">One thing before the day. The rest can wait for the door.</p>
      <ol className="rd-steps" data-sk-skip="">
        <li data-s={placed ? 'done' : 'now'} data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>{placed ? <>You’re on the list for {pass!.cityName}</> : <>Register for {city} on Luma</>}<span className="rd-vh">{placed ? ', done' : ', the one thing to do'}</span></h3>
            {placed
              ? <p className="rd-who">Signed in as <b>{fs.email}</b>. <button type="button" className="rd-link" onClick={account} aria-haspopup="dialog">Your account</button></p>
              : signedIn
              ? <><p className="rd-who">Signed in as <b>{fs.email}</b>, which isn’t on a list yet.</p>
                  <p className="rd-row">
                    {LUMA_LIVE ? <a className="rd-key" href={lumaHref(cityId)} {...away(lumaHref(cityId))}>Register on Luma<span className="rd-vh"> (opens in a new tab)</span></a> : null}
                    <button type="button" className="rd-link" onClick={account} aria-haspopup="dialog">Registered with another email?</button>
                  </p></>
              : <><p>Already registered? Then you’re set.</p>
                  {LUMA_LIVE ? <p className="rd-row"><a className="rd-key" href={lumaHref(cityId)} {...away(lumaHref(cityId))}>Register on Luma<span className="rd-vh"> (opens in a new tab)</span></a></p> : null}</>}
          </div>
        </li>
        <li data-s="later" data-pf-wait={wait}>
          <span className="rd-tick" aria-hidden="true" />
          <div className="rd-step">
            <h3>On the day</h3>
            <p>Bring your laptop. A host checks you in, you sign in with Supabase, build, and submit on {mine}’s page. Your repository:</p>
            <ul className="rd-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </li>
      </ol>
      {/* the heading takes the page's screen and arrival like every section's; the steps under it stay plain (data-sk-skip).
         the head start: closed by default, so the section reads as two lines; native details, so it opens with the keyboard and a reader */}
      <details ref={more$} className="rd-more" data-sk-skip="" open={more === 'open' || undefined} data-pf-wait={wait}>
        <summary onClick={onMore}><span className="rd-more-t">A head start</span><span className="rd-more-k">Optional</span><span className="rd-more-x" aria-hidden="true" /></summary>
        <div ref={body} className="rd-more-b"><ul className="rd-extra">
          {signin ? <li>
            <div><h4>Sign in now</h4><p>{signedIn ? <>Done, as <b>{fs.email}</b>.</> : 'Saves a minute at the door.'}</p></div>
            {!signedIn && forms ? <button type="button" className="rd-sb" onClick={signIn} aria-haspopup="dialog"><span className="rd-sb-mark"><SupabaseMark /></span>Continue with Supabase</button> : null}
          </li> : null}
          <li>
            <div><h4>Have your accounts</h4><p>No time for sign-ups on the day.</p></div>
            <p className="rd-links">{TOOLS.map((t) => <a key={t.id} href={t.href} {...away(t.href)}><span className="rd-links-t">{t.name.replace(' project', '')}</span><Away /><span className="rd-vh"> (opens in a new tab)</span></a>)}</p>
          </li>
          {signin ? <li className="rd-extra-ed">
            <div><h4>Submit from your editor</h4><p>The browser needs nothing. To submit by asking your editor instead, add your line.</p></div>
            <div className="rd-extra-line">
              <EditorLine url={fs.editor} signedIn={signedIn} onCopy={() => setWaiting(true)} />
              {fs.editor ? <Live s={seen ? 'on' : waiting ? 'wait' : 'idle'} seen={seen} city={mine} /> : null}
            </div>
          </li> : null}
        </ul></div>
      </details>
    </section>
  );
}

/* the head start opens and closes: the body's height eases from where it is (so a press mid-way turns it round
   without a jump), its rows rise a few pixels in a step apart on the way in and fade together on the way out, a
   little faster. The details element stays native: it is open for the whole opening and only shut once closed. */
function fold(d: HTMLDetailsElement | null, b: HTMLDivElement | null) {
  if (!d || !b) return;
  const opening = !d.open || d.dataset.closing === '1';
  const enter = tokMs('--dur-panel'), exit = tokMs('--dur-panel-exit');
  const rows = Array.from(b.querySelectorAll<HTMLElement>(':scope > ul > li'));
  const from = d.open ? b.getBoundingClientRect().height : 0;
  const shown = rows.map((r) => (d.open ? parseFloat(getComputedStyle(r).opacity) : 0));
  b.getAnimations().forEach((a) => a.cancel());
  rows.forEach((r) => r.getAnimations().forEach((a) => a.cancel()));
  if (stillPage() || !enter) { delete d.dataset.closing; d.open = opening; return; }
  if (opening) {
    delete d.dataset.closing;
    d.open = true;
    const to = b.scrollHeight;
    b.dataset.moving = '1';
    const a = b.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: enter, easing: tokEase('--ease-drawer') });
    a.onfinish = () => { delete b.dataset.moving; };
    const step = tokMs('--stagger');
    rows.forEach((r, i) => r.animate([{ opacity: shown[i], transform: shown[i] ? 'none' : 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: enter, delay: shown[i] ? 0 : i * step, easing: tokEase('--ease-out'), fill: 'backwards' }));
  } else {
    d.dataset.closing = '1';
    b.dataset.moving = '1';
    rows.forEach((r, i) => r.animate([{ opacity: shown[i] }, { opacity: 0 }], { duration: exit * 0.7, easing: tokEase('--ease-exit'), fill: 'forwards' }));
    const a = b.animate([{ height: from + 'px' }, { height: '0px' }], { duration: exit, easing: tokEase('--ease-drawer'), fill: 'forwards' });
    a.onfinish = () => {
      if (d.dataset.closing !== '1') return;
      delete d.dataset.closing;
      d.open = false;
      delete b.dataset.moving;
      a.cancel();
      rows.forEach((r) => r.getAnimations().forEach((x) => x.cancel()));
    };
  }
}
