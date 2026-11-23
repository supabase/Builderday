'use client';
import { useEffect, useRef, useState } from 'react';
import { nextWords, stepsOf, visible } from '@/lib/stage/deck';
import { started } from '@/lib/stage/act';
import type { StageDriver } from '@/lib/stage/driver';
import type { StageAction } from '@/lib/stage/types';
import { placeTime } from '@/lib/stage/rows';
import { BD_WALL, hasVote, type WallEvent } from '@/lib/stage/event';
import { mmss } from './parts';
import { useAwake, useSecond, useSnap } from './use';
import './remote.css';

/* The remote: the host's phone, for a thumb, in the dark, held by someone who is talking. The lower part of the
   screen is Next, one key; Back sits above it, smaller. At the top: the scene, the step, what the next press does in words, the notes, the city's time and the time left. Under that the keys that
   belong to the scene, then Blank, QR and the list of scenes. Start building and Close voting ask once; nothing else
   asks. When the link is down every key is off and the remote says so, so a press is never lost without a word. Keys
   are never animated: each press is a cut on the wall. A pressed key darkens for as long as the thumb is on it. */

type Ctl = { label: string; a: StageAction; on?: boolean; pri?: boolean; off?: boolean; time?: string };

export function StageRemote({ driver, name, first, event = BD_WALL }: { driver: StageDriver; name: string; first: number; event?: WallEvent }) {
  const snap = useSnap(driver), now = useSecond(driver, first);
  const deck = visible(snap.deck), i = Math.max(0, deck.findIndex((s) => s.id === snap.row.scene)), s = deck[i];
  const steps = s ? stepsOf(s) : 1, step = snap.row.step, c = snap.city, go = snap.link === 'local' || snap.link === 'live';
  /* the question, and when it appeared: its go-ahead takes no press in the first moment, so a second tap on Next
     (which the question replaced) never answers it */
  const [ask, setAsk] = useState<{ q: string; a: StageAction; at: number } | null>(null);
  const [list, setList] = useState(false);
  const [why, setWhy] = useState('');
  /* the note a refused press leaves goes after a few seconds, or with the next press */
  useEffect(() => { if (!why) return; const id = window.setTimeout(() => setWhy(''), 4000); return () => window.clearTimeout(id); }, [why]);
  /* a dropped link cancels a question that was waiting: the answer could not be sent */
  const shown = go ? ask : null;
  useAwake();
  /* closing the question or the list puts focus back on the key that opened it */
  const nextRef = useRef<HTMLButtonElement>(null), listRef = useRef<HTMLButtonElement>(null), was = useRef({ ask: false, list: false });
  useEffect(() => {
    if (was.current.ask && !shown) nextRef.current?.focus();
    if (was.current.list && !list) listRef.current?.focus();
    was.current = { ask: !!shown, list };
  }, [shown, list]);

  const send = (a: StageAction) => {
    if (!go) return;
    try { navigator.vibrate?.(8); } catch { /* no vibration here */ }
    driver.send(a).then((r) => setWhy(r.ok ? '' : r.why), () => setWhy('Not sent. Try again.'));
  };
  const press = (a: StageAction, t = 0) => {
    if (!go) return;
    const q = driver.ask(a, name, (ms) => placeTime(c, ms));
    if (q) setAsk({ q, a, at: t }); else send(a);
  };

  /* the time line: before the clock, the planned start; then what is left of building or voting */
  const time = placeTime(c, now);
  const [lw, lt] = !started(c) ? ['Starts', placeTime(c, c.planned_start)]
    : c.build_end && now < c.build_end ? ['Building ends in', mmss((c.build_end - now) / 1000)]
    : c.vote_end && now < c.vote_end ? ['Voting closes in', mmss((c.vote_end - now) / 1000)] : ['Voting has closed', ''];
  const talk = snap.row.timer.ends_at && snap.row.timer.ends_at > now ? snap.row.timer.ends_at - now : 0;

  /* the scene's own keys. They keep their places while the scene is on: a key that cannot be pressed now is off,
     never taken away, so a thumb that comes back to the same spot never finds another key there. */
  const ctl: Ctl[] = [];
  const building = !!c.build_end && now < c.build_end, voting = !!c.vote_end && now < c.vote_end;
  if (s?.kind === 'building') {
    if (!started(c)) ctl.push({ label: 'Start building', a: { t: 'start' }, pri: true });
    else {
      ctl.push({ label: '+1 min', a: { t: 'add', min: 1 }, off: !building }, { label: '+5 min', a: { t: 'add', min: 5 }, off: !building });
      /* the chart is votes over time: none where the judges decide alone */
      if (hasVote(event)) ctl.push({ label: 'Chart', a: { t: 'chart' }, on: snap.row.chart_on });
    }
  }
  if (s?.kind === 'voting') {
    ctl.push({ label: '+1 min', a: { t: 'add', min: 1 }, off: !voting }, { label: '+5 min', a: { t: 'add', min: 5 }, off: !voting });
    if (hasVote(event)) ctl.push({ label: 'Chart', a: { t: 'chart' }, on: snap.row.chart_on });
    ctl.push({ label: snap.can.super ? 'Close voting' : 'Close voting (super admin)', a: { t: 'close' }, off: !voting || !snap.can.super });
  }
  if (s?.kind === 'top3') {
    ctl.push({ label: step < 3 ? ['Reveal third', 'Reveal second', 'Reveal first'][step] : 'All three shown', a: { t: 'next' }, off: step >= 3 });
    ctl.push({ label: talk ? 'Talk timer' : 'Start talk timer', a: { t: 'talk' }, on: !!talk, time: talk ? mmss(talk / 1000) : undefined });
  }
  if (s?.kind === 'tombola') ctl.push({ label: step ? 'Spin again' : 'Spin', a: { t: 'spin' }, pri: !step });

  const status = !go ? (snap.link === 'off' ? 'Not connected. Keys are off.' : 'Reconnecting… Keys are off.')
    : snap.screens > 0 ? (snap.screens === 1 ? 'Screen connected' : snap.screens + ' screens connected') : 'No screen is showing ' + name;
  const nextLabel = s ? nextWords(snap.deck, s.id, step, started(c)) : '';

  return (
    <div className="rm" data-link={snap.link} data-screens={snap.screens > 0 ? '' : undefined} data-alone={go && snap.screens === 0 ? '' : undefined}>
      {/* under the question or the list nothing can be reached, by touch or by keyboard */}
      <div className="rm-main" inert={!!shown || list}>
      <p className="rm-status" role="status" aria-live="polite"><span className="rm-dot" aria-hidden="true" />{status}</p>
      <header className="rm-top">
        <p className="rm-city"><span>{name}</span><span className="rm-num">{time}</span></p>
        <h1 className="rm-scene">{s ? s.title : 'The deck is empty'}</h1>
        <p className="rm-meta">
          {steps > 1 ? <span>Step {step + 1} of {steps}</span> : null}
          <span>{lw} <span className="rm-num">{lt}</span></span>
          {snap.row.blank ? <span className="rm-flag">The wall is blank</span> : null}
          {snap.row.timer.qr ? <span className="rm-flag">QR is on the wall</span> : null}
        </p>
        <p className="rm-next">Next: <b>{nextLabel}</b></p>
      </header>
      {s?.notes ? <p className="rm-notes">{s.notes}</p> : <div className="rm-notes" />}
      {ctl.length ? (
        <div className="rm-ctl">
          {ctl.map((k, j) => <button key={k.a.t + j} type="button" className="rm-k" data-pri={k.pri ? '' : undefined} aria-pressed={k.on === undefined ? undefined : k.on} disabled={!go || k.off} onClick={(e) => press(k.a, e.timeStamp)}>{k.label}{k.time ? <> · <span className="rm-num">{k.time}</span></> : null}</button>)}
        </div>
      ) : null}
      <div className="rm-util">
        <button type="button" className="rm-k" aria-pressed={snap.row.blank} disabled={!go} onClick={() => press({ t: 'blank' })}>Blank</button>
        <button type="button" className="rm-k" aria-pressed={!!snap.row.timer.qr} disabled={!go} onClick={() => press({ t: 'qr' })}>QR</button>
        <button ref={listRef} type="button" className="rm-k" aria-expanded={list} onClick={() => setList(true)}>Scenes</button>
      </div>
      <p className="rm-why" role="alert">{why}</p>
      <button type="button" className="rm-back" disabled={!go} onClick={() => press({ t: 'back' })}>Back</button>
      <button ref={nextRef} type="button" className="rm-nextk" disabled={!go || !s} onClick={(e) => press({ t: 'next' }, e.timeStamp)}>
        <span className="rm-nextk-l">Next</span>
        <span className="rm-nextk-w">{nextLabel}</span>
      </button>
      </div>

      {shown ? (
        <div className="rm-ask" role="alertdialog" aria-modal="true" aria-labelledby="rm-ask-q" onKeyDown={(e) => { if (e.key === 'Escape') setAsk(null); }}>
          <p id="rm-ask-q" className="rm-ask-q">{shown.q}</p>
          {/* the go-ahead sits up here; Cancel takes Next's place, so a second tap on Next cancels */}
          <button type="button" className="rm-k rm-ask-go" onClick={(e) => { if (e.timeStamp - shown.at < 600) return; send(shown.a); setAsk(null); }}>
            {shown.a.t === 'close' ? 'Close voting' : 'Start the clock'}
          </button>
          <button type="button" className="rm-nextk rm-ask-no" autoFocus onClick={() => setAsk(null)}>
            <span className="rm-nextk-l">Cancel</span>
          </button>
        </div>
      ) : null}

      {list ? (
        <div className="rm-list" role="dialog" aria-modal="true" aria-label="Scenes" onKeyDown={(e) => { if (e.key === 'Escape') setList(false); }}>
          <ol>
            {deck.map((x, j) => (
              <li key={x.id}>
                <button type="button" aria-current={j === i ? 'step' : undefined} disabled={!go} onClick={() => { press({ t: 'jump', i: j }); setList(false); }}>
                  <span className="rm-num">{j + 1}</span>{x.title}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="rm-back" autoFocus onClick={() => setList(false)}>Close the list</button>
        </div>
      ) : null}
    </div>
  );
}
