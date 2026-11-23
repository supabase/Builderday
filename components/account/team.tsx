'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CopyKey } from '@/components/day/get-ready';
import { store, type Me, type MyTeam } from '@/components/forms/store';
import { ErrBox, FM_F, FM_L, FM_NOTE, FM_T } from '@/components/forms/sheet';
import { teamCode, teamCodeOK, teamKey } from '@/lib/team';
import { TeamPicture } from './team-picture';
import { initialsOf, type Seat } from './team-art';

/* "Your team", in the account sheet of someone with a place. Builders on one city's list make a team and share one
   entry: any of them can submit or edit it, none of them can vote for it.
   - Not in a team: the seats, you in the first; "Start a team" makes one at once and shows its code; "Join with a
     code" takes the code a teammate said or sent. A team link (/team/KTR482) lands with the code filled in.
   - In a team: the seats filled, the code and the link to copy, who is in it, the team's project, Leave.
   Every rule is the server's (lib/server/teams.ts); a refusal is shown as said. */

export type TeamLook = { join?: string; leaving?: boolean; said?: string };

/* the code from a team link, once per page: the sheet offers it until it is used */
let invite: string | null | undefined;
function inviteCode(): string {
  if (invite === undefined) {
    try { const c = new URL(window.location.href).searchParams.get('team'); invite = c && teamCodeOK(c) ? teamCode(c) : null; } catch { invite = null; }
  }
  return invite || '';
}
function inviteUsed() {
  invite = null;
  try { const u = new URL(window.location.href); if (u.searchParams.has('team')) { u.searchParams.delete('team'); window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash); } } catch { /* not in a browser */ }
}

const seatsOf = (t: MyTeam | null, me: Me, max: number): Seat[] => {
  const taken: Seat[] = t ? t.members.map((m) => ({ initials: initialsOf(m.name), you: m.you })) : [{ initials: initialsOf(me.name || me.email), you: true }];
  return taken.concat(Array(Math.max(0, max - taken.length)).fill(null)).slice(0, Math.max(max, taken.length));
};

