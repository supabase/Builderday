import type { Metadata } from 'next';
import saved from '@/saved/family.config.json';
import { clampFamily } from '@/lib/family';
import { FamilyLab } from '@/components/lab/family-lab';

export const metadata: Metadata = { title: 'Family lab', description: 'The kit the preview, the home and the city pages share, part by part, with every look on a knob.', robots: { index: false } };

export default function Page() {
  return <FamilyLab saved={clampFamily(saved)} />;
}
