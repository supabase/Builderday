'use client';
import { CHECKS, PLACEHOLDER_URL } from '@/lib/hackday-server';
import { FromEditor, GetReady } from '@/components/day/get-ready';
import '@/components/day/explain.css';
import './explain-lab.css';

/* The submit lab: Get ready in its three states (the server not open, open before the day, building), the editor
   picker with its copy key, the submit sheet's two parts, and what every check says. The open states use a marked
   stand-in address (PLACEHOLDER_URL); the real pages show none until the server opens. */

const SAMPLE = { repo: 'github.com/ada/quiet-beacon', city: 'Berlin', time: '10:30', made: '2 November 2026' };

export function SubmitLab({ only }: { only?: string }) {
  const states = [
    { k: 'closed', cap: 'The server is not open yet (today, on every page)', el: <GetReady id="s-closed" city="London" cityId="london" live={false} /> },
    { k: 'open', cap: 'Open, before the day (stand-in address)', el: <GetReady id="s-open" city="London" cityId="london" live url={PLACEHOLDER_URL} /> },
    { k: 'building', cap: 'Building: submit now (stand-in address)', el: <GetReady id="s-building" state="building" city="London" cityId="london" live url={PLACEHOLDER_URL} onBrowser={() => {}} /> },
    { k: 'sheet', cap: 'In the preview’s sheet, 400 wide (server not open)', el: <div className="xl-sheet sl-narrow"><GetReady id="s-sheet" compact level={3} live={false} /></div> },
  ];
  const door = (
    <div className="sl-doors">
      <div><p className="xl-cap">Server not open</p><FromEditor city="Berlin" live={false} /></div>
      <div><p className="xl-cap">Server open</p><FromEditor city="Berlin" live /></div>
    </div>
  );
  if (only) {
    const s = states.find((x) => x.k === only);
    return <div className="xl xl-only sl-only">{s ? s.el : door}</div>;
  }
  return (
    <div className="xl sl">
      <header className="xl-h"><h1>Submit</h1><p>Get ready and the two ways in: from your editor through the Builder Day server, or in the browser. Both run the same checks.</p></header>
      <section className="xl-sec" aria-labelledby="sl-a">
        <h2 id="sl-a">Get ready, in each state</h2>
        <ul className="sl-states">{states.map((s) => <li key={s.k}><p className="xl-cap">{s.cap}</p>{s.el}</li>)}</ul>
      </section>
      <section className="xl-sec" aria-labelledby="sl-b">
        <h2 id="sl-b">The submit sheet: two parts</h2>
        <p className="xl-note">From your editor first, then In the browser: today’s form, unchanged (try it at <a href="/lab/forms">/lab/forms</a>). The same sentence about the rules sits above both.</p>
        {door}
      </section>
      <section className="xl-sec" aria-labelledby="sl-c">
        <h2 id="sl-c">What each check does and says</h2>
        <p className="xl-note">A block stops the entry and says how to fix it. A flag goes to the hosts and judges and never shows on the public page. Whether a repository made before the day is blocked is the owner’s call; it is a block here, on the plan’s advice, because the rule is printed ahead.</p>
        <div className="sl-scroll" role="region" aria-label="The checks" tabIndex={0}><table className="xl-cost sl-checks">
          <thead><tr><th scope="col">Check</th><th scope="col">Read from</th><th scope="col">Does</th><th scope="col">What the person reads</th></tr></thead>
          <tbody>{CHECKS.map((c) => <tr key={c.id}><th scope="row">{c.what}</th><td>{c.from}</td><td>{c.does}</td><td>{c.say ? c.say(SAMPLE) : 'Nothing: flagged for the hosts'}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
