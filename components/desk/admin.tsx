'use client';
/* An event admin's screens: Place (a place's times, venue, Luma event, prize, the clock), People (admins, hosts and
   judges, for the event or one place; super admins for a super admin), Switches (pause submissions or voting, in one
   place or every place of the event), Outbox and Log. The event's own screens are in event.tsx. */
import { Fragment, useState, type FormEvent } from 'react';
import { clockText, type DeskAct, type DeskCity, type DeskState, type RoleKind } from '@/lib/event/desk';
import { ago, copyText, Sec, Status, usePress, useUnsaved, type Ask } from './parts';
import { STATUS, TEMPLATE } from './guests';
import { dayText } from './events';

/* a place's planned start keeps its own day (Luma's), at the time typed, in the place's offset */
function plannedIso(c: DeskCity, hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const day = new Date(c.planned + c.offset * 60000).toISOString().slice(0, 10);
  return new Date(Date.parse(day + 'T' + hhmm + ':00Z') - c.offset * 60000).toISOString();
}
const localDayOf = (c: DeskCity) => dayText(new Date(c.planned + c.offset * 60000).toISOString().slice(0, 10));

export function Place({ s, c, now, act, ask }: { s: DeskState; c: DeskCity; now: number; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const ev = s.events.find((e) => e.id === s.event);
  const [f, setF] = useState(() => formOf(c));
  /* reset only when another city is chosen: the desk re-reads its state every few seconds, and that must never wipe
     what is being typed */
  const [was, setWas] = useState(c.id);
  if (was !== c.id) { setWas(c.id); setF(formOf(c)); }
  useUnsaved(c.name + '’s settings', JSON.stringify(f) !== JSON.stringify(formOf(c)));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const planned = plannedIso(c, f.start);
    run('city', 'city.update', { city: c.id, name: f.name, venue: f.venue, luma: f.luma, lumaEvent: f.lumaEvent, editor: f.editor, prize: f.prize, buildMin: Number(f.buildMin), voteAfter: Number(f.voteAfter), ...(planned && !live ? { planned } : {}) }, () => f.name + ' is saved.');
  };
  const live = c.buildStart != null, building = live && now < (c.buildEnd ?? 0), voting = live && !building && now < (c.voteEnd ?? 0);
  return (
    <>
      <Sec title={c.name} id="dk-city" aside={c.zone.replace(/_/g, ' ')}>
        <form className="dk-form" onSubmit={save}>
          {live ? <p className="dk-note" style={{ margin: 0 }}><b>Set by the clock.</b> Building has started, so the three times are locked. Change them with the clock keys below.</p> : null}
          <div className="dk-two">
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-n">Name</label><input id="dk-c-n" className="fm-i" required minLength={2} maxLength={60} autoComplete="off" value={f.name} onChange={set('name')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-s">Building starts{' '}<small>{c.name} time, {localDayOf(c)}</small></label><input id="dk-c-s" className="fm-i" type="time" required value={f.start} onChange={set('start')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-v">Venue</label><input id="dk-c-v" className="fm-i" maxLength={120} autoComplete="off" value={f.venue} onChange={set('venue')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-b">Building lasts{' '}<small>Minutes</small></label><input id="dk-c-b" className="fm-i" type="number" inputMode="numeric" min={15} max={600} required value={f.buildMin} onChange={set('buildMin')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-a">Voting runs on after{' '}<small>Minutes</small></label><input id="dk-c-a" className="fm-i" type="number" inputMode="numeric" min={0} max={240} required value={f.voteAfter} onChange={set('voteAfter')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-l">Luma link</label><input id="dk-c-l" className="fm-i" type="url" placeholder="https://lu.ma/…" autoComplete="off" spellCheck={false} value={f.luma} onChange={set('luma')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-le">Luma event ID{' '}<small>{s.luma ? 'For Sync from Luma' : 'Used once a Luma key is set'}</small></label><input id="dk-c-le" className="fm-i" type="text" placeholder="evt-…" autoComplete="off" autoCapitalize="none" spellCheck={false} data-1p-ignore value={f.lumaEvent} onChange={set('lumaEvent')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-e">Editor named on the page{' '}<small>Optional</small></label><input id="dk-c-e" className="fm-i" maxLength={40} autoComplete="off" value={f.editor} onChange={set('editor')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-p">Prize for first place{' '}<small>{ev?.f.placePrize ? 'If empty: ' + ev.f.placePrize : 'Optional'}</small></label><input id="dk-c-p" className="fm-i" maxLength={120} autoComplete="off" value={f.prize} onChange={set('prize')} /></div>
          </div>
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'city'} aria-busy={busy === 'city'}>{busy === 'city' ? 'Saving…' : 'Save'}</button></div>
          <Status said={said} k="city" />
        </form>
      </Sec>
      <Sec title="The clock" id="dk-clock" aside={live ? (building ? 'Building until ' + clockText(c.buildEnd!, c.offset) : voting ? 'Voting until ' + clockText(c.voteEnd!, c.offset) : 'Closed') : 'Not started'}>
        <div className="dk-acts-row dk-keys">
          <button type="button" className="fm-b" disabled={!building || busy === 'clk'} onClick={() => run('clk', 'clock.add', { city: c.id, what: 'build', mins: 5 }, () => 'Five minutes added to building.')}>Add 5 minutes to building</button>
          <button type="button" className="fm-b" disabled={!(building || voting) || busy === 'clk'} onClick={() => run('clk', 'clock.add', { city: c.id, what: 'vote', mins: 5 }, () => 'Five minutes added to voting.')}>Add 5 minutes to voting</button>
          </div>
        <div className="dk-acts-row dk-keys">
          <button type="button" className="fm-b" disabled={!building || busy === 'clk'} onClick={() => ask({ title: 'End building in ' + c.name + ' now?', text: 'Submit closes on every phone in the room. This cannot be undone.', yes: 'End building', danger: true, run: () => run('clk', 'clock.end', { city: c.id, what: 'build' }, () => 'Building has ended.') })}>End building now</button>
          <button type="button" className="fm-b" disabled={!voting || busy === 'clk'} onClick={() => ask({ title: 'End voting in ' + c.name + ' now?', text: 'The ranking is final from this moment. This cannot be undone.', yes: 'End voting', danger: true, run: () => run('clk', 'clock.end', { city: c.id, what: 'vote' }, () => 'Voting has ended.') })}>End voting now</button>
        </div>
        <Status said={said} k="clk" />
      </Sec>
    </>
  );
}
function formOf(c: DeskCity) { return { name: c.name, prize: c.prize, start: clockText(c.planned, c.offset), venue: c.venue, luma: c.luma, lumaEvent: c.lumaEvent, editor: c.editor, buildMin: String(c.buildMin), voteAfter: String(c.voteAfter) }; }

/* the kinds, in the order the list shows them, with what each can do */
const KINDS: { id: RoleKind; one: string; many: string; can: string }[] = [
  { id: 'admin', one: 'Admin', many: 'Admins', can: 'Everything in this event: its places, people, format and final.' },
  { id: 'host', one: 'Host', many: 'Hosts', can: 'Runs a place on the day: the guest list, the door, the stage and the clock.' },
  { id: 'judge', one: 'Judge', many: 'Judges', can: 'Votes or scores the entries, and sees their flags.' },
  { id: 'super', one: 'Super admin', many: 'Super admins', can: 'Everything in every event, and makes new events.' },
];
export function People({ s, act, ask }: { s: DeskState; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const ev = s.events.find((e) => e.id === s.event)!;
  const many = s.cities.length > 1;
  const [f, setF] = useState({ email: '', name: '', role: 'host' as RoleKind, city: s.city || (many ? '' : s.cities[0]?.id || ''), budget: String(ev.f.judgeBudget) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));
  const cityName = (id: string | null) => (id ? s.cities.find((x) => x.id === id)?.name || id : many ? 'every place' : ev.short);
  const kinds = KINDS.filter((k) => k.id !== 'super' || s.me.super);
  const budgets = ev.f.decide !== 'votes' && ev.f.judging === 'budget';
  const scopeOf = (r: RoleKind) => (r === 'admin' || r === 'super' ? null : f.city || null);
  const add = (e: FormEvent) => {
    e.preventDefault();
    run('add', 'role.add', { event: ev.id, email: f.email, name: f.name, role: f.role, roleCity: scopeOf(f.role), budget: Number(f.budget) }, () => {
      const k = KINDS.find((x) => x.id === f.role)!;
      const t = (f.name || f.email) + ' is ' + (f.role === 'admin' ? 'an admin' : 'a ' + k.one.toLowerCase()) + (f.role === 'super' ? '' : f.role === 'admin' ? ' of ' + ev.short : ' for ' + cityName(scopeOf(f.role))) + '. ' + (s.mail === 'outbox' ? 'The email is in the outbox, not sent.' : 'They have an email with the link.');
      setF((o) => ({ ...o, email: '', name: '' })); return t;
    });
  };
  const all = s.people.concat(s.me.super ? s.supers : []);
  return (
    <>
      <Sec title={'Add someone to ' + ev.short} id="dk-p-add">
        <form className="dk-form" onSubmit={add}>
          <div className="dk-two">
            <div className="dk-f"><label className="dk-l" htmlFor="dk-p-e">Email</label><input id="dk-p-e" className="fm-i" type="email" required autoComplete="off" spellCheck={false} data-1p-ignore value={f.email} onChange={set('email')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-p-n">Name{' '}<small>Optional</small></label><input id="dk-p-n" className="fm-i" maxLength={60} autoComplete="off" data-1p-ignore value={f.name} onChange={set('name')} /></div>
          </div>
          <fieldset className="dk-seg">
            <legend className="sr-only">Role</legend>
            {kinds.map((k) => <label key={k.id}><input type="radio" name="dk-role" value={k.id} checked={f.role === k.id} onChange={set('role')} />{k.one}</label>)}
          </fieldset>
          <p className="dk-note" style={{ margin: 0 }}>{KINDS.find((k) => k.id === f.role)!.can}</p>
          {f.role === 'host' || f.role === 'judge' ? (
            <div className="dk-two">
              {many ? (
                <div className="dk-f"><label className="dk-l" htmlFor="dk-p-c">Where</label>
                  <select id="dk-p-c" className="dk-sel" value={f.city} onChange={set('city')}>
                    <option value="">{f.role === 'judge' ? 'The whole event' : 'Every place'}</option>
                    {s.cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select></div>
              ) : null}
              {f.role === 'judge' && budgets ? <div className="dk-f"><label className="dk-l" htmlFor="dk-p-b">Votes{' '}<small>{f.city || !many ? 'For this place' : 'Across the event'}</small></label><input id="dk-p-b" className="fm-i" type="number" inputMode="numeric" min={1} max={1000} value={f.budget} onChange={set('budget')} /></div> : null}
            </div>
          ) : null}
          {f.role === 'judge' && ev.f.decide === 'votes' ? <p className="dk-warn" style={{ margin: 0 }}><b>In this event only the votes decide.</b> A judge can see the entries and their flags, but has no say until Format gives judges one.</p> : null}
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'add'} aria-busy={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add and email them'}</button></div>
          <Status said={said} k="add" />
        </form>
      </Sec>
      {kinds.map((kind) => {
        const list = all.filter((p) => p.kind === kind.id).sort((a, b) => Number(!!a.city) - Number(!!b.city) || cityName(a.city).localeCompare(cityName(b.city)));
        if (!list.length && kind.id === 'super') return null;
        return (
          <Sec key={kind.id} title={kind.many} id={'dk-p-' + kind.id} aside={String(list.length)}>
            {list.length ? (
              <ul className="dk-list">
                {list.map((p) => {
                  const k = 'r:' + p.role;
                  const where = kind.id === 'super' ? 'Every event' : kind.id === 'admin' ? 'The whole event' : p.city ? cityName(p.city) : kind.id === 'judge' ? 'The whole event' : 'Every place';
                  const work = kind.id !== 'judge' ? null : ev.f.judging === 'scores' ? p.scored + (p.scored === 1 ? ' project scored' : ' projects scored') : budgets ? p.used + ' of ' + p.budget + ' votes used' : null;
                  return (
                    <li key={p.role} className="dk-row">
                      <div className="dk-who">
                        <b>{p.name || p.email}</b>
                        <span>{p.name ? p.email + ' · ' : ''}{where}</span>
                        <div className="dk-marks">
                          <span className={p.signedIn ? 'is-on' : ''}>{p.signedIn ? 'Has signed in' : 'Not signed in yet'}</span>
                          {work ? <span className="is-on">{work}</span> : null}
                        </div>
                        <Status said={said} k={k} />
                      </div>
                      <div className="dk-acts">
                        <button type="button" className="dk-t" disabled={busy === k} aria-label={'Send ' + (p.name || p.email) + ' their link again'} onClick={() => run(k, 'role.again', { id: p.role }, () => s.mail === 'outbox' ? 'In the outbox, not sent.' : 'Sent again.')}>Send it again</button>
                        {p.email !== s.me.email || (kind.id !== 'super' && kind.id !== 'admin') ? <button type="button" className="dk-t" disabled={busy === 'gone:' + kind.id} aria-label={'Remove ' + (p.name || p.email)} onClick={() => ask({ title: 'Remove ' + (p.name || p.email) + ' as ' + (kind.id === 'admin' ? 'an admin' : 'a ' + kind.one.toLowerCase()) + '?', text: kind.id === 'judge' ? 'What they have given stays counted.' : 'They lose the desk for ' + where.toLowerCase() + ' at once.', yes: 'Remove', danger: true, run: () => run('gone:' + kind.id, 'role.remove', { id: p.role }, () => (p.name || p.email) + ' is no longer ' + (kind.id === 'admin' ? 'an admin' : 'a ' + kind.one.toLowerCase()) + '.') })}>Remove</button> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="dk-note" style={{ marginTop: 0 }}>None yet. {kind.can}</p>}
            <Status said={said} k={'gone:' + kind.id} />
          </Sec>
        );
      })}
    </>
  );
}

export function Switches({ s, c, act, ask }: { s: DeskState; c: DeskCity | null; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const ev = s.events.find((e) => e.id === s.event)!;
  const anySub = s.cities.some((x) => x.submissionsPaused), anyVote = s.cities.some((x) => x.votingPaused);
  const allSub = s.cities.every((x) => x.submissionsPaused), allVote = s.cities.every((x) => x.votingPaused);
  const voting = ev.f.decide !== 'judges';
  const g = s.gate;
  const opens = g ? new Date(g.opensAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '';
  const gateSay = !g ? '' : g.why === 'desk' ? (g.open ? 'Open: opened here at the desk, before the time.' : 'Closed: kept closed here at the desk.') + ' The time says ' + opens + '.'
    : g.open ? 'Open since ' + opens + '.' : 'Closed until ' + opens + '. Until then, everyone but hosts, judges and admins is sent to the preview page.';
  const one = s.cities.length === 1 ? s.cities[0] : c;
  return (
    <>
      {one ? (
        <Sec title={one.name} id="dk-sw-c">
          <div className="dk-sw">
            <div><b>Submissions</b><span className={one.submissionsPaused ? 'is-paused' : ''}>{one.submissionsPaused ? 'Paused: nobody in ' + one.name + ' can submit or edit.' : 'Open while building runs.'}</span></div>
            <button type="button" className="fm-b" disabled={busy === 'sub'} aria-label={(one.submissionsPaused ? 'Resume' : 'Pause') + ' submissions in ' + one.name} onClick={() => run('sub', 'switch', { city: one.id, submissionsPaused: !one.submissionsPaused }, () => one.submissionsPaused ? 'Submissions are open again in ' + one.name + '.' : 'Submissions are paused in ' + one.name + '.')}>{one.submissionsPaused ? 'Resume' : 'Pause'}</button>
          </div>
          <Status said={said} k="sub" />
          {voting ? (
            <>
              <div className="dk-sw">
                <div><b>Voting</b><span className={one.votingPaused ? 'is-paused' : ''}>{one.votingPaused ? 'Paused: votes in ' + one.name + ' are refused.' : 'Open from the start of building until voting closes.'}</span></div>
                <button type="button" className="fm-b" disabled={busy === 'vote'} aria-label={(one.votingPaused ? 'Resume' : 'Pause') + ' voting in ' + one.name} onClick={() => run('vote', 'switch', { city: one.id, votingPaused: !one.votingPaused }, () => one.votingPaused ? 'Voting is open again in ' + one.name + '.' : 'Voting is paused in ' + one.name + '.')}>{one.votingPaused ? 'Resume' : 'Pause'}</button>
              </div>
              <Status said={said} k="vote" />
            </>
          ) : null}
        </Sec>
      ) : null}
      {s.cities.length > 1 ? (
        <Sec title={'Every place in ' + ev.short} id="dk-sw-all">
          <div className="dk-acts-row">
            {([['submissions', anySub, allSub, 'submit or edit'], ...(voting ? [['voting', anyVote, allVote, 'vote']] as const : [])] as const).map(([what, any, every, verb]) => {
              const key = what === 'submissions' ? 'submissionsPaused' : 'votingPaused', Word = what === 'submissions' ? 'Submissions' : 'Voting';
              return (
                <Fragment key={what}>
                  {every ? null : <button type="button" className="fm-b" disabled={busy === 'all'} onClick={() => ask({ title: 'Pause ' + what + ' in every place?', text: 'Nobody in ' + ev.short + ' can ' + verb + ' until you resume.', yes: 'Pause everywhere', danger: true, run: () => run('all', 'switch', { event: ev.id, all: true, [key]: true }, () => Word + ' is paused in every place.') })}>Pause {what} everywhere</button>}
                  {any ? <button type="button" className="fm-b" disabled={busy === 'all'} onClick={() => ask({ title: 'Resume ' + what + ' everywhere?', text: 'Every place opens again at once.', yes: 'Resume everywhere', run: () => run('all', 'switch', { event: ev.id, all: true, [key]: false }, () => Word + ' is open in every place.') })}>Resume {what} everywhere</button> : null}
                </Fragment>
              );
            })}
          </div>
          <Status said={said} k="all" />
          <ul className="dk-list" style={{ marginTop: 'var(--s-4)' }}>
            {s.cities.map((x) => <li key={x.id} className="dk-row"><div className="dk-who"><b>{x.name}</b><span>{x.submissionsPaused || x.votingPaused ? [x.submissionsPaused ? 'Submissions paused' : '', x.votingPaused ? 'Voting paused' : ''].filter(Boolean).join(' · ') : 'Nothing paused'}</span></div></li>)}
          </ul>
        </Sec>
      ) : null}
      {g ? (
        <Sec title="The day pages" id="dk-sw-gate" aside={g.open ? 'Open' : 'Closed'}>
          <div className="dk-sw">
            <div><b>The home and the city pages</b><span>{gateSay}</span></div>
            <button type="button" className="fm-b" disabled={busy === 'gate'} onClick={() => g.open
              ? ask({ title: 'Close the day pages?', text: 'Everyone but hosts, judges and admins is sent to the preview page until you open them again.', yes: 'Close them', danger: true, run: () => run('gate', 'gate.set', { open: 'closed' }, () => 'The day pages are closed.') })
              : ask({ title: 'Open the day pages now?', text: 'The home and every city page open for everyone, before the time.', yes: 'Open now', run: () => run('gate', 'gate.set', { open: 'open' }, () => 'The day pages are open.') })}>{g.open ? 'Close' : 'Open now'}</button>
          </div>
          {g.override !== 'auto' ? <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'gate'} onClick={() => run('gate', 'gate.set', { open: 'auto' }, () => 'Back to the time: the pages open at ' + opens + '.')}>Follow the time again</button></div> : null}
          <Status said={said} k="gate" />
        </Sec>
      ) : null}
    </>
  );
}

export function Outbox({ s, now, act }: { s: DeskState; now: number; act: DeskAct }) {
  const { busy, said, run, say } = usePress(act);
  /* when the browser refuses the clipboard, the link shows in a field that selects itself */
  const [shown, setShown] = useState<{ id: string; link: string } | null>(null);
  const what = (o: DeskState['outbox'][number]) => (TEMPLATE[o.template] || o.template) + (o.city ? ', ' + (s.cities.find((x) => x.id === o.city)?.name || o.city) : '');
  return (
    <Sec title="Outbox" id="dk-out" aside={s.mail === 'outbox' ? 'Email not connected: nothing is sent' : s.mailHeld ? (s.mailTest ? 'Place emails on hold, except the test list' : 'Place emails on hold; sign-in emails send') : 'Sending through Resend'}>
      {s.outbox.length ? (
        <table className="dk-tbl">
          <thead><tr><th>To</th><th>What</th><th>State</th><th>When</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {s.outbox.map((o) => (
              <tr key={o.id}>
                <td className="dk-lead">{o.to}{o.code ? <> · code <b className="dk-codev">{o.code}</b></> : null}
                  {/* on a phone the row is two lines: the address, then what, state and when in one quieter line; the
                      state only when it says more than the heading does */}
                  <span className="dk-oneline">{[what(o), o.status === 'failed' || s.mail !== 'outbox' ? (STATUS[o.status] || o.status) + (o.error ? ': ' + o.error : '') : '', ago(o.at, now)].filter(Boolean).join(' · ')}</span>
                  {shown?.id === o.id ? <input className="fm-i" style={{ marginTop: 'var(--s-2)' }} readOnly value={shown.link} aria-label={'Link sent to ' + o.to} onFocus={(e) => e.target.select()} /> : null}
                  <Status said={said} k={'o:' + o.id} /></td>
                <td className="dk-mid">{what(o)}</td>
                <td className="dk-mid"><span className={o.status === 'failed' ? 'dk-bad' : undefined}>{STATUS[o.status] || o.status}{o.error ? ': ' + o.error : ''}</span></td>
                <td className="dk-tnum dk-mid">{ago(o.at, now)}</td>
                <td><div className="dk-cell-acts">
                  {o.link ? <button type="button" className="dk-t" aria-label={'Copy the link sent to ' + o.to} onClick={async () => { if (await copyText(o.link)) say('o:' + o.id, 'Link copied.'); else { setShown({ id: o.id, link: o.link }); say('o:' + o.id, 'Copy the link above.'); } }}>Copy link</button> : null}
                  {o.status === 'failed' ? <button type="button" className="dk-t" disabled={busy === 'o:' + o.id} aria-label={'Retry the email to ' + o.to} onClick={() => run('o:' + o.id, 'outbox.retry', { id: o.id }, () => 'Sent again.')}>Retry</button> : null}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="dk-note">No emails yet.</p>}
      {s.devCodes ? <p className="dk-note">Codes show here because this is the development server.</p> : null}
    </Sec>
  );
}

export function Log({ s, now }: { s: DeskState; now: number }) {
  return (
    <Sec title="Log" id="dk-log" aside={'Last ' + s.log.length}>
      {s.log.length ? (
        <table className="dk-tbl">
          <thead><tr><th>When</th><th>What</th><th>Who</th><th>Place</th></tr></thead>
          <tbody>
            {s.log.map((l) => {
              const what = l.what.charAt(0).toUpperCase() + l.what.slice(1), where = l.city ? s.cities.find((x) => x.id === l.city)?.name || l.city : 'The event';
              return <tr key={l.id}><td className="dk-tnum dk-mid">{ago(l.at, now)}</td><td className="dk-lead">{what}<span className="dk-oneline">{[l.who || 'The system', where, ago(l.at, now)].join(' · ')}</span></td><td className="dk-mid">{l.who || 'The system'}</td><td className="dk-mid">{where}</td></tr>;
            })}
          </tbody>
        </table>
      ) : <p className="dk-note">Nothing yet.</p>}
    </Sec>
  );
}
