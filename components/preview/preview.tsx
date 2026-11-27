'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { countdown, nearestCity, type Here, type OurFact, type OurFacts } from './facts';
import './preview.css';
import '@/components/day/explain.css';
import { CITY_WORD } from '@/lib/day-data';

/* What the preview page (components/preview/fold) shares: the wheel's caption, and our cities with their countdowns and
   the one to open on (the visitor's nearest by time zone, or ?city=). */

export const CAPTION = `The ${CITY_WORD} cities, from the first to start to the last`;

/* the clock, in 30 second steps; the server has none, so the countdown cell appears after hydration */
const tick = (f: () => void) => { const t = window.setInterval(f, 30000); return () => window.clearInterval(t); };
const useNow = () => useSyncExternalStore(tick, () => Math.floor(Date.now() / 30000) * 30000, () => 0);
const never = () => () => {};
const useVisitorOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);

/* our cities with their countdowns, and the one to open on */
export function useOurCities(ours: OurFacts, forced: number | null, here: Here | null = null): { cities: (OurFact & { soon?: string })[]; start: number } {
  const now = useNow(), off = useVisitorOffset();
  const start = forced ?? (off === null ? 0 : nearestCity(ours.cities, off, here));
  const cities = useMemo(() => ours.cities.map((c) => ({ ...c, soon: now ? countdown(c, now) : undefined })), [ours, now]);
  return { cities, start };
}
