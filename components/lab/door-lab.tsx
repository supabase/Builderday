'use client';
import type { CSSProperties, ReactNode } from 'react';
import { clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { HeaderRow } from '@/components/board/header-row';
import { createClock } from '@/components/board/clock';
import { AccountBody, AccountCell, type CellState, type Moved } from '@/components/account/account';
import { FormsProvider } from '@/components/forms/forms-provider';
import type { Me } from '@/components/forms/store';
import { EVENT } from '@/lib/day-data';
import { PLACEHOLDER_URL } from '@/lib/hackday-server';
import '@/components/board/board.css';
import '@/components/day/get-ready.css';

/* The door lab: every account state side by side. The header cell on the day home's header and on
   Berlin's, signed out, with a place, and with none; then the account sheet's body for each kind of person. The
   people are made up; the editor address is the placeholder, never a real key. */

/* the shape of a real key (48 characters), so the line puts it in a header as it would; it opens nothing */
const ADDR = PLACEHOLDER_URL + '/' + 'LABKEY-not-real-'.repeat(3);
const START = '2026-12-10T08:00:00.000Z';
type PassBits = Partial<NonNullable<Me['pass']>>;
const person = (o: Omit<Partial<Me>, 'pass'> & { pass?: PassBits | null } = {}): Me => ({
  signedIn: true, email: 'ana@example.com', name: 'Ana', roles: [], entry: null, votes: {}, judging: {}, editor: { url: ADDR }, open: false, ...o,
  pass: o.pass === null ? null : { city: 'berlin', cityName: 'Berlin', source: 'luma', checkedIn: false, editorSeen: null, listedAs: null, start: START, offset: 60, ...(o.pass || {}) },
} as Me);

const SHEETS: { title: string; note: string; me: Me; here?: string; claim?: 'closed' | 'email' | 'code' | 'done'; moved?: Moved }[] = [
  { title: 'A place, editor not connected', note: 'On the preview page before the day: the line, and the sentence that runs the practice call.', me: person() },
  { title: 'A place, editor connected', note: 'After the practice call, or any call with the key.', me: person({ pass: { editorSeen: '2026-11-18T14:02:00.000Z' } }) },
  { title: 'A place in another city', note: 'Signed in for Berlin, on London’s page, the day pages open.', me: person({ open: true, pass: { editorSeen: '2026-11-18T14:02:00.000Z' } }), here: 'london' },
  { title: 'A place moved from another email', note: 'Claimed: the place keeps the address it was listed under.', me: person({ email: 'ana@gmail.example', pass: { listedAs: 'ana@work.example' } }) },
  { title: 'No place', note: 'Signed in with an email that is on no list; pending or waitlisted on Luma looks the same.', me: person({ pass: null, editor: null }), claim: 'closed' },
  { title: 'No place: a different email', note: '“Registered with a different email?” pressed.', me: person({ pass: null, editor: null }), claim: 'email' },
  { title: 'No place: the code', note: 'A code went to the Luma email, if it is on a list.', me: person({ pass: null, editor: null }), claim: 'code' },
  { title: 'No place: moved', note: 'The code was right: the sheet swaps to the place, focus goes to its heading, and one line says the place moved.', me: person({ email: 'ana@gmail.example', pass: { listedAs: 'ana@work.example' } }), moved: { cityName: 'Berlin' } },
  { title: 'A host with a place', note: 'Hosts, judges and super admins also get the desk.', me: person({ roles: [{ id: 'r', role: 'host', city: 'berlin', budget: 0 }], pass: { editorSeen: '2026-11-18T14:02:00.000Z', checkedIn: true } }) },
];
const CELLS: { state: CellState; label: string }[] = [{ state: 'out', label: 'Signed out' }, { state: 'place', label: 'With a place (Berlin)' }, { state: 'none', label: 'Signed in, no place' }];

const Frame = ({ title, note, children }: { title: string; note: string; children: ReactNode }) => (
  <figure className="m-0 grid content-start gap-3">
    <figcaption><p className="m-0 text-ink">{title}</p><p className="m-0 text-sm text-ink-2">{note}</p></figcaption>
    {children}
  </figure>
);

export function DoorLab({ parts, q }: { parts: Partial<PartsCfg>; q: Record<string, string | undefined> }) {
  const P = clampParts(parts), clock = createClock(9 * 60, false);
  const only = q.only;
  return (
    <FormsProvider>
      <main className="bd min-h-dvh bg-[var(--bd-ground)] pb-24" style={partsVars(P) as CSSProperties} data-face={P.face}>
        <header className="grid gap-2 px-(--bd-m) pt-10 pb-8"><h1 className="m-0 text-2xl font-medium">Door lab</h1><p className="m-0 max-w-[68ch] text-[var(--bd-muted)]">Every account state of {EVENT.short}: the cell in the header of the home and of a city page, and the sheet it opens. The preview page’s header (lab modes merged and beside, top link and both) waits for the preview’s own files.</p></header>
        {only === 'sheet' ? null : <section className="grid gap-8 pb-12" aria-label="The header cell">
          {CELLS.map((c) => (
            <div key={c.state} className="grid gap-2">
              <p className="m-0 px-(--bd-m) text-sm text-[var(--bd-muted)]">{c.label}</p>
              <HeaderRow title={EVENT.name} state="opens" clock={clock} first={9 * 60} zone="UTC" homeHref="/lab/door" right={<AccountCell look={{ state: c.state, city: 'berlin' }} onOpen={() => {}} />} />
              <HeaderRow title="Berlin" state="opens" clock={clock} first={9 * 60} offset={60} zone="Local · BER" homeHref="/lab/door" right={<AccountCell look={{ state: c.state, city: 'berlin' }} onOpen={() => {}} />} />
            </div>
          ))}
        </section>}
        {only === 'cell' ? null : <section className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-x-8 gap-y-12 px-(--bd-m)" aria-label="The account sheet">
          {SHEETS.map((s) => (
            <Frame key={s.title} title={s.title} note={s.note}>
              <div className="dl-sheet border border-[var(--c-line)] bg-ground px-8 pt-6 pb-8 text-ink phone-window:px-4">
                <AccountBody me={s.me} here={s.here} onSignOut={() => {}} claimLook={s.claim} moved={s.moved} />
              </div>
            </Frame>
          ))}
        </section>}
      </main>
    </FormsProvider>
  );
}
