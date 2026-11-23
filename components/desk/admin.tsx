'use client';
/* The super admin's screens: Cities (times, venue, Luma link, the clock), People (hosts, judges, super admins),
   Switches (pause submissions or voting, in one city or all), The pick, Outbox and Log. */
import { Fragment, useState, type FormEvent } from 'react';
import { clockText, type DeskAct, type DeskCity, type DeskState } from '@/lib/event/desk';
import { ago, copyText, Sec, Status, usePress, type Ask } from './parts';
import { STATUS, TEMPLATE } from './guests';
import { CITY_WORD, FINALIST_COUNT } from '@/lib/day-data';

const DAY = '2026-12-10';
function plannedIso(hhmm: string, offset: number): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return new Date(Date.parse(DAY + 'T' + hhmm + ':00Z') - offset * 60000).toISOString();
}

export function Cities({ s, c, now, act, ask }: { s: DeskState; c: DeskCity; now: number; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const [f, setF] = useState(() => formOf(c));
  /* reset only when another city is chosen: the desk re-reads its state every few seconds, and that must never wipe
     what is being typed */
  const [was, setWas] = useState(c.id);
  if (was !== c.id) { setWas(c.id); setF(formOf(c)); }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const planned = plannedIso(f.start, c.offset);
    run('city', 'city.update', { city: c.id, venue: f.venue, luma: f.luma, lumaEvent: f.lumaEvent, editor: f.editor, buildMin: Number(f.buildMin), voteAfter: Number(f.voteAfter), ...(planned ? { planned } : {}) }, () => c.name + ' is saved.');
  };
  const live = c.buildStart != null, building = live && now < (c.buildEnd ?? 0), voting = live && !building && now < (c.voteEnd ?? 0);
  return (
    <>
      <Sec title={c.name} id="dk-city" aside={c.zone}>
        <form className="dk-form" onSubmit={save}>
          {live ? <p className="dk-note" style={{ margin: 0 }}><b>Set by the clock.</b> Building has started, so the three times are locked. Change them with the clock keys below.</p> : null}
          <div className="dk-two">
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-s">Building starts{' '}<small>{c.name} time, 10 December</small></label><input id="dk-c-s" className="fm-i" type="time" required value={f.start} onChange={set('start')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-v">Venue</label><input id="dk-c-v" className="fm-i" maxLength={120} autoComplete="off" value={f.venue} onChange={set('venue')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-b">Building lasts{' '}<small>Minutes</small></label><input id="dk-c-b" className="fm-i" type="number" inputMode="numeric" min={15} max={600} required value={f.buildMin} onChange={set('buildMin')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-a">Voting runs on after{' '}<small>Minutes</small></label><input id="dk-c-a" className="fm-i" type="number" inputMode="numeric" min={0} max={240} required value={f.voteAfter} onChange={set('voteAfter')} disabled={live} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-l">Luma link</label><input id="dk-c-l" className="fm-i" type="url" placeholder="https://lu.ma/…" autoComplete="off" spellCheck={false} value={f.luma} onChange={set('luma')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-le">Luma event ID{' '}<small>{s.luma ? 'For Sync from Luma' : 'Used once a Luma key is set'}</small></label><input id="dk-c-le" className="fm-i" type="text" placeholder="evt-…" autoComplete="off" autoCapitalize="none" spellCheck={false} data-1p-ignore value={f.lumaEvent} onChange={set('lumaEvent')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-c-e">Editor named on the page{' '}<small>Optional</small></label><input id="dk-c-e" className="fm-i" maxLength={40} autoComplete="off" value={f.editor} onChange={set('editor')} /></div>
          </div>
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'city'} aria-busy={busy === 'city'}>{busy === 'city' ? 'Saving…' : 'Save ' + c.name}</button></div>
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
      <Sec title="All cities" id="dk-all">
        <ul className="dk-list">
          {s.cities.map((x) => {
            const ph = x.buildStart == null ? 'Starts ' + clockText(x.planned, x.offset) : now < (x.buildEnd ?? 0) ? 'Building' : now < (x.voteEnd ?? 0) ? 'Voting' : 'Closed';
            const hosts = s.people.filter((p) => p.kind === 'host' && p.city === x.id).map((p) => p.name || p.email);
            return <li key={x.id} className="dk-row"><div className="dk-who"><b>{x.name}</b><span>{ph}{x.venue ? ' · ' + x.venue : ''} · {hosts.length ? 'Host: ' + hosts.join(', ') : 'No host yet'}</span></div></li>;
          })}
        </ul>
      </Sec>
    </>
  );
}
function formOf(c: DeskCity) { return { start: clockText(c.planned, c.offset), venue: c.venue, luma: c.luma, lumaEvent: c.lumaEvent, editor: c.editor, buildMin: String(c.buildMin), voteAfter: String(c.voteAfter) }; }

