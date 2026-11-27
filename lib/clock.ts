/* clock.ts: the pages follow the real clock. For checking, the URL can move it (it then keeps running from there):
   ?moment= or ?t= on either page, ?still=1 to stop it. Pure: the caller passes the current time. */
import { EPOCH } from './day-data';

/* at: the minute on screen when the page was drawn; preview: the URL moved the clock; still: it does not run */
export type ClockInit = { at: number; preview: boolean; still: boolean };
export function realMinute(ms: number): number { return (ms - EPOCH) / 60000; }

