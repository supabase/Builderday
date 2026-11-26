'use client';
/* proto:under-hero. The three new directions for what sits under the hero (the fourth, Baseline, is today's page).
   All three lead with the prizes, then explain the day, then keep today's cities, Get ready and Questions.
   - Panels: the manager's frame with our marks: three hairline panels with step tabs, each a working diagram.
   - Ruler: one object read left to right: the 0–90 ruler, the lanes, the race on the same axis, the final after 90.
   - Walkthrough: one sticky stage that steps through a city's 90 minutes as you scroll. */
import type { Under } from '@/components/preview/fold/fold';
import { BUILD_MS, Board, BuildTake, FinalGrid, PLAIN, Prizes, RaceChart, TOTAL, atMs, localAt, useClock } from './parts';
import { END, OPEN, SHOW } from './race';
import { Walk } from '@/components/preview/walk/walk';
import { clampWalk, type WalkCfg } from '@/components/preview/walk/config';
import walkSaved from '@/saved/walk.config.json';
const WALK = clampWalk(walkSaved as Partial<WalkCfg>);

const Replay = ({ on, label }: { on: () => void; label: string }) => <button type="button" className="pv-replay" onClick={on} aria-label={'Replay ' + label}>↻</button>;
const Plain = () => <p className="pv-plain">{PLAIN}</p>;
const rest = (u: Under) => <>{u.section('cities')}{u.section('ready')}{u.section('questions')}</>;

/* ---------------- Panels ---------------- */
/* each panel owns its clock, so a tick re-renders that panel only */
function BuildPanel() {
  const { ref, ms, replay } = useClock<HTMLElement>(BUILD_MS + 2600, false);
  return (
    <article className="pv-panel" ref={ref}>
      <header className="pv-tab"><span className="pv-min">0–90 min</span><h3>Build for 90 minutes</h3></header>
      <p className="pv-rule">Your host checks you in at the door. Build something new with Supabase and submit it before minute 90.</p>
      <Replay on={replay} label="the build" />
      <div className="pv-dia"><BuildTake ms={ms} onMode={replay} /></div>
    </article>
  );
}
function VotePanel({ c }: { c: Under['city'] }) {
  const { ref, ms, replay, fade } = useClock<HTMLElement>(TOTAL, true), at = atMs(ms);
  return (
    <article className="pv-panel" ref={ref}>
      <header className="pv-tab"><span className="pv-min">45–90 min</span><h3>Compete for votes</h3></header>
      <p className="pv-rule">Anyone votes from minute 45 ({localAt(c, OPEN)} in {c.name}). The counts show at 60, when the judges join.</p>
      <Replay on={replay} label="the votes" />
      <div className="pv-dia pv-dia-vote" style={{ opacity: fade }}>
        <RaceChart at={at} W={400} H={240} x1={336} from={40} />
        <Board at={at} rows={5} city={c.name} />
      </div>
    </article>
  );
}
function PanelsHow({ u }: { u: Under }) {
  const c = u.city;
  return (
    <section id="how" className="pf-part pv-how pv-how-panels" aria-labelledby="how-h">
      <h2 id="how-h" className="pf-h">How Builder Day works</h2>
      <div className="pv-panels">
        <BuildPanel />
        <VotePanel c={c} />
        <article className="pv-panel">
          <header className="pv-tab"><span className="pv-min">After 90</span><h3>Global final</h3></header>
          <p className="pv-rule">The top 3 in each city are finalists, 42 in all. The Supabase team picks 1st, 2nd and 3rd.</p>
          <div className="pv-dia"><FinalGrid mine={c.id} compact /></div>
        </article>
      </div>
    </section>
  );
}
export function Panels({ u }: { u: Under }) {
  return <><Prizes plain={<Plain />} /><PanelsHow u={u} />{rest(u)}</>;
}

/* ---------------- Ruler ---------------- */
const MARKS: [number, string, string][] = [[0, 'Build starts', ''], [OPEN, 'Voting opens', ''], [SHOW, 'Counts shown', ''], [END, 'Everything closes', '']];
function RulerHow({ u }: { u: Under }) {
  const { ref: rRef, ms: rMs, replay: rReplay, fade: rFade } = useClock(TOTAL, true), at = atMs(rMs), c = u.city, pct = (m: number) => (100 * m) / END + '%';
  return (
    <section id="how" className="pf-part pv-how" aria-labelledby="how-h">
      <h2 id="how-h" className="pf-h">How Builder Day works</h2>
      <p className="pv-rule pv-rule-wide">One city, one 90-minute clock. Read it left to right. Times are {c.name}’s: it starts at {localAt(c, 0)}.</p>
      <div className="pv-ruler" ref={rRef} style={{ ['--pv-now' as string]: pct(at.min), ['--pv-fade' as string]: rFade }}>
        <Replay on={rReplay} label="the day" />
        <div className="pv-rl-main">
          <ol className="pv-rl-axis">
            {MARKS.map(([m, h, s]) => <li key={m} style={{ left: pct(m) }} data-on={at.min >= m ? '' : undefined} data-edge={m === 0 ? 'l' : m === END ? 'r' : undefined}><b>{m}</b><span>{h}</span><small>{localAt(c, m)}{s ? ' · ' + s : ''}</small></li>)}
          </ol>
          <div className="pv-rl-lanes" aria-hidden="true">
            <p className="pv-lane"><span className="pv-lane-k">Build</span><span className="pv-bar" style={{ left: 0, width: '100%' }} /><span className="pv-pin" style={{ left: pct(34) }} data-on={at.min >= 34 ? '' : undefined}>you submit</span></p>
            <p className="pv-lane"><span className="pv-lane-k">Votes</span><span className="pv-bar pv-bar-hidden" style={{ left: pct(OPEN), width: pct(SHOW - OPEN) }}>hidden</span><span className="pv-bar" style={{ left: pct(SHOW), width: pct(END - SHOW) }}>shown live</span></p>
            <p className="pv-lane"><span className="pv-lane-k">Judges</span><span className="pv-bar" style={{ left: pct(SHOW), width: pct(END - SHOW) }}><span className="pv-long">10 votes each, worth 5</span><span className="pv-short">×5 each</span></span></p>
            <span className="pv-now" />
          </div>
          <RaceChart at={at} W={900} H={240} x0={0} x1={900} top={20} bottom={232} axis="none" className="pv-rl-chart" />
        </div>
        <aside className="pv-rl-after">
          <p className="pv-rl-k">After 90</p>
          <Board at={at} rows={5} city={c.name} />
          <p className="pv-funnel"><b>14</b> cities × <b>3</b> = <b>42</b> finalists → <b>3</b> global winners</p>
        </aside>
      </div>
      <FinalGrid mine={c.id} />
    </section>
  );
}
export function Ruler({ u }: { u: Under }) {
  return <><Prizes plain={<Plain />} /><RulerHow u={u} />{rest(u)}</>;
}

/* ---------------- Walkthrough ---------------- */
/* the walk from components/preview/walk, with the look saved at /lab/walk */
export function Walkthrough({ u }: { u: Under }) {
  return <><Prizes plain={<Plain />} /><Walk cfg={WALK} city={u.city} />{rest(u)}</>;
}
