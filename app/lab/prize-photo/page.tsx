import type { Metadata } from 'next';
import saved from '@/saved/prize-photo.config.json';
import { PHOTOS, clampPhoto, type Photo, type PhotoLook } from '@/components/prize/photo';
import { PrizePhotoLab } from '@/components/lab/prize-photo-lab';

export const metadata: Metadata = { title: 'Prize photo lab', description: 'The prize photos printed in the site look, every value on a knob.', robots: { index: false } };

/* ?show=pro|mini|neo|quest opens on that prize */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const show = (PHOTOS as readonly string[]).includes(q.show ?? '') ? (q.show as Photo) : 'pro';
  return <PrizePhotoLab saved={clampPhoto(saved as Partial<PhotoLook>)} show={show} />;
}
