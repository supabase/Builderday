/* POST /api/luma/hook: Luma's webhook. Luma sends guest.registered and guest.updated for every
   event on the calendar; a new guest fires both, and a delivery can come twice, so everything here is safe to run
   again. Read 2026-11-18 (help.luma.com/p/webhooks): the header Webhook-Signature is "t=<unix seconds>,v1=<hex>", the
   hex is HMAC-SHA256 over "<t>.<raw body>" with the webhook's secret as given (whsec_…), Webhook-Id names the
   delivery, and Luma wants an answer inside five seconds. So: check the signature and the time, write the rows,
   answer, and send the email after the answer (it is already a row in the outbox if the send fails). */
import { after } from 'next/server';
import { offline } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { siteUrl } from '@/lib/server/env';
import { applyGuest, cityByLumaEvent } from '@/lib/server/registrations';
import { emailOf, nameOf, verifyHook, type LumaGuest } from '@/lib/server/luma';

export const dynamic = 'force-dynamic';
const plain = (status: number, text = '') => new Response(text, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const secret = process.env.LUMA_WEBHOOK_SECRET;
  if (!secret) return plain(503, 'The Luma webhook is not set up on this server.');
  const raw = await req.text();
  if (raw.length > 512_000) return plain(413);
  const v = verifyHook(secret, req.headers.get('webhook-signature'), raw);
  if (v !== 'ok') return plain(401, v === 'old' ? 'The timestamp is too old.' : 'The signature does not match.');

  let msg: { type?: string; data?: LumaGuest & { event?: { id?: string; api_id?: string }; event_id?: string } };
  try { msg = JSON.parse(raw); } catch { return plain(400, 'The body is not JSON.'); }
  const db = admin(), hookId = (req.headers.get('webhook-id') || '').slice(0, 120) || null;
  if (msg.type !== 'guest.registered' && msg.type !== 'guest.updated') return plain(200);

  /* the same delivery twice: answered, not applied again */
  if (hookId) {
    const { data: seen } = await db.from('log').select('id').eq('what', 'luma hook').eq('target', hookId).limit(1);
    if (seen && seen.length) return plain(200);
  }
  const g = msg.data || {}, eventId = String(g.event?.id || g.event?.api_id || g.event_id || '');
  const city = eventId ? await cityByLumaEvent(eventId) : null;
  const a = city ? await applyGuest(city, { email: emailOf(g), name: nameOf(g), id: g.id || g.api_id || null, status: String(g.approval_status || ''), registeredAt: g.registered_at || null }, 'hook', { base: siteUrl(req) }) : null;
  await db.from('log').insert({ what: 'luma hook', city: city?.id || null, target: hookId, data: { type: msg.type, event: eventId.slice(0, 80), status: g.approval_status || null, known: !!city } });
  if (a?.mail) after(a.mail);
  return plain(200);
}
