/* http.ts: the small pieces every route uses. Answers are JSON; a refusal says, in words, what to do. */
import { backendOn } from './env';

export const ok = (body: unknown, init?: ResponseInit) => Response.json(body, init);
export const no = (error: string, status = 400, extra?: Record<string, unknown>) => Response.json({ error, ...extra }, { status });

/* the body as an object, or null */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try { const j = await req.json(); return j && typeof j === 'object' && !Array.isArray(j) ? j as T : null; } catch { return null; }
}

/* routes answer 503 when no backend is configured: the pages then use the stand-in in the browser */
export function offline(): Response | null {
  return backendOn() ? null : no('The backend is not configured on this server.', 503, { offline: true });
}

export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* a database error as a person-readable sentence: our functions raise plain sentences; the rest get a generic one */
export function said(e: { message?: string; code?: string } | null | undefined, fallback = 'Something went wrong. Try again.'): string {
  if (!e?.message) return fallback;
  return /^[A-Z][^\n]{3,200}[.?!]$/.test(e.message) && !/violates|syntax|relation|column|permission denied/.test(e.message) ? e.message : fallback;
}
