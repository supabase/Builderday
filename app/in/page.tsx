import Link from 'next/link';
import { pageMeta } from '@/lib/meta';
import { InCard } from '@/components/forms/in-card';
import { EVENT } from '@/lib/day-data';

export const metadata = pageMeta('Your link · ' + EVENT.name, 'Your link to ' + EVENT.name + '.');

/* /in?e=…: where a link that did not work lands, with what to do instead */
type Q = Record<string, string | string[] | undefined>;
export default async function In({ searchParams }: { searchParams: Promise<Q> }) {
  const e = String((await searchParams).e || '');
  const text = e === 'offline' ? 'Signing in is not open on this site yet.' : e || 'Open the link from your email to sign in.';
  return (
    <InCard title="That link did not sign you in" text={text}>
      <p className="m-0 text-ink-2">Press Sign in at the top of the page and type the email you registered with on Luma; we send a six-digit code. On the day, in the room, the code on the screen signs you in at once.</p>
      <Link className="fm-b w-full" href="/">Go to {EVENT.short}</Link>
    </InCard>
  );
}
