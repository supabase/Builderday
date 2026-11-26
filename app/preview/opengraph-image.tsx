import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { CITIES, EVENT } from '@/lib/day-data';
import { PLACE } from '@/lib/places';
import { STUDY, cellOf, gridOf } from '@/components/wheel/text-globe';
import day from '@/saved/day.config.json';

/* The share image, from the campaign's frame "General · Horizontal 01 · Logo" (1920 × 1080), set at 1200 × 630: scaled
   by height and centred, so nothing is cropped. Behind it the text globe, the motion study's frame that faces the
   Atlantic, with London marked by a green cross on its light, as the frame draws it. The logo, the Supabase lockup and
   the centre guide are the frame's own files (assets/og). */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
const MONTH = new Date(Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
const CELLS = [`${MONTH} ${EVENT.day}`, `${CITIES.length} cities`, `${day.buildMin} minutes`];
export const alt = `${EVENT.short}: ${CELLS.join(', ')}. Hosted by Supabase.`;

/* the frame's units to the image's: by height, centred across */
const S = size.height / 1080, X = (size.width - 1920 * S) / 2;
const px = (n: number) => n * S;
const C = { ground: '#151515', visual: '#6b6b6b', accent: '#3ecf8e', fg: '#fafafa', muted: '#8f8f8f', line: '#4a4a4a' };
/* the globe's frame: facing the Atlantic (the study's 16th frame) */
const FRAME = 15;

const file = (name: string) => readFileSync(join(process.cwd(), 'assets/og', name));
const svg = (name: string) => 'data:image/svg+xml;base64,' + file(name).toString('base64');

/* the frame's rows, and the cells of London's cross: around the frame's light nearest London's own cell */
function globe(): { rows: string[]; marks: Set<string> } {
  const line = readFileSync(join(process.cwd(), 'public/wheel/ascii-globe.txt'), 'utf8').split('\n')[FRAME] ?? '';
  const rows = Array.from({ length: STUDY.rows }, (_, r) => line.slice(r * STUDY.cols, (r + 1) * STUDY.cols).padEnd(STUDY.cols));
  const [lat, lon] = PLACE.london, at = cellOf(gridOf(STUDY.rows), STUDY.first + STUDY.step * FRAME, lat, lon);
  const marks = new Set<string>();
  if (!at) return { rows, marks };
  let best = at, d = Infinity;
  rows.forEach((row, r) => [...row].forEach((ch, c) => { const e = Math.abs(r - at[0]) * 2 + Math.abs(c - at[1]); if (ch === 'o' && e < d && e <= 6) { d = e; best = [r, c]; } }));
  const [r, c] = best;
  [[r - 1, c], [r, c - 1], [r, c + 1], [r + 1, c]].forEach(([a, b]) => marks.add(a + ',' + b));
  return { rows, marks };
}

export default function Image() {
  const { rows, marks } = globe();
  const glyph = px(47.424), lead = px(60.8), gw = px(2816.256), gh = px(1520);
  const cell = { display: 'flex', alignItems: 'center', padding: `${px(20)}px ${px(28)}px`, border: `${px(2)}px solid ${C.line}`, background: C.ground, marginRight: -px(2) } as const;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: C.ground, overflow: 'hidden' }}>
        {/* the text globe, at half strength */}
        <div style={{ position: 'absolute', left: X + px(960.13) - gw / 2, top: px(540) - gh / 2, width: gw, height: gh, display: 'flex', flexDirection: 'column', opacity: 0.5, fontFamily: 'Geist Mono', fontSize: glyph, lineHeight: `${lead}px`, letterSpacing: -px(0.2838), color: C.visual }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', height: lead, whiteSpace: 'pre' }}>
              {[...row].map((ch, c) => (marks.has(r + ',' + c) ? <span key={c} style={{ color: C.accent }}>+</span> : <span key={c}>{ch}</span>))}
            </div>
          ))}
        </div>
        {/* the centre guide */}
        <img src={svg('guide.svg')} width={Math.max(1, px(1.5))} height={size.height} alt="" style={{ position: 'absolute', left: X + px(960), top: 0 }} />
        {/* the logo: the pixel globe and the name */}
        <div style={{ position: 'absolute', left: X + px(425.33), top: px(389.23), display: 'flex', alignItems: 'center', gap: px(40.8) }}>
          <img src={svg('builder-logo.svg')} width={px(181.5)} height={px(181.535)} alt="" />
          <span style={{ fontFamily: 'Manrope', fontSize: px(168), lineHeight: 1, letterSpacing: -px(3.36), color: C.accent }}>Builder Day</span>
        </div>
        {/* the date, the cities and the length */}
        <div style={{ position: 'absolute', left: X + px(645), top: px(638.77), display: 'flex' }}>
          {CELLS.map((t, i) => (
            <div key={t} style={{ ...cell, marginRight: i === CELLS.length - 1 ? 0 : -px(2) }}>
              <span style={{ fontFamily: 'Geist Mono', fontSize: px(28), lineHeight: 1, color: C.fg }}>{t}</span>
            </div>
          ))}
        </div>
        {/* hosted by Supabase */}
        <div style={{ position: 'absolute', left: 0, top: px(982), width: size.width, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: px(14) }}>
          <span style={{ fontFamily: 'Geist', fontSize: px(28), lineHeight: 1.4, color: C.muted }}>Hosted by</span>
          <div style={{ display: 'flex', position: 'relative', width: px(207.272), height: px(40) }}>
            <img src={svg('supabase-bolt.svg')} width={px(207.272 * 0.1882)} height={px(40)} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
            <img src={svg('supabase-word.svg')} width={px(207.272 * 0.7397)} height={px(40 * 0.8168)} alt="" style={{ position: 'absolute', left: px(207.272 * 0.2603), top: px(40 * 0.07) }} />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: file('geist-400.ttf'), weight: 400, style: 'normal' },
        { name: 'Geist Mono', data: file('geist-mono-400.ttf'), weight: 400, style: 'normal' },
        { name: 'Manrope', data: file('manrope-500.ttf'), weight: 500, style: 'normal' },
      ],
    },
  );
}
