import type { Metadata } from 'next';
import saved from '@/saved/day.config.json';
import type { Query } from '@/lib/clock';
import type { HomeCfg } from '@/lib/home';
import { DayLab } from '@/components/lab/day-lab';

export const metadata: Metadata = { title: 'Day lab', description: 'Tuning page for the home: every city on one day, four layouts, six moments.', robots: { index: false } };

/* Dynamic: the page starts from the URL (?moment=, ?t=, ?seed=, ?panel=0 and the knobs) */
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  return <DayLab saved={saved as Partial<HomeCfg>} q={await searchParams} />;
}
