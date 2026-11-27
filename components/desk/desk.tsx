'use client';
/* The desk: one screen for every role, drawn from a DeskState and acting through one act(). /desk feeds it /api/desk/state and POST /api/desk.

   Three levels, named in the header as a path (Events / the event / the place), each part a switcher:
   - Events: every event this person sees; a super admin makes new ones here.
   - An event: Overview (its places at a glance), Places, People, Format, Final, Switches, Outbox, Log, for its
     admins; someone who sees all its places but runs none (a judge of the whole event) gets the Overview.
   - A place: Today, Guests, Entries, Stage, Check-in for its hosts (Today and Entries for a judge), and Place (its
     settings and clock) for the event's admins. An event with one place opens straight on it, with the event's own
     tabs after a rule. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeskAct, DeskState } from '@/lib/event/desk';
import { Announcer, unsavedNow, useAsk } from './parts';
import { Today } from './today';
import { Guests } from './guests';
import { Entries } from './entries';
import { Deck } from './deck';
import { CheckIn } from './door';
import { Place, Log, Outbox, People, Switches } from './admin';
import { EventList } from './events';
import { Overview, Places, FormatTab, Final } from './event';
import './desk.css';
import '@/components/forms/forms.css';

type Tab = { id: string; label: string };
const HOST: Tab[] = [{ id: 'today', label: 'Today' }, { id: 'guests', label: 'Guests' }, { id: 'entries', label: 'Entries' }, { id: 'stage', label: 'Stage' }, { id: 'door', label: 'Check-in' }];
const JUDGE: Tab[] = [{ id: 'today', label: 'Today' }, { id: 'entries', label: 'Entries' }];

export function tabsFor(s: DeskState): { place: Tab[]; event: Tab[] } {
  if (!s.event) return { place: [], event: [] };
  const ev = s.events.find((e) => e.id === s.event), many = (ev?.places ?? s.cities.length) > 1;
  const admin: Tab[] = s.can.admin ? [
    ...(s.city && !many ? [] : [{ id: 'overview', label: 'Overview' }]),
    { id: 'places', label: 'Places' }, { id: 'people', label: 'People' }, { id: 'format', label: 'Format' },
    ...(ev?.f.finalOn && many ? [{ id: 'final', label: 'Final' }] : []),
    { id: 'switches', label: 'Switches' }, { id: 'outbox', label: 'Outbox' }, { id: 'log', label: 'Log' },
  ] : s.overview.length ? [{ id: 'overview', label: 'Overview' }] : [];
  if (!s.city) return { place: [], event: admin };
  const place = (s.can.host ? HOST : s.can.judge || s.can.admin ? JUDGE : []).concat(s.can.admin ? [{ id: 'place', label: 'Place' }] : []);
  /* inside a place of a bigger event, the event's tabs live one level up */
  return { place, event: many ? [] : admin };
}

