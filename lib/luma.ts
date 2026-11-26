/* luma.ts: where to register. Each city has its own Luma event: its public page (the Register links) and its id (the
   state read on the server, lib/server/signups.ts). */
const EVENTS: Record<string, { page: string; id: string }> = {
  'seoul': { page: 'supabase-builder-day-seoul', id: 'evt-VilR3HKaevteGqU' },
  'singapore': { page: 'supabase-builder-day-singapore', id: 'evt-NsvUUaMGfes9Y86' },
  'peshawar': { page: 'supabase-builder-day-peshawar', id: 'evt-XgF3x1gJDTqYgbA' },
  'nouakchott': { page: 'supabase-builder-day-nouakchott', id: 'evt-ur2Z3FBLm1VUEvW' },
  'london': { page: 'supabase-builder-day-london', id: 'evt-F6N31ZkysGF97Dz' },
  'rosario': { page: 'supabase-builder-day-rosario', id: 'evt-Zo5OS43EYzeDcmV' },
  'santiago': { page: 'supabase-builder-day-santiago', id: 'evt-mLEC0doAFD66gSX' },
  'manta': { page: 'supabase-builder-day-manta', id: 'evt-vSQMieO2DnD2j3K' },
  'new-york': { page: 'supabase-builder-day-new-york-city', id: 'evt-5ABMJ1jvoxBX2dY' },
  'toronto': { page: 'supabase-builder-day-toronto', id: 'evt-ALrEbnypZxEXnDS' },
  'san-salvador': { page: 'supabase-builder-day-san-salvador', id: 'evt-pxC2QrjXhgvI1eR' },
  'austin': { page: 'supabase-builder-day-austin', id: 'evt-Wns48FymfbBq8in' },
  'mexico-city': { page: 'supabase-builder-day-mexico-city', id: 'evt-FRQx4pKxeIklqiF' },
  'san-francisco': { page: 'supabase-builder-day-san-francisco', id: 'evt-83FwKVtT4u56nQT' },
};
export const LUMA = 'https://luma.com/';
/* true: the pages show Register links to the Luma events */
export const LUMA_LIVE = true;
/* a city's Luma event page */
export const lumaHref = (city?: string) => (LUMA_LIVE && city && EVENTS[city] ? LUMA + EVENTS[city].page : LUMA);
/* a city's Luma event id, for the API */
export const lumaId = (city: string) => EVENTS[city]?.id ?? null;
