/* desk.ts: the desk's shapes, shared by the server that fills them and the screens that draw them (and the lab's
   sample data). Pure. */
export type DeskCity = {
  id: string; name: string; offset: number; zone: string; venue: string; luma: string; lumaEvent: string; editor: string;
  planned: number; buildMin: number; voteAfter: number; buildStart: number | null; buildEnd: number | null; voteEnd: number | null;
  roomCode: string; submissionsPaused: boolean; votingPaused: boolean;
};
/* inRoom: when they checked in (the room code with their email, or a host by hand); only then may they submit (rule 7c) */
/* listedAs: the address the place is listed under, when another account holds it (claimed with a code); editor: the
   last call from their editor ("editor connected") */
export type DeskGuest = { person: string; email: string; name: string; source: 'luma' | 'host'; sent: number | null; opened: number | null; signedIn: boolean; inRoom: number | null; inRoomHow: 'room' | 'host' | null; entry: boolean; listedAs?: string | null; editor?: number | null };
export type DeskEntry = {
  no: number; slug: string; name: string; pitch: string; url: string; repo: string; picture: string | null; pictureFrom: string | null; via: string;
  by: string; byEmail: string; flags: string[]; hidden: boolean; created: number; votes: number; judge: number;
};
export type DeskScene = { id: string; position: number; kind: string; title: string; data: Record<string, unknown>; notes: string; hidden: boolean; event: boolean };
export type DeskPerson = { role: string; kind: 'super' | 'host' | 'judge'; city: string | null; budget: number; person: string; email: string; name: string; signedIn: boolean; used: number };
export type DeskOutbox = { id: string; to: string; template: string; city: string | null; status: string; error: string; at: number; link: string; code: string };
export type DeskLog = { id: number; what: string; city: string | null; target: string; at: number; who: string };
export type DeskState = {
  me: { email: string; name: string | null; super: boolean; roles: { role: string; city: string | null; budget: number }[] };
  city: string | null; cities: DeskCity[]; can: { host: boolean; judge: boolean; super: boolean };
  /* editors: places whose editor has called the server; unsent: places whose link has not gone out */
  counts: { listed: number; opened: number; signedIn: number; inRoom: number; entries: number; votes: number; editors?: number; unsent?: number } | null;
  guests: DeskGuest[]; entries: DeskEntry[]; scenes: DeskScene[];
  people: DeskPerson[]; outbox: DeskOutbox[]; log: DeskLog[]; pick: { no: number; name: string; city: string; at: number } | null;
  mail: 'resend' | 'outbox'; mailHeld?: boolean; mailTest?: number; devCodes: boolean;
  /* true when the server holds a Luma key: the Guests screen offers Sync from Luma for a city with its event set */
  luma: boolean;
  /* when the day pages open (a super admin's switch): the time, the desk's override and where that leaves the gate */
  gate?: { open: boolean; opensAt: number; override: 'auto' | 'open' | 'closed'; why: 'time' | 'desk' } | null;
  /* true when the server holds Luma's webhook secret */
  hook?: boolean;
};

/* the line hosts paste into Luma's confirmation message, the same for everyone. It must not ask
   people to confirm or register anywhere else: Luma drops such events from discovery. */
export const lumaLine = (site: string) => 'Set up your editor before the day: ' + site.replace(/\/+$/, '') + '/in';
export type ImportPreview = { fresh: number; already: number; elsewhere: number; bad: number; badList: string[]; skipped: number; repeats: number };

/* the flags, in words for the desk */
export const FLAG_WORDS: Record<string, string> = {
  'one-address': 'Many new voters from one address in a minute',
  'throwaway': 'Votes from throwaway email domains',
  'plus-copies': 'Votes from +tag copies of one address',
  'fork': 'A fork of an older repository',
  'push': 'One push carries most of the code',
  'dates': 'Commit dates from before the start',
  'demo': 'The live link did not answer',
  'supabase': 'No sign of Supabase in the repository',
  'no-repo': 'No repository given',
  'key': 'The builder’s editor line was in the repository (replaced; they were told)',
};

/* the host's one next thing, in order through the day */
export type Next = { key: string; label: string; hint: string };
export function nextThing(c: DeskCity, now: number): Next {
  if (c.buildStart == null) {
    if (now < c.planned - 90 * 60000) return { key: 'door', label: 'Open the door', hint: 'Put Doors on the screen as people arrive. Guests on the list type the code beside the QR to check in; anyone else comes to you to be added.' };
    return { key: 'start', label: 'Start building', hint: 'Press it when the intro ends. Submit then appears on every phone in the room at once. This cannot be undone.' };
  }
  if (now < (c.buildEnd ?? 0)) return { key: 'add5', label: 'Add 5 minutes', hint: 'Only if the room needs it: the minutes cannot be taken back.' };
  if (now < (c.voteEnd ?? 0)) return { key: 'rank', label: 'Show the ranking', hint: 'Building is closed. Voting closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  return { key: 'top3', label: 'Reveal the top 3', hint: 'Voting is closed. Reveal the top 3 on the stage, then hand over to the final.' };
}
export function clockText(ms: number, offset: number): string {
  const d = new Date(ms + offset * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/* what every desk action answers */
export type DeskResult = { ok: boolean; error?: string; [k: string]: unknown };
export type DeskAct = (action: string, p?: Record<string, unknown>) => Promise<DeskResult>;

/* where a city is in its day, in words, for the top of Today */
export function phaseLine(c: DeskCity, now: number): { word: string; line: string } {
  if (c.buildStart == null) return { word: 'Before the start', line: 'Building is planned for ' + clockText(c.planned, c.offset) + ', for ' + c.buildMin + ' minutes.' };
  if (now < (c.buildEnd ?? 0)) return { word: 'Building', line: 'Building ends ' + clockText(c.buildEnd!, c.offset) + '. Voting closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  if (now < (c.voteEnd ?? 0)) return { word: 'Voting', line: 'Building is closed. Voting closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  return { word: 'Closed', line: 'Voting closed at ' + clockText(c.voteEnd!, c.offset) + '.' };
}
