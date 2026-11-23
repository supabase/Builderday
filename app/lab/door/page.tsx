import type { Metadata } from 'next';
import parts from '@/saved/parts.config.json';
import type { PartsCfg } from '@/components/board/config';
import { DoorLab } from '@/components/lab/door-lab';

export const metadata: Metadata = { title: 'Door lab', description: 'Every account state: the header cell on the home and a city page, and the account sheet.', robots: { index: false } };

/* ?only=cell | sheet shows one part */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DoorLab parts={parts as Partial<PartsCfg>} q={await searchParams} />;
}
