'use client';
import { useCallback, useMemo, useState } from 'react';
import { EMAIL_BOUNDS, EMAIL_BUTTONS, EMAIL_GROUNDS, EMAIL_HATCHES, EMAIL_MODES, clampEmail, type EmailLook } from '@/lib/email/look';
import { render, TEMPLATES, type MailData, type Template } from '@/lib/event/mail';
import { LabPanel, useLabSave, type Group } from './lab-kit';
import './email-lab.css';

/* The emails lab: every email rendered with the look on the knobs, at a desktop client's width and a phone's, exactly
   the HTML that would be sent. Click an email for a new seed; Save writes saved/email.config.json, which the sender
   reads. "Inverted" shows roughly what Gmail on iOS and Outlook for Windows do to a dark email (they flip it light). */

const GROUPS: Group[] = [
  { name: 'Mode', knobs: [{ k: 'mode', kind: 'select', label: 'Layout' }, { k: 'ground', kind: 'select', label: 'Ground' }, { k: 'button', kind: 'select', label: 'Main action' }, { k: 'perf', kind: 'toggle', label: 'Perforation (pass)' }, { k: 'webfont', kind: 'toggle', label: 'Geist where it loads' }] },
  { name: 'The picture', knobs: [{ k: 'cols', kind: 'range', label: 'Width, columns' }, { k: 'size', kind: 'range', label: 'Type, px (600 wide)' }, { k: 'sizePhone', kind: 'range', label: 'Type, px (phone)' }, { k: 'leading', kind: 'range', label: 'Line height' }] },
  { name: 'The word', knobs: [{ k: 'hatch', kind: 'select', label: 'Hatch' }, { k: 'dotW', kind: 'range', label: 'Dot width, columns' }, { k: 'dotH', kind: 'range', label: 'Dot height, rows' }, { k: 'shadow', kind: 'range', label: 'Print shadow, cells' }, { k: 'shadowInk', kind: 'range', label: 'Shadow ink' }] },
  { name: 'Ground', knobs: [{ k: 'grid', kind: 'range', label: 'Grid dot every' }, { k: 'gridInk', kind: 'range', label: 'Grid ink' }] },
  { name: 'Globe', knobs: [{ k: 'globe', kind: 'toggle', label: 'Text globe on the city' }, { k: 'globeRows', kind: 'range', label: 'Globe rows' }, { k: 'mark', kind: 'toggle', label: 'Green [+] on the city' }] },
];
const LABELS: Record<string, string> = {
  pass: 'Pass: a ticket stub, as the sheets', board: 'Board: the departures row', globe: 'Globe: a poster, globe over word', plain: 'Plain: words only',
  none: 'None: the black ticket on the inbox’s white', night: 'Night', paper: 'Paper', solid: 'Green block', bracket: '[ Mono in brackets ]', outline: 'Hairline box',
  globe_h: 'Globe hatch ::|', dense: 'Dense :|:|', dots: 'Dots ::',
  code: 'Sign-in code (fallback)', reminder: 'Starts soon', role: 'Host / judge', claim: 'Add an email',
};
const SAMPLE: Record<Template, MailData> = {
  code: { code: '595017', link: 'https://hackday-seven.vercel.app/in/confirm?th=0395470bab3c&next=%2Fpreview' },
  reminder: { city: 'Mexico City', when: '18:00 on 10 December', link: 'https://hackday-seven.vercel.app/city/mexico-city', name: 'Luis' },
  role: { city: 'Singapore', role: 'host', link: 'https://hackday-seven.vercel.app/desk', name: 'Wei' },
  claim: { city: 'Toronto', code: '204611', account: 'sam@work.example' },
};

export function EmailLab({ saved }: { saved: EmailLook }) {
  const [cfg, setCfg] = useState<EmailLook>(saved), [tpl, setTpl] = useState<Template>('claim'), [inv, setInv] = useState(false);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampEmail({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('email', 'lab-email-saved');
  const reseed = useCallback(() => setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99998) })), []);
  const mail = useMemo(() => render(tpl, SAMPLE[tpl], cfg), [tpl, cfg]);
  const out = (k: string) => { const v = Number(cfg[k as keyof EmailLook]); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  /* a click in an email: a new seed (links do nothing here) */
  const wire = (f: HTMLIFrameElement | null) => {
    const d = f?.contentDocument; if (!d || (d as unknown as { _wired?: boolean })._wired) return;
    (d as unknown as { _wired?: boolean })._wired = true;
    d.addEventListener('click', (e) => { e.preventDefault(); reseed(); });
  };
  return (
    <>
      <main className="el">
        <h1 className="el-h">Emails · {LABELS[cfg.mode]}</h1>
        <p className="el-p">Click an email for a new seed. Knobs change it live. Save keeps it; the sender reads the saved file.</p>
        <div className="el-tabs" role="tablist">
          {TEMPLATES.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tpl} className={t === tpl ? 'on' : ''} onClick={() => setTpl(t)}>{LABELS[t]}</button>)}
          <label className="el-inv"><input type="checkbox" checked={inv} onChange={(e) => setInv(e.target.checked)} /> Inverted (Gmail iOS)</label>
        </div>
        <div className="el-subject"><span>Subject</span>{mail.subject}<em>{(mail.html.length / 1024).toFixed(1)} KB</em></div>
        <div className={'el-frames' + (inv ? ' inv' : '')}>
          <figure><figcaption>Desktop client, 680 wide</figcaption><iframe title="Email at 680" srcDoc={mail.html} style={{ width: 680 }} onLoad={(e) => wire(e.currentTarget)} /></figure>
          <figure><figcaption>Phone, 375 wide</figcaption><iframe title="Email at 375" srcDoc={mail.html} style={{ width: 375 }} onLoad={(e) => wire(e.currentTarget)} /></figure>
          <figure><figcaption>Plain text part</figcaption><pre className="el-text">{mail.text}</pre></figure>
        </div>
      </main>
      <LabPanel title="Emails lab" cfg={cfg as unknown as Record<string, unknown>} bounds={EMAIL_BOUNDS}
        choices={{ mode: EMAIL_MODES, ground: EMAIL_GROUNDS, hatch: EMAIL_HATCHES, button: EMAIL_BUTTONS }}
        optionLabel={(k, v) => (k === 'hatch' && v === 'globe' ? LABELS.globe_h : LABELS[v] || v)}
        groups={GROUPS} set={set} moments={[]} momentIdx={-1} out={out}
        buttons={[['Save', () => save({ ...cfg }), true], ['New seed', reseed]]} meter={{ text: 'Seed ' + cfg.seed + ' · ' + cfg.mode + ' · ' + cfg.ground, bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.mode) + ' · ' + String(s.ground) + ' · ' + String(s.seed)} apply={(s) => setCfg(clampEmail(s as Partial<EmailLook>))} />
    </>
  );
}
