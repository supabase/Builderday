'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { CHECKS, cityLabel, pictureError, atCity, withScheme, type FieldName } from '@/lib/forms';
import { emit, meNow, store, type Entry } from './store';
import { FM_ACT, FM_DONE, FM_F, FM_FORM, FM_H, FM_L, FM_NOTE, FM_P, FM_T, ErrBox, Sheet, useSheet } from './sheet';
import type { Who } from './sign-in-sheet';
import { FromEditor } from '@/components/day/get-ready';
import { RULES, SERVER } from '@/lib/hackday-server';
import { submit } from '@/lib/submit';
import { ROOM_HOST, ROOM_NOT_SAVED, notListedAnywhere, roomCodeOK, roomStep } from '@/lib/event/rule';

/* Submit: one entry per person. The same sheet edits it until building closes, then says so. A new entry gets two
   parts under one sentence about the rules: from your editor first (the sentence to say), then in the browser (this
   form). Both run the same checks. Editing an entry is the form alone.
   On a site with the backend, a person on a list who has not typed the room code yet is asked for it first (rule 7c),
   one field, then the form; a refusal for the same reason later brings the step back with everything typed kept. */
export type SubmitOpts = { city?: string; cityName?: string; deadline?: Date | string; off?: number };
type Fields = { name: string; pitch: string; repo: string; demo: string; video: string; rules: boolean };
const NAMES: FieldName[] = ['name', 'pitch', 'repo', 'demo', 'video', 'rules'];
const isPast = (d: Date | string) => Date.now() > new Date(d).getTime();

export function SubmitSheet({ o, who, done, again, share }: { o: SubmitOpts; who: Who; done: (e: Entry | null) => void; again: () => void; share: (e: Entry) => void }) {
  const [mine] = useState(() => store.entryFor(who.handle));
  const edit = !!mine, saved = useRef<Entry | null>(null), nameRef = useRef<HTMLInputElement>(null);
  const cityName = edit ? (mine!.cityName || cityLabel(mine!.city)) : (o.cityName || cityLabel(o.city));
  const [doneEntry, setDoneEntry] = useState<Entry | null>(null), [gone, setGone] = useState(false);
  const [needRoom] = useState(() => { const m = meNow(); return store.isLive() && !!m?.pass && !m.pass.checkedIn; }), roomRef = useRef<HTMLInputElement>(null);
  /* signed in but on no city's list: they can vote, and the sheet says how to get on a list rather than show a form */
  const [unlisted] = useState(() => store.isLive() && !mine && !meNow()?.pass);
  return (
    <Sheet wide label={doneEntry ? (edit ? 'Saved' : 'Submitted') : cityName ? 'Entry · ' + cityName : 'Entry'} focusRef={needRoom ? roomRef : nameRef} onDone={() => done(saved.current)}>
      {unlisted ? <NotListedView />
        : gone ? <GoneView cityName={cityName} />
        : doneEntry
        ? <DoneView edit={edit} entry={doneEntry} cityName={cityName} until={until(edit, mine, o)} again={again} share={share} />
        : <SubmitForm o={o} who={who} mine={mine} cityName={cityName} nameRef={nameRef} roomRef={roomRef} needRoom={needRoom} onSaved={(e) => { saved.current = e; setDoneEntry(e); }} onDeleted={() => { saved.current = null; setGone(true); }} />}
    </Sheet>
  );
}
function deadlineOf(edit: boolean, mine: Entry | null, o: SubmitOpts) { return edit ? (mine!.deadline || o.deadline) : o.deadline; }
function until(edit: boolean, mine: Entry | null, o: SubmitOpts) { const d = deadlineOf(edit, mine, o); return d ? atCity(d, o.off) : ''; }

