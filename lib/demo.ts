/* The sample day (?demo): the day home, a city page and a project page drawn from the seeded day of lib/day-data.ts,
   never from Luma or the database, so the pages can be shown before the day. The switch opens the pages past the gate
   (proxy.ts), keeps the forms off the server, opens the moments panel and rides along on every link. Search engines
   are told to leave these addresses alone. Pure. */
import type { Metadata } from 'next';

export const DEMO = 'demo';
export const isDemo = (q: Record<string, string | string[] | undefined>) => q[DEMO] !== undefined;
export const demoRobots: Metadata['robots'] = { index: false, follow: false };
