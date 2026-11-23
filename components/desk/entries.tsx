'use client';
/* Entries: the place's entries as they arrive, newest first, flagged ones first. A host can hide or show one, refresh
   its picture and open it; a judge sees the same list and its flags, and judges here: with a budget, a press puts
   votes on a project or takes them back; with scores, 1 to 5 on each criterion. The numbers shown follow the event's
   format: votes, judges' votes, or the judges' average score. Once voting has closed, a tie for a place at the top is
   shown first, and a host puts it in order (Ties). */
import { useMemo, useState } from 'react';
import { FLAG_WORDS, type DeskAct, type DeskCity, type DeskEntry, type DeskState } from '@/lib/event/desk';
import { BUILDER_DAY, maxScore, meanScore, publicVotes, rankValue, ranked, topTies, type Format } from '@/lib/event/format';
import { ago, Sec, Status, usePress } from './parts';
import { EVENT } from '@/lib/day-data';
const BUILDER_EVENT = EVENT.id;

/* the entry's numbers, in the event's terms */
function numbers(e: DeskEntry, f: Format): { big: string; small: string } {
  const pub = publicVotes(e), plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');
  if (f.decide === 'votes') return { big: String(pub), small: pub === 1 ? 'vote' : 'votes' };
  if (f.decide === 'both') return { big: String(e.votes), small: e.judge ? 'votes · ' + e.judge + ' from judges' : 'votes' };
  const judged = f.judging === 'scores'
    ? { big: e.scoreN ? meanScore(e).toFixed(1) : '–', small: 'of ' + maxScore(f) + ' · ' + plural(e.scoreN, 'judge') }
    : { big: String(e.judge), small: 'judges’ votes' };
  return f.decide === 'apart' ? { big: judged.big, small: judged.small + ' · ' + plural(pub, 'public vote') } : judged;
}

/* Ties at the top once voting has closed: each group in its current order (the host's, or who reached the count first);
   a host moves one up and keeps the order. Nothing shows while there is none. */
