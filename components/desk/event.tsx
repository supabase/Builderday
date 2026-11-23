'use client';
/* An event's own screens on the desk:
   - Overview: every place at a glance (when it starts, where it stands, how many are listed and in the room, entries,
     who leads), and a row opens the place.
   - Places: add a place by picking its Luma event from the calendar (or by hand), and remove an empty one.
   - Format: the name and day, who decides and how judges judge, the final, the times, the rules for an entry, prizes.
   - Final: each place's finalists by the event's format, and the winner entered when it is said. */
import { useMemo, useState, type FormEvent } from 'react';
import { clockText, type DeskAct, type DeskState } from '@/lib/event/desk';
import { PRESETS, formatLine, formatProblem, maxScore, rankUnit, type Criterion, type Decide, type Format } from '@/lib/event/format';
import { EVENT } from '@/lib/day-data';
import { Sec, Status, usePress, useUnsaved, IconGo, type Ask } from './parts';
import { dayText } from './events';

const phaseOf = (c: DeskState['cities'][number], now: number) => c.buildStart == null ? 'Starts ' + clockText(c.planned, c.offset) : now < (c.buildEnd ?? 0) ? 'Building' : now < (c.voteEnd ?? 0) ? 'Voting' : 'Closed';
const evOf = (s: DeskState) => s.events.find((e) => e.id === s.event)!;

/* ---------------------------------------------------------------- Overview */
export function Overview({ s, now, open }: { s: DeskState; now: number; open: (id: string) => void }) {
  const ev = evOf(s);
  const sum = s.overview.reduce((a, p) => ({ listed: a.listed + p.listed, inRoom: a.inRoom + p.inRoom, entries: a.entries + p.entries }), { listed: 0, inRoom: 0, entries: 0 });
  return (
    <>
      <div className="dk-top">
        <div>
          <h2 className="dk-h">{ev.name}</h2>
          <p className="dk-p">{dayText(ev.day)} · {formatLine(ev.f, ev.places)}</p>
        </div>
      </div>
      <dl className="dk-stats">
        <div><dt>Places</dt><dd>{s.cities.length}</dd></div>
        <div><dt>On the lists</dt><dd>{sum.listed}</dd></div>
        <div><dt>In the room</dt><dd>{sum.inRoom}</dd></div>
        <div><dt>Entries</dt><dd>{sum.entries}</dd></div>
      </dl>
      <Sec title="Places" id="dk-ov" aside={'By start time'}>
        {s.cities.length ? (
          <table className="dk-tbl dk-ov">
            <thead><tr><th>Place</th><th>Now</th><th className="dk-r">Listed</th><th className="dk-r">In the room</th><th className="dk-r">Entries</th><th>Leading</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {s.cities.slice().sort((a, b) => a.planned - b.planned).map((c) => {
                const p = s.overview.find((x) => x.id === c.id);
                return (
                  <tr key={c.id} className="dk-tr-go" onClick={() => open(c.id)}>
                    <td className="dk-lead"><button type="button" className="dk-rowgo" onClick={(e) => { e.stopPropagation(); open(c.id); }}>{c.name}</button>
                      <span className="dk-oneline">{[phaseOf(c, now), (p?.listed ?? 0) + ' listed', (p?.entries ?? 0) + ' entries', p?.leader ? 'Leading: ' + p.leader : ''].filter(Boolean).join(' · ')}</span></td>
                    <td className="dk-mid">{phaseOf(c, now)}</td>
                    <td className="dk-mid dk-r dk-tnum">{p?.listed ?? 0}</td>
                    <td className="dk-mid dk-r dk-tnum">{p?.inRoom ?? 0}</td>
                    <td className="dk-mid dk-r dk-tnum">{p?.entries ?? 0}</td>
                    <td className="dk-mid">{p?.leader || <span className="dk-dim">None yet</span>}</td>
                    <td className="dk-go-cell" aria-hidden="true"><IconGo /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="dk-note">No places yet. Add them on Places.</p>}
      </Sec>
    </>
  );
}

/* ---------------------------------------------------------------- Places */
type LumaEv = { id: string; name: string; start: string; zone: string; url: string; city: string | null; address: string | null; visibility: string; open: boolean; taken: string | null };

/* the local time on a day in a zone, as an instant */
function localToIso(day: string, hhmm: string, zone: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    const guess = Date.parse(day + 'T' + hhmm + ':00Z');
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const off = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - guess;
    return new Date(guess - off).toISOString();
  } catch { return null; }
}
const localHHMM = (iso: string, zone: string) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)); } catch { return ''; } };
const localDay = (iso: string, zone: string) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return ''; } };
/* a place's name from its Luma event: the city Luma knows, else what follows the last colon or dash in the name */
const placeName = (e: LumaEv) => e.city || (e.name.split(/[:–—|-]\s*/).pop() || e.name).trim().slice(0, 60);
const ZONES: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); } catch { return ['UTC', 'Europe/London', 'America/New_York', 'Asia/Singapore']; } })();

