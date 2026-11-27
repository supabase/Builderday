/* mail.ts: one send(), two drivers. Every email is a row in the outbox either way.
   - resend: when RESEND_API_KEY is set. The row ends 'sent' (with Resend's id) or 'failed' (with its error).
     While the hold is on (see mailHeld), Remind me emails stay in the outbox unless the address is on MAIL_ALLOW.
   - outbox: when it is not. The row ends 'not_sent'; the desk's Outbox shows it with Copy link, and with
     HACKDAY_DEV_MAIL=1 the development server prints it. With MAIL_CATCHER_URL set to the local stack's mail catcher
     (Mailpit, on this machine only), the email is also delivered there, to be read in a browser while building.
     A machine without the Resend key can never mail a real address.
   Supabase's own mail is never used: codes and links come from Auth's generateLink, the email is ours. */
import { render, type MailData, type Template } from '@/lib/event/mail';
import { admin } from './supabase';
import { devMail, mailAllowed, mailHeld } from './env';
import { EVENT } from '@/lib/day-data';

/* the local stack's mail catcher, and only when it is on this machine */
function catcher(): string | null {
  const u = (process.env.MAIL_CATCHER_URL || '').replace(/\/+$/, '');
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
}
async function toCatcher(url: string, to: string, mail: { subject: string; text: string; html: string }) {
  try {
    await fetch(url + '/api/v1/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(2000),
      body: JSON.stringify({ From: { Email: 'desk@hackday.test', Name: EVENT.name }, To: [{ Email: to }], Subject: mail.subject, Text: mail.text, HTML: mail.html }),
    });
  } catch { /* the catcher is a convenience; the outbox row is the record */ }
}

export type Sent = { id: string; status: 'sent' | 'failed' | 'not_sent'; error?: string };
/* no key: the outbox only. A machine without the key mails no real address */
export const mailDriver = () => (process.env.RESEND_API_KEY ? 'resend' : 'outbox') as 'resend' | 'outbox';
/* what the hold covers: emails that go to many people at once (Remind me). An email a person asked for (a claim
   code, a role, a sign-in code) always goes. */
const HELD: Template[] = ['reminder'];
export const isHeld = (t: Template, to: string) => mailHeld() && HELD.includes(t) && !mailAllowed(to);
const driverFor = (to: string, t: Template) => (process.env.RESEND_API_KEY && !isHeld(t, to) ? 'resend' : 'outbox');

export async function send(to: string, template: Template, data: MailData, city?: string | null): Promise<Sent> {
  const db = admin();
  const { data: row, error } = await db.from('outbox').insert({ to_email: to.toLowerCase(), template, data, city: city || null }).select('id').single();
  if (error || !row) throw new Error('The outbox refused the email: ' + (error?.message || 'no row'));
  const mail = render(template, data);

  if (driverFor(to, template) === 'outbox') {
    await db.from('outbox').update({ status: 'not_sent', error: isHeld(template, to) ? 'held: place emails are on hold (MAIL_HOLD)' : null }).eq('id', row.id);
    const c = catcher(); if (c) await toCatcher(c, to, mail);
    if (devMail()) console.log('[outbox] ' + template + ' to ' + to + ': ' + mail.subject + (data.link ? '\n         ' + data.link : ''));
    return { id: row.id, status: 'not_sent' };
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': row.id },
      body: JSON.stringify({ from: process.env.MAIL_FROM || EVENT.name + ' <onboarding@resend.dev>', to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({})) as { id?: string; message?: string };
    if (!r.ok) throw new Error(j.message || 'Resend answered ' + r.status);
    await db.from('outbox').update({ status: 'sent', provider_id: j.id || null, sent_at: new Date().toISOString() }).eq('id', row.id);
    return { id: row.id, status: 'sent' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('outbox').update({ status: 'failed', error: msg.slice(0, 500) }).eq('id', row.id);
    return { id: row.id, status: 'failed', error: msg };
  }
}
