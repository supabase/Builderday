'use client';
/* Events: every event this person sees, soonest first, and (for a super admin) a new one. An event is a name, a day and
   a format; its places come after, picked from Luma on its Places tab. The format starts from one of four presets,
   each said in one line, and every part of it can be changed on Format. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DeskAct, DeskEvent, DeskState } from '@/lib/event/desk';
import { PRESETS, formatLine } from '@/lib/event/format';
import { Sec, Status, usePress, useUnsaved, clearUnsaved, IconGo } from './parts';

export const dayText = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const PHASE: Record<DeskEvent['phase'], string> = { next: 'Coming up', live: 'Running now', done: 'Done' };

export function EventList({ s, now, act, open }: { s: DeskState; now: number; act: DeskAct; open: (id: string, tab?: string) => void }) {
  const live = s.events.filter((e) => !e.archived), old = s.events.filter((e) => e.archived);
  const [making, setMaking] = useState(false);
  /* closing the form hands focus back to the key that opened it */
  const newRef = useRef<HTMLButtonElement>(null), wasMaking = useRef(false);
  useEffect(() => { if (wasMaking.current && !making) newRef.current?.focus(); wasMaking.current = making; }, [making]);
  void now;
  return (
    <>
      <div className="dk-top">
        <div>
          <h1 className="dk-h">Events</h1>
          <p className="dk-p">{live.length ? live.length === 1 ? 'One event.' : live.length + ' events.' : 'No events yet.'} Open one to see its places, people and format.</p>
        </div>
        {s.me.super && !making ? <button ref={newRef} type="button" className="fm-b is-go" onClick={() => setMaking(true)}>New event</button> : null}
      </div>
      {making ? <NewEvent act={act} done={(id) => { setMaking(false); if (id) open(id, 'places'); }} /> : null}
      {live.length ? <ul className="dk-evs">{live.map((e) => <EventRow key={e.id} e={e} open={open} />)}</ul> : null}
      {old.length ? (
        <details className="dk-more">
          <summary>Archived ({old.length})</summary>
          <ul className="dk-evs">{old.map((e) => <EventRow key={e.id} e={e} open={open} />)}</ul>
        </details>
      ) : null}
      {s.supers.length ? (
        <Sec title="Super admins" id="dk-supers" aside={String(s.supers.length)}>
          <p className="dk-note" style={{ marginTop: 0 }}>They can do everything in every event, and make new ones. Add or remove them on any event’s People tab.</p>
          <ul className="dk-list">
            {s.supers.map((p) => <li key={p.role} className="dk-row"><div className="dk-who"><b>{p.name || p.email}</b><span>{p.name ? p.email + ' · ' : ''}{p.signedIn ? 'Has signed in' : 'Not signed in yet'}</span></div></li>)}
          </ul>
        </Sec>
      ) : null}
    </>
  );
}

function EventRow({ e, open }: { e: DeskEvent; open: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="dk-ev" onClick={() => open(e.id)}>
        <span className="dk-ev-main">
          <b>{e.name}</b>
          <span>{dayText(e.day)} · {e.places === 1 ? 'One place' : e.places + ' places'}{e.mine ? ' · ' + e.mine : ''}</span>
          <span className="dk-ev-f">{formatLine(e.f, e.places)}</span>
        </span>
        <span className="dk-ev-nums">
          <span><b>{e.listed}</b> on the lists</span>
          <span><b>{e.entries}</b> {e.entries === 1 ? 'entry' : 'entries'}</span>
        </span>
        <span className={'dk-ev-phase is-' + (e.archived ? 'off' : e.phase)}>{e.archived ? 'Archived' : PHASE[e.phase]}</span>
        <span className="dk-ev-go"><IconGo /></span>
      </button>
    </li>
  );
}

/* the next free Saturday-ish default: four weeks from today */
const inFourWeeks = () => new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);

function NewEvent({ act, done }: { act: DeskAct; done: (id: string | null) => void }) {
  const { busy, said, run } = usePress(act);
  const [f, setF] = useState({ name: '', short: '', shortTouched: false, day: inFourWeeks(), preset: PRESETS[0].id });
  const shortOf = (n: string) => n.replace(/^supabase\s+/i, '').slice(0, 30);
  useUnsaved('the new event', f.name.trim() !== '' && busy !== 'new');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run('new', 'event.create', { name: f.name, short: f.short || shortOf(f.name), day: f.day, preset: f.preset }, (r) => { clearUnsaved(); done(String(r.id)); return 'Made. Now add its places.'; });
  };
  return (
    <Sec title="New event" id="dk-new">
      <form className="dk-form" onSubmit={submit}>
        <div className="dk-two">
          <div className="dk-f"><label className="dk-l" htmlFor="dk-n-name">Name{' '}<small>As people will read it</small></label>
            <input id="dk-n-name" className="fm-i" required minLength={2} maxLength={60} autoComplete="off" data-1p-ignore placeholder="Supabase Hack Lisbon" value={f.name}
              onChange={(e) => { const name = e.target.value; setF((o) => ({ ...o, name, short: o.shortTouched ? o.short : shortOf(name) })); }} autoFocus /></div>
          <div className="dk-f"><label className="dk-l" htmlFor="dk-n-short">Short name{' '}<small>For the desk and emails</small></label>
            <input id="dk-n-short" className="fm-i" required minLength={2} maxLength={30} autoComplete="off" data-1p-ignore value={f.short} onChange={(e) => setF((o) => ({ ...o, short: e.target.value, shortTouched: true }))} /></div>
          <div className="dk-f"><label className="dk-l" htmlFor="dk-n-day">Day</label>
            <input id="dk-n-day" className="fm-i" type="date" required value={f.day} onChange={(e) => setF((o) => ({ ...o, day: e.target.value }))} /></div>
        </div>
        <fieldset className="dk-cards">
          <legend className="dk-l">How it is decided{' '}<small>Every part can be changed after, on Format</small></legend>
          {PRESETS.map((p) => (
            <label key={p.id} className="dk-card">
              <input type="radio" name="dk-preset" value={p.id} checked={f.preset === p.id} onChange={() => setF((o) => ({ ...o, preset: p.id }))} />
              <b>{p.name}</b>
              <span>{p.line}</span>
            </label>
          ))}
        </fieldset>
        <div className="dk-acts-row">
          <button type="submit" className="fm-b is-go" disabled={busy === 'new'} aria-busy={busy === 'new'}>{busy === 'new' ? 'Making…' : 'Make the event'}</button>
          <button type="button" className="fm-b" onClick={() => { clearUnsaved(); done(null); }}>Cancel</button>
        </div>
        <Status said={said} k="new" />
      </form>
    </Sec>
  );
}
