/* the head both pages share: the same text in og and twitter as in the title */
import type { Metadata } from 'next';
import { EVENT } from '@/lib/day-data';

export function pageMeta(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { type: 'website', siteName: EVENT.name, title, description },
    twitter: { card: 'summary' },
  };
}
