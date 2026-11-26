'use client';
/* /lab/desk: the desk on sample data, with no backend. The bar on top picks who is signed in and the moment of the day;
   every action works on the page's own copy of the data, so each screen can be tried. */
import { useCallback, useMemo, useState } from 'react';
import type { DeskAct, DeskState } from '@/lib/event/desk';
import { Desk } from './desk';
import { DeskSignIn } from './sign-in';
import { MOMENTS, sampleState, timesFor, type Moment, type Role } from './sample';
import { at } from '@/lib/routes';

type Who = Role | 'out';
export function DeskLab({ who: who0, moment: m0, tab }: { who: Who; moment: Moment; tab?: string }) {
  const [who, setWho] = useState<Who>(who0), [moment, setMoment] = useState<Moment>(m0);
  const [state, setState] = useState<DeskState>(() => sampleState(who0 === 'out' ? 'host' : who0));
  /* where the lab desk is: a place, the event with no place chosen (null), or the Events list (event null) */
  const [cityId, setCityId] = useState<string | null>('berlin'), [onEvent, setOnEvent] = useState(true);
  const view = useMemo(() => {
    const cities = state.cities.map((c) => timesFor(c, moment).city);
    const seesAll = state.can.admin || state.overview.length > 0;
    const cur = (cityId == null && seesAll) ? null : cities.find((c) => c.id === cityId) || cities[0];
    const now = timesFor(cur || cities.find((c) => c.id === 'berlin') || cities[0], moment).now;
    return { s: { ...state, event: onEvent ? state.event : null, city: onEvent && cur ? cur.id : null, cities }, now };
  }, [state, moment, cityId, onEvent]);

  const pick = (w: Who) => { setWho(w); if (w !== 'out') setState(sampleState(w)); setCityId('berlin'); setOnEvent(true); };
  const act: DeskAct = useCallback(async (action, p = {}) => {
    await new Promise((r) => setTimeout(r, 250));
    const upd = (f: (s: DeskState) => DeskState) => setState(f);
    switch (action) {
      case 'import.preview': if (p.from === 'luma') return { ok: true, preview: { fresh: 138, already: 4, elsewhere: 2, bad: 0, badList: [], skipped: 0, repeats: 1 } };
      { const lines = String(p.text || '').split(/[\n,;]/).map((x) => x.trim()).filter((x) => x.indexOf('@') > 0); return { ok: true, preview: { fresh: lines.length, already: 0, elsewhere: 0, bad: 0, badList: [], skipped: 0, repeats: 0 } }; }
      case 'import.commit': if (p.from === 'luma') return { ok: true, added: 136, sent: p.send ? 136 : 0 };
        return { ok: true, added: String(p.text || '').split('\n').filter((x) => x.indexOf('@') > 0).length, sent: 0 };
      case 'guest.add': upd((s) => ({ ...s, guests: [{ person: 'n' + Date.now(), email: String(p.email), name: String(p.name || ''), source: 'host', sent: Date.now(), opened: null, signedIn: false, inRoom: null, inRoomHow: null, entry: false }, ...s.guests] })); return { ok: true };
      case 'guest.again': return { ok: true, status: 'not_sent' };
      case 'guest.link': return { ok: true, link: location.origin + at('/in/sample-link') };
      case 'guest.in': case 'guest.out': upd((s) => ({ ...s, guests: s.guests.map((g) => (g.person === p.person ? { ...g, inRoom: action === 'guest.in' ? Date.now() : null, inRoomHow: action === 'guest.in' ? 'host' : null } : g)) })); return { ok: true };
      case 'guest.remove': upd((s) => ({ ...s, guests: s.guests.filter((g) => g.person !== p.person) })); return { ok: true };
      case 'entry.hide': case 'entry.show': upd((s) => ({ ...s, entries: s.entries.map((e) => (e.no === p.no ? { ...e, hidden: action === 'entry.hide' } : e)) })); return { ok: true };
      case 'entry.picture': return { ok: true };
      case 'clock.start': setMoment('build'); return { ok: true };
      case 'clock.add': case 'clock.end': return { ok: true };
      case 'scene.update': upd((s) => ({ ...s, scenes: s.scenes.map((x) => (x.id === p.id ? { ...x, hidden: !!p.hidden } : x)) })); return { ok: true };
      case 'scene.move': upd((s) => ({ ...s, scenes: (p.order as string[]).map((id) => s.scenes.find((x) => x.id === id)!).filter(Boolean) })); return { ok: true };
      case 'scene.remove': upd((s) => ({ ...s, scenes: s.scenes.filter((x) => x.id !== p.id) })); return { ok: true };
      case 'scene.add': upd((s) => ({ ...s, scenes: [...s.scenes, { id: 'x' + Date.now(), position: s.scenes.length + 1, kind: String(p.kind), title: String(p.title || p.kind), data: (p.data as Record<string, unknown>) || {}, notes: '', hidden: false, event: false }] })); return { ok: true };
      case 'switch': upd((s) => ({ ...s, cities: s.cities.map((c) => (p.all || c.id === p.city ? { ...c, ...(typeof p.submissionsPaused === 'boolean' ? { submissionsPaused: p.submissionsPaused } : {}), ...(typeof p.votingPaused === 'boolean' ? { votingPaused: p.votingPaused } : {}) } : c)) })); return { ok: true };
      case 'pick.set': upd((s) => { const e = s.entries.find((x) => x.no === p.no)!; return { ...s, pick: { no: e.no, name: e.name, city: String(p.city), at: Date.now() } }; }); return { ok: true };
      case 'role.remove': upd((s) => ({ ...s, people: s.people.filter((x) => x.role !== p.id) })); return { ok: true };
      default: return { ok: true };
    }
  }, []);

  return (
    <>
      <div className="dk dk-lab-wrap" style={{ minHeight: 0 }}>
        <div className="dk-lab">
          <span>Desk lab</span>
          <label>Signed in as
            <select value={who} onChange={(e) => pick(e.target.value as Who)}>
              <option value="host">Host, Berlin</option><option value="judge">Judge, Berlin</option><option value="super">Super admin</option><option value="out">Nobody (sign-in)</option>
            </select>
          </label>
          <label>Moment
            <select value={moment} onChange={(e) => setMoment(e.target.value as Moment)}>{MOMENTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </label>
        </div>
      </div>
      {who === 'out' ? <DeskSignIn mail="outbox" onIn={() => pick('host')} />
        : <Desk s={view.s} act={act} now={view.now} onGo={(e, c) => { setOnEvent(e != null); setCityId(c); }} onSignOut={() => setWho('out')} site="http://localhost:4320" tab={tab} />}
    </>
  );
}
