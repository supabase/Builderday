/* forms.ts: what the sheets check and write, as pure functions. The checks, the share text and the share card. */
import { EVENT } from '@/lib/day-data';

export const MAX_PIC = 5 * 1024 * 1024;
export const PIC_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const RESEND_S = 30;

export function emailOK(v: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }
export function withScheme(v: string): string { v = String(v).trim(); return v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? 'https://' + v : v; }
export function urlOK(v: string): boolean { try { const u = new URL(withScheme(v)); return (u.protocol === 'https:' || u.protocol === 'http:') && /\.[a-z]{2,}$/i.test(u.hostname); } catch { return false; } }
export function githubOK(v: string): boolean { try { const u = new URL(withScheme(v)); return /^(www\.)?github\.com$/i.test(u.hostname) && /^\/[\w.-]+\/[\w.-]+/.test(u.pathname); } catch { return false; } }
/* a time in the city's own clock with UTC beside it, as the page around the sheet says it; UTC alone without an offset */
export function atCity(d: Date | string | number, off?: number): string {
  const x = d instanceof Date ? d : new Date(d); if (isNaN(x.getTime()) || off == null) return utc(d);
  const m = ((x.getUTCHours() * 60 + x.getUTCMinutes() + off) % 1440 + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ' (' + utc(x) + ')';
}
export function utc(d: Date | string | number): string { const x = d instanceof Date ? d : new Date(d); if (isNaN(x.getTime())) return ''; return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0') + ' UTC'; }
export function ordinal(n: number): string { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export function votesText(n: number): string { return Number(n).toLocaleString('en-US') + (n === 1 ? ' vote' : ' votes'); }
export function cityLabel(id: string | null | undefined): string { return String(id || '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
export function slugOf(s: string): string { return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'entry'; }

/* the submit form's checks: an empty string means the field is fine */
export type FieldName = 'name' | 'pitch' | 'repo' | 'demo' | 'video' | 'rules';
export const CHECKS: Record<FieldName, (v: string | boolean) => string> = {
  name: (v) => String(v).trim() ? '' : 'Add a project name.',
  pitch: (v) => String(v).trim() ? '' : 'Add a one-line pitch. Say what it does in one sentence.',
  repo: (v) => !String(v).trim() ? 'Add the link to the GitHub repo.' : githubOK(String(v)) ? '' : 'Use the GitHub link to the repo, like https://github.com/you/project.',
  demo: (v) => !String(v).trim() || urlOK(String(v)) ? '' : 'Check the demo link. Use a full address, like https://demo.example.com.',
  video: (v) => !String(v).trim() || urlOK(String(v)) ? '' : 'Check the video link. Use a full address, like https://youtu.be/abc123.',
  rules: (v) => v ? '' : 'Check the box to confirm you built this during Builder Day.',
};
export function pictureError(f: { type: string; size: number }): string {
  return PIC_TYPES.indexOf(f.type) < 0 ? 'Use a JPEG, PNG or WebP picture.' : f.size > MAX_PIC ? 'That picture is ' + (f.size / 1048576).toFixed(1) + ' MB. Use one under 5 MB.' : '';
}

/* ---------------- share ---------------- */
export type ShareProject = { name: string; pitch?: string; handle?: string; city?: string; cityName?: string; slug?: string; url?: string; rank?: number | null; votes?: number | null };
/* a project's own address, under its city, on whatever host the page is served from (the live site when drawn
   outside a browser) */
export const SITE = 'https://hackday-seven.vercel.app';
export function projectURL(p: ShareProject): string {
  if (p.url) return p.url;
  const host = typeof location !== 'undefined' ? location.origin : SITE, slug = p.slug || slugOf(p.name);
  return host + (p.city ? '/city/' + p.city + '/p/' + slug : '/p/' + slug);
}
export function shareText(p: ShareProject, myHandle: string | null): string {
  const me = myHandle && p.handle === myHandle, where = p.cityName || cityLabel(p.city);
  if (p.rank) return p.name + ' is ' + ordinal(p.rank) + ' in ' + where + ' at ' + EVENT.name + (p.votes != null ? ', with ' + votesText(p.votes) : '') + '.';
  return me ? 'I built ' + p.name + ' at ' + EVENT.name + ' in ' + where + '.' : p.name + ', built at ' + EVENT.name + ' in ' + where + '.';
}
export function cardAlt(p: ShareProject): string { return 'Share card: ' + p.name + ', ' + (p.cityName || cityLabel(p.city)) + (p.rank ? ', ' + ordinal(p.rank) : '') + (p.votes != null ? ', ' + votesText(p.votes) : '') + '.'; }

function esc(s: unknown): string { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]); }
function wrap(text: string, size: number, maxW: number, maxLines: number): string[] {
  const cw = size * 0.52, per = Math.max(4, Math.floor(maxW / cw)), words = String(text).split(/\s+/); let lines: string[] = [], cur = '';
  words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (t.length > per && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines.map((l) => (l.length > per ? l.slice(0, per - 1) + '…' : l));
}
export type CardColours = { ground: string; ink: string; ink2: string; line: string; green: string };
/* the share card: 1200×630, on the night ground, drawn as one standalone SVG file. The colours come in as hex (from
   the --fm-card-* tokens), so any viewer can open the file; seal is the city's seal paths, without the outer <svg>. */
export function cardSVG(p: ShareProject, C: CardColours, seal: string): string {
  const W = 1200, H = 630, M = 56, where = p.cityName || cityLabel(p.city), name = p.name || 'Untitled';
  /* the name as large as it fits: one or two lines, a size step down until nothing is cut */
  let size = 112, lines: string[] = [];
  const sizes = [112, 96, 80, 64, 56];
  for (let si = 0; si < sizes.length; si++) { size = sizes[si]; lines = wrap(name, size, 780, 2); if (lines.join(' ').slice(-1) !== '…' || si === sizes.length - 1) break; }
  const mono = "font-family=\"'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace\" font-weight=\"500\" letter-spacing=\"0.9\"";
  const sans = "font-family=\"Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif\"";
  const o: string[] = [];
  o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
  o.push('<title>' + esc(name) + ' · ' + EVENT.name + ' ' + esc(where) + '</title>');
  o.push('<rect width="' + W + '" height="' + H + '" fill="' + C.ground + '"/>');
  /* the drawing's grid: columns every 100, a frame, a title-block rule */
  const g: string[] = []; for (let gx = M + 100; gx < W - M; gx += 100) g.push('M' + gx + ' ' + M + 'V' + (H - M));
  o.push('<path d="' + g.join('') + '" stroke="' + C.line + '" stroke-width="1" fill="none"/>');
  o.push('<rect x="' + M + '.5" y="' + M + '.5" width="' + (W - 2 * M - 1) + '" height="' + (H - 2 * M - 1) + '" stroke="' + C.ink2 + '" stroke-opacity="0.5" stroke-width="1" fill="none"/>');
  o.push('<path d="M' + M + ' ' + (H - M - 72) + 'H' + (W - M) + '" stroke="' + C.ink2 + '" stroke-opacity="0.5" stroke-width="1"/>');
  o.push('<text x="' + (M + 24) + '" y="' + (M + 40) + '" fill="' + C.ink2 + '" ' + mono + ' font-size="15">' + esc(EVENT.name.toUpperCase()) + ' · ' + esc(where.toUpperCase()) + '</text>');
  const top = M + 40 + 40 + size * 0.9;
  lines.forEach((l, i) => { o.push('<text x="' + (M + 20) + '" y="' + Math.round(top + i * size * 1.02) + '" fill="' + C.ink + '" ' + sans + ' font-weight="400" font-size="' + size + '" letter-spacing="' + (-size * 0.03).toFixed(1) + '">' + esc(l) + '</text>'); });
  if (p.pitch) { const pl = wrap(p.pitch, 26, 700, 2), py = Math.round(top + (lines.length - 1) * size * 1.02 + 56); pl.forEach((l, i) => { o.push('<text x="' + (M + 24) + '" y="' + (py + i * 36) + '" fill="' + C.ink2 + '" ' + sans + ' font-size="26">' + esc(l) + '</text>'); }); }
  /* the title block along the bottom: handle, rank, votes */
  const by = H - M - 28, cells: [string, string][] = [];
  if (p.handle) cells.push(['BY', '@' + p.handle]);
  if (p.rank) cells.push(['RANK', ordinal(p.rank)]);
  if (p.votes != null) cells.push(['VOTES', Number(p.votes).toLocaleString('en-US')]);
  cells.forEach((c, i) => {
    const cx = M + 24 + i * 240;
    if (i) o.push('<path d="M' + (cx - 24) + ' ' + (H - M - 72) + 'V' + (H - M) + '" stroke="' + C.ink2 + '" stroke-opacity="0.5" stroke-width="1"/>');
    o.push('<text x="' + cx + '" y="' + (by - 18) + '" fill="' + C.ink2 + '" ' + mono + ' font-size="12">' + c[0] + '</text>');
    o.push('<text x="' + cx + '" y="' + (by + 10) + '" fill="' + (c[0] === 'RANK' && p.rank === 1 ? C.green : C.ink) + '" ' + sans + ' font-weight="500" font-size="24">' + esc(c[1]) + '</text>');
  });
  o.push('<text x="' + (W - M - 24) + '" y="' + (by + 10) + '" text-anchor="end" fill="' + C.ink2 + '" ' + sans + ' font-size="20">' + esc(projectURL(p).replace(/^https?:\/\//, '')) + '</text>');
  /* the city's seal, top right */
  if (seal) o.push('<g transform="translate(' + (W - M - 24 - 200) + ' ' + (M + 24) + ')"><svg x="0" y="0" width="200" height="200" viewBox="-100 -100 200 200" fill="none" stroke="' + (p.rank === 1 ? C.green : C.ink) + '" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">' + seal + '</svg></g>');
  o.push('</svg>');
  /* every line of text breaks the grid where it crosses it, as on the page (rule 10): a ground-coloured stroke under the fill */
  return o.join('').replace(/<text /g, '<text stroke="' + C.ground + '" stroke-width="8" stroke-linejoin="round" paint-order="stroke" ');
}