export function Places({ s, now, act, ask, open }: { s: DeskState; now: number; act: DeskAct; ask: (a: Ask) => void; open: (id: string) => void }) {
  const ev = evOf(s);
  const { busy, said, run, say } = usePress(act);
  const [luma, setLuma] = useState<LumaEv[] | null>(null);
  const [q, setQ] = useState('');
  const blank = { name: '', zone: 'Europe/London', time: '18:00', start: '', lumaEvent: '', luma: '', venue: '' };
  const [f, setF] = useState(blank);
  const [adding, setAdding] = useState(!s.cities.length);
  const load = () => run('luma', 'luma.events', { event: ev.id }, (r) => { setLuma((r.list as LumaEv[]) || []); });
  const pickLuma = (e: LumaEv) => { setF({ name: placeName(e), zone: e.zone, time: localHHMM(e.start, e.zone), start: e.start, lumaEvent: e.id, luma: e.url, venue: e.address || '' }); requestAnimationFrame(() => document.getElementById('dk-pl-name')?.focus()); };
  const shown = useMemo(() => {
    if (!luma) return [];
    const w = q.trim().toLowerCase();
    const day = ev.day;
    return luma.filter((e) => !w || (e.name + ' ' + (e.city || '') + ' ' + (e.address || '')).toLowerCase().indexOf(w) >= 0)
      .sort((a, b) => Number(localDay(b.start, b.zone) === day) - Number(localDay(a.start, a.zone) === day) || Date.parse(a.start) - Date.parse(b.start)).slice(0, 60);
  }, [luma, q, ev.day]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    /* a start picked from Luma is kept as Luma has it; a time typed by hand is on the event's day in the place's zone */
    const day = f.lumaEvent && f.start ? localDay(f.start, f.zone) : ev.day;
    const start = f.lumaEvent && f.start && localHHMM(f.start, f.zone) === f.time ? f.start : localToIso(day, f.time, f.zone);
    if (!start) return say('add', 'Check the start time and the time zone.', true);
    run('add', 'place.add', { event: ev.id, name: f.name, zone: f.zone, start, lumaEvent: f.lumaEvent || null, luma: f.luma || null, venue: f.venue || null }, () => { const n = f.name; setF(blank); return n + ' is added, with its own stage and the usual deck.'; });
  };
  return (
    <>
      <Sec title={'Places in ' + ev.short} id="dk-pl" aside={s.cities.length === 1 ? 'One place' : s.cities.length + ' places'}>
        {s.cities.length ? (
          <ul className="dk-list">
            {s.cities.slice().sort((a, b) => a.planned - b.planned).map((c) => {
              const p = s.overview.find((x) => x.id === c.id), k = 'rm:' + c.id, empty = !p || (p.listed === 0 && p.entries === 0);
              return (
                <li key={c.id} className="dk-row">
                  <div className="dk-who">
                    <b>{c.name}</b>
                    <span>{phaseOf(c, now)} · {c.zone.replace(/_/g, ' ')} time{c.venue ? ' · ' + c.venue : ''}</span>
                    <div className="dk-marks">
                      <span className={c.lumaEvent ? 'is-on' : ''}>{c.lumaEvent ? 'Linked to Luma' : 'No Luma event'}</span>
                      <span>{p?.listed ?? 0} listed</span>
                      {c.prize ? <span>Prize: {c.prize}</span> : null}
                    </div>
                    <Status said={said} k={k} />
                  </div>
                  <div className="dk-acts">
                    <button type="button" className="dk-t" aria-label={'Settings for ' + c.name} onClick={() => open(c.id)}>Settings</button>
                    {empty ? <button type="button" className="dk-t" disabled={busy === 'gone'} onClick={() => ask({ title: 'Remove ' + c.name + ' from ' + ev.short + '?', text: 'Its stage and deck go with it. Nobody is on its list yet.', yes: 'Remove', danger: true, run: () => run('gone', 'place.remove', { event: ev.id, place: c.id }, () => c.name + ' is removed.') })} aria-label={'Remove ' + c.name}>Remove</button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="dk-note" style={{ marginTop: 0 }}>No places yet. Each place is one room with its own list, stage and clock.</p>}
        <Status said={said} k="gone" />
        {!adding ? <div className="dk-acts-row"><button type="button" className="fm-b" onClick={() => setAdding(true)}>Add a place</button></div> : null}
      </Sec>
      {adding ? (
        <Sec title="Add a place" id="dk-pl-add">
          {s.luma ? (
            <div className="dk-luma">
              {luma == null ? (
                <>
                  <p className="dk-note" style={{ marginTop: 0 }}>Pick the place’s Luma event: its name, time zone, start and address fill in, and its guests come onto the list as Luma approves them.</p>
                  <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'luma'} aria-busy={busy === 'luma'} onClick={load}>{busy === 'luma' ? 'Reading Luma…' : 'Choose from Luma'}</button></div>
                  <Status said={said} k="luma" />
                </>
              ) : (
                <>
                  <div className="dk-f"><label className="dk-l" htmlFor="dk-pl-q">Find the Luma event{' '}<small>{luma.length} on the calendar; the event’s day first</small></label>
                    <input id="dk-pl-q" className="fm-i" type="search" autoComplete="off" spellCheck={false} placeholder="City or name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                  <ul className="dk-pickl" aria-label="Luma events">
                    {shown.map((e) => {
                      const on = f.lumaEvent === e.id;
                      return (
                        <li key={e.id}>
                          <button type="button" className="dk-pickr" aria-pressed={on} disabled={!!e.taken} onClick={() => pickLuma(e)}>
                            <b>{e.name}</b>
                            <span>{new Date(e.start).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: e.zone })} {e.zone.replace(/_/g, ' ')}{e.address ? ' · ' + e.address : ''}</span>
                            {e.taken ? <span className="dk-dim">Already a place: {e.taken}</span> : e.visibility === 'private' ? <span className="dk-dim">Private on Luma</span> : null}
                          </button>
                        </li>
                      );
                    })}
                    {!shown.length ? <li className="dk-note">Nothing on the calendar matches.</li> : null}
                  </ul>
                </>
              )}
            </div>
          ) : <p className="dk-note" style={{ marginTop: 0 }}>Luma is not connected on this server, so fill the place in by hand. Its guests can be imported from Luma’s CSV on Guests.</p>}
          <form className="dk-form" onSubmit={submit} style={{ marginTop: 'var(--s-5)' }}>
            <div className="dk-two">
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pl-name">Name{' '}<small>Usually the city</small></label><input id="dk-pl-name" className="fm-i" required minLength={2} maxLength={60} autoComplete="off" data-1p-ignore value={f.name} onChange={(e) => setF((o) => ({ ...o, name: e.target.value }))} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pl-zone">Time zone</label><input id="dk-pl-zone" className="fm-i" required list="dk-zones" autoComplete="off" spellCheck={false} value={f.zone} onChange={(e) => setF((o) => ({ ...o, zone: e.target.value }))} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pl-time">Building starts{' '}<small>Local time, {dayText(f.lumaEvent && f.start ? localDay(f.start, f.zone) : ev.day)}</small></label><input id="dk-pl-time" className="fm-i" type="time" required value={f.time} onChange={(e) => setF((o) => ({ ...o, time: e.target.value }))} /></div>
              <div className="dk-f"><label className="dk-l" htmlFor="dk-pl-venue">Venue{' '}<small>Optional</small></label><input id="dk-pl-venue" className="fm-i" maxLength={120} autoComplete="off" value={f.venue} onChange={(e) => setF((o) => ({ ...o, venue: e.target.value }))} /></div>
            </div>
            <datalist id="dk-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
            {f.lumaEvent ? <p className="dk-note" style={{ margin: 0 }}>Linked to Luma event <b>{f.lumaEvent}</b>. <button type="button" className="dk-t" onClick={() => setF((o) => ({ ...o, lumaEvent: '', luma: '', start: '' }))}>Unlink</button></p> : null}
            <div className="dk-acts-row">
              <button type="submit" className="fm-b" disabled={busy === 'add'} aria-busy={busy === 'add'}>{busy === 'add' ? 'Adding…' : f.name ? 'Add ' + f.name : 'Add the place'}</button>
              {s.cities.length ? <button type="button" className="fm-b" onClick={() => { setAdding(false); setLuma(null); setF(blank); }}>Done</button> : null}
            </div>
            <Status said={said} k="add" />
          </form>
        </Sec>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- Format */
const DECIDE: { id: Decide; name: string; line: string }[] = [
  { id: 'both', name: 'Votes and judges', line: 'Anyone votes; each judge has a budget of votes that adds to the same tally.' },
  { id: 'votes', name: 'Votes only', line: 'Anyone with an email votes. There are no judges.' },
  { id: 'judges', name: 'Judges only', line: 'Judges decide. Nobody else votes.' },
  { id: 'apart', name: 'Judges, and a people’s choice', line: 'Judges decide the ranking; the votes give a separate people’s choice.' },
];

export function FormatTab({ s, act, ask }: { s: DeskState; act: DeskAct; ask: (a: Ask) => void }) {
  const ev = evOf(s);
  const { busy, said, run } = usePress(act);
  const [f, setF] = useState<Format>(ev.f);
  const [head, setHead] = useState({ name: ev.name, short: ev.short, day: ev.day });
  /* reset only when another event is opened: the desk re-reads every few seconds and must not wipe what is typed */
  const [was, setWas] = useState(ev.id);
  if (was !== ev.id) { setWas(ev.id); setF(ev.f); setHead({ name: ev.name, short: ev.short, day: ev.day }); }
  const set = <K extends keyof Format>(k: K, v: Format[K]) => setF((o) => {
    const n = { ...o, [k]: v };
    /* in one tally, judges vote; scores need judges deciding alone or apart */
    if (k === 'decide' && v === 'both' && n.judging === 'scores') n.judging = 'budget';
    return n;
  });
  const judges = f.decide !== 'votes', canScore = f.decide === 'judges' || f.decide === 'apart';
  const problem = formatProblem(f);
  const changed = JSON.stringify(f) !== JSON.stringify(ev.f) || head.name !== ev.name || head.short !== ev.short || head.day !== ev.day;
  useUnsaved('Format', changed);
  const save = (e: FormEvent) => { e.preventDefault(); run('fmt', 'event.update', { event: ev.id, ...head, f }, () => 'Saved. ' + formatLine(f, ev.places)); };
  const setCrit = (i: number, name: string) => set('criteria', f.criteria.map((c, j) => (j === i ? { ...c, name } : c)));
  return (
    <form className="dk-fmt" onSubmit={save}>
      {ev.id === EVENT.id ? <p className="dk-warn"><b>The public pages say Builder Day’s format in their own words.</b> What you change here changes how votes, judging and entries work; tell whoever edits the pages if their words need to follow.</p> : null}
      <Sec title="The event" id="dk-f-ev">
        <div className="dk-two">
          <div className="dk-f"><label className="dk-l" htmlFor="dk-f-name">Name</label><input id="dk-f-name" className="fm-i" required minLength={2} maxLength={60} value={head.name} onChange={(e) => setHead((o) => ({ ...o, name: e.target.value }))} /></div>
          <div className="dk-f"><label className="dk-l" htmlFor="dk-f-short">Short name</label><input id="dk-f-short" className="fm-i" required minLength={2} maxLength={30} value={head.short} onChange={(e) => setHead((o) => ({ ...o, short: e.target.value }))} /></div>
          <div className="dk-f"><label className="dk-l" htmlFor="dk-f-day">Day{' '}<small>Each place keeps its own start</small></label><input id="dk-f-day" className="fm-i" type="date" required value={head.day} onChange={(e) => setHead((o) => ({ ...o, day: e.target.value }))} /></div>
        </div>
      </Sec>
      <Sec title="Who decides" id="dk-f-who" aside={PRESETS.find((p) => p.f.decide === f.decide && p.f.judging === f.judging)?.name}>
        <fieldset className="dk-cards">
          <legend className="sr-only">Who decides each place’s ranking</legend>
          {DECIDE.map((d) => (
            <label key={d.id} className="dk-card">
              <input type="radio" name="dk-decide" value={d.id} checked={f.decide === d.id} onChange={() => set('decide', d.id)} />
              <b>{d.name}</b><span>{d.line}</span>
            </label>
          ))}
        </fieldset>
        {judges ? (
          <>
            <fieldset className="dk-seg" style={{ marginTop: 'var(--s-5)' }}>
              <legend className="dk-l">How judges judge</legend>
              <label><input type="radio" name="dk-judging" checked={f.judging === 'budget'} onChange={() => set('judging', 'budget')} />A budget of votes</label>
              <label className={canScore ? '' : 'is-off'}><input type="radio" name="dk-judging" disabled={!canScore} checked={f.judging === 'scores'} onChange={() => set('judging', 'scores')} />Scores on criteria</label>
            </fieldset>
            {!canScore ? <p className="dk-note">In one tally, judges vote. Choose judges only, or judges and a people’s choice, to score.</p> : null}
            {f.judging === 'budget' ? (
              <div className="dk-two" style={{ marginTop: 'var(--s-4)' }}>
                <div className="dk-f"><label className="dk-l" htmlFor="dk-f-bud">Votes per judge{' '}<small>They can put several on one project</small></label><NumIn id="dk-f-bud" min={1} max={1000} value={f.judgeBudget} onNum={(v) => set('judgeBudget', v)} /></div>
              </div>
            ) : (
              <div className="dk-crit">
                <p className="dk-note">Each judge gives every project 1 to 5 on each criterion; a project’s score is the judges’ average total, out of {maxScore(f)}.</p>
                <ol>
                  {f.criteria.map((c: Criterion, i) => (
                    <li key={i}>
                      <label className="sr-only" htmlFor={'dk-f-c' + i}>Criterion {i + 1}</label>
                      <input id={'dk-f-c' + i} className="fm-i" required maxLength={40} value={c.name} onChange={(e) => setCrit(i, e.target.value)} />
                      {f.criteria.length > 1 ? <button type="button" className="dk-t" aria-label={'Remove ' + (c.name || 'this criterion')} onClick={() => set('criteria', f.criteria.filter((_, j) => j !== i))}>Remove</button> : null}
                    </li>
                  ))}
                </ol>
                {f.criteria.length < 6 ? <button type="button" className="dk-t" onClick={() => set('criteria', f.criteria.concat({ id: 'c' + (f.criteria.length + 1), name: '' }))}>Add a criterion</button> : null}
              </div>
            )}
          </>
        ) : null}
      </Sec>
      {ev.places > 1 ? (
        <Sec title="The final" id="dk-f-fin" aside={f.finalOn ? 'Top ' + f.finalists + ' of each place' : 'No final'}>
          <label className="fm-chk"><input type="checkbox" checked={f.finalOn} onChange={(e) => set('finalOn', e.target.checked)} /><span>A final across the places</span></label>
          {f.finalOn ? (
            <>
              <div className="dk-two" style={{ marginTop: 'var(--s-4)' }}>
                <div className="dk-f"><label className="dk-l" htmlFor="dk-f-n">From each place{' '}<small>{f.finalists * ev.places} finalists in all</small></label><NumIn id="dk-f-n" min={1} max={20} value={f.finalists} onNum={(v) => set('finalists', v)} /></div>
              </div>
              <fieldset className="dk-seg" style={{ marginTop: 'var(--s-4)' }}>
                <legend className="dk-l">The winner is chosen by</legend>
                <label><input type="radio" name="dk-finalby" checked={f.finalBy === 'pickers'} onChange={() => set('finalBy', 'pickers')} />Named people</label>
                <label><input type="radio" name="dk-finalby" checked={f.finalBy === 'judges'} onChange={() => set('finalBy', 'judges')} />The event’s judges</label>
              </fieldset>
              {f.finalBy === 'pickers' ? <div className="dk-two" style={{ marginTop: 'var(--s-4)' }}>
                <div className="dk-f"><label className="dk-l" htmlFor="dk-f-pk">Who picks the winner</label><input id="dk-f-pk" className="fm-i" maxLength={80} placeholder="Ant and Copple" value={f.pickers} onChange={(e) => set('pickers', e.target.value)} /></div>
              </div> : null}
            </>
          ) : null}
        </Sec>
      ) : null}
      <Sec title="Time" id="dk-f-time">
        <div className="dk-two">
          <div className="dk-f"><label className="dk-l" htmlFor="dk-f-b">Building lasts{' '}<small>Minutes; for places added from now</small></label><NumIn id="dk-f-b" min={15} max={600} value={f.buildMin} onNum={(v) => set('buildMin', v)} /></div>
          {f.decide !== 'judges' ? <div className="dk-f"><label className="dk-l" htmlFor="dk-f-v">Voting runs on after{' '}<small>Minutes after building ends</small></label><NumIn id="dk-f-v" min={0} max={240} value={f.voteAfter} onNum={(v) => set('voteAfter', v)} /></div>
            : <div className="dk-f"><label className="dk-l" htmlFor="dk-f-v">Judging runs on after{' '}<small>Minutes after building ends</small></label><NumIn id="dk-f-v" min={0} max={240} value={f.voteAfter} onNum={(v) => set('voteAfter', v)} /></div>}
        </div>
        <p className="dk-note">Each place’s own times are on its Place tab; the host starts building from the stage.</p>
      </Sec>
      <Sec title="Entries" id="dk-f-rules">
        <div className="dk-checks">
          <label className="fm-chk"><input type="checkbox" checked={f.roomCode} onChange={(e) => set('roomCode', e.target.checked)} /><span><b>The room code</b> Only people on the list who typed the code on the wall can submit.</span></label>
          <label className="fm-chk"><input type="checkbox" checked={f.repoRequired} onChange={(e) => set('repoRequired', e.target.checked)} /><span><b>A public repository</b> Every entry links one GitHub repository we can read.</span></label>
          <label className={'fm-chk' + (f.repoRequired ? '' : ' is-off')}><input type="checkbox" disabled={!f.repoRequired} checked={f.repoNew && f.repoRequired} onChange={(e) => set('repoNew', e.target.checked)} /><span><b>Made on the day</b> A repository made before building starts is refused. Off, it is only flagged.</span></label>
          <label className="fm-chk"><input type="checkbox" checked={f.demoRequired} onChange={(e) => set('demoRequired', e.target.checked)} /><span><b>A demo link</b> Every entry links a page the judges can try.</span></label>
          <label className="fm-chk"><input type="checkbox" checked={f.teams} onChange={(e) => set('teams', e.target.checked)} /><span><b>Teams</b> Builders on the same list make a team in their account and share one entry.</span></label>
        </div>
        {f.teams ? <div className="dk-f"><label className="dk-l" htmlFor="dk-f-tm">People in a team at most</label><NumIn id="dk-f-tm" min={2} max={10} value={f.teamMax} onNum={(v) => set('teamMax', v)} /></div> : null}
      </Sec>
      <Sec title="Prizes" id="dk-f-prize">
        <div className="dk-two">
          {ev.places > 1 && f.finalOn ? <div className="dk-f"><label className="dk-l" htmlFor="dk-f-pz">The winner of the final</label><input id="dk-f-pz" className="fm-i" maxLength={120} value={f.prize} onChange={(e) => set('prize', e.target.value)} /></div> : null}
          <div className="dk-f"><label className="dk-l" htmlFor="dk-f-pp">{ev.places > 1 ? 'First in each place' : 'First place'}{' '}<small>A place can name its own</small></label><input id="dk-f-pp" className="fm-i" maxLength={120} value={f.placePrize} onChange={(e) => set('placePrize', e.target.value)} /></div>
        </div>
      </Sec>
      <div className="dk-savebar">
        <p className={'dk-status' + (problem ? ' is-error' : '')}>{problem || (changed ? 'Not saved yet.' : said?.key === 'fmt' ? said.text : 'Saved.')}</p>
        <button type="submit" className="fm-b" disabled={!changed || !!problem || busy === 'fmt'} aria-busy={busy === 'fmt'}>{busy === 'fmt' ? 'Saving…' : 'Save'}</button>
      </div>
      {s.me.super ? (
        <Sec title={ev.archived ? 'Archived' : 'Archive'} id="dk-f-arch">
          <p className="dk-note" style={{ marginTop: 0 }}>{ev.archived ? 'This event is in the archive: it is kept, and off the list of events.' : 'When it is over, archive it: everything is kept, and it moves to the bottom of Events.'}</p>
          <div className="dk-acts-row"><button type="button" className="fm-b" disabled={busy === 'arch'} onClick={() => ev.archived ? run('arch', 'event.archive', { event: ev.id, archived: false }, () => 'Back on the list.') : ask({ title: 'Archive ' + ev.short + '?', text: 'Nothing is deleted. It moves to the archive, and can be brought back.', yes: 'Archive', run: () => run('arch', 'event.archive', { event: ev.id }, () => 'Archived.') })}>{ev.archived ? 'Bring it back' : 'Archive the event'}</button></div>
          <Status said={said} k="arch" />
        </Sec>
      ) : null}
    </form>
  );
}

/* ---------------------------------------------------------------- Final */
export function Final({ s, now, act, ask }: { s: DeskState; now: number; act: DeskAct; ask: (a: Ask) => void }) {
  const ev = evOf(s);
  const { busy, said, run } = usePress(act);
  const who = ev.f.finalBy === 'judges' ? 'The event’s judges choose' : (ev.f.pickers || 'The pickers') + ' choose';
  const unit = rankUnit(ev.f);
  const pickCity = s.pick ? s.cities.find((x) => x.id === s.pick!.city)?.name || s.pick.city : '';
  const val = (v: number) => (ev.f.judging === 'scores' && ev.f.decide !== 'both' && ev.f.decide !== 'votes' ? v.toFixed(1) : String(v));
  return (
    <>
      <Sec title="The winner" id="dk-fin-w" aside={s.pick ? 'Entered' : 'Not entered'}>
        <p className="dk-note" style={{ marginTop: 0 }}>{who} one of the {ev.f.finalists * s.cities.length} finalists{ev.f.prize ? ', who wins ' + ev.f.prize : ''}. Enter the choice here when it is said; a place’s finalists are final once its voting closes.</p>
        {s.pick ? (
          <div className="dk-sw">
            <div><b>{s.pick.name}</b><span>From {pickCity}</span></div>
            <button type="button" className="fm-b" disabled={busy === 'clr'} onClick={() => ask({ title: 'Clear the winner?', text: s.pick!.name + ' is no longer named as the winner.', yes: 'Clear', danger: true, run: () => run('clr', 'pick.clear', { event: ev.id }, () => 'Cleared.') })}>Clear</button>
          </div>
        ) : null}
        <Status said={said} k="clr" />
      </Sec>
      {s.cities.slice().sort((a, b) => a.planned - b.planned).map((c) => {
        const list = s.finalists.filter((x) => x.city === c.id), closed = c.voteEnd != null && now >= c.voteEnd;
        return (
          <Sec key={c.id} title={c.name} id={'dk-fin-' + c.id} aside={closed ? 'Final' : c.voteEnd ? 'Final at ' + clockText(c.voteEnd, c.offset) : 'Not started'}>
            {list.length && !closed ? <p className="dk-note" style={{ marginTop: 0 }}>{c.voteEnd ? 'These can be entered as the winner once ' + (ev.f.decide === 'judges' ? 'judging' : 'voting') + ' here closes, at ' + clockText(c.voteEnd, c.offset) + '.' : 'These can be entered as the winner once this place has closed.'}</p> : null}
            {list.length ? (
              <ol className="dk-list">
                {list.map((e) => {
                  const k = 'p:' + e.no, on = s.pick?.no === e.no;
                  return (
                    <li key={e.no} className="dk-row">
                      <div className="dk-who"><b>{e.name}</b><span>{['First', 'Second', 'Third'][e.place - 1] || e.place + 'th'} · {e.by || 'No name'} · {val(e.value)} {unit}</span><Status said={said} k={k} /></div>
                      <div className="dk-acts">
                        <button type="button" className="dk-t" disabled={busy === k || on || !closed} aria-label={on ? e.name + ' is the winner' : 'Enter ' + e.name + ' as the winner'}
                          onClick={() => ask({ title: 'Enter ' + e.name + ' as the winner?', text: 'It is named as the winner of ' + ev.short + ' from this moment.' + (s.pick ? ' It replaces ' + s.pick.name + '.' : ''), yes: 'Enter the winner', danger: true, run: () => run(k, 'pick.set', { city: c.id, no: e.no }, () => e.name + ' is the winner.') })}>{on ? 'The winner' : 'Enter as the winner'}</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="dk-note" style={{ marginTop: 0 }}>No entries yet.</p>}
          </Sec>
        );
      })}
    </>
  );
}

/* a whole number field that can be cleared and retyped: it keeps what is typed, passes on a number only when there is
   one, and shows the last good number again if it is left empty */
function NumIn({ id, min, max, value, onNum }: { id: string; min: number; max: number; value: number; onNum: (v: number) => void }) {
  const [text, setText] = useState(String(value)), [was, setWas] = useState(value);
  if (was !== value) { setWas(value); if (Number(text) !== value) setText(String(value)); }
  return (
    <input id={id} className="fm-i" type="number" inputMode="numeric" min={min} max={max} step={1} required value={text}
      onChange={(e) => { const t = e.target.value; setText(t); if (t.trim() !== '' && !isNaN(Number(t))) onNum(Math.trunc(Number(t))); }}
      onBlur={() => { if (text.trim() === '' || isNaN(Number(text))) setText(String(value)); }} />
  );
}
