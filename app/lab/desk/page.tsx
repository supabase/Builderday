import type { Metadata } from 'next';
import { DeskLab } from '@/components/desk/lab';
import { EVENT } from '@/lib/day-data';

export const metadata: Metadata = { title: 'Desk lab · ' + EVENT.name, robots: { index: false, follow: false } };

/* /lab/desk?as=host|judge|super|out&moment=before|build|vote|closed&tab=… : the desk on sample data */
type Q = Record<string, string | string[] | undefined>;
export default async function DeskLabPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const as = ['host', 'judge', 'super', 'out'].indexOf(String(q.as)) >= 0 ? (String(q.as) as 'host') : 'host';
  const moment = ['before', 'build', 'vote', 'closed'].indexOf(String(q.moment)) >= 0 ? (String(q.moment) as 'before') : 'before';
  const tab = typeof q.tab === 'string' && /^[a-z]{1,12}$/.test(q.tab) ? q.tab : undefined;
  return <DeskLab key={as + moment + (tab || '')} who={as} moment={moment} tab={tab} />;
}
