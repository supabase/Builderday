'use client';
import { useSyncExternalStore } from 'react';
import { CITY_WORD } from '@/lib/day-data';
import { nearestCity, type Here, type OurFact, type OurWheel } from './facts';

export const CAPTION = `The ${CITY_WORD} cities, from the first to start to the last`;

const never = () => () => {};
const useVisitorOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);

/* our cities, and the one to open on: ?city=, else the nearest */
export function useOurCities(ours: OurWheel, forced: number | null, here: Here | null = null): { cities: OurFact[]; start: number } {
  const off = useVisitorOffset();
  const start = forced ?? (off === null ? 0 : nearestCity(ours.cities, off, here));
  return { cities: ours.cities, start };
}
