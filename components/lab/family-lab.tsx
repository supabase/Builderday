'use client';
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { FAMILY_BOUNDS, FAMILY_CHOICES, FAMILY_DEF, clampFamily, familyVars, type FamilyCfg } from '@/lib/family';
import { Cells, Chip, Key, Label, Notice, SectionHead, type ChipState } from '@/components/kit/kit';
import { dayOf } from '@/components/day/day';
import { focusCity, homeAt, cityAt } from '@/components/board/day-model';
import { moments as homeMoments, DEF as HOME_DEF, type HomeCfg } from '@/lib/home';
import { nowOf, sched, EVENT } from '@/lib/day-data';
import { hhmm } from '@/lib/format';
import { CODE } from '@/lib/places';
import { finalCount } from '@/components/home/final-parts';
import { ourWheel } from '@/components/preview/facts';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './family-lab.css';

/* The specimen sheet (family plan): the kit's parts drawn with real words from all three pages side by side, a column
   per page and a row per part, so drift shows at a glance; the three first screens at a third of their size (they are
   the saved pages: Save and they reload). Knobs on the right change the parts here live; Save writes
   saved/family.config.json, which the pages read. A press on a first screen moves it to its next moment. */

const GROUPS: Group[] = [
  { name: 'Modes', knobs: [{ k: 'key', kind: 'select', label: 'The preview’s Key' }, { k: 'labels', kind: 'select', label: 'Labels' }, { k: 'chip', kind: 'select', label: 'The state chip' }, { k: 'headline', kind: 'select', label: 'The home’s headline' }, { k: 'frame', kind: 'select', label: 'First screens' }, { k: 'arrive', kind: 'select', label: 'The globe between pages' }, { k: 'standings', kind: 'select', label: 'The city’s Top ten' }, { k: 'nowLine', kind: 'select', label: 'Now line in the cities' }, { k: 'voteBox', kind: 'select', label: 'Count and Vote' }, { k: 'endStub', kind: 'select', label: 'The ending’s stub' }, { k: 'sans', kind: 'select', label: 'The wheel’s words' }] },
  { name: 'Sizes', knobs: [{ k: 'keyH', kind: 'range', label: 'Key height' }, { k: 'cellH', kind: 'range', label: 'Cell height' }, { k: 'chipH', kind: 'range', label: 'Chip height' }, { k: 'display', kind: 'range', label: 'Home headline (max)' }, { k: 'displayCity', kind: 'range', label: 'City name (max)' }, { k: 'h2', kind: 'range', label: 'Section head' }, { k: 'label', kind: 'range', label: 'Label size' }, { k: 'labelTrack', kind: 'range', label: 'Label tracking (em)' }] },
  { name: 'Rows and screens', knobs: [{ k: 'rowH', kind: 'range', label: 'Table row' }, { k: 'picTop', kind: 'range', label: 'Picture, top 3' }, { k: 'picRest', kind: 'range', label: 'Picture, the rest' }, { k: 'cityFirst', kind: 'range', label: 'City first screen (svh)' }, { k: 'globeGlass', kind: 'range', label: 'Glass on the day globes' }, { k: 'globeBleed', kind: 'range', label: 'Globe off the right edge' }, { k: 'people', kind: 'range', label: 'People shown from' }] },
];
const LABELS: Record<string, string> = {
  square: 'Square (the site’s)', pill: 'Pill (the Luma one)', sentence: 'Sentence case', upper: 'Capitals', boxed: 'Boxed', bare: 'Bare', cell: 'Cell',
  news: 'The news', name: 'The event’s name', same: 'One frame', loose: 'Each as it was', turn: 'Turns from the last page', cut: 'Cut', dock: 'Docks once row 3 leaves', fixed: 'Always beside', off: 'Off', on: 'On',
  joined: 'One box', apart: 'Apart', geist: 'Geist', study: 'The study’s Inter',
};
const HOME_M = ['announced', 'mid', 'closed', 'picked'], CITY_M = ['before', 'build', 'last', 'closed'];

