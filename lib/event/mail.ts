/* mail.ts: the four emails, as words. Plain sentences, one link each, the city and its local time in the subject.
   Pure, so the desk's outbox can show exactly what was (or would have been) sent. The words become a
   letter here; lib/email/layout.ts sets the letter in the saved look (saved/email.config.json).

   code      your six-digit code, with a link that does the same (only while the email sign-in switch is on)
   role      you are a host or a judge, with the desk link
   reminder  your city starts soon (Remind me)
   claim     a six-digit code to the address a place is listed under, when a Supabase account adds that address
   Nothing goes out when someone registers on Luma (owner, 2026-11-25): they sign in with Supabase and find their place. */
import { CITIES, EVENT } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { layout, type Letter } from '@/lib/email/layout';
import { clampEmail, type EmailLook } from '@/lib/email/look';
import saved from '@/saved/email.config.json';

export type Template = 'code' | 'role' | 'reminder' | 'claim';

export type MailData = {
  city?: string;          /* the city's name */
  when?: string;          /* the start in the city's own time, "09:00 on 10 December" */
  link?: string;          /* the one link */
  code?: string;          /* six digits */
  role?: 'host' | 'judge' | 'super';
  name?: string;          /* the person's public name, when known */
  account?: string;       /* claim: the email of the account asking for the place */
};
export type Mail = { subject: string; text: string; html: string };

const ROLE: Record<string, string> = { host: 'a host', judge: 'a judge', super: 'a super admin' };
const SAVED = clampEmail(saved as Partial<EmailLook>);
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY = EVENT.day + ' ' + MON[EVENT.month - 1];

/* the city's id from its name (the outbox stores the name), for the globe and the three letters */
const idOf = (name?: string) => (name ? CITIES.find((c) => c.name === name)?.id ?? null : null);

export function letter(t: Template, d: MailData): Letter {
  const city = d.city || 'your city', id = idOf(d.city), code3 = id ? CODE[id] : '';
  const hi = d.name ? 'Hi ' + d.name + ', ' : '';
  const time = d.when ? d.when.split(' on ')[0] : '';
  const stub = (k: string) => [EVENT.name, ...(d.city ? [d.city] : []), DAY + (time ? ' ' + time : ''), k].filter(Boolean);
  const board = (status: string) => (d.city ? { city: d.city, code: code3 || '—', starts: time ? time + ' local' : DAY, status } : undefined);
  const why = (s: string) => s + ' ' + EVENT.name + ', ' + EVENT.day + ' December ' + EVENT.year + '.';
  switch (t) {
    case 'code': return {
      subject: (d.code ? d.code + ' is your code' : 'Your code') + ' for ' + EVENT.name,
      pre: 'Type it in the sheet that asked for it. It works for an hour.',
      word: d.code || 'IN', stub: [EVENT.name, DAY, 'Sign in'],
      head: 'Your code is', code: d.code || '',
      lines: ['Type it in the sheet that asked for it. It works for an hour.'],
      link: d.link ? { href: d.link, label: 'Or sign in with this link' } : undefined,
      after: ['If you did not ask for a code, ignore this email.'],
      why: why('Someone asked to sign in with this email at'),
    };
    case 'role': {
      const role = d.role || 'host';
      return {
        subject: 'You are ' + ROLE[role] + (d.city ? ' for ' + d.city : '') + ' at ' + EVENT.name,
        pre: 'You were added as ' + ROLE[role] + (d.city ? ' for ' + d.city : ' for every city') + '.',
        word: role === 'super' ? 'DESK' : role.toUpperCase(), stub: stub(role === 'judge' ? 'Judge' : role === 'super' ? 'Desk' : 'Host'), board: board(role === 'judge' ? 'Judge' : 'Host'),
        head: hi + (hi ? 'you' : 'You') + ' were added as ' + ROLE[role] + (d.city ? ' for ' + d.city : ' for every city') + '.',
        lines: [role === 'judge' ? 'You have ' + EVENT.judgeVotes + ' votes for the day' + (EVENT.judgeWeight > 1 ? ', each worth ' + EVENT.judgeWeight + ' votes,' : '') + ' and may put several on one project. Vote on the city pages' + (EVENT.judgeAt ?? EVENT.publicAt ? ' from ' + (EVENT.judgeAt ?? EVENT.publicAt) + ' minutes after the start' : '') + ', until everything closes.'
          : 'The desk is where you run the day: the guest list, the entries, the stage and the door.',
          'Sign in with the Supabase account that uses this email.'],
        link: d.link ? { href: d.link, label: role === 'judge' ? 'Open ' + (d.city || 'the cities') : 'Open the desk' } : undefined,
        why: why('The desk added this email to'),
      };
    }
    case 'claim': return {
      subject: (d.code ? d.code + ' is your code' : 'Your code') + ' to add this email to your account',
      pre: 'Your place in ' + city + ' is listed under this email. It works for 15 minutes.',
      word: d.code || 'ADD', stub: stub('Add this email'), board: board('Add email'),
      head: 'Your code is', code: d.code || '',
      lines: ['Someone signed in with Supabase' + (d.account ? ' as ' + d.account : '') + ' asked to add this email, and your place in ' + city + ', to that account. If that was you, type the code where it asked. It works for 15 minutes.'],
      after: ['If it was not you, ignore this email. Your place stays where it is.'],
      why: why('Your place in ' + city + ' is listed under this email at'),
    };
    case 'reminder': return {
      subject: city + ' starts' + (d.when ? ' at ' + d.when : ' soon') + ', ' + EVENT.name,
      pre: 'Voting opens when building starts.',
      word: code3 || 'GO', stub: stub('Starts soon'), board: board('Starts soon'),
      head: city + ' starts' + (d.when ? ' at ' + d.when + ', local time' : ' soon') + '.',
      lines: [...(hi ? [hi.replace(/, $/, '.')] : []), 'Voting opens when building starts.'],
      link: d.link ? { href: d.link, label: 'Open ' + city } : undefined,
      why: why('You asked to be reminded about'),
    };
  }
}

/* the email as sent: the letter in the saved look (or the lab's), the globe facing the city */
export function render(t: Template, d: MailData, look: EmailLook = SAVED): Mail {
  const l = letter(t, d), { html, text } = layout(l, look, idOf(d.city));
  return { subject: l.subject, html, text };
}
