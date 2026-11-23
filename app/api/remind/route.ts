/* POST /api/remind { email, city }: Remind me. Kept in reminders; the reminder email goes out from the desk's outbox
   run before the city starts (it is a row, never sent from here). */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { emailOK } from '@/lib/forms';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const email = str(b?.email, 200).toLowerCase(), city = str(b?.city, 40);
  if (!emailOK(email)) return no('Check the email. It needs an @ and a domain.');
  const { error } = await admin().from('reminders').upsert({ email, city }, { onConflict: 'email,city', ignoreDuplicates: true });
  if (error) return no(error.code === '23503' ? 'That city is not one of ours.' : 'The reminder was not saved. Try again.');
  return ok({ saved: true });
}
