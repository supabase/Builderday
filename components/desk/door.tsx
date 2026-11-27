'use client';
/* Check-in: the host at the door (owner, 2026-11-25: no room code; a host checks people in, and only checked-in
   accounts can submit, from the page or the editor). Find a person by name or email (the one on Luma or the
   Supabase account they signed in with), press Check in. Anyone not on the list is added on Guests first. */
import { useMemo, useRef, useState } from 'react';
import type { DeskAct, DeskCity, DeskState } from '@/lib/event/desk';
import { ago, Sec, Status, usePress } from './parts';

export function CheckIn({ s, c, now, act }: { s: DeskState; c: DeskCity; now: number; act: DeskAct }) {
  const { busy, said, run } = usePress(act);
  const [q, setQ] = useState(''), find = useRef<HTMLInputElement>(null);
  const inRoom = useMemo(() => s.guests.filter((g) => g.inRoom).length, [s.guests]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = k ? s.guests.filter((g) => g.email.indexOf(k) >= 0 || (g.listedAs || '').indexOf(k) >= 0 || g.name.toLowerCase().indexOf(k) >= 0) : s.guests;
    /* the people still to check in first, then by name */
    return hit.slice().sort((a, b) => (a.inRoom ? 1 : 0) - (b.inRoom ? 1 : 0) || (a.name || a.email).localeCompare(b.name || b.email));
  }, [s.guests, q]);
  const who = (g: { name: string; email: string }) => g.name || g.email;

  return (
    <Sec title={'Check-in at ' + c.name} id="dk-door" aside={inRoom + ' of ' + s.guests.length + ' checked in'}>
      <p className="dk-note">Ask for the email they signed in with on Supabase, or the one they used on Luma. Only people you check in can submit, from the page or their editor. Not on the list? Add them on Guests, then check them in here.</p>
      <div className="dk-f" style={{ marginTop: 'var(--s-3)' }}>
        <label className="sr-only" htmlFor="dk-door-q">Find a guest</label>
        <input id="dk-door-q" ref={find} className="fm-i" type="search" enterKeyHint="search" placeholder="Name or email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-1p-ignore value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="sr-only" aria-live="polite">{q ? list.length + (list.length === 1 ? ' guest matches' : ' guests match') : ''}</p>
      {list.length ? (
        <ul className="dk-list dk-guests" style={{ marginTop: 'var(--s-2)' }}>
          {list.slice(0, 200).map((g) => {
            const k = 'd:' + g.person;
            return (
              <li key={g.person} className="dk-row">
                <div className="dk-who">
                  <b>{who(g)}</b>
                  {g.name ? <span>{g.email}</span> : null}
                  {g.listedAs ? <span>On Luma as {g.listedAs}</span> : null}
                  <div className="dk-marks">
                    {g.inRoom ? <span className="is-on">Checked in {ago(g.inRoom, now)}</span> : null}
                    <span className={g.signedIn ? 'is-on' : ''}>{g.signedIn ? 'Signed in with Supabase' : 'Not signed in yet'}</span>
                    {g.entry ? <span className="is-on">Has an entry</span> : null}
                  </div>
                  <Status said={said} k={k} />
                </div>
                <div className="dk-acts">
                  {g.inRoom
                    ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Undo check-in for ' + who(g)} onClick={() => run(k, 'guest.out', { city: c.id, person: g.person }, () => 'Check-in undone for ' + who(g) + '.')}>Undo</button>
                    : <button type="button" className="fm-b g" disabled={busy === k} aria-busy={busy === k} aria-label={'Check in ' + who(g)} onClick={() => run(k, 'guest.in', { city: c.id, person: g.person }, () => { setQ(''); find.current?.focus(); return who(g) + ' is checked in.' + (g.signedIn ? ' They can submit now.' : ' Once they sign in with Supabase, they can submit.'); })}>{busy === k ? 'Checking in…' : 'Check in'}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="dk-note" style={{ marginTop: 'var(--s-2)' }}>{q ? 'Nobody on the list matches “' + q + '”. Add them on Guests.' : 'Nobody is on the list yet. Sync from Luma on Guests.'}</p>}
      {list.length > 200 ? <p className="dk-note">Showing the first 200. Search to find someone.</p> : null}
    </Sec>
  );
}
