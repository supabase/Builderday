import type { Metadata } from 'next';
import saved from '@/saved/build.config.json';
import { clampBuild, type BuildLook } from '@/components/preview/fold/build-art';
import { BuildLab } from '@/components/lab/build-lab';

export const metadata: Metadata = { title: 'Build lab', description: 'Build in How Builder Day works: the project going up block by block in the text globe’s characters, with every value on a knob.', robots: { index: false } };

/* any knob as a query opens on it (?shape=mark&cube=4); ?min= sets the preview minute */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const over: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && k !== 'min') over[k] = ['shape', 'shade', 'arrive'].includes(k) ? v : Number(v);
  return <BuildLab saved={clampBuild({ ...(saved as Partial<BuildLook>), ...over })} min={q.min ? Number(q.min) : 90} />;
}