export function Desk({ s, act, now, onGo, onSignOut, tab: tab0 }: {
  s: DeskState; act: DeskAct; now: number; onGo: (event: string | null, city: string | null) => void | Promise<boolean>; onSignOut?: () => void; tab?: string;
}) {
  const { place, event } = useMemo(() => tabsFor(s), [s]);
  const all = useMemo(() => place.concat(event), [place, event]);
  const [want, setTab] = useState(tab0 || ''), [was, setWas] = useState(tab0);
  if (was !== tab0) { setWas(tab0); if (tab0) setTab(tab0); }
  const tab = all.some((t) => t.id === want) ? want : all[0]?.id || '';
  const rowRef = useRef<HTMLDivElement>(null);
  /* the fades at the row's ends show only while there is more to scroll that way */
  const ends = () => { const el = rowRef.current; if (!el) return; el.dataset.l = el.scrollLeft > 2 ? '1' : ''; el.dataset.r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? '1' : ''; };
  /* another tab starts at its top, the way another page would; the first one keeps where a reload left it */
  const shownTab = useRef(tab);
  useEffect(() => {
    if (!tab) return;
    if (shownTab.current && shownTab.current !== tab && window.scrollY > 0) window.scrollTo({ top: 0 });
    shownTab.current = tab;
    document.getElementById('dk-tab-' + tab)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); ends();
    /* the tab stays in the address, so a reload or coming back from the remote opens it again */
    const u = new URL(location.href); if (u.searchParams.get('tab') !== tab) { u.searchParams.set('tab', tab); history.replaceState(history.state, '', u); }
  }, [tab]);
  useEffect(() => { window.addEventListener('resize', ends); return () => window.removeEventListener('resize', ends); }, []);
  /* where is being opened shows in the path while it loads */
  const [pend, setPend] = useState<{ event: string | null; city: string | null } | null>(null);
  const [seen, setSeen] = useState(s);
  if (seen !== s) { setSeen(s); setPend(null); }
  const { ask, node } = useAsk();
  /* after a move to another event or place, focus lands on the new screen, not on the page as a whole */
  const moved = useRef<{ event: string | null } | null>(null), mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (moved.current && moved.current.event === s.event) { moved.current = null; mainRef.current?.focus({ preventScroll: true }); }
  }, [s]);
  const [lost, setLost] = useState(false);
  /* a form with unsaved edits asks first; nothing is thrown away without a yes */
  const guard = (then: () => void) => {
    const n = unsavedNow();
    if (!n) return then();
    ask({ title: 'Leave without saving?', text: 'Your changes to ' + n + ' are not saved yet. They are lost if you leave.', yes: 'Leave without saving', danger: true, run: then });
  };
  const toTab = (id: string) => { if (id !== tab) guard(() => setTab(id)); };
  const go = (ev: string | null, city: string | null, t?: string) => guard(() => goNow(ev, city, t));
  const goNow = (ev: string | null, city: string | null, t?: string) => {
    moved.current = { event: ev };
    setPend({ event: ev, city }); setLost(false);
    Promise.resolve(onGo(ev, city)).then((okay) => { if (okay === false) { moved.current = null; setPend(null); setLost(true); } });
    if (t) setTab(t);
  };
  const ev = s.events.find((e) => e.id === s.event) || null;
  const c = s.cities.find((x) => x.id === s.city) || null;
  const role = ev ? ev.mine : s.me.super ? 'Super admin' : '';
  const shownEvent = pend ? pend.event : s.event, shownCity = pend ? pend.city : s.city;
  const seesAll = s.can.admin || s.overview.length > 0;
  const keyTabs = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = all.findIndex((t) => t.id === tab);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -2;
    if (j === -2) return;
    e.preventDefault();
    const t = all[(j + all.length) % all.length]; toTab(t.id);
    requestAnimationFrame(() => document.getElementById('dk-tab-' + t.id)?.focus());
  };
  const wide = s.can.admin || !s.event;
  const label = (all.find((t) => t.id === tab)?.label || '') + (c ? ' · ' + c.name : ev ? ' · ' + ev.short : '');

  return (
    <div className={'dk' + (wide ? ' is-wide' : '')}>
      <header className="dk-head">
        <nav className="dk-bar dk-path" aria-label="Where you are on the desk">
          {s.events.length > 1 || s.me.super ? (
            <button type="button" className="dk-crumb" aria-current={!s.event ? 'page' : undefined} onClick={() => go(null, null)}>Events</button>
          ) : <span className="dk-crumb is-still">Desk</span>}
          {ev ? (
            <>
              <span className="dk-sep" aria-hidden="true">/</span>
              {s.events.length > 1 ? (
                <span className="dk-pick">
                  <label className="sr-only" htmlFor="dk-ev">Event</label>
                  <Switcher id="dk-ev" value={shownEvent || ''} onPick={(v) => go(v, null)}>
                    {s.events.filter((x) => !x.archived || x.id === s.event).map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                  </Switcher>
                </span>
              ) : <span className="dk-crumb is-still">{ev.short}</span>}
            </>
          ) : null}
          {ev && (s.cities.length > 1 || (c && seesAll && ev.places > 1)) ? (
            <>
              <span className="dk-sep" aria-hidden="true">/</span>
              <span className="dk-pick">
                <label className="sr-only" htmlFor="dk-city">Place</label>
                <Switcher id="dk-city" value={shownCity || ''} onPick={(v) => go(s.event, v || null)}>
                  {seesAll ? <option value="">Every place</option> : null}
                  {s.cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Switcher>
              </span>
            </>
          ) : c && ev && ev.places > 1 ? <><span className="dk-sep" aria-hidden="true">/</span><span className="dk-crumb is-still">{c.name}</span></> : null}
        </nav>
        {lost ? <p className="dk-status is-error dk-lost" role="alert">That could not be opened. Check the connection and try again.</p> : null}
        {all.length ? (
          <div className="dk-tabs" role="tablist" aria-label={c ? c.name : ev ? ev.short : 'Desk'} onKeyDown={keyTabs} ref={rowRef} onScroll={ends}>
            {place.map((t) => <TabKey key={t.id} t={t} on={tab === t.id} set={toTab} />)}
            {place.length && event.length ? <span className="dk-tabgap" aria-hidden="true" /> : null}
            {event.map((t) => <TabKey key={t.id} t={t} on={tab === t.id} set={toTab} />)}
          </div>
        ) : null}
      </header>
      <main ref={mainRef} key={(s.event || 'events') + ':' + (c?.id || '')} className="dk-main" id={tab ? 'dk-panel-' + tab : 'dk-panel'} role={tab ? 'tabpanel' : undefined} aria-labelledby={tab ? 'dk-tab-' + tab : undefined} tabIndex={-1} aria-busy={pend ? true : undefined}>
        {!s.event ? <EventList s={s} now={now} act={act} open={(id, t) => go(id, null, t)} />
          : (
            <>
              <h1 className="sr-only">{label}</h1>
              {tab === 'overview' ? <Overview s={s} now={now} open={(id) => go(s.event, id, 'today')} />
                : tab === 'places' ? <Places s={s} now={now} act={act} ask={ask} open={(id) => go(s.event, id, 'place')} />
                  : tab === 'people' ? <People s={s} act={act} ask={ask} />
                    : tab === 'format' ? <FormatTab s={s} act={act} ask={ask} />
                      : tab === 'final' ? <Final s={s} now={now} act={act} ask={ask} />
                        : tab === 'switches' ? <Switches s={s} c={c} act={act} ask={ask} />
                          : tab === 'outbox' ? <Outbox s={s} now={now} act={act} />
                            : tab === 'log' ? <Log s={s} now={now} />
                              : !c ? <p className="dk-p">{s.cities.length ? 'Choose a place above.' : 'This event has no places yet.'}</p>
                                : tab === 'today' ? <Today s={s} c={c} now={now} act={act} ask={ask} go={toTab} />
                                  : tab === 'guests' ? <Guests s={s} c={c} now={now} act={act} ask={ask} />
                                    : tab === 'entries' ? <Entries s={s} c={c} now={now} act={act} />
                                      : tab === 'stage' ? <Deck s={s} c={c} act={act} ask={ask} />
                                        : tab === 'door' ? <CheckIn s={s} c={c} now={now} act={act} />
                                          : tab === 'place' ? <Place s={s} c={c} now={now} act={act} ask={ask} /> : null}
            </>
          )}
      </main>
      <footer className="dk-main dk-foot">
        <p className="dk-note" style={{ margin: 0 }}>Signed in as <b>{s.me.name || s.me.email}</b>{s.me.name ? ' (' + s.me.email + ')' : ''}{role ? ' · ' + role : ''}.</p>
        {onSignOut ? <button type="button" className="dk-t" onClick={onSignOut}>Sign out of the desk</button> : null}
      </footer>
      {node}
      <Announcer />
    </div>
  );
}

function TabKey({ t, on, set }: { t: Tab; on: boolean; set: (id: string) => void }) {
  return <button type="button" role="tab" id={'dk-tab-' + t.id} aria-selected={on} aria-controls={on ? 'dk-panel-' + t.id : undefined} tabIndex={on ? 0 : -1} className="dk-tab" onClick={() => set(t.id)}>{t.label}</button>;
}

/* A switcher in the path. A pick with the mouse or a finger goes there at once. Arrow keys on a closed select change
   its value step by step in some browsers, so a keyboard choice waits for Enter or for leaving the field: the desk
   does not load every place on the way. */
function Switcher({ id, value, onPick, children }: { id: string; value: string; onPick: (v: string) => void; children: React.ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null);
  const keyed = useRef(false);
  const commit = () => { if (draft != null && draft !== value) onPick(draft); setDraft(null); keyed.current = false; };
  return (
    <select id={id} value={draft ?? value}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.length === 1) keyed.current = true; }}
      onPointerDown={() => { keyed.current = false; }}
      onChange={(e) => { const v = e.target.value; if (keyed.current) setDraft(v); else { setDraft(null); if (v !== value) onPick(v); } }}
      onBlur={commit}>
      {children}
    </select>
  );
}
