'use client';
import { useSyncExternalStore } from 'react';
import { EPOCH } from '@/lib/day-data';

/* The visitor's own time for a minute of the day ("19:00"), once the browser has said its zone; null on the server's
   first paint, so the words start with the city's time alone and add "your time" after hydration. Times are said in
   one order everywhere: the city's first, the visitor's second. */
const never = () => () => {};
const zoneNow = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function useYourTime(): ((minute: number) => string) | null {
  const zone = useSyncExternalStore(never, zoneNow, () => '');
  if (!zone) return null;
  const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone });
  return (m: number) => f.format(new Date(EPOCH + m * 60000));
}
/* "18:00 in London · 19:00 your time" (the second half only when it differs) */
export function bothTimes(local: string, where: string, yours: string | null): string {
  return local + ' in ' + where + (yours && yours !== local ? ' · ' + yours + ' your time' : '');
}