function SubmitForm({ o, who, mine, cityName, nameRef, roomRef, needRoom, onSaved, onDeleted }: { o: SubmitOpts; who: Who; mine: Entry | null; cityName: string; nameRef: React.RefObject<HTMLInputElement | null>; roomRef: React.RefObject<HTMLInputElement | null>; needRoom: boolean; onSaved: (e: Entry) => void; onDeleted: () => void }) {
  const { id, busy: busyRef, open: openRef, focus } = useSheet(), edit = !!mine;
  const city = edit ? mine!.city : o.city, deadline = deadlineOf(edit, mine, o), untilT = until(edit, mine, o);
  const otherCity = edit && o.city && mine!.city !== o.city;
  const [f, setF] = useState<Fields>(() => edit ? { name: mine!.name || '', pitch: mine!.pitch || '', repo: mine!.repo || '', demo: mine!.demo || '', video: mine!.video || '', rules: true } : { name: '', pitch: '', repo: '', demo: '', video: '', rules: false });
  const [err, setErr] = useState<Partial<Record<FieldName | 'picture', string>>>({});
  const [busy, setBusy] = useState(false), [closed, setClosed] = useState(false);
  /* live: the public name is asked for once, when Luma gave none; never taken from the email */
  const live = store.isLive(), askName = live && !who.handle;
  const [by, setBy] = useState(''), [byErr, setByErr] = useState(''), [formErr, setFormErr] = useState('');
  const [del, setDel] = useState<'' | 'ask' | 'busy'>('');
  const byRef = useRef<HTMLInputElement>(null);
  /* the picture: a new file, the one already saved (kept), or none */
  const [pic, setPic] = useState<{ file: File | null; keep: boolean; url: string; preview: string }>(() => ({ file: null, keep: !!(mine && mine.picture), url: '', preview: mine && mine.picture ? mine.picture : '' }));
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), formRef = useRef<HTMLFormElement>(null), headRef = useRef<HTMLHeadingElement>(null);
  const urlRef = useRef('');
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  /* the room code step: shown first when needed, and again if the server says so; the form below keeps its values */
  const [room, setRoom] = useState(needRoom), [code, setCode] = useState(''), [codeErr, setCodeErr] = useState(''), [checking, setChecking] = useState(false), [inNote, setInNote] = useState('');
  const [why, setWhy] = useState(''), [hostSaid, setHostSaid] = useState('');
  const roomCity = meNow()?.pass?.cityName || cityName;
  const toRoom = (reason: string) => { setRoom(true); setWhy(reason); setHostSaid(''); setCode(''); setCodeErr(''); window.setTimeout(() => roomRef.current?.focus(), 0); };
  const leaveRoom = () => {
    setRoom(false); setWhy(''); setHostSaid(''); setFormErr(''); setInNote('Checked in. You can submit until the end of building.'); emit();
    window.setTimeout(() => focus(document.getElementById(id + '-name')), 0);
  };
  const onCode = (e: FormEvent) => {
    e.preventDefault(); if (busyRef.current) return;
    if (!roomCodeOK(code)) { setCodeErr('The code on the screen is four letters and numbers.'); roomRef.current?.focus(); return; }
    busyRef.current = true; setChecking(true); setCodeErr('');
    store.checkIn(code).then((r) => {
      busyRef.current = false; setChecking(false); if (!openRef.current) return;
      if (!r.ok) { setCodeErr(r.error || 'That code did not work. Check the screen and try again.'); roomRef.current?.focus(); return; }
      leaveRoom();
    });
  };
  /* a host may mark the person in the room at the desk while this step is open: look again when the step shows, when
     the page comes back into view, and when they say so */
  const [looking, setLooking] = useState(false);
  const hostChecked = () => {
    if (looking) return; setLooking(true); setHostSaid('');
    store.refresh().then(() => {
      setLooking(false); if (!openRef.current) return;
      if (meNow()?.pass?.checkedIn) leaveRoom(); else setHostSaid('Not checked in yet. Ask the host at the desk to mark you in the room, then press this again.');
    });
  };
  useEffect(() => {
    if (!room || !live) return;
    let on = true;
    const look = () => { if (document.visibilityState !== 'visible') return; store.refresh().then(() => { if (on && meNow()?.pass?.checkedIn) { on = false; setRoom(false); setWhy(''); setHostSaid(''); setFormErr(''); setInNote('Checked in. You can submit until the end of building.'); window.setTimeout(() => focus(document.getElementById(id + '-name')), 0); } }); };
    look();
    window.addEventListener('focus', look); document.addEventListener('visibilitychange', look);
    return () => { on = false; window.removeEventListener('focus', look); document.removeEventListener('visibilitychange', look); };
  }, [room, live, focus, id]);

  const check = (n: FieldName, v: string | boolean) => { const m = CHECKS[n](v); setErr((e) => ({ ...e, [n]: m })); return !m; };
  const set = (n: FieldName, v: string | boolean) => { setF((x) => ({ ...x, [n]: v })); if (err[n]) check(n, v); };
  const takeFile = (file: File | null | undefined) => {
    if (!file) return;
    const m = pictureError(file); setErr((e) => ({ ...e, picture: m }));
    if (m) { if (fileRef.current) fileRef.current.value = ''; return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const u = URL.createObjectURL(file); urlRef.current = u; setPic({ file, keep: false, url: u, preview: u });
  };
  const removePic = () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; if (fileRef.current) fileRef.current.value = ''; setErr((e) => ({ ...e, picture: '' })); setPic({ file: null, keep: false, url: '', preview: '' }); fileRef.current?.focus(); };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault(); if (busyRef.current) return;
    let first: HTMLElement | null = null;
    NAMES.forEach((n) => { if (!check(n, f[n]) && !first) first = (formRef.current?.elements.namedItem(n) as HTMLElement | null) || null; });
    if (err.picture && !first) first = fileRef.current;
    if (askName && !by.trim()) { setByErr('Say your name as it should show beside your project.'); if (!first) first = byRef.current; }
    if (first) { (first as HTMLElement).focus(); return; }
    if (deadline && isPast(deadline)) { setClosed(true); headRef.current?.focus(); return; }
    busyRef.current = true; setBusy(true);
    const fields = { name: f.name.trim(), pitch: f.pitch.trim(), repo: withScheme(f.repo), demo: f.demo.trim() ? withScheme(f.demo) : '', video: f.video.trim() ? withScheme(f.video) : '', city: city || '', cityName: cityName || '', deadline: deadline ? new Date(deadline).toISOString() : '' };
    /* the same checks as the editor's way in (lib/submit.ts); the stand-in store saves */
    setFormErr('');
    submit(fields, { now: new Date(), hasEntry: edit, off: o.off }, (d) => store.saveEntry(who.handle, d, pic.file, pic.keep, askName ? by.trim() : undefined)).catch((x: Error & { field?: string }) => {
      /* the server's refusal, in its own words, on the field it is about */
      busyRef.current = false; setBusy(false);
      const fld = x.field || '';
      if (fld === 'closed') { setClosed(true); setFormErr(x.message); headRef.current?.focus(); return { verdict: null, entry: null, handled: true }; }
      if (fld === 'by') { setByErr(x.message); byRef.current?.focus(); return { verdict: null, entry: null, handled: true }; }
      if (fld === 'room') { toRoom(ROOM_NOT_SAVED); return { verdict: null, entry: null, handled: true }; }
      if (fld === 'name' || fld === 'pitch' || fld === 'repo' || fld === 'demo' || fld === 'video' || fld === 'picture') {
        setErr((e) => ({ ...e, [fld]: x.message })); (fld === 'picture' ? fileRef.current : formRef.current?.elements.namedItem(fld) as HTMLElement | null)?.focus();
      } else setFormErr(x.message);
      return { verdict: null, entry: null, handled: true };
    }).then((res) => {
      if ('handled' in res) return;
      const { verdict, entry } = res;
      busyRef.current = false;
      if (!entry) {
        setBusy(false);
        if (!verdict) return;
        if (verdict.refused.some((r) => r.check === 'closed')) { setClosed(true); headRef.current?.focus(); return; }
        const r = verdict.refused.find((x) => x.check === 'repo') ?? verdict.refused[0];
        if (r) { setErr((e) => ({ ...e, repo: r.say })); (formRef.current?.elements.namedItem('repo') as HTMLElement | null)?.focus(); }
        return;
      }
      emit(); if (!openRef.current) return; onSaved(entry);
    });
  };

  const attrs = (n: FieldName) => ({ className: 'fm-i', id: id + '-' + n, name: n, 'aria-describedby': id + '-e-' + n, 'aria-invalid': err[n] ? true : undefined, ref: n === 'name' ? nameRef : undefined });
  const onBlurField = (n: FieldName) => { const v = f[n]; if (typeof v === 'string' && (v.trim() || err[n])) check(n, v); };
  const field = (n: FieldName, label: string, input: React.ReactNode, hint?: React.ReactNode) => (
    <div className={FM_F}><label className={FM_L} htmlFor={id + '-' + n}><span>{label}</span>{hint}</label>{input}<ErrBox id={id + '-e-' + n} msg={err[n] || ''} /></div>
  );
  const text = (n: 'name' | 'pitch' | 'repo' | 'demo' | 'video') => ({ value: f[n], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(n, e.target.value), onBlur: () => onBlurField(n) });

  return (
    <>
      {room ? (
        <form className={FM_FORM} data-step="room" noValidate onSubmit={onCode}>
          <h2 className={FM_H} id={id + '-h'} tabIndex={-1}>Type the code on the screen</h2>
          <p className={FM_P} id={id + '-rp'}>{why ? <><b className="font-medium text-ink">{why}</b> </> : null}{roomStep(roomCity)}</p>
          <div className={FM_F}>
            <label className={FM_L} htmlFor={id + '-rc'}>Code on the screen</label>
            <input ref={roomRef} className="fm-i fm-room" id={id + '-rc'} name="room" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={4} enterKeyHint="go"
              data-1p-ignore data-lpignore="true" aria-describedby={id + '-rp ' + id + '-re'} aria-invalid={codeErr ? true : undefined} value={code} readOnly={checking}
              onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); if (codeErr) setCodeErr(''); }} />
            <ErrBox id={id + '-re'} msg={codeErr} live />
          </div>
          <div className={FM_ACT}><button className="fm-b g" type="submit" disabled={checking} aria-busy={checking || undefined}>{checking ? 'Checking code…' : 'Check in'}</button></div>
          <p className={FM_NOTE}>{ROOM_HOST}</p>
          <div className={FM_ACT}><button className={FM_T} type="button" disabled={looking} aria-busy={looking || undefined} onClick={hostChecked}>{looking ? 'Looking…' : 'The host checked me in'}</button></div>
          <p className={FM_NOTE + (hostSaid ? '' : ' sr-only')} role="status">{hostSaid}</p>
        </form>
      ) : null}
      <p className="sr-only" role="status">{room ? '' : inNote}</p>
      <div hidden={room}>
      <h2 ref={headRef} className={FM_H} id={room ? undefined : id + '-h'} tabIndex={-1}>{edit ? 'Edit your project' : 'Submit your project'}</h2>
      {inNote ? <p className={FM_NOTE + ' mt-2'}>{inNote}</p> : null}
      <p className={FM_P}>{closed
        ? (formErr || 'Submissions for ' + cityName + ' closed at ' + untilT + '.') + ' Your entry was not saved.'
        : <>{otherCity ? 'You already have an entry in ' + cityName + '. One entry per person, so this edits it. ' : ''}{live ? (who.handle ? <>Entering as <b>{who.handle}</b>. </> : null) : <>Entering as <b>@{who.handle}</b>. </>}One entry per person.{untilT ? ' You can edit it until ' + untilT + '.' : ''}</>}</p>
      {/* the browser form first (it needs nothing set up), the editor door under it once the server is open; until then
          one line says so, and the form is the way in */}
      {edit || closed ? null : SERVER.live ? <div className="gr-two mt-3">
        <p className={FM_NOTE}>The rules, for both ways in: {RULES.join(' ')}</p>
        <h3 className="gr-in">In the browser</h3>
      </div> : <p className={FM_NOTE + ' mt-3'}>{RULES.join(' ')} Submitting from your editor opens later; for now, submit here.</p>}
      <form ref={formRef} className={FM_FORM} noValidate onSubmit={onSubmit}>
        {askName ? (
          <div className={FM_F}><label className={FM_L} htmlFor={id + '-by'}><span>Your name</span><small>Shown beside your project</small></label>
            <input ref={byRef} className="fm-i" id={id + '-by'} name="by" type="text" maxLength={60} autoComplete="name" value={by} aria-describedby={id + '-e-by'} aria-invalid={byErr ? true : undefined}
              onChange={(e) => { setBy(e.target.value); if (byErr && e.target.value.trim()) setByErr(''); }} />
            <ErrBox id={id + '-e-by'} msg={byErr} /></div>
        ) : null}
        {field('name', 'Project name', <input {...attrs('name')} {...text('name')} type="text" maxLength={40} autoComplete="off" spellCheck={false} enterKeyHint="next" />)}
        {field('pitch', 'One-line pitch', <input {...attrs('pitch')} {...text('pitch')} type="text" maxLength={100} autoComplete="off" spellCheck enterKeyHint="next" />,
          <span className={clsx('tabular-nums', f.pitch.length >= 100 ? 'text-ink' : 'text-ink-3')} id={id + '-ct'} aria-hidden="true">{f.pitch.length}/100</span>)}
        {field('repo', 'GitHub repo', <input {...attrs('repo')} {...text('repo')} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://github.com/you/project" enterKeyHint="next" />)}
        {field('demo', 'Demo link', <input {...attrs('demo')} {...text('demo')} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://" enterKeyHint="next" />, <small>Optional</small>)}
        {field('video', 'Video link', <input {...attrs('video')} {...text('video')} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://" enterKeyHint="next" />, <small>Optional</small>)}
        <div className={FM_F}>
          <span className={FM_L} id={id + '-pl'}><span>Picture</span><small>Optional</small></span>
          <div className="grid grid-cols-2 items-end gap-x-4 phone-window:grid-cols-[minmax(0,1fr)] phone-window:gap-y-2">
            <label className={'fm-pic' + (pic.preview ? ' has-img' : '') + (over ? ' is-over' : '')} data-pic
              onDragOver={(e: DragEvent) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
              <input ref={fileRef} type="file" name="picture" accept="image/jpeg,image/png,image/webp" aria-labelledby={id + '-pl'} aria-describedby={id + '-ph ' + id + '-e-picture'} aria-invalid={err.picture ? true : undefined}
                onChange={(e) => takeFile(e.target.files && e.target.files[0])} />
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
              {pic.preview ? <img src={pic.preview} alt="Picture preview" /> : null}
              <span className="grid justify-items-center gap-y-1 p-4 text-center text-sm text-ink-2 [&_b]:font-medium [&_b]:text-ink" data-pic-t hidden={!!pic.preview}><b>Add a picture</b><span>Drop it here or choose a file</span></span>
            </label>
            <div className="grid content-end gap-y-2">
              <p className={FM_NOTE} id={id + '-ph'}>Shown at 16:9 in the list and on your project page. JPEG, PNG or WebP, up to 5{' '}MB.</p>
              <div className="flex flex-wrap gap-x-4" data-pic-a hidden={!pic.preview}>
                <button className={FM_T} type="button" onClick={() => fileRef.current?.click()}>Change picture</button>
                <button className={FM_T} type="button" onClick={removePic}>Remove picture</button>
              </div>
            </div>
          </div>
          <ErrBox id={id + '-e-picture'} msg={err.picture || ''} />
        </div>
        <div className={FM_F}>
          <label className="fm-chk"><input type="checkbox" name="rules" aria-describedby={id + '-e-rules'} aria-invalid={err.rules ? true : undefined} checked={f.rules}
            onChange={(e) => { setF((x) => ({ ...x, rules: e.target.checked })); if (err.rules) check('rules', e.target.checked); }} />
          <span>I built this during Builder Day.</span></label>
          <ErrBox id={id + '-e-rules'} msg={err.rules || ''} />
        </div>
        <ErrBox id={id + '-e-form'} msg={closed ? '' : formErr} />
        <div className={FM_ACT}><button className="fm-b g" type="submit" disabled={busy || closed} aria-busy={busy || undefined}>{busy ? (edit ? 'Saving changes…' : 'Submitting project…') : (edit ? 'Save changes' : 'Submit project')}</button>
          {edit && live && !closed ? (
            <button className={FM_T} type="button" disabled={busy || del === 'busy'} aria-live="polite" onClick={async () => {
              if (del !== 'ask') { setDel('ask'); return; }
              setDel('busy'); const r = await store.deleteEntry();
              if (r.ok) { if (openRef.current) onDeleted(); } else if (r.field === 'room') { setDel(''); toRoom('Your entry is not deleted. Check in first, then delete it.'); } else { setDel(''); setFormErr(r.error); }
            }}>{del === 'ask' ? 'Press again to delete your entry' : del === 'busy' ? 'Deleting…' : 'Delete entry'}</button>
          ) : null}
        </div>
      </form>
      {edit || closed || !SERVER.live ? null : <div className="gr-two gr-after">
        <h3 className="gr-in">Or from your editor</h3>
        <FromEditor city={cityName || undefined} rules={false} label={null} />
      </div>}
      </div>
    </>
  );
}

function NotListedView() {
  const { id } = useSheet(), h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, []);
  return (
    <>
      <h2 ref={h} className={FM_H} id={id + '-h'} tabIndex={-1}>You are not on a list yet</h2>
      <p className={FM_P}>{notListedAnywhere}</p>
      <div className={FM_DONE}><div className={FM_ACT}><button className="fm-b" type="button" data-close>Done</button></div></div>
    </>
  );
}

function GoneView({ cityName }: { cityName: string }) {
  const { id } = useSheet(), h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, []);
  return (
    <>
      <h2 ref={h} className={FM_H} id={id + '-h'} tabIndex={-1}>Your entry is deleted.</h2>
      <p className={FM_P} role="status">It is off the {cityName || 'city'} list. You can submit again while building runs.</p>
      <div className={FM_DONE}><div className={FM_ACT}><button className="fm-b" type="button" data-close>Done</button></div></div>
    </>
  );
}

function DoneView({ edit, entry, cityName, until: untilT, again, share }: { edit: boolean; entry: Entry; cityName: string; until: string; again: () => void; share: (e: Entry) => void }) {
  const { id, close } = useSheet(), h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, []);
  return (
    <>
      <h2 ref={h} className={FM_H} id={id + '-h'} tabIndex={-1}>{edit ? 'Changes saved.' : entry.name + ' is in.'}</h2>
      <p className={FM_P} role="status">{(edit ? 'Your entry is up to date' : 'Your entry is in the ' + (cityName || 'city') + ' list') + (untilT ? '. You can edit it until ' + untilT + '.' : '.')}</p>
      <div className={FM_DONE}><div className={FM_ACT}>
        <button className="fm-b g" type="button" data-share onClick={() => share(entry)}>Share entry</button>
        <button className="fm-b" type="button" data-again onClick={() => { close(); again(); }}>Edit entry</button>
        <button className="fm-b" type="button" data-close>Done</button>
      </div></div>
    </>
  );
}
