import type { Metadata } from 'next';
import saved from '@/saved/fold.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { FoldLab } from '@/components/lab/fold-lab';
import { backendOn } from '@/lib/server/env';
import { FormsProvider } from '@/components/forms/forms-provider';

export const metadata: Metadata = { title: 'Fold lab', description: 'Tuning page for the preview without its sheet: the wheel, then the day as sections.', robots: { index: false } };

/* the time of the request: the end board is drawn at it */
function requestTime() { return Date.now(); }

/* ?dir= base | plain | line | unroll, ?acct= merged | beside, ?acctTop= link | both, ?bare, ?city=, ?at=, ?gl=0, ?still=1 */
/* ?mark= and ?globe= try the wheel's other marks and globes without saving (the admin panel holds them too) */
const pick = (q: Record<string, string | undefined>) => ({ ...(q.mark ? { mark: q.mark } : {}), ...(q.globe ? { globe: q.globe } : {}) });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <FormsProvider live={backendOn()}><FoldLab saved={saved as Partial<FoldCfg>} wheel={clampWheel({ ...wheel, ...pick(q) })} ours={ourWheel()} q={q} nowMs={requestTime()} /></FormsProvider>;
}
