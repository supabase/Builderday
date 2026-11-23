'use client';
/* Door: the room code at a size a room can read from a phone held up, a new code, and the poster to print. */
import type { DeskAct, DeskCity } from '@/lib/event/desk';
import { IconOut, Status, usePress } from './parts';

export function Door({ c, act, site }: { c: DeskCity; act: DeskAct; site: string }) {
  const { busy, said, run } = usePress(act);
  const addr = site.replace(/^https?:\/\//, '') + '/city/' + c.id;
  return (
    <section className="dk-sec" aria-labelledby="dk-door">
      <h2 className="dk-h" id="dk-door">The room code for {c.name}</h2>
      <p className="dk-code"><span aria-hidden="true">{c.roomCode || '····'}</span><span className="sr-only">{c.roomCode ? 'Room code ' + c.roomCode.split('').join(' ') : 'No room code yet'}</span></p>
      <p className="dk-addr">Go to <b>{addr}</b>, press Submit, and type the code with the email you used on Luma.</p>
      <p className="dk-note">Only guests on the list can use it; it checks them in, and only checked-in guests can submit. Anyone else comes to you: add them on Guests. Voting needs no code. Hold the phone up, or put Doors on the stage: it shows the same code beside a QR. A new code ends the old one after 15 minutes, and anyone already checked in stays checked in.</p>
      <div className="dk-acts-row" style={{ marginTop: 'var(--s-5)' }}>
        <button type="button" className="fm-b" disabled={busy === 'code'} aria-busy={busy === 'code'} onClick={() => run('code', 'door.code', { city: c.id }, (r) => 'The new code is ' + r.code + '.')}>{busy === 'code' ? 'Making…' : 'New code'}</button>
        <a className="fm-b" href={'/desk/poster?city=' + c.id} target="_blank" rel="noreferrer">Print the poster<IconOut /></a>
      </div>
      <Status said={said} k="code" />
    </section>
  );
}
