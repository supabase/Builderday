import Link from 'next/link';
import { pageMeta } from '@/lib/meta';
import { InCard } from '@/components/forms/in-card';
import { EVENT } from '@/lib/day-data';

export const metadata = pageMeta('Sign in · ' + EVENT.name, 'Sign in to ' + EVENT.name + ' with your Supabase account.');

/* /in?e=…: where an old link, or a sign-in that did not work, lands, with what to do instead */
type Q = Record<string, string | string[] | undefined>;
export default async function In({ searchParams }: { searchParams: Promise<Q> }) {
  const e = String((await searchParams).e || '');
  const old = e === 'supabase';
  const text = e === 'offline' ? 'Signing in is not open on this site yet.' : old ? EVENT.short + ' signs you in with your Supabase account now, so this link is no longer needed.' : e || 'That did not sign you in.';
  return (
    <InCard title={old ? 'Sign in with Supabase' : 'That did not sign you in'} text={text}>
      <p className="m-0 text-ink-2">Press Sign in at the top of the page. Already signed in on supabase.com? Then you are signed in here too.</p>
      <Link className="fm-b w-full" href="/">Go to {EVENT.short}</Link>
    </InCard>
  );
}
