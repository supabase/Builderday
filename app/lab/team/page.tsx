import type { Metadata } from 'next';
import saved from '@/saved/team.config.json';
import { clampTeam, type TeamLook } from '@/components/account/team-config';
import { TeamLab } from '@/components/lab/team-lab';

export const metadata: Metadata = { title: 'Team lab', description: 'The team in the account sheet: its seats drawn in the sheets’ characters, every value on a knob.', robots: { index: false } };

/* ?mode=seats|board|none opens on that mode */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <TeamLab saved={clampTeam({ ...(saved as Partial<TeamLook>), ...(q.mode ? { mode: q.mode as TeamLook['mode'] } : {}) })} />;
}