export function FamilyLab({ saved }: { saved: FamilyCfg }) {
  const [cfg, setCfg] = useState<FamilyCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampFamily({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('family', 'lab-family-saved');
  const doSave = useCallback(() => save(cfg as unknown as Record<string, unknown>), [cfg, save]);
  const [hm, setHm] = useState(1), [cm, setCm] = useState(1), [stamp, setStamp] = useState(0);

  /* the real words: the preview's facts, the home and London at mid-day */
  const ours = useMemo(() => ourWheel(), []);
  const day = useMemo(() => dayOf(0), []);
  const S = sched(day), ms = homeMoments({ ...HOME_DEF, ...day } as HomeCfg), mid = nowOf(ms[2][2], S);
  const H = useMemo(() => homeAt(day, mid), [day, mid]), fx = focusCity(H);
  const C = useMemo(() => cityAt(day, 'london', mid), [day, mid]);
  const pv = ours.cities[3] ?? ours.cities[0], fin = finalCount(H);
  const bounds = Object.fromEntries(Object.entries(FAMILY_BOUNDS)) as Record<string, [number, number, number]>;
  const choices = FAMILY_CHOICES as Record<string, string[]>;

  /* slots, not a list: each row's three cells are placed by position */
  /* eslint-disable react/jsx-key */
  const rows: [string, ReactNode, ReactNode, ReactNode][] = [
    ['Key', <><Key href="#">{cfg.key === 'pill' ? <span className="fl-pill">Register on Luma</span> : 'Register on Luma'}</Key><Key kind="second" href="#">Get ready</Key><Key kind="quiet" href="#">Register</Key></>,
      <><Key href="#">Watch {fx.name}</Key><Key kind="second" href="#">See the cities</Key><Key kind="quiet" href="#">How it works</Key></>,
      <><Key href="#">Vote in London</Key><Key kind="second" onClick={() => {}}>Remind me at {hhmm(C.publicAt + C.off)}</Key><Key kind="quiet" onClick={() => {}}>Print all {C.arrived.length}</Key></>],
    ['Cells', <Cells cells={[{ k: 'Starts', v: pv.session }, { k: 'State', v: <Chip s="open" /> }]} />,
      <Cells cells={[{ k: 'Building now', v: H.live.length }, { k: 'Closed', v: H.cs.filter((x) => x.state === 'done').length }, { k: 'Still to open', v: H.cs.filter((x) => x.state === 'next').length }, { k: 'Finalists in', v: fin.in + ' of ' + fin.of }]} />,
      <Cells cells={[{ k: 'State', v: <Chip s={C.state === 'next' ? 'next' : C.state === 'done' ? 'final' : C.state} /> }, { k: 'Entries', v: C.arrived.length }, { k: 'Votes', v: C.total }, { k: 'Local time', v: hhmm(mid + C.off) }]} />],
    ['Chip', <><Chip s="open" look={cfg.chip} /> <Chip s="soon" look={cfg.chip} /> <Chip s="full" look={cfg.chip} /></>,
      <>{(['next', 'build', 'vote', 'done', 'final'] as ChipState[]).map((s) => <Chip key={s} s={s} look={cfg.chip} />)}</>,
      <>{(['build', 'hidden', 'vote', 'final', 'picked'] as ChipState[]).map((s) => <Chip key={s} s={s} look={cfg.chip} />)}</>],
    ['Label', <><Label>City</Label> · <Label>Starts there</Label> · <Label>For you</Label></>, <><Label>City</Label> · <Label>Starts</Label> · <Label>State</Label> · <Label>{CODE[fx.id]}</Label></>, <><Label>Top ten</Label> · <Label>Local time</Label> · <Label>Votes</Label></>],
    ['Section head', <SectionHead id="fl-h1" lede="Each city builds at its own local time.">{ours.cities.length} cities, east to west</SectionHead>,
      <SectionHead id="fl-h2" lede={`The top ${EVENT.finalists} in each city go to the final.`}>The final</SectionHead>,
      <SectionHead id="fl-h3" lede={`The top ${EVENT.finalists} by votes go to the final.`}>The ranking</SectionHead>],
    ['Notice', <Notice>Registration opens soon on Luma.</Notice>, <Notice>Everyone votes in {fx.name} from <b>{hhmm((fx.publicAt ?? fx.start) + fx.city.offset)} local</b>. Its builders vote now.</Notice>,
      <Notice>Votes are hidden from <b>{hhmm(C.x.start + 70 + C.off)}</b> until <b>{hhmm(C.x.end + C.off)} in London</b>. Voting goes on.</Notice>],
    ['Table', <table className="k-table"><thead><tr><th>City</th><th>Starts</th><th>State</th></tr></thead><tbody>{ours.cities.slice(0, 3).map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.session}</td><td><Chip s="open" look={cfg.chip} /></td></tr>)}</tbody></table>,
      <table className="k-table"><thead><tr><th>City</th><th>State</th><th className="k-r">Entries</th></tr></thead><tbody>{H.cs.slice(4, 7).map((x) => <tr key={x.id}><th scope="row"><Label>{CODE[x.id]}</Label> {x.name}</th><td><Chip s={x.state === 'done' ? 'final' : x.state} look={cfg.chip} /></td><td className="k-r">{x.entries}</td></tr>)}<tr className="k-now"><td colSpan={3}><span className="k-now-l">{hhmm(mid)} UTC</span></td></tr>{H.cs.slice(7, 9).map((x) => <tr key={x.id}><th scope="row"><Label>{CODE[x.id]}</Label> {x.name}</th><td><Chip s={x.state === 'done' ? 'final' : x.state} look={cfg.chip} /></td><td className="k-r">{x.entries}</td></tr>)}</tbody></table>,
      <table className="k-table"><thead><tr><th>Place</th><th>Entry</th><th className="k-r">Votes</th></tr></thead><tbody>{C.ranked.slice(0, 3).map((o) => <tr key={o.p.id}><td>{o.rank}</td><td>{o.p.name}</td><td className="k-r">{o.votes ?? '··'}</td></tr>)}</tbody></table>],
  ];
  /* eslint-enable react/jsx-key */

  const screens: [string, string, () => void][] = [
    ['Preview', '/preview', () => setStamp((n) => n + 1)],
    ['Home · ' + HOME_M[hm], `/lab/day-home?bare&still=1&moment=${HOME_M[hm]}`, () => setHm((n) => (n + 1) % HOME_M.length)],
    ['City · ' + CITY_M[cm], `/lab/day-city?bare&still=1&moment=${CITY_M[cm]}&city=london`, () => setCm((n) => (n + 1) % CITY_M.length)],
  ];

  return (
    <div className="k-lab" style={familyVars(cfg) as CSSProperties} data-labels={cfg.labels}>
      <header className="fl-top">
        <h1 className="fl-h">Family</h1>
        <p className="fl-sub">The kit’s parts as the preview, the home on the day and a city page draw them. Rule 6: one display size, 56, 32, 20, 17, 15, mono 13 and 12. Three Key looks. One chip.</p>
      </header>
      <section className="fl-screens" aria-label="The three first screens">
        {screens.map(([t, src, next]) => (
          <figure key={t} className="fl-screen">
            <button type="button" className="fl-shot" onClick={next} aria-label={t + ': show the next moment'}>
              <iframe key={src + stamp} src={src} title={t} tabIndex={-1} loading="lazy" />
            </button>
            <figcaption className="k-label">{t} · press for the next moment</figcaption>
          </figure>
        ))}
      </section>
      <div className="fl-grid" role="table" aria-label="The kit, part by part">
        <div className="fl-row fl-head" role="row"><span role="columnheader" /><span role="columnheader" className="k-label">Preview</span><span role="columnheader" className="k-label">Home on the day</span><span role="columnheader" className="k-label">City</span></div>
        {rows.map(([name, a, b, c]) => (
          <div key={name} className="fl-row" role="row">
            <span role="rowheader" className="k-label fl-name">{name}</span>
            <div role="cell" className="fl-cell">{a}</div><div role="cell" className="fl-cell">{b}</div><div role="cell" className="fl-cell">{c}</div>
          </div>
        ))}
      </div>
      <LabPanel title="Family" cfg={cfg as unknown as Record<string, unknown>} bounds={bounds} choices={choices} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={(k) => String((cfg as unknown as Record<string, unknown>)[k])} optionLabel={(k, v) => LABELS[v] || v}
        meter={{ text: 'The first screens show the saved look; Save, then press one to reload it.', bad: false }} msg={msg} rail={rail} railLabel={(s) => String(s.key) + ', ' + String(s.chip)}
        apply={(s) => setCfg(clampFamily(s))} buttons={[['Defaults', () => setCfg(FAMILY_DEF)], ['Save', doSave, true]]} />
    </div>
  );
}
