import type { Metadata } from 'next';
import saved from '@/saved/ending.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { clampEnd } from '@/components/day/ending-config';
import { ourWheel } from '@/components/preview/facts';
import { EndingLab } from '@/components/lab/ending-lab';

export const metadata: Metadata = { title: 'Ending lab', description: 'Tuning page for how the preview page ends: the world opened flat, a test card, the city names, or today’s end board.', robots: { index: false } };

/* the time of the request: the last line is written at it */
function requestTime() { return Date.now(); }

export default async function Page() {
  return <EndingLab saved={clampEnd(saved)} wheel={clampWheel(wheel)} ours={ourWheel()} nowMs={requestTime()} />;
}
