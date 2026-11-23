'use client';
import Link from 'next/link';
/* /desk on the backend: reads /api/desk/state for the chosen city, acts through POST /api/desk and reads again. The
   state is read again every 15 seconds while the tab is showing, so counts and entries keep up without Realtime. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeskAct, DeskState } from '@/lib/event/desk';
import { Desk } from './desk';
import { DeskSignIn } from './sign-in';
import './desk.css';
import '@/components/forms/forms.css';
import { at as withBase } from '@/lib/routes';

const stateUrl = (event: string | null, city: string | null) => {
  const q = new URLSearchParams();
  if (event) q.set('event', event);
  if (city) q.set('city', city);
  return withBase('/api/desk/state') + (q.toString() ? '?' + q.toString() : '');
};

type Load = { kind: 'loading' } | { kind: 'in'; why?: string } | { kind: 'no'; text: string } | { kind: 'ok'; s: DeskState };

export function DeskLive({ event: event0, city: city0, mail, site, tab }: { event: string | null; city: string | null; mail: 'resend' | 'outbox'; site: string; tab?: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const city = useRef(city0), event = useRef(event0);

  /* each read is numbered; an answer that comes back after a newer read started (a poll that crossed a move to
     another place) is dropped, so the desk never jumps back to where it was. True when the desk now shows it. */
  const seq = useRef(0), shown = useRef<{ event: string | null; city: string | null }>({ event: event0, city: city0 });
  const read = useCallback(async (): Promise<boolean> => {
    const my = ++seq.current;
    try {
      const r = await fetch(stateUrl(event.current, city.current), { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (my !== seq.current) return true;
      if (r.status === 401) { setLoad({ kind: 'in', why: /code from your email/.test(j.error || '') ? j.error : undefined }); return true; }
      if (r.status === 403) { setLoad({ kind: 'no', text: j.error || 'This email has no role on the desk.' }); return true; }
      if (r.status === 503) { setLoad({ kind: 'no', text: 'The desk opens when this site has its backend.' }); return true; }
      if (!r.ok) { setLoad((l) => (l.kind === 'ok' ? l : { kind: 'no', text: j.error || 'The desk could not be read. Try again in a moment.' })); return false; }
      city.current = (j as DeskState).city; event.current = (j as DeskState).event;
      shown.current = { event: event.current, city: city.current };
      setLoad({ kind: 'ok', s: j as DeskState }); setNow(Date.now());
      return true;
    } catch {
      if (my !== seq.current) return true;
      setLoad((l) => (l.kind === 'ok' ? l : { kind: 'no', text: 'The desk could not be reached. Check the connection.' }));
      return false;
    }
  }, []);

  useEffect(() => { read(); }, [read]);
  /* the address says where the desk is, so a reload or a shared link opens the same place */
  const at = load.kind === 'ok' ? (load.s.event || '') + '|' + (load.s.city || '') : null;
  useEffect(() => {
    if (at == null) return;
    const [ev, city] = at.split('|'), u = new URL(location.href);
    if (ev) u.searchParams.set('event', ev); else u.searchParams.delete('event');
    if (city) u.searchParams.set('city', city); else u.searchParams.delete('city');
    if (u.href !== location.href) history.replaceState(history.state, '', u);
  }, [at]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); } };
    const poll = () => { if (document.visibilityState === 'visible') read(); };
    const a = setInterval(tick, 1000 * 5), b = setInterval(poll, 15000);
    const vis = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', vis); };
  }, [read]);

  const act: DeskAct = useCallback(async (action, p = {}) => {
    const r = await fetch(withBase('/api/desk'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...p }) });
    const j = await r.json().catch(() => ({ ok: false, error: 'That did not work. Try again.' }));
    if (r.status === 401) setLoad({ kind: 'in' });
    else if (r.ok && action !== 'import.preview' && action !== 'guest.link') await read();
    return r.ok ? { ...j, ok: true } : { ok: false, error: j.error || 'That did not work. Try again.' };
  }, [read]);

  /* a move that could not be read goes back to where the desk is, so the next poll does not try it again */
  const onGo = async (ev: string | null, id: string | null): Promise<boolean> => {
    event.current = ev; city.current = id;
    const okay = await read();
    if (!okay) { event.current = shown.current.event; city.current = shown.current.city; }
    return okay;
  };
  const signOut = async () => { await fetch(withBase('/api/auth/out'), { method: 'POST' }).catch(() => null); setLoad({ kind: 'in' }); };

  if (load.kind === 'loading') return <div className="dk"><main className="dk-in" aria-busy="true"><p className="dk-p">Opening the desk…</p></main></div>;
  if (load.kind === 'in') return <DeskSignIn mail={mail} why={load.why} onIn={() => { setLoad({ kind: 'loading' }); read(); }} />;
  if (load.kind === 'no') return (
    <div className="dk"><main className="dk-in"><div className="dk-in-card">
      <p className="dk-kicker">Desk</p>
      <div><h1 className="dk-h">The desk is not open to you</h1><p className="dk-p">{load.text}</p></div>
      <div className="dk-acts-row"><button type="button" className="fm-b" onClick={signOut}>Sign in with another email</button><Link className="dk-t" href="/">Go to the site</Link></div>
    </div></main></div>
  );
  return <Desk s={load.s} act={act} now={now} onGo={onGo} onSignOut={signOut} site={site} tab={tab} />;
}
