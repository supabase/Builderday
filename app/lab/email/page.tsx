import type { Metadata } from 'next';
import saved from '@/saved/email.config.json';
import { clampEmail, type EmailLook } from '@/lib/email/look';
import { EmailLab } from '@/components/lab/email-lab';

export const metadata: Metadata = { title: 'Emails lab', description: 'Every email with its picture in the text globe’s characters, every value on a knob.', robots: { index: false } };

/* ?mode=pass|board|globe|plain opens on that mode */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return <EmailLab saved={clampEmail({ ...(saved as Partial<EmailLook>), ...(q.mode ? { mode: q.mode as EmailLook['mode'] } : {}) })} />;
}
