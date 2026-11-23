// env.mjs: the scripts read .env.local the way the site does (names in env.example), and refuse anything but the
// local stack, so a script can never touch a cloud project.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function env() {
  const file = path.resolve(import.meta.dirname, '../../.env.local'), out = { ...process.env };
  try { for (const line of readFileSync(file, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && out[m[1]] == null) out[m[1]] = m[2]; } } catch { /* no file */ }
  const url = out.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url)) { console.error('These scripts run against the local stack only; NEXT_PUBLIC_SUPABASE_URL is ' + (url ? 'not local' : 'unset') + '.'); process.exit(2); }
  return out;
}

export async function rest(e, pathname, init = {}) {
  const r = await fetch(e.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + pathname, {
    ...init, headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const t = await r.text(); if (!r.ok) throw new Error(pathname + ': ' + r.status + ' ' + t);
  return t ? JSON.parse(t) : null;
}
