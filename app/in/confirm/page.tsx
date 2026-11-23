import { pageMeta } from '@/lib/meta';
import { InCard } from '@/components/forms/in-card';
import { EVENT } from '@/lib/day-data';

export const metadata = pageMeta('Sign in · ' + EVENT.name, 'Confirm your email to sign in.');

/* /in/confirm?th=…: the link in the code email lands here and waits for a press, so a mail scanner that opens the
   link first uses nothing up */
type Q = Record<string, string | string[] | undefined>;
export default async function Confirm({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams, th = String(q.th || ''), next = String(q.next || '/');
  return (
    <InCard title={'Sign in to ' + EVENT.name} text={th ? 'Press the button to finish signing in on this device.' : 'This link is missing its code. Open the newest email we sent, or ask for a new code.'}>
      {th ? <form method="post" action="/api/auth/confirm">
        <input type="hidden" name="th" value={th} />
        <input type="hidden" name="next" value={next.startsWith('/') ? next : '/'} />
        <button className="fm-b g w-full" type="submit">Sign in</button>
      </form> : null}
    </InCard>
  );
}
