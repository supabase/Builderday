'use client';
/* Today: where the city is, its one next thing as one large key, and the counts. */
import { clockText, nextThing, phaseLine, type DayWords, type DeskAct, type DeskCity, type DeskState } from '@/lib/event/desk';
import { BUILDER_DAY, hasVotes } from '@/lib/event/format';
import { EVENT } from '@/lib/day-data';
import { IconGo, IconOut, Status, usePress, type Ask } from './parts';

export function Today({ s, c, now, act, ask, go }: { s: DeskState; c: DeskCity; now: number; act: DeskAct; ask: (a: Ask) => void; go: (tab: string) => void }) {
  const { busy, said, run } = usePress(act);
  const ev = s.events.find((x) => x.id === s.event), f = ev?.f || BUILDER_DAY, ours = s.event === EVENT.id;
  const many = (ev?.places ?? 1) > 1, final = f.finalOn && many;
  const words: DayWords = { vote: f.decide === 'judges' ? 'Judging' : 'Voting', top: final ? 'the top ' + f.finalists : f.decide === 'votes' ? 'the winner' : 'the result', final };
  const ph = phaseLine(c, now, words), next = nextThing(c, now, words);
  const host = s.can.host;
  const press = () => {
    if (next.key === 'door') return go('door');
    if (next.key === 'start') return ask({
      title: 'Start the clock for ' + c.name + '?',
      text: 'Building runs ' + c.buildMin + ' minutes from now and Submit appears on every phone in the room at once. This cannot be undone.',
      yes: 'Start building', danger: true, run: () => run('next', 'clock.start', { city: c.id }, () => 'The clock is running. Building ends in ' + c.buildMin + ' minutes.'),
    });
    if (next.key === 'add5') return ask({
      title: 'Add 5 minutes to building in ' + c.name + '?',
      text: 'Building then ends at ' + clockText((c.buildEnd ?? now) + 5 * 60000, c.offset) + ', and ' + words.vote.toLowerCase() + ' moves with it. Minutes cannot be taken back off.',
      yes: 'Add 5 minutes', run: () => run('next', 'clock.add', { city: c.id, what: 'build', mins: 5 }, () => 'Five minutes added. Building ends at ' + clockText((c.buildEnd ?? now) + 5 * 60000, c.offset) + '.'),
    });
  };
  const remote = '/desk/' + c.id + '/remote';
  return (
    <>
      <section className="dk-sec" aria-labelledby="dk-today">
        <h2 className="sr-only" id="dk-today">Today in {c.name}</h2>
        <p className="dk-when"><span className="dk-clock">{clockText(now, c.offset)}</span><span className="dk-phase">{ph.word}</span></p>
        <p className="dk-p">{c.name} time. {ph.line}</p>
        {host ? (
          <div className="dk-next">
            {next.key === 'rank' || next.key === 'top3' ? (
              <a className="dk-key" href={remote}>{next.label}<IconGo /></a>
            ) : (
              <button type="button" className={'dk-key' + (next.key === 'add5' ? ' is-plain' : '')} onClick={press} disabled={busy === 'next'} aria-busy={busy === 'next'}>
                {busy === 'next' ? 'One moment…' : next.label}<IconGo />
              </button>
            )}
            <p className="dk-note">{next.hint}</p>
            <Status said={said} k="next" />
            <div className="dk-links">
              <a className="dk-t" href={remote}>Open the remote</a>
              <a className="dk-t" href={'/city/' + c.id + '/stage'} target="_blank" rel="noreferrer">Open the stage</a>
              {ours ? <a className="dk-t" href={'/city/' + c.id} target="_blank" rel="noreferrer">Open the city page</a> : null}
            </div>
          </div>
        ) : s.can.judge && !ours ? (
          <div className="dk-next">
            <button type="button" className="dk-key is-plain" onClick={() => go('entries')}>Judge the entries<IconGo /></button>
            <p className="dk-note">{f.judging === 'scores' ? 'Score every project 1 to 5 on each criterion, under Entries.' : 'Your votes are under Entries: several on one project if it earns them.'} Flags on entries are there too.</p>
          </div>
        ) : s.can.judge ? (
          <div className="dk-next">
            <a className="dk-key is-plain" href={'/city/' + c.id} target="_blank" rel="noreferrer">Judge on the {c.name} page<IconOut /></a>
            <p className="dk-note">Your votes are on the city page, as on the day: up to {s.me.roles.find((r) => r.role === 'judge')?.budget ?? 50} in all, several on one project if you like. Flags on entries are under Entries.</p>
          </div>
        ) : null}
      </section>
      {s.counts ? (
        <section className="dk-sec" aria-labelledby="dk-counts">
          <h2 className="dk-h2" id="dk-counts">{c.name} so far</h2>
          <dl className="dk-cells" data-n={(s.counts.editors != null ? 7 : 6) - (hasVotes(f) ? 0 : 1)}>
            <div className="dk-cell"><dt>On the list</dt><dd>{s.counts.listed}</dd></div>
            <div className="dk-cell"><dt>Opened their link</dt><dd>{s.counts.opened}</dd></div>
            <div className="dk-cell"><dt>Signed in</dt><dd>{s.counts.signedIn}</dd></div>
            {s.counts.editors != null ? <div className="dk-cell"><dt>Editors connected</dt><dd>{s.counts.editors}</dd></div> : null}
            <div className="dk-cell"><dt>In the room</dt><dd>{s.counts.inRoom}</dd></div>
            <div className="dk-cell"><dt>Entries</dt><dd>{s.counts.entries}</dd></div>
            {hasVotes(f) ? <div className="dk-cell"><dt>Votes</dt><dd>{s.counts.votes}</dd></div> : null}
          </dl>
        </section>
      ) : null}
    </>
  );
}
