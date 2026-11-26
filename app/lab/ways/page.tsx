import type { Metadata } from 'next';
import saved from '@/saved/ways.config.json';
import { clampWays, type WaysLook } from '@/components/preview/fold/ways-config';
import { WaysLab } from '@/components/lab/ways-lab';

export const metadata: Metadata = { title: 'Ways lab', description: 'Build in How Builder Day works: the two ways to submit, in the browser or from the editor, with every value on a knob.', robots: { index: false } };

/* any knob as a query opens on it (?chrome=bare); ?min= (0 to 1) sets the preview progress, ?way=editor the way */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, over: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && k !== 'p' && k !== 'way') over[k] = ['chrome', 'checks'].includes(k) ? v : Number(v);
  return <WaysLab saved={clampWays({ ...(saved as Partial<WaysLook>), ...over })} p={q.p ? Number(q.p) : 1} way={q.way === 'editor' ? 'editor' : 'browser'} />;
}
