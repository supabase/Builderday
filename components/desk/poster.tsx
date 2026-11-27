'use client';
/* The door poster, A4: the QR to the city's page, the address, and how to submit. Printed in black on white paper;
   on screen it shows as the sheet that will come out of the printer. The poster is read from the desk, so only a
   host of the city (or a super admin) can print it. */
import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { DeskState } from '@/lib/event/desk';
import './desk.css';
import { EVENT } from '@/lib/day-data';
import { at } from '@/lib/routes';

function Qr({ url }: { url: string }) {
  const p = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d, n: n + 8 };
  }, [url]);
  return (
    <svg className="dk-qr" viewBox={`0 0 ${p.n} ${p.n}`} role="img" aria-label={'QR code for ' + url} shapeRendering="crispEdges">
      <rect width={p.n} height={p.n} fill="#fff" /><path d={p.d} fill="#000" />
    </svg>
  );
}

export function Poster({ city, site }: { city: string | null; site: string }) {
  const [s, setS] = useState<DeskState | null>(null), [err, setErr] = useState('');
  useEffect(() => {
    fetch(at('/api/desk/state') + (city ? '?city=' + encodeURIComponent(city) : ''), { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setS(j); else setErr(r.status === 401 ? 'Sign in to the desk first, then print the poster from the Door screen.' : j.error || 'The poster could not be made.'); })
      .catch(() => setErr('The desk could not be reached.'));
  }, [city]);
  const c = s?.cities.find((x) => x.id === s.city);
  if (err || (s && (!c || !s.can.host))) return <div className="dk"><main className="dk-in"><div className="dk-in-card"><div><h1 className="dk-h">No poster</h1><p className="dk-p">{err || 'Only a host of this city can print its poster.'}</p></div><a className="dk-t" href={at('/desk?city=' + encodeURIComponent(city || '') + '&tab=door')}>Back to the desk</a></div></main></div>;
  if (!s || !c) return <div className="dk"><main className="dk-in" aria-busy="true"><p className="dk-p">Making the poster…</p></main></div>;
  const url = site + '/city/' + c.id, addr = url.replace(/^https?:\/\//, '');
  return (
    <div className="dk dk-poster-page">
      <div className="dk-poster-bar">
        <a className="dk-t" href={at('/desk?city=' + c.id + '&tab=door')}>Back to the desk</a>
        <button type="button" className="fm-b" onClick={() => window.print()}>Print</button>
      </div>
      <article className="dk-poster" aria-label={'Poster for ' + c.name}>
        <p className="dk-poster-k">{EVENT.name} · {c.name}</p>
        <h1 className="dk-poster-h">Submit and vote</h1>
        <Qr url={url} />
        <p className="dk-poster-a">Scan, or go to <b>{addr}</b></p>
        <p className="dk-poster-line">Sign in with your Supabase account. To submit, get checked in by a host at the door, then press Submit. To vote, press Vote.</p>
      </article>
    </div>
  );
}
