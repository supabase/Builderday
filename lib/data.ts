/* data.ts: sample content for the home and the city pages.

   PLACEHOLDER DATA. None of this is confirmed:
   - SAMPLE_PROJECTS: twenty sample projects. Names, pitches, handles, repos and demo links are made up. day-data.ts
     seeds every city's entries from this list in this order, so reordering it changes every city's winner.
   - PAST: the three past events listed on the home. Dates, formats and entry counts are as last published; winners
     are not listed because they are not in this repository. 0 entries means the count was never published.
   - FAQ: the questions on the home. Only facts that are settled are stated. Venues, prizes, team size and who can
     vote are not settled, so the answers say they will be announced. */

export type Project = {
  id: number;
  name: string;
  pitch: string;
  handle: string;
  repo: string;
  demo: string;
  /* generated in day-data.ts, not one of the twenty */
  gen?: boolean;
  /* a real screenshot URL, once there is one */
  image?: string;
  /* a live entry's stored slug: unique in its city, so two entries with the same name keep their own addresses */
  slug?: string;
};

export type PastEvent = { name: string; date: string; format: string; submissions: number };

const ROWS: [string, string, string][] = [
  ['Rowboat', 'Natural-language migrations that diff and explain themselves', 'mara.dev'],
  ['Pulse Table', 'A spreadsheet where every cell is a Realtime channel', 'tomasz_k'],
  ['Keyring', 'Passkey-only auth starter with recovery that does not suck', 'ines.builds'],
  ['Shelf', 'S3-style bucket browser with versioned undo, in one file', 'kofi'],
  ['Lull', 'Edge function that turns your cron jobs into a calm daily brief', 'yuki.tables'],
  ['Vec Garden', 'Plant-care helper on pgvector and your own photos', 'noor.codes'],
  ['Wall of Hands', 'A live shared canvas for 1,000 cursors, throttled on purpose', 'lars.sh'],
  ['Rowlock', 'Visual RLS policy tester. Pick a user, see the rows', 'amara.xyz'],
  ['Tidepool', 'Turn a CSV into a typed API in about 30 seconds', 'jules_b'],
  ['Quill Mail', 'Magic links with a handwriting font and no tracking pixels', 'petra.dev'],
  ['Dropbox Jr', 'Resumable uploads that survive a train tunnel', 'hiro.ts'],
  ['Sentry Pup', 'Edge function that watches your logs and barks in plain English', 'bea.codes'],
  ['Cache Me', 'A playable explainer of what Postgres does with your query', 'omar.sql'],
  ['Jam Room', 'Presence-only music room, nothing is stored', 'sana.wav'],
  ['Echo', 'Voice notes that become searchable rows', 'ravi.m'],
  ['Tiny Vault', 'Secrets manager for solo devs, 90 lines of SQL', 'ada_l'],
  ['Lantern', 'Accessibility checker that files its own issues', 'elif.dev'],
  ['Plot Twist', 'Generates seed data that looks like a real startup', 'finn.dev'],
  ['Gatekeeper', 'Role-based access for hackathon demos, one toggle', 'zoe.tsx'],
  ['Bucket List', 'Public gallery of what people stored this week', 'leo.fm'],
];

export const SAMPLE_PROJECTS: Project[] = ROWS.map((r, i) => {
  const slug = r[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { id: i + 1, name: r[0], pitch: r[1], handle: r[2], repo: 'github.com/' + r[2].replace(/[^a-z0-9]/gi, '') + '/' + slug, demo: slug + '.vercel.app' };
});

export const PAST: PastEvent[] = [
  { name: 'Supabase Select 2026 Hackathon', date: 'Oct 3, 2026', format: 'Onsite, San Francisco', submissions: 68 },
  { name: 'Supabase Lisbon AI Hackathon', date: 'Nov 8, 2025', format: 'Onsite, Lisbon', submissions: 0 },
  { name: 'Supabase Select 2025', date: 'Oct 4, 2025', format: 'Onsite, San Francisco', submissions: 54 },
];

/* times here are local: every city runs the same local schedule (day-data.ts SCHED) */
export const FAQ: [string, string][] = [
  ['How do I enter?', 'Open your city’s page and submit your project while building is open, from 09:00 to 10:30 local time.'],
  ['How do I vote?', 'Open the city’s page while voting is open, from 09:00 to 11:00 local time, and press Vote on a project. You can vote on a project as soon as it is in. The first time, you confirm your email.'],
];
