/* gate.ts (server): the gate from the event's row (lib/gate.ts has the sum). Read often (every gated page), so the row is
   kept for a few seconds; a press at the desk forgets it at once on this server. */
import { admin } from './supabase';
import { backendOn, superAdmins } from './env';
import { EVENT_ID, personByAuth, rolesOf } from './people';
import { CITY_IDS } from '@/lib/day-data';
import { defaultOpensAt, gateAt, type Gate, type Override } from '@/lib/gate';

const KEEP_MS = 5000;
let kept: { at: number; opensAt: number; override: Override } | null = null;

export function forgetGate() { kept = null; }

export async function dayGate(now = Date.now()): Promise<Gate> {
  if (!backendOn()) return gateAt(now, defaultOpensAt());
  if (!kept || now - kept.at > KEEP_MS) {
    try {
      const db = admin();
      const [{ data: ev }, { data: cities }] = await Promise.all([
        db.from('events').select('opens_at, open').eq('id', EVENT_ID).maybeSingle(),
        db.from('cities').select('planned_start').eq('event', EVENT_ID),
      ]);
      const starts = (cities || []).map((c) => Date.parse(c.planned_start as string)).filter((n) => !isNaN(n));
      kept = { at: now, opensAt: ev?.opens_at ? Date.parse(ev.opens_at as string) : defaultOpensAt(starts), override: ((ev?.open as Override) || 'auto') };
    } catch {
      /* the database does not answer: the config's sum, so the pages still draw */
      return gateAt(now, defaultOpensAt());
    }
  }
  return gateAt(now, kept.opensAt, kept.override);
}

/* where a person lands after a link or a code: their city's page once the day pages are open; before then the
   preview page, with the wheel on their city (rule 1: no link from us points at a page that is closed) */
export async function landing(city: string | null, now = Date.now()): Promise<string> {
  const g = await dayGate(now);
  const i = city ? CITY_IDS.indexOf(city) : -1;
  if (g.open) return city && i >= 0 ? '/city/' + city : '/';
  return i >= 0 ? '/preview?city=' + i : '/preview';
}

/* may this signed-in person see the day pages before they open? A host, a judge or a super admin may. */
export async function seesEarly(authId: string, email: string): Promise<boolean> {
  if (superAdmins().indexOf(email.toLowerCase()) >= 0) return true;
  const p = await personByAuth(authId);
  if (!p) return false;
  return (await rolesOf(p.id)).length > 0;
}
