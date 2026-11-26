/* proto:under-hero. The preview page with a picker for what sits under the hero. Throwaway: delete this folder and
   the `under` hook in components/preview/fold (fenced "proto:under-hero") once a direction is picked. */
import saved from '@/saved/fold.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { backendOn } from '@/lib/server/env';
import { signups } from '@/lib/server/signups';
import { FormsProvider } from '@/components/forms/forms-provider';
import type { Metadata } from 'next';
import { Harness } from './harness';

export const metadata: Metadata = { title: 'Under the hero', robots: { index: false, follow: false } };

function requestTime() { return Date.now(); }

export default async function ProtoUnderHero({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, ours = ourWheel(backendOn() ? await signups() : undefined);
  /* the full page, sections and footer, whatever the saved page mode */
  return <FormsProvider live={backendOn()}><Harness saved={{ ...(saved as Partial<FoldCfg>), page: 'full' } as Partial<FoldCfg>} wheel={clampWheel(wheel)} ours={ours} here={null} q={q} nowMs={requestTime()} /></FormsProvider>;
}