function Ties({ s, c, f, now, act }: { s: DeskState; c: DeskCity; f: Format; now: number; act: DeskAct }) {
  const { busy, said, run } = usePress(act);
  const [moved, setMoved] = useState<Record<string, number[]>>({});
  const closed = c.voteEnd != null && now >= c.voteEnd;
  const groups = useMemo(() => {
    if (!closed || f.decide === 'judges' && f.judging === 'scores') return [];
    const list = ranked(s.entries.filter((e) => !e.hidden && e.city === c.id), f);
    const t = topTies(list, f.finalists, (e) => rankValue(e, f), (e) => e.tie, (e) => e.no);
    const out: { at: number; n: number; nos: number[]; settled: boolean }[] = [];
    list.forEach((e, i) => { const st = t.get(e.no); if (!st) return; const g = out[out.length - 1]; if (g && g.n === rankValue(e, f)) g.nos.push(e.no); else out.push({ at: i + 1, n: rankValue(e, f), nos: [e.no], settled: st === 'settled' }); });
    return out;
  }, [closed, s.entries, c.id, f]);
  if (!groups.length) return null;
  const name = (no: number) => s.entries.find((e) => e.no === no)?.name || '#' + no;
  return (
    <div className="dk-ties">
      {groups.map((g) => {
        const k = 'tie:' + g.at, order = moved[k] || g.nos;
        const up = (i: number) => { const o = order.slice(); [o[i - 1], o[i]] = [o[i], o[i - 1]]; setMoved((m) => ({ ...m, [k]: o })); };
        return (
          <div key={k} className="dk-tie">
            <p className="dk-judge-line"><b>{g.settled && !moved[k] ? 'Tie settled' : 'Tie'}</b> for {g.at === 1 ? 'first place' : 'place ' + g.at}: {g.nos.length} projects on {g.n}.{s.can.host ? (g.settled && !moved[k] ? ' The order below is yours.' : ' Put them in order and keep it; the city page shows it.') : ' A host settles it.'}</p>
            <ol className="dk-tie-list">
              {order.map((no, i) => (
                <li key={no}>
                  <span>{name(no)}</span>
                  {s.can.host && i > 0 ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Move ' + name(no) + ' up'} onClick={() => up(i)}>Up</button> : null}
                </li>
              ))}
            </ol>
            {s.can.host ? (
              <div className="dk-acts">
                <button type="button" className="dk-t" disabled={busy === k || (g.settled && !moved[k])} onClick={() => run(k, 'tie.settle', { city: c.id, order }, () => { setMoved((m) => { const n = { ...m }; delete n[k]; return n; }); return 'Settled. The city page shows this order.'; })}>Keep this order</button>
                {g.settled ? <button type="button" className="dk-t" disabled={busy === k} onClick={() => run(k, 'tie.clear', { city: c.id }, () => 'Cleared. Who reached the count first goes first again.')}>Clear</button> : null}
              </div>
            ) : null}
            <Status said={said} k={k} />
          </div>
        );
      })}
    </div>
  );
}

export function Entries({ s, c, now, act }: { s: DeskState; c: DeskCity; now: number; act: DeskAct }) {
  const { busy, said, run, say } = usePress(act);
  /* a score shows the moment it is pressed and saves behind it, so a judge can go down the criteria without waiting;
     the pressed values give way to the desk's own once every save is back and a fresh state has come in */
  const [pend, setPend] = useState<Record<string, number | null>>({});
  const [flying, setFlying] = useState(0);
  const [seen, setSeen] = useState(s);
  if (seen !== s) { setSeen(s); if (!flying && Object.keys(pend).length) setPend({}); }
  const score = async (e: DeskEntry, crit: string, val: number | null) => {
    const key = e.no + ':' + crit;
    setPend((o) => ({ ...o, [key]: val }));
    setFlying((n) => n + 1);
    let r;
    try { r = await act('judge.score', { city: c.id, no: e.no, crit, val }); } catch { r = { ok: false, error: 'The desk could not be reached. Check the connection and try again.' }; }
    setFlying((n) => n - 1);
    if (!r.ok) { setPend((o) => { const n = { ...o }; delete n[key]; return n; }); say('e:' + e.no, r.error || 'That score was not saved. Try again.', true); }
  };
  const f = s.events.find((x) => x.id === s.event)?.f || BUILDER_DAY;
  const j = s.can.judge ? s.judging : null;
  const budget = j && 'budget' in j ? j : null, scores = j && 'scores' in j ? j.scores : null;
  const open = c.buildStart != null && now < (c.voteEnd ?? 0);
  const left = budget ? budget.budget - budget.used : 0;
  const list = useMemo(() => s.entries.slice().sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || b.created - a.created), [s.entries]);
  const flagged = list.filter((e) => e.flags.length).length, hidden = list.filter((e) => e.hidden).length;
  const aside = list.length + (list.length === 1 ? ' entry' : ' entries') + (flagged ? ', ' + flagged + ' flagged' : '') + (hidden ? ', ' + hidden + ' hidden' : '');
  return (
    <Sec title={'Entries in ' + c.name} id="dk-ent" aside={aside}>
      <Ties s={s} c={c} f={f} now={now} act={act} />
      {s.can.host ? null : <p className="dk-note">You can see flags here. Only a host can hide an entry.</p>}
      {budget ? <p className={'dk-judge-line' + (left ? '' : ' is-out')}><b>{left}</b> of your {budget.budget} votes left{f.judgeWeight > 1 ? ', each worth ' + f.judgeWeight : ''}{open ? '. Put several on one project if it earns them; take them back while voting is open.' : c.buildStart == null ? '. Judging opens when building starts.' : '. Voting has closed.'}</p> : null}
      {scores ? <p className="dk-judge-line">Score every project 1 to 5 on each criterion{open ? '. Press a number again to take it back.' : c.buildStart == null ? '. Judging opens when building starts.' : '. Judging has closed.'}</p> : null}
      {list.length ? (
        <ul className="dk-list">
          {list.map((e) => {
            const k = 'e:' + e.no;
            return (
              <li key={e.no} className={'dk-row has-pic' + (e.hidden ? ' is-off' : '')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.picture ? <img className="dk-pic" src={e.picture} alt="" loading="lazy" /> : <span className="dk-pic" aria-hidden="true" />}
                <div className="dk-who">
                  <b>{e.name}</b>
                  <span>{e.by || 'No name'}{e.byEmail ? ' · ' + e.byEmail : ''}</span>
                  <div className="dk-marks">
                    <span>{ago(e.created, now)}</span>
                    <span>{e.via === 'editor' ? 'From an editor' : 'From the web'}</span>
                    {e.hidden ? <span className="dk-mark-box">Hidden</span> : null}
                  </div>
                  {e.flags.length ? <ul className="dk-flags" aria-label="Flags">{e.flags.map((f) => <li key={f}>{FLAG_WORDS[f] || f}</li>)}</ul> : null}
                  <Status said={said} k={k} />
                </div>
                {(() => { const n = numbers(e, f); return <p className="dk-num" style={{ margin: 0 }}>{n.big}<small>{n.small}</small></p>; })()}
                {budget && !e.hidden ? (
                  <div className="dk-judge" role="group" aria-label={'Your votes on ' + e.name}>
                    <span className="dk-judge-n"><b>{budget.per[String(e.no)] || 0}</b> yours</span>
                    <button type="button" className="dk-t" disabled={!open || busy === k || !(budget.per[String(e.no)] > 0)} aria-label={'Take one vote back from ' + e.name} onClick={() => run(k, 'judge.vote', { city: c.id, no: e.no, delta: -1 })}>−1</button>
                    <button type="button" className="dk-t" disabled={!open || busy === k || left < 1} aria-label={'Give ' + e.name + ' one vote'} onClick={() => run(k, 'judge.vote', { city: c.id, no: e.no, delta: 1 })}>+1</button>
                    <button type="button" className="dk-t" disabled={!open || busy === k || left < 5} aria-label={'Give ' + e.name + ' five votes'} onClick={() => run(k, 'judge.vote', { city: c.id, no: e.no, delta: 5 })}>+5</button>
                  </div>
                ) : null}
                {scores && !e.hidden ? (
                  <div className="dk-scores">
                    {f.criteria.map((cr) => {
                      const pk = e.no + ':' + cr.id, mine = pk in pend ? pend[pk] : scores[String(e.no)]?.[cr.id];
                      return (
                        <div key={cr.id} className="dk-score" role="group" aria-label={cr.name + ' for ' + e.name}>
                          <span>{cr.name}</span>
                          {[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" aria-pressed={mine === v} className="dk-sc" disabled={!open} aria-label={cr.name + ': ' + v} onClick={() => score(e, cr.id, mine === v ? null : v)}>{v}</button>)}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className="dk-acts">
                  {s.can.host ? (
                    <button type="button" className="dk-t" disabled={busy === k} aria-label={(e.hidden ? 'Show ' : 'Hide ') + e.name} onClick={() => run(k, e.hidden ? 'entry.show' : 'entry.hide', { city: c.id, no: e.no }, () => e.hidden ? 'Shown again on the city page.' : 'Hidden from the city page and the ranking.')}>{e.hidden ? 'Show' : 'Hide'}</button>
                  ) : null}
                  {s.can.host ? <button type="button" className="dk-t" disabled={busy === k} aria-label={'Refresh ' + e.name + '’s picture'} onClick={() => run(k, 'entry.picture', { city: c.id, no: e.no }, () => 'The picture is fetched again from the project’s page.')}>Refresh picture</button> : null}
                  {s.event === BUILDER_EVENT ? <a className="dk-t" href={'/city/' + c.id + '/p/' + e.slug} target="_blank" rel="noreferrer" aria-label={'Open ' + e.name + ' on the city page'}>Open</a> : null}
                  {e.url && e.url !== e.repo ? <a className="dk-t" href={e.url} target="_blank" rel="noreferrer" aria-label={e.name + '’s live link'}>Live link</a> : null}
                  {e.repo ? <a className="dk-t" href={e.repo} target="_blank" rel="noreferrer" aria-label={e.name + '’s repository'}>Repository</a> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="dk-note">No entries yet. They appear here the moment someone submits.</p>}
    </Sec>
  );
}
