'use client';
import { useCallback, useRef, useState } from 'react';
import { ART_BOUNDS, ART_HATCHES, ART_MODES, ART_REVEALS, clampArt, type ArtLook } from '@/components/forms/art-config';
import { ArtLookProvider, forgetPrints } from '@/components/forms/sheet-art';
import { StillSheet } from '@/components/forms/sheet';
import { SignInBody, signInArt } from '@/components/forms/sign-in-sheet';
import { AccountBody, accountArt } from '@/components/account/account';
import { FormsProvider, useForms } from '@/components/forms/forms-provider';
import type { Me } from '@/components/forms/store';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import '@/components/forms/forms.css';
import './sheet-lab.css';

/* The sheets lab: the sign-in and account sheets drawn open on the page, with their picture (the word in the text
   globe's characters, the globe on the city). Click a picture for a new seed and a fresh print; the knobs change every
   sheet live; Save writes saved/sheet.config.json, which every sheet reads. "Open" opens the real sheet with the look
   on the knobs, to see it arrive (the knobs wait while it is open). */

const GROUPS: Group[] = [
  { name: 'Mode', knobs: [{ k: 'mode', kind: 'select', label: 'Where the picture sits' }, { k: 'hatch', kind: 'select', label: 'Solid cells' }] },
  { name: 'The word', knobs: [{ k: 'cell', kind: 'range', label: 'Cell width, px' }, { k: 'aspect', kind: 'range', label: 'Cell height / width' }, { k: 'word', kind: 'range', label: 'Word height' }, { k: 'solid', kind: 'range', label: 'Solid from' }, { k: 'edge', kind: 'range', label: 'Edge dot from' }, { k: 'ink', kind: 'range', label: 'Ink' }, { k: 'mark', kind: 'toggle', label: 'Green [+] after the word' }] },
  { name: 'Ground', knobs: [{ k: 'band', kind: 'range', label: 'Band height, px' }, { k: 'side', kind: 'range', label: 'Split column, px' }, { k: 'shadow', kind: 'range', label: 'Print shadow, cells' }, { k: 'shadowInk', kind: 'range', label: 'Shadow ink' }, { k: 'grid', kind: 'range', label: 'Grid dot every' }, { k: 'gridInk', kind: 'range', label: 'Grid ink' }] },
  { name: 'Globe', knobs: [{ k: 'globe', kind: 'toggle', label: 'Text globe' }, { k: 'globeSize', kind: 'range', label: 'Globe size' }] },
  { name: 'Arrival', knobs: [{ k: 'reveal', kind: 'select', label: 'How it prints' }, { k: 'revealMs', kind: 'range', label: 'Print, ms' }, { k: 'revealDelay', kind: 'range', label: 'After the sheet, ms' }] },
];
const LABELS: Record<string, string> = {
  masthead: 'Masthead: a band over the sheet', pass: 'Pass: a ticket stub with notches', split: 'Split: a column beside the form', none: 'None: the sheet as it was',
  print: 'Print: reading order, a cursor in front', sweep: 'Sweep: left to right', globe: 'Globe hatch ::|', dense: 'Dense :|:|', dots: 'Dots ::',
};

const PLACE_ME: Me = {
  signedIn: true, email: 'ana@example.com', name: 'Ana', roles: [], entry: null, votes: {}, judging: {}, editor: { url: 'https://example.supabase.co/functions/v1/mcp?k=demo' }, open: false,
  pass: { city: 'london', cityName: 'London', source: 'luma', checkedIn: false, editorSeen: null, start: '2026-12-10T18:00:00Z', offset: 0 },
};
const NONE_ME: Me = { ...PLACE_ME, pass: null };

export function SheetLab({ saved }: { saved: ArtLook }) {
  const [cfg, setCfg] = useState<ArtLook>(saved), [run, setRun] = useState(0);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampArt({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('sheet', 'lab-sheet-saved');
  const reseed = () => { setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) })); setRun((r) => r + 1); };
  const out = (k: string) => { const v = Number(cfg[k as keyof ArtLook]); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  return (
    <ArtLookProvider value={cfg}>
      <FormsProvider>
        <main className="sl">
          <h1 className="sl-h">Sheets · {LABELS[cfg.mode]}</h1>
          <p className="sl-p">Click a picture for a new seed and a fresh print. Knobs change every sheet live. Save keeps it.</p>
          <Opens />
          <div className="sl-grid" onClick={(e) => { if ((e.target as Element).closest('.fm-art')) reseed(); }}>
            <figure><figcaption>Sign in, email step (480px)</figcaption><Sign key={'s' + run} /></figure>
            <figure><figcaption>Account, on a list (600px)</figcaption>
              <StillSheet key={'a' + run} label="Your account" wide art={accountArt(PLACE_ME)}><AccountBody me={PLACE_ME} onSignOut={() => {}} /></StillSheet></figure>
            <figure><figcaption>Vote, email step</figcaption><Sign key={'v' + run} vote /></figure>
            <figure><figcaption>Account, no place yet</figcaption>
              <StillSheet key={'n' + run} label="Your account" wide art={accountArt(NONE_ME)}><AccountBody me={NONE_ME} onSignOut={() => {}} claimLook="closed" /></StillSheet></figure>
          </div>
        </main>
        <LabPanel title="Sheets lab" cfg={cfg as unknown as Record<string, unknown>} bounds={ART_BOUNDS} choices={{ mode: ART_MODES, reveal: ART_REVEALS, hatch: ART_HATCHES }} optionLabel={(_k, v) => LABELS[v] || v}
          groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
          buttons={[['Save', () => save({ ...cfg }), true], ['New seed', reseed], ['Print again', () => { forgetPrints(); setRun((r) => r + 1); }]]} meter={{ text: 'Seed ' + cfg.seed + ' · ' + cfg.mode, bad: false }} msg={msg} rail={rail}
          railLabel={(s) => String(s.mode) + ' · ' + String(s.seed)} apply={(s) => { setCfg(clampArt(s as Partial<ArtLook>)); setRun((r) => r + 1); }} />
      </FormsProvider>
    </ArtLookProvider>
  );
}

function Sign({ vote }: { vote?: boolean }) {
  const em = useRef<HTMLInputElement>(null), fd = useRef<HTMLInputElement>(null);
  const o = vote ? { label: 'Vote', title: 'Confirm your email to vote', reason: 'One vote per project, so we need an email.', verb: 'Confirm email' } : { title: 'Sign in to Builder Day', reason: 'Use the email you registered with on Luma.' };
  return <StillSheet label={o.label || 'Sign in'} art={signInArt(o)}><SignInBody o={o} start={{ step: 'email', email: '' }} emRef={em} firstDigit={fd} onSignedIn={() => {}} /></StillSheet>;
}

/* the real sheets, opened over the lab with the knobs' look */
function Opens() {
  const f = useForms();
  if (!f) return null;
  return <div className="sl-open"><button className="fm-b" type="button" onClick={() => f.signIn({ title: 'Sign in to Builder Day', reason: 'Use the email you registered with on Luma.' })}>Open sign in</button><button className="fm-b" type="button" onClick={() => f.ensureVoter()}>Open vote</button><button className="fm-b" type="button" onClick={() => f.account()}>Open account</button></div>;
}