export function TeamPart({ me, look }: { me: Me; look?: TeamLook }) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  const p = me.pass!, t = me.team || null, max = t?.max || me.teams?.max || 4;
  /* a team link: the join form opens with its code, unless the person is already in that team */
  const [first] = useState(() => {
    if (look) return look.join ?? null;
    const c = typeof window === 'undefined' ? '' : inviteCode();
    return c && !(t && teamKey(t.code) === teamKey(c)) ? c : null;
  });
  const [join, setJoin] = useState<string | null>(first), [code, setCode] = useState(first || '');
  const [leaving, setLeaving] = useState(!!look?.leaving), [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''), [said, setSaid] = useState(look?.said || '');
  const inp = useRef<HTMLInputElement>(null), head = useRef<HTMLHeadingElement>(null);

  /* a link to the team they are in already has done its work */
  useEffect(() => {
    if (look || !t) return;
    const c = inviteCode();
    if (c && teamKey(t.code) === teamKey(c)) inviteUsed();
  }, [look, t]);

  const act = (action: 'make' | 'join' | 'leave', c?: string) => {
    if (busy || look) return;
    setBusy(true); setErr('');
    store.team(action, c).then((r) => {
      setBusy(false);
      if (!r.ok) { setErr(r.error); if (action === 'join') window.setTimeout(() => inp.current?.focus(), 0); return; }
      const nt = r.data.team;
      if (action === 'join') inviteUsed();
      setJoin(null); setLeaving(false);
      setSaid(action === 'make' ? 'Team ' + nt?.code + ' is made.'
        : action === 'join' ? 'You’re in team ' + nt?.code + '.' : 'You left the team.');
      /* the section's content changed under the person: focus goes to its heading, which the status line follows */
      window.setTimeout(() => head.current?.focus(), 0);
    });
  };
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!teamCodeOK(code)) { setErr('A team code is three letters and three numbers, like KTR-482.'); inp.current?.focus(); return; }
    act('join', code);
  };

  const n = t?.members.length || 0, full = !!t && n >= max;
  const mine = t?.entry;
  const nameless = !me.name;

  return (
    <section className="ac-ed gr tm" aria-labelledby={id + '-h'}>
      <h3 ref={head} id={id + '-h'} className="ac-k type-label" tabIndex={-1} aria-describedby={said ? id + '-said' : undefined}>{t ? 'Your team · ' + t.code : 'Build with a team'}</h3>
      <TeamPicture seats={seatsOf(t, me, max)} code={t?.code || ''} />
      {said ? <p id={id + '-said'} className="ac-st" data-on="" role="status">{said}</p> : null}

      {!t ? (
        <>
          <p className="ac-st">Up to {max} people on {p.cityName}’s list can build one project together. Any of you can submit or edit it, and none of you can vote for it.</p>
          {join === null ? (
            <div className="tm-acts">
              <button className="fm-b g" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => act('make')}>{busy ? 'Making the team…' : 'Start a team'}</button>
              <button className={FM_T} type="button" onClick={() => { setJoin(''); setErr(''); window.setTimeout(() => inp.current?.focus(), 0); }}>Join with a code</button>
            </div>
          ) : (
            <form className="tm-join" onSubmit={submitJoin} noValidate>
              {inviteCode() && join === inviteCode() ? <p className="ac-st">You were sent the code of a team in {p.cityName}. Join it?</p> : null}
              <div className={FM_F}>
                <label className={FM_L} htmlFor={id + '-c'}>Team code <small>From a teammate</small></label>
                <input ref={inp} className="fm-i tm-in" id={id + '-c'} name="team" placeholder="KTR-482" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={9}
                  value={code} aria-invalid={!!err || undefined} aria-describedby={id + '-e'} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (err) setErr(''); }} />
                <ErrBox id={id + '-e'} msg={err} live />
              </div>
              <div className="tm-acts">
                <button className="fm-b g" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Joining…' : 'Join team'}</button>
                <button className={FM_T} type="button" onClick={() => { setJoin(null); setErr(''); if (inviteCode()) inviteUsed(); }}>Cancel</button>
              </div>
            </form>
          )}
          {join === null && err ? <ErrBox id={id + '-e2'} msg={err} live /> : null}
        </>
      ) : (
        <>
          {!t.set && !full ? (
            <div className="tm-share">
              <div className="gr-cmd tm-code"><pre>{t.code}</pre><CopyKey text={t.code} label={'Copy the team code, ' + t.code} /></div>
              <div className="gr-cmd"><pre>{t.link}</pre><CopyKey text={t.link} label="Copy the team link" /></div>
              <p className="ac-st">{n === 1 ? 'Just you so far. ' : ''}Send the link, or say the code: teammates join from their own account. {max - n === 1 ? 'One seat left.' : max - n + ' seats left.'}</p>
            </div>
          ) : null}
          <ul className="tm-list" aria-label={'In team ' + t.code}>
            {t.members.map((m, i) => <li key={i}>{m.name}{m.you ? <span> · you</span> : null}{!m.named ? <span> · no name yet</span> : null}</li>)}
          </ul>
          {full && !t.set ? <p className="ac-st">The team is full: {max} people.</p> : null}
          {nameless ? <p className={FM_NOTE}>Your team sees you by the start of your email until your name is in. It comes from Luma, or from the first time you submit.</p> : null}
          <p className="ac-st">{mine
            ? <>Your team’s project: {me.open ? <a className="underline-link" href={'/city/' + t.city + '/p/' + mine.slug}>{mine.name}</a> : <b>{mine.name}</b>}. Any of you can edit it until building ends.</>
            : <>No project yet. On the day any of you submits it, once, for the whole team.</>}</p>
          {t.set ? <p className="ac-st">The team is set: building has ended in {t.cityName}.</p>
            : leaving ? (
              <div className="tm-leave" role="group" aria-labelledby={id + '-lq'}>
                <p id={id + '-lq'} className="ac-st" data-on="">Leave team {t.code}?{n === 1 ? ' It closes, and your project, if any, stays yours.' : mine ? ' The project stays with the team.' : ''}</p>
                <div className="tm-acts">
                  <button className="fm-b" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => act('leave')}>{busy ? 'Leaving…' : 'Leave the team'}</button>
                  <button className={FM_T} type="button" onClick={() => setLeaving(false)}>Stay</button>
                </div>
              </div>
            ) : <p><button className={FM_T} type="button" onClick={() => { setLeaving(true); setErr(''); }}>Leave the team</button></p>}
          {err ? <ErrBox id={id + '-e3'} msg={err} live /> : null}
        </>
      )}
    </section>
  );
}
