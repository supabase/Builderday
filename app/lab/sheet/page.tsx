import type { Metadata } from 'next';
import saved from '@/saved/sheet.config.json';
import { clampArt, type ArtLook } from '@/components/forms/art-config';
import { SheetLab } from '@/components/lab/sheet-lab';

export const metadata: Metadata = { title: 'Sheets lab', description: 'The sign-in and account sheets with their picture: the word in the globe’s characters, every value on a knob.', robots: { index: false } };

/* ?mode=masthead|pass|split|none opens on that mode */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <SheetLab saved={clampArt({ ...(saved as Partial<ArtLook>), ...(q.mode ? { mode: q.mode as ArtLook['mode'] } : {}) })} />;
}