const ROLE: Record<string, string> = { super: 'Super admins', host: 'Hosts', judge: 'Judges' };
export function People({ s, act, ask }: { s: DeskState; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const [f, setF] = useState({ email: '', name: '', role: 'host', city: s.city || '', budget: '50' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }));
  const cityName = (id: string | null) => (id ? s.cities.find((x) => x.id === id)?.name || id : 'All cities');
  const add = (e: FormEvent) => {
    e.preventDefault();
    run('add', 'role.add', { email: f.email, name: f.name, role: f.role, roleCity: f.role === 'super' ? null : f.city || null, budget: Number(f.budget) }, () => {
      const t = (f.name || f.email) + ' is a ' + (f.role === 'super' ? 'super admin' : f.role) + (f.role === 'super' ? '' : ' for ' + cityName(f.city || null)) + '. ' + (s.mail === 'outbox' ? 'The email is in the outbox, not sent.' : 'They have an email with the link.');
      setF((o) => ({ ...o, email: '', name: '' })); return t;
    });
  };
  return (
    <>
      <Sec title="Add someone" id="dk-p-add">
        <form className="dk-form" onSubmit={add}>
          <div className="dk-two">
            <div className="dk-f"><label className="dk-l" htmlFor="dk-p-e">Email</label><input id="dk-p-e" className="fm-i" type="email" required autoComplete="off" spellCheck={false} data-1p-ignore value={f.email} onChange={set('email')} /></div>
            <div className="dk-f"><label className="dk-l" htmlFor="dk-p-n">Name{' '}<small>Optional</small></label><input id="dk-p-n" className="fm-i" maxLength={60} autoComplete="off" data-1p-ignore value={f.name} onChange={set('name')} /></div>
          </div>
          <fieldset className="dk-seg">
            <legend className="sr-only">Role</legend>
            {(['host', 'judge', 'super'] as const).map((r) => <label key={r}><input type="radio" name="dk-role" value={r} checked={f.role === r} onChange={set('role')} />{r === 'super' ? 'Super admin' : r === 'host' ? 'Host' : 'Judge'}</label>)}
          </fieldset>
          {f.role !== 'super' ? (
            <div className="dk-two">
              <div className="dk-f"><label className="dk-l" htmlFor="dk-p-c">City</label>
                <select id="dk-p-c" className="dk-sel" value={f.city} onChange={set('city')}>
                  <option value="">All cities</option>
                  {s.cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select></div>
              {f.role === 'judge' ? <div className="dk-f"><label className="dk-l" htmlFor="dk-p-b">Votes</label><input id="dk-p-b" className="fm-i" type="number" inputMode="numeric" min={1} max={1000} value={f.budget} onChange={set('budget')} /></div> : null}
            </div>
          ) : <p className="dk-note" style={{ margin: 0 }}>A super admin can do everything, in every city.</p>}
          <div className="dk-acts-row"><button type="submit" className="fm-b" disabled={busy === 'add'} aria-busy={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add and email them'}</button></div>
          <Status said={said} k="add" />
        </form>
      </Sec>
      {(['super', 'host', 'judge'] as const).map((kind) => {
        const list = s.people.filter((p) => p.kind === kind);
        return (
          <Sec key={kind} title={ROLE[kind]} id={'dk-p-' + kind} aside={String(list.length)}>
            {list.length ? (
              <ul className="dk-list">
                {list.map((p) => {
                  const k = 'r:' + p.role;
                  return (
                    <li key={p.role} className="dk-row">
                      <div className="dk-who">
                        <b>{p.name || p.email}</b>
                        <span>{p.name ? p.email + ' · ' : ''}{kind === 'super' ? 'Every city' : cityName(p.city)}</span>
                        <div className="dk-marks">
                          <span className={p.signedIn ? 'is-on' : ''}>{p.signedIn ? 'Has signed in' : 'Not signed in yet'}</span>
                          {kind === 'judge' ? <span className="is-on">{p.used} of {p.budget} votes used</span> : null}
                        </div>
                        <Status said={said} k={k} />
                      </div>
                      <div className="dk-acts">
                        <button type="button" className="dk-t" disabled={busy === k} aria-label={'Send ' + (p.name || p.email) + ' their link again'} onClick={() => run(k, 'role.again', { id: p.role }, () => s.mail === 'outbox' ? 'In the outbox, not sent.' : 'Sent again.')}>Send it again</button>
                        {p.email !== s.me.email || kind !== 'super' ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Remove ' + (p.name || p.email)} onClick={() => ask({ title: 'Remove ' + (p.name || p.email) + ' as ' + (kind === 'super' ? 'a super admin' : 'a ' + kind) + '?', text: kind === 'judge' ? 'Votes they have given stay counted.' : 'They lose the desk for ' + (kind === 'super' ? 'every city' : cityName(p.city)) + ' at once.', yes: 'Remove', danger: true, run: () => run(k, 'role.remove', { id: p.role }) })}>Remove</button> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="dk-note">None yet.</p>}
          </Sec>
        );
      })}
    </>
  );
}

export function Switches({ s, c, act, ask }: { s: DeskState; c: DeskCity; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  const anySub = s.cities.some((x) => x.submissionsPaused), anyVote = s.cities.some((x) => x.votingPaused);
  const allSub = s.cities.every((x) => x.submissionsPaused), allVote = s.cities.every((x) => x.votingPaused);
  const g = s.gate;
  const opens = g ? new Date(g.opensAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '';
  const gateSay = !g ? '' : g.why === 'desk' ? (g.open ? 'Open: opened here at the desk, before the time.' : 'Closed: kept closed here at the desk.') + ' The time says ' + opens + '.'
    : g.open ? 'Open since ' + opens + '.' : 'Closed until ' + opens + '. Until then, everyone but hosts, judges and super admins is sent to the preview page.';
  return (
    <>
      <Sec title={c.name} id="dk-sw-c">
        <div className="dk-sw">
          <div><b>Submissions</b><span className={c.submissionsPaused ? 'is-paused' : ''}>{c.submissionsPaused ? 'Paused: nobody in ' + c.name + ' can submit or edit.' : 'Open while building runs.'}</span></div>
          <button type="button" className="fm-b" disabled={busy === 'sub'} aria-label={(c.submissionsPaused ? 'Resume' : 'Pause') + ' submissions in ' + c.name} onClick={() => run('sub', 'switch', { city: c.id, submissionsPaused: !c.submissionsPaused }, () => c.submissionsPaused ? 'Submissions are open again in ' + c.name + '.' : 'Submissions are paused in ' + c.name + '.')}>{c.submissionsPaused ? 'Resume' : 'Pause'}</button>
        </div>
        <Status said={said} k="sub" />
        <div className="dk-sw">
          <div><b>Voting</b><span className={c.votingPaused ? 'is-paused' : ''}>{c.votingPaused ? 'Paused: votes in ' + c.name + ' are refused.' : 'Open from the start of building until voting closes.'}</span></div>
          <button type="button" className="fm-b" disabled={busy === 'vote'} aria-label={(c.votingPaused ? 'Resume' : 'Pause') + ' voting in ' + c.name} onClick={() => run('vote', 'switch', { city: c.id, votingPaused: !c.votingPaused }, () => c.votingPaused ? 'Voting is open again in ' + c.name + '.' : 'Voting is paused in ' + c.name + '.')}>{c.votingPaused ? 'Resume' : 'Pause'}</button>
        </div>
        <Status said={said} k="vote" />
      </Sec>
      <Sec title="Every city at once" id="dk-sw-all">
        <div className="dk-acts-row">
          {([['submissions', anySub, allSub, 'submit or edit'], ['voting', anyVote, allVote, 'vote']] as const).map(([what, any, every, verb]) => {
            const key = what === 'submissions' ? 'submissionsPaused' : 'votingPaused', Word = what === 'submissions' ? 'Submissions' : 'Voting';
            return (
              <Fragment key={what}>
                {every ? null : <button type="button" className="fm-b" disabled={busy === 'all'} onClick={() => ask({ title: 'Pause ' + what + ' in all ' + CITY_WORD + ' cities?', text: 'Nobody anywhere can ' + verb + ' until you resume.', yes: 'Pause everywhere', danger: true, run: () => run('all', 'switch', { all: true, [key]: true }, () => Word + ' is paused in every city.') })}>Pause {what} everywhere</button>}
                {any ? <button type="button" className="fm-b" disabled={busy === 'all'} onClick={() => ask({ title: 'Resume ' + what + ' everywhere?', text: 'Every city opens again at once.', yes: 'Resume everywhere', run: () => run('all', 'switch', { all: true, [key]: false }, () => Word + ' is open in every city.') })}>Resume {what} everywhere</button> : null}
              </Fragment>
            );
          })}
        </div>
        <Status said={said} k="all" />
        <ul className="dk-list" style={{ marginTop: 'var(--s-4)' }}>
          {s.cities.map((x) => <li key={x.id} className="dk-row"><div className="dk-who"><b>{x.name}</b><span>{x.submissionsPaused || x.votingPaused ? [x.submissionsPaused ? 'Submissions paused' : '', x.votingPaused ? 'Voting paused' : ''].filter(Boolean).join(' · ') : 'Nothing paused'}</span></div></li>)}
        </ul>
      </Sec>
      {g ? (
        <Sec title="The day pages" id="dk-sw-gate" aside={g.open ? 'Open' : 'Closed'}>
          <div className="dk-sw">
            <div><b>The home and the city pages</b><span>{gateSay}</span></div>
            <button type="button" className="fm-b" disabled={busy === 'gate'} onClick={() => g.open
              ? ask({ title: 'Close the day pages?', text: 'Everyone but hosts, judges and super admins is sent to the preview page until you open them again.', yes: 'Close them', danger: true, run: () => run('gate', 'gate.set', { open: 'closed' }, () => 'The day pages are closed.') })
              : ask({ title: 'Open the day pages now?', text: 'The home and every city page open for everyone, before the time.', yes: 'Open now', run: () => run('gate', 'gate.set', { open: 'open' }, () => 'The day pages are open.') })}>{g.open ? 'Close' : 'Open now'}</button>
          </div>
          {g.override !== 'auto' ? <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'gate'} onClick={() => run('gate', 'gate.set', { open: 'auto' }, () => 'Back to the time: the pages open at ' + opens + '.')}>Follow the time again</button></div> : null}
          <Status said={said} k="gate" />
        </Sec>
      ) : null}
    </>
  );
}

export function Pick({ s, c, now, act, ask }: { s: DeskState; c: DeskCity; now: number; act: DeskAct; ask: (a: Ask) => void }) {
  const { busy, said, run } = usePress(act);
  /* the 30 finalists exist once each city's voting has closed; before that a top 3 can still change */
  const final = c.voteEnd != null && now >= c.voteEnd;
  const top = s.entries.filter((e) => !e.hidden).sort((a, b) => b.votes - a.votes).slice(0, 3);
  const pickCity = s.pick ? s.cities.find((x) => x.id === s.pick!.city)?.name || s.pick.city : '';
  return (
    <Sec title="The pick" id="dk-pick" aside={s.pick ? s.pick.name + ', ' + pickCity : 'Not entered'}>
      <p className="dk-note">Ant and Copple choose one of the {FINALIST_COUNT} finalists. Enter their choice here when they say it; the pages show it at once. Choose the city above, then the project.</p>
      {final ? null : <p className="dk-note"><b>Not yet for {c.name}.</b> {c.voteEnd ? 'Its top 3 is final when voting closes at ' + clockText(c.voteEnd, c.offset) + '.' : 'Its top 3 is final once its voting has closed.'}</p>}
      {top.length ? (
        <ul className="dk-list">
          {top.map((e, i) => {
            const k = 'p:' + e.no, on = s.pick?.no === e.no;
            return (
              <li key={e.no} className="dk-row">
                <div className="dk-who"><b>{e.name}</b><span>{['First', 'Second', 'Third'][i]} in {c.name} · {e.votes} votes{on ? ' · The pick' : ''}</span><Status said={said} k={k} /></div>
                <div className="dk-acts"><button type="button" className="dk-t" disabled={busy === k || on || !final} aria-label={on ? e.name + ' is the pick' : 'Enter ' + e.name + ' as the pick'} onClick={() => ask({ title: 'Enter ' + e.name + ' as the pick?', text: 'Every page names it as the global winner from this moment.' + (s.pick ? ' It replaces ' + s.pick.name + '.' : ''), yes: 'Enter the pick', danger: true, run: () => run(k, 'pick.set', { city: c.id, no: e.no }, () => e.name + ' is the pick.') })}>{on ? 'The pick' : 'Enter as the pick'}</button></div>
              </li>
            );
          })}
        </ul>
      ) : <p className="dk-note">{c.name} has no entries yet.</p>}
    </Sec>
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
          <thead><tr><th>When</th><th>What</th><th>Who</th><th>City</th></tr></thead>
          <tbody>
            {s.log.map((l) => {
              const what = l.what.charAt(0).toUpperCase() + l.what.slice(1), where = l.city ? s.cities.find((x) => x.id === l.city)?.name || l.city : 'All';
              return <tr key={l.id}><td className="dk-tnum dk-mid">{ago(l.at, now)}</td><td className="dk-lead">{what}<span className="dk-oneline">{[l.who || 'The system', where, ago(l.at, now)].join(' · ')}</span></td><td className="dk-mid">{l.who || 'The system'}</td><td className="dk-mid">{where}</td></tr>;
            })}
          </tbody>
        </table>
      ) : <p className="dk-note">Nothing yet.</p>}
    </Sec>
  );
}
