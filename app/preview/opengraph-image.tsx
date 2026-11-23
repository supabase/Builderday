import { ImageResponse } from 'next/og';
import { CITIES, EVENT, CITY_WORD, USUAL_START, cityStartLocal } from '@/lib/day-data';
import { PRIZES } from '@/lib/prizes';
import { CODE } from '@/lib/places';
import day from '@/saved/day.config.json';

/* The preview page's share image: the name, the day in one line, the cities east to west and the prize. The colours
   are the share card's (as in the project share image), as hex for the image renderer. */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${EVENT.name}: ${CITY_WORD} cities build for ${day.buildMin} minutes on 10 December 2026`;
const C = { ground: '#0c0d0d', ink: '#f4f4f2', ink2: '#b4b4af', rule: '#2b2c2c', green: '#3ecf8e' };

export default function Image() {
  const codes = CITIES.map((c) => CODE[c.id] ?? c.name.slice(0, 3).toUpperCase());
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: C.ground, color: C.ink }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, color: C.ink2 }}>
          <div style={{ width: 14, height: 14, background: C.green }} />
          <span>{EVENT.name} · 10 December 2026</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 96, lineHeight: 1.02, letterSpacing: -3 }}>
          <span>{`Build for ${day.buildMin} minutes.`}</span>
          <span>{`${CITIES.length} cities, one day.`}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, borderTop: '1px solid ' + C.rule, paddingTop: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 24, color: C.ink2, letterSpacing: 1 }}>
            {codes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30 }}>
            <span>{`Most from ${cityStartLocal({ start: USUAL_START })} local time, east to west`}</span>
            {PRIZES.global.what ? <span style={{ color: C.green }}>{PRIZES.global.what} to the winner</span> : null}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
