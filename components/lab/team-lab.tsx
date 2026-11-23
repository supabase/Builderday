'use client';
import { useCallback, useState } from 'react';
import { TEAM_BOUNDS, TEAM_EMPTIES, TEAM_HATCHES, TEAM_MODES, clampTeam, type TeamLook } from '@/components/account/team-config';
import { TeamLookProvider, TeamPicture } from '@/components/account/team-picture';
import { initialsOf } from '@/components/account/team-art';
import { StillSheet } from '@/components/forms/sheet';
import { AccountBody, accountArt } from '@/components/account/account';
import { FormsProvider } from '@/components/forms/forms-provider';
import type { Me, MyTeam } from '@/components/forms/store';
import type { TeamLook as PartLook } from '@/components/account/team';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import '@/components/forms/forms.css';
import './sheet-lab.css';

/* The team lab: the account sheet's team section drawn open in each state (no team, just made, three of four with a
   project, full, a team link, leaving), with the seats' picture on knobs. Click a picture for a new seed; Save writes
   saved/team.config.json, which the account sheet reads. */

const GROUPS: Group[] = [
  { name: 'Mode', knobs: [{ k: 'mode', kind: 'select', label: 'How the team is drawn' }, { k: 'empty', kind: 'select', label: 'An empty seat' }, { k: 'hatch', kind: 'select', label: 'Solid dots' }] },
  { name: 'Letters', knobs: [{ k: 'dotW', kind: 'range', label: 'Dot width, chars' }, { k: 'dotH', kind: 'range', label: 'Dot height, rows' }, { k: 'size', kind: 'range', label: 'Largest character, px' }, { k: 'shadow', kind: 'range', label: 'Print shadow' }] },
  { name: 'Seats', knobs: [{ k: 'gap', kind: 'range', label: 'Between seats' }, { k: 'pad', kind: 'range', label: 'Air in a seat' }, { k: 'frame', kind: 'toggle', label: 'Outline every seat' }, { k: 'grid', kind: 'range', label: 'Grid dot every' }, { k: 'mark', kind: 'toggle', label: 'Green [+] under you' }] },
];
const LABELS: Record<string, string> = {
  seats: 'Seats: a stub per place, initials in board letters', board: 'Board: the code in board letters, seats as pips', none: 'None: words only',
  plus: 'A dim plus', dots: 'A field of dots', frame: 'Only the outline', globe: 'Globe hatch ::|', dense: 'Dense :|:|', dots_h: 'Dots ::',
};

const BASE: Me = {
  signedIn: true, email: 'ana@example.com', name: 'Ana Souza', roles: [], entry: null, votes: {}, judging: {}, editor: { url: 'https://example.supabase.co/functions/v1/mcp/demo' }, open: false,
  pass: { city: 'london', cityName: 'London', source: 'luma', checkedIn: false, editorSeen: null, start: '2026-12-10T18:00:00Z', offset: 0 },
  teams: { on: true, max: 4 }, team: null,
};
const team = (names: string[], extra: Partial<MyTeam> = {}): MyTeam => ({
  code: 'KTR-482', city: 'london', cityName: 'London', max: 4, set: false, link: 'https://supabase.com/builderday/team/KTR482', entry: null,
  members: names.map((n, i) => ({ name: n, you: i === 0, named: !n.endsWith('…') })), ...extra,
});
const STATES: { cap: string; me: Me; look?: PartLook }[] = [
  { cap: 'No team yet', me: BASE },
  { cap: 'Just made', me: { ...BASE, team: team(['Ana Souza']) }, look: { said: 'Team KTR-482 is made.' } },
  { cap: 'Three of four, with a project', me: { ...BASE, team: team(['Ana Souza', 'Bo Lindqvist', 'chi…'], { entry: { name: 'Rowboat', slug: 'rowboat' } }) } },
  { cap: 'Full', me: { ...BASE, team: team(['Ana Souza', 'Bo Lindqvist', 'Chidi Okeke', 'Dana Wu']) } },
  { cap: 'Opened from a team link', me: BASE, look: { join: 'KTR-482' } },
  { cap: 'Leaving', me: { ...BASE, team: team(['Ana Souza', 'Bo Lindqvist'], { entry: { name: 'Rowboat', slug: 'rowboat' } }) }, look: { leaving: true } },
];

export function TeamLab({ saved }: { saved: TeamLook }) {
  const [cfg, setCfg] = useState<TeamLook>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampTeam({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('team', 'lab-team-saved');
  const reseed = () => setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) }));
  const out = (k: string) => String(cfg[k as keyof TeamLook]);
  const big = ['Ana Souza', 'Bo Lindqvist', null, null].map((n, i) => (n ? { initials: initialsOf(n), you: i === 0 } : null));
  return (
    <TeamLookProvider value={cfg}>
      <FormsProvider>
        <main className="sl">
          <h1 className="sl-h">Team · {LABELS[cfg.mode]}</h1>
          <p className="sl-p">Click a picture for a new seed. Knobs change every sheet live. Save keeps it.</p>
          <div className="sl-grid" onClick={(e) => { if ((e.target as Element).closest('.tm-wrap')) reseed(); }}>
            <figure style={{ width: 520 }}><figcaption>The picture alone, two of four</figcaption><TeamPicture seats={big} code="KTR-482" /></figure>
            {STATES.map((s) => (
              <figure key={s.cap}><figcaption>{s.cap}</figcaption>
                <StillSheet label="Your account" wide art={accountArt(s.me)}><AccountBody me={s.me} onSignOut={() => {}} teamLook={s.look || {}} /></StillSheet></figure>
            ))}
          </div>
        </main>
        <LabPanel title="Team lab" cfg={cfg as unknown as Record<string, unknown>} bounds={TEAM_BOUNDS} choices={{ mode: TEAM_MODES, empty: TEAM_EMPTIES, hatch: TEAM_HATCHES }} optionLabel={(k, v) => (k === 'hatch' && v === 'dots' ? LABELS.dots_h : LABELS[v] || v)}
          groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
          buttons={[['Save', () => save({ ...cfg }), true], ['New seed', reseed]]} meter={{ text: 'Seed ' + cfg.seed + ' · ' + cfg.mode, bad: false }} msg={msg} rail={rail}
          railLabel={(s) => String(s.mode) + ' · ' + String(s.seed)} apply={(s) => setCfg(clampTeam(s as Partial<TeamLook>))} />
      </FormsProvider>
    </TeamLookProvider>
  );
}
