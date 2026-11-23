/* entry-id.ts: the pages name a project by its number in a city; the database functions take its id */
import { admin } from './supabase';

export async function entryIdOf(city: string, no: number): Promise<string | null> {
  if (!Number.isInteger(no) || no <= 0) return null;
  const { data } = await admin().from('entries').select('id').eq('city', city).eq('no', no).maybeSingle();
  return data?.id ?? null;
}
