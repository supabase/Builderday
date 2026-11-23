/* luma.ts: where to register. Each city has its own Luma event; the address is the event's public page. */
const EVENT_PAGE: Record<string, string> = {
  'seoul': 'supabase-builder-day-seoul',
  'singapore': 'supabase-builder-day-singapore',
  'peshawar': 'supabase-builder-day-peshawar',
  'nouakchott': 'supabase-builder-day-nouakchott',
  'london': 'supabase-builder-day-london',
  'rosario': 'supabase-builder-day-rosario',
  'santiago': 'supabase-builder-day-santiago',
  'manta': 'supabase-builder-day-manta',
  'new-york': 'supabase-builder-day-new-york-city',
  'toronto': 'supabase-builder-day-toronto',
  'san-salvador': 'supabase-builder-day-san-salvador',
  'austin': 'supabase-builder-day-austin',
  'mexico-city': 'supabase-builder-day-mexico-city',
  'san-francisco': 'supabase-builder-day-san-francisco',
};
export const LUMA = 'https://luma.com/';
/* true: the pages show Register links to the Luma events */
export const LUMA_LIVE = true;
/* a city's Luma event; with no city (or one without an event), the list of cities on the preview page to pick from */
export const lumaHref = (city?: string) => (LUMA_LIVE && city && EVENT_PAGE[city] ? LUMA + EVENT_PAGE[city] : '/preview#cities');
/* ---------------- the guest list import ----------------
   A host pastes addresses, or drops the CSV Luma exports. The exact Luma header names are not confirmed, so the
   email column is found wherever it is (a header containing "email", else the column whose cells look like emails);
   a name column is used when one is found ("name", or first and last name); rows whose approval status says
   anything but approved are left out when that column is there; repeats of one email are dropped. Pure. */
/* id and registeredAt come only from Luma's API (the sync), never from a CSV */
export type Guest = { email: string; name: string | null; id?: string | null; registeredAt?: string | null };
export type Parsed = { guests: Guest[]; bad: string[]; skipped: number; repeats: number };

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

/* one CSV line into cells, with quotes */
function cells(line: string, sep: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map((c) => c.trim());
}

export function parseGuests(text: string): Parsed {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>(), guests: Guest[] = [], bad: string[] = [];
  let skipped = 0, repeats = 0;
  const add = (email: string, name: string | null) => {
    const e = email.trim().replace(/^mailto:/i, '').replace(/^<|>$/g, '').toLowerCase();
    if (!EMAIL.test(e)) { if (e) bad.push(email.trim()); return; }
    if (seen.has(e)) { repeats++; return; }
    seen.add(e); guests.push({ email: e, name: name && name.trim() ? name.trim().slice(0, 60) : null });
  };
  if (!lines.length) return { guests, bad, skipped, repeats };
  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ',';
  const head = cells(lines[0], sep).map((h) => h.toLowerCase());
  const isCsv = head.length > 1 && head.some((h) => /e-?mail/.test(h)) && !head.some((h) => EMAIL.test(h));
  if (!isCsv) {
    /* a pasted list: anything separated by commas, semicolons, spaces or new lines; "Name <email>" keeps the name */
    const parts = lines.join('\n').split(/[\n;,]+/).map((s) => s.trim()).filter(Boolean);
    parts.forEach((p) => { const m = p.match(/^(.*?)\s*<([^>]+)>$/); if (m) add(m[2], m[1].replace(/^"|"$/g, '')); else p.split(/\s+/).forEach((w) => add(w, null)); });
    return { guests, bad, skipped, repeats };
  }
  const ei = head.findIndex((h) => /e-?mail/.test(h));
  const ni = head.findIndex((h) => h === 'name' || h === 'full name' || h === 'guest name');
  const fi = head.findIndex((h) => /^first.?name$/.test(h)), li = head.findIndex((h) => /^last.?name$/.test(h));
  const ap = head.findIndex((h) => /approval/.test(h));
  lines.slice(1).forEach((l) => {
    const c = cells(l, sep);
    if (ap >= 0 && c[ap] && !/^approved$/i.test(c[ap])) { skipped++; return; }
    const name = ni >= 0 ? c[ni] : [fi >= 0 ? c[fi] : '', li >= 0 ? c[li] : ''].join(' ').trim();
    add(c[ei] || '', name || null);
  });
  return { guests, bad, skipped, repeats };
}
