/* mail.ts: the six emails, as words. Plain sentences, one link each, the city and its local time in the subject.
   Pure, so the desk's outbox and the lab can show exactly what was (or would have been) sent. The words become a
   letter here; lib/email/layout.ts sets the letter in the saved look (saved/email.config.json, tuned at /lab/email).

   link      your place on the list, and your link (to a builder, from the guest list)
   code      your six-digit code, with a link that does the same
   role      you are a host or a judge, with the desk link
   reminder  your city starts soon (Remind me)
   again     the same link again (Send it again, on the desk or from the sign-in sheet)
   claim     a six-digit code to the address a place is listed under, when someone signed in elsewhere claims it */
import { ON_LIST_NEXT } from './rule';
import { CITIES, EVENT } from '@/lib/day-data';
import { CODE } from '@/lib/places';
import { checkIt } from '@/lib/hackday-server';
import { layout, type Letter } from '@/lib/email/layout';
import { clampEmail, type EmailLook } from '@/lib/email/look';
import saved from '@/saved/email.config.json';

export type Template = 'link' | 'code' | 'role' | 'reminder' | 'again' | 'claim';
export const TEMPLATES: Template[] = ['code', 'link', 'again', 'reminder', 'role', 'claim'];
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
    case 'link': return {
      subject: 'Your place in ' + city + ', ' + EVENT.name,
      pre: 'Building starts' + (d.when ? ' at ' + d.when + ', local time' : ' on the day') + '. This link signs you in.',
      word: code3 || 'IN', stub: stub('On the list'), board: board('On the list'),
      head: hi + (hi ? 'you’re' : 'You’re') + ' on the list for ' + city + '.',
      lines: [...(d.when ? ['Building starts at ' + d.when + ', local time.'] : []),
        'This link signs you in. On the day it opens ' + city + '’s page, where you submit your project in the browser. You type the code on the screen in the room, then your project’s name, a one-line pitch and its GitHub repository.',
        'Rather submit from your editor? Open the link before the day for your own editor line, add it, then say “' + checkIt() + '” to try it.',
        'Keep the link. It works until the day after, and you can open it again. ' + ON_LIST_NEXT + ' Anyone can vote.'],
      link: d.link ? { href: d.link, label: 'Open your place in ' + city } : undefined,
      after: ['Not you, or got this by mistake? Ignore it; nothing happens unless the link is opened.'],
      why: why('You registered on Luma for'),
    };
    case 'again': return {
      subject: 'Your link for ' + city + ', ' + EVENT.name,
      pre: 'Here is your link for ' + city + ' again.',
      word: code3 || 'IN', stub: stub('Your link'), board: board('Your link'),
      head: hi + (hi ? 'here' : 'Here') + ' is your link for ' + city + ' again.',
      lines: ['It signs you in on any device.'],
      link: d.link ? { href: d.link, label: 'Open ' + city } : undefined,
      why: why('You asked for your link to'),
    };
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
        lines: [role === 'judge' ? 'You have ' + EVENT.judgeVotes + ' votes for the day' + (EVENT.judgeWeight > 1 ? ', each worth ' + EVENT.judgeWeight + ' votes,' : '') + ' and may put several on one project. Vote on the city pages' + (EVENT.publicAt ? ' from ' + EVENT.publicAt + ' minutes after the start' : '') + ' while voting is open.'
          : 'The desk is where you run the day: the guest list, the entries, the stage and the door.',
          'Sign in with this email; we send a six-digit code each time.'],
        link: d.link ? { href: d.link, label: role === 'judge' ? 'Open ' + (d.city || 'the cities') : 'Open the desk' } : undefined,
        why: why('The desk added this email to'),
      };
    }
    case 'claim': return {
      subject: (d.code ? d.code + ' is your code' : 'Your code') + ' to move your place in ' + city,
      pre: 'Someone asked to move your place in ' + city + '. It works for 15 minutes.',
      word: d.code || 'MOVE', stub: stub('Move your place'), board: board('Move place'),
      head: 'Your code is', code: d.code || '',
      lines: ['Someone signed in' + (d.account ? ' as ' + d.account : '') + ' asked to move your place in ' + city + ' to that account. If that was you, type the code where it asked. It works for 15 minutes.'],
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
