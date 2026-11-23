'use client';
/* Guests: import a list (pasted, or the CSV Luma exports) with a preview before anything is saved, add one person, find
   someone, and per person: who is in the room, mark them in the room by hand (or take it back), send their link again,
   copy it, remove. Only a guest in the room may submit (rule 7c); there are no walk-ins, so this is where they are added. */
import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import { lumaLine, type DeskAct, type DeskCity, type DeskState, type ImportPreview } from '@/lib/event/desk';
import { ago, copyText, Sec, Status, usePress, type Ask } from './parts';

const noop = () => () => {};
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

export function Guests({ s, c, now, act, ask }: { s: DeskState; c: DeskCity; now: number; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run, say } = usePress(act);
  const [text, setText] = useState(''), [preview, setPreview] = useState<ImportPreview | null>(null), [sendNow, setSendNow] = useState(true);
  /* where the previewed list came from: the box (pasted or a CSV), or the city's Luma event (only with a Luma key) */
  const [from, setFrom] = useState<'text' | 'luma'>('text');
  const canLuma = s.luma && !!c.lumaEvent;
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [q, setQ] = useState('');
  const [shown, setShown] = useState<{ person: string; link: string } | null>(null);
  /* place emails wait in the outbox when email is not connected, or while the hold is on (the test list still gets them) */
  const held = s.mail !== 'outbox' && !!s.mailHeld, outbox = s.mail === 'outbox' || held;
  const why = held ? 'place emails are on hold' : 'email is not connected yet';
  const inRoom = useMemo(() => s.guests.filter((g) => g.inRoom).length, [s.guests]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? s.guests.filter((g) => g.email.indexOf(k) >= 0 || g.name.toLowerCase().indexOf(k) >= 0) : s.guests;
  }, [s.guests, q]);

  const doPreview = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return say('imp', 'Paste the addresses or choose the CSV first.', true);
    const r = await run('imp', 'import.preview', { city: c.id, text });
    if (r.ok) { setFrom('text'); setPreview(r.preview as ImportPreview); }
  };
  const fromLuma = async () => {
    const r = await run('imp', 'import.preview', { city: c.id, from: 'luma' });
    if (r.ok) { setFrom('luma'); setPreview(r.preview as ImportPreview); }
  };
  const commit = () => run('imp', 'import.commit', from === 'luma' ? { city: c.id, from: 'luma', send: sendNow } : { city: c.id, text, send: sendNow }, (r) => {
    setText(''); setPreview(null); setFrom('text');
    const added = r.added as number, sent = r.sent as number;
    return plural(added, 'guest', 'guests') + ' added to ' + c.name + '.' + (sendNow ? (outbox ? ' Their links are in the outbox, not sent: ' + why + '.' : ' ' + plural(sent, 'link', 'links') + ' on the way.') : '');
  });
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return say('imp', 'That file is over 2 MB. Export only the approved guests.', true);
    setText(await f.text()); setPreview(null); say('imp', f.name + ' is loaded. Press Preview.');
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return say('add', 'Type the person’s email, like name@example.com.', true);
    run('add', 'guest.add', { city: c.id, email, name }, (r) => {
      const who = name.trim() || email.trim(); setEmail(''); setName('');
      return (r.moved ? who + ' moved to ' + c.name + '’s list.' : who + ' is on the list.') + (outbox ? ' Their link is in the outbox: copy it below and send it yourself.' : ' Their link is on its way.');
    });
  };
  const copy = async (person: string) => {
    const r = await run('g:' + person, 'guest.link', { city: c.id, person });
    if (!r.ok) return;
    const link = r.link as string;
    if (await copyText(link)) say('g:' + person, 'Link copied.'); else { setShown({ person, link }); say('g:' + person, 'Copy the link above.'); }
  };

  return (
    <>
      {outbox ? <p className="dk-warn">{held ? <><b>Place emails are on hold.</b> Links wait in the outbox{s.mailTest ? ', except for the test list' : ''}. Sign-in codes still send. Use Copy link to send one yourself.</> : <><b>Email is not connected yet.</b> Nothing is sent: each email waits in the outbox. Use Copy link and send it yourself.</>}</p> : null}
      <Sec title="Import" id="dk-imp" aside={s.guests.length ? plural(s.guests.length, 'person', 'people') + ' on the list' : 'The list is empty'}>
        <form className="dk-form" onSubmit={doPreview}>
          <div className="dk-f">
            <label className="dk-l" htmlFor="dk-imp-t">Addresses, or Luma’s CSV{' '}<small>One per line</small></label>
            <textarea id="dk-imp-t" className="dk-area" value={text} spellCheck={false} autoComplete="off" placeholder={'ada@example.com, Ada Lovelace\ngrace@example.com'}
              onChange={(e) => { setText(e.target.value); setPreview(null); setFrom('text'); }} />
          </div>
          <p className="sr-only" aria-live="polite">{preview ? (preview.fresh - preview.elsewhere) + ' new, ' + preview.already + ' already on the list, ' + preview.bad + ' not an email.' : ''}</p>
          {preview ? (
            <div className="dk-preview">
              {from === 'luma' ? <p className="dk-note">Approved guests on {c.name}’s Luma event.</p> : null}
              <p className="dk-big">{[(preview.fresh - preview.elsewhere) + ' new', preview.already ? preview.already + ' already on the list' : '', preview.bad ? preview.bad + (preview.bad === 1 ? ' line is' : ' lines are') + ' not an email' : ''].filter(Boolean).join(', ')}</p>
              {preview.elsewhere ? <p className="dk-note">{plural(preview.elsewhere, 'person is', 'people are')} on another city’s list and stay there. Add them one by one to move them.</p> : null}
              {preview.bad ? <p className="dk-note">Not an email: {preview.badList.join(', ')}{preview.bad > preview.badList.length ? ' and ' + (preview.bad - preview.badList.length) + ' more' : ''}.</p> : null}
              {preview.skipped ? <p className="dk-note">{plural(preview.skipped, 'row was', 'rows were')} left out: not approved on Luma.</p> : null}
              <label className="fm-chk" style={{ marginTop: 'var(--s-2)' }}>
                <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
                <span>Email each new guest their link now</span>
              </label>
            </div>
          ) : null}
          <div className="dk-acts-row">
            {preview && preview.fresh - preview.elsewhere > 0 ? (
              <button type="button" className="fm-b g" onClick={commit} disabled={busy === 'imp'} aria-busy={busy === 'imp'}>{busy === 'imp' ? 'Adding…' : 'Add ' + plural(preview.fresh - preview.elsewhere, 'guest', 'guests')}</button>
            ) : (
              <button type="submit" className="fm-b" disabled={busy === 'imp'} aria-busy={busy === 'imp'}>{busy === 'imp' ? 'Reading…' : 'Preview'}</button>
            )}
            {canLuma ? <button type="button" className="fm-b" onClick={fromLuma} disabled={busy === 'imp'}>Sync from Luma</button> : null}
            <label className="fm-b dk-file">Choose CSV<input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          <Status said={said} k="imp" />
          {s.luma && !c.lumaEvent ? <p className="dk-note">Luma is connected, but {c.name} has no Luma event yet. {s.can.super ? 'Set it under Cities' : 'A super admin sets it under Cities'} to sync the approved guests.</p> : null}
        </form>
      </Sec>

      {s.counts?.unsent ? (
        <Sec title="Links not sent" id="dk-unsent" aside={plural(s.counts.unsent, 'link', 'links')}>
          <p className="dk-note">{plural(s.counts.unsent, 'person on the list has', 'people on the list have')} not been sent their link yet.</p>
          <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'uns'} aria-busy={busy === 'uns'} onClick={() => run('uns', 'guest.unsent', { city: c.id }, (r) => outbox && !(r.sent as number) ? 'The links are in the outbox, not sent: ' + why + '.' : plural(r.sent as number, 'link', 'links') + ' on the way.')}>{busy === 'uns' ? 'Sending…' : 'Send ' + plural(s.counts.unsent, 'link', 'links')}</button></div>
          <Status said={said} k="uns" />
        </Sec>
      ) : null}

      {s.can.super && s.luma ? (
        <Sec title="Every city from Luma" id="dk-all-luma" aside={s.hook ? 'Luma’s webhook is on' : 'Luma’s webhook is not set up'}>
          <p className="dk-note">{s.hook ? 'New registrations arrive by themselves. Sync catches up anything the webhook missed.' : 'Without the webhook, places arrive only when someone syncs.'} A person registered for two cities keeps the later one.</p>
          <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'all'} aria-busy={busy === 'all'} onClick={() => run('all', 'import.all', { send: false }, (r) => (r.per as { city: string; added: number; error?: string }[]).map((x) => x.city + ': ' + (x.error || plural(x.added, 'new place', 'new places'))).join('. ') + '. Links are not sent: send them per city.')}>{busy === 'all' ? 'Syncing…' : 'Sync every city'}</button></div>
          <Status said={said} k="all" />
        </Sec>
      ) : null}

      <Sec title="Luma’s confirmation message" id="dk-luma-line">
        <p className="dk-note">Paste this line into the confirmation message on {c.name}’s Luma event. It is the same for every city.</p>
        <LumaLine said={said} say={say} />
      </Sec>

      <Sec title="Add a person" id="dk-add">
        <form className="dk-form" onSubmit={add} noValidate>
          <div className="dk-two">
            <div className="dk-f"><label className="dk-l" htmlFor="dk-add-e">Email</label><input id="dk-add-e" className="fm-i" type="email" required autoComplete="off" spellCheck={false} data-1p-ignore value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-add-n">Name{' '}<small>Optional</small></label><input id="dk-add-n" className="fm-i" type="text" autoComplete="off" maxLength={60} data-1p-ignore value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'add'} aria-busy={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add and send their link'}</button></div>
          <Status said={said} k="add" />
        </form>
      </Sec>

      <Sec title="The list" id="dk-list" aside={q ? list.length + ' of ' + s.guests.length : inRoom + ' of ' + s.guests.length + ' in the room'}>
        <div className="dk-f">
          <label className="sr-only" htmlFor="dk-q">Find a person</label>
          <input id="dk-q" className="fm-i" type="search" placeholder="Find by name or email" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length ? (
          <ul className="dk-list dk-guests" style={{ marginTop: 'var(--s-2)' }}>
            {list.slice(0, 300).map((g) => {
              const k = 'g:' + g.person;
              return (
                <li key={g.person} className="dk-row">
                  <div className="dk-who">
                    <b>{g.name || g.email}</b>
                    {g.name ? <span>{g.email}</span> : null}
                    {g.listedAs ? <span>Listed on Luma as {g.listedAs}, signed in as {g.email}</span> : null}
                    <div className="dk-marks">
                      <span className={g.opened ? 'is-on' : ''}>{g.opened ? 'Opened their link ' + ago(g.opened, now) : g.sent ? 'Link sent ' + ago(g.sent, now) : 'Link not sent'}</span>
                      {g.signedIn ? <span className="is-on">Signed in</span> : null}
                      {g.inRoom ? <span className="is-on">{(g.inRoomHow === 'host' ? 'Marked in the room ' : 'Checked in ') + ago(g.inRoom, now)}</span> : null}
                      {g.team ? <span>Team {g.team}</span> : null}
                      {g.entry ? <span className="is-on">{g.team ? 'Team has an entry' : 'Has an entry'}</span> : null}
                      {g.editor ? <span className="is-on">Editor connected {ago(g.editor, now)}</span> : null}
                    </div>
                    {shown?.person === g.person ? <input className="fm-i" style={{ marginTop: 'var(--s-2)' }} readOnly value={shown.link} aria-label={'Link for ' + (g.name || g.email)} onFocus={(e) => e.target.select()} /> : null}
                    <Status said={said} k={k} />
                  </div>
                  <div className="dk-acts">
                    {g.inRoom
                      ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Undo check-in for ' + (g.name || g.email)} onClick={() => run(k, 'guest.out', { city: c.id, person: g.person }, () => 'Check-in undone. Their next submit asks for the code.')}>Undo check-in</button>
                      : <button type="button" className="dk-t" disabled={busy === k} aria-label={'Mark in the room: ' + (g.name || g.email)} onClick={() => run(k, 'guest.in', { city: c.id, person: g.person }, () => 'Marked in the room. They can submit now.')}>Mark in the room</button>}
                    <button type="button" className="dk-t" disabled={busy === k} aria-label={'Send it again to ' + (g.name || g.email)} onClick={() => run(k, 'guest.again', { city: c.id, person: g.person }, (r) => r.status === 'sent' ? 'Sent again.' : 'In the outbox, not sent. Copy the link instead.')}>Send it again</button>
                    <button type="button" className="dk-t" disabled={busy === k} aria-label={'Copy link for ' + (g.name || g.email)} onClick={() => copy(g.person)}>Copy link</button>
                    {g.editor ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'End editor line: ' + (g.name || g.email)} onClick={() => ask({ title: 'End ' + (g.name || g.email) + '’s editor line?', text: 'Their editor stops working with the old line. They copy a new one from their account on the site; their emailed link still works.', yes: 'End the line', danger: true, run: () => run(k, 'guest.editor', { city: c.id, person: g.person }, () => 'Editor line ended. They need to copy the new one.') })}>End editor line</button> : null}
                    <button type="button" className="dk-t" disabled={busy === k} aria-label={'Remove ' + (g.name || g.email)} onClick={() => ask({ title: 'Remove ' + (g.name || g.email) + '?', text: 'They come off ' + c.name + '’s list and their link stops working.' + (g.team ? ' They leave team ' + g.team + '.' : '') + (g.entry ? ' Their entry stays until you hide it.' : ''), yes: 'Remove', danger: true, run: () => run(k, 'guest.remove', { city: c.id, person: g.person }) })}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="dk-note">{q ? 'Nobody on the list matches “' + q + '”.' : 'Nobody is on the list yet. Import the guests from Luma, or add a person.'}</p>}
        {list.length > 300 ? <p className="dk-note">Showing the first 300. Search to find someone.</p> : null}
      </Sec>

      {s.outbox.length ? (
        <Sec title="Emails from this city" id="dk-mail" aside={s.outbox.length > 12 ? 'The last 12' : undefined}>
          <ul className="dk-list">
            {s.outbox.slice(0, 12).map((o) => (
              <li key={o.id} className="dk-row">
                <div className="dk-who"><b>{o.to}</b><span>{TEMPLATE[o.template] || o.template} · {(STATUS[o.status] || o.status).toLowerCase()} · {ago(o.at, now)}</span>{shown?.person === 'o:' + o.id ? <input className="fm-i" style={{ marginTop: 'var(--s-2)' }} readOnly value={shown.link} aria-label={'Link sent to ' + o.to} onFocus={(e) => e.target.select()} /> : null}<Status said={said} k={'o:' + o.id} /></div>
                {o.link ? <div className="dk-acts"><button type="button" className="dk-t" aria-label={'Copy the link sent to ' + o.to} onClick={async () => { if (await copyText(o.link)) say('o:' + o.id, 'Link copied.'); else { setShown({ person: 'o:' + o.id, link: o.link }); say('o:' + o.id, 'Copy the link above.'); } }}>Copy link</button></div> : null}
              </li>
            ))}
          </ul>
        </Sec>
      ) : null}
    </>
  );
}

export const TEMPLATE: Record<string, string> = { link: 'Their link', again: 'Their link, again', code: 'A sign-in code', role: 'A desk role', reminder: 'A reminder' };
export const STATUS: Record<string, string> = { queued: 'Waiting', sent: 'Sent', failed: 'Failed', not_sent: 'Not sent (email not connected)' };

/* the line for Luma's confirmation message, with a copy key; the site's address is read after load */
function LumaLine({ said, say }: { said: { key: string; text: string; error: boolean } | null; say: (k: string, t: string, bad?: boolean) => void }) {
  const site = useSyncExternalStore(noop, () => window.location.origin, () => '');
  const line = site ? lumaLine(site) : '';
  return (
    <>
      <div className="dk-f"><label className="sr-only" htmlFor="dk-luma-l">The line for Luma</label><input id="dk-luma-l" className="fm-i" readOnly value={line} onFocus={(e) => e.target.select()} /></div>
      <div className="dk-acts-row"><button type="button" className="fm-b" disabled={!line} onClick={async () => say('lumaline', (await copyText(line)) ? 'Copied.' : 'Select the line above and copy it.')}>Copy the line</button></div>
      <Status said={said} k="lumaline" />
    </>
  );
}
