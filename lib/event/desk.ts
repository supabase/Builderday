/* desk.ts: the desk's shapes, shared by the server that fills them and the screens that draw them (and the lab's
   sample data). Pure. */
import type { Format } from './format';

/* a place (a city of an event). prize: its own, when it differs from the event's */
export type DeskCity = {
  id: string; event: string; name: string; offset: number; zone: string; venue: string; luma: string; lumaEvent: string; editor: string; prize: string;
  planned: number; buildMin: number; voteAfter: number; buildStart: number | null; buildEnd: number | null; voteEnd: number | null;
  submissionsPaused: boolean; votingPaused: boolean;
};
/* inRoom: when a host checked them in at the door; only then may they submit (rule 7c) */
/* listedAs: the address the place is listed under, when another account holds it (claimed with a code); editor: the
   last call from their editor ("editor connected") */
export type DeskGuest = { person: string; email: string; name: string; source: 'luma' | 'host'; sent: number | null; opened: number | null; signedIn: boolean; inRoom: number | null; inRoomHow: 'room' | 'host' | null; entry: boolean; listedAs?: string | null; editor?: number | null };
export type DeskEntry = {
  no: number; slug: string; name: string; pitch: string; url: string; repo: string; picture: string | null; pictureFrom: string | null; via: string;
  by: string; byEmail: string; flags: string[]; hidden: boolean; created: number; votes: number; judge: number;
  /* the judges' scores: their sum over every judge and criterion, and how many judges scored */
  scoreSum: number; scoreN: number; reached: number; city: string;
  /* the host's order inside a tie at the top, once voting has closed (1 first); null or absent: not placed */
  tie?: number | null;
};
export type DeskScene = { id: string; position: number; kind: string; title: string; data: Record<string, unknown>; notes: string; hidden: boolean; event: boolean };
export type RoleKind = 'super' | 'admin' | 'host' | 'judge';
export type DeskPerson = { role: string; kind: RoleKind; event: string | null; city: string | null; budget: number; person: string; email: string; name: string; signedIn: boolean; used: number; scored: number };
/* an event, as the desk lists it. phase: before its first place starts, while any place runs, or after all closed */
export type DeskEvent = {
  id: string; name: string; short: string; day: string; archived: boolean; f: Format;
  places: number; listed: number; entries: number; phase: 'next' | 'live' | 'done'; first: number | null;
  /* what this person is in it, in words ("Super admin", "Host, London") */
  mine: string;
};
/* one place on the event's overview */
export type DeskPlace = { id: string; listed: number; inRoom: number; entries: number; votes: number; leader: string | null; editors: number };
/* a finalist: the top N of a place, by the event's format */
export type DeskFinalist = { no: number; name: string; city: string; by: string; value: number; place: number; picture: string | null; url: string };
export type DeskOutbox = { id: string; to: string; template: string; city: string | null; status: string; error: string; at: number; link: string; code: string };
export type DeskLog = { id: number; what: string; city: string | null; target: string; at: number; who: string };
export type DeskState = {
  me: { email: string; name: string | null; super: boolean; roles: { role: RoleKind; event: string | null; city: string | null; budget: number }[] };
  /* the events this person sees, the one open (null: the list of events) and the place open in it (null: the event) */
  events: DeskEvent[]; event: string | null;
  city: string | null; cities: DeskCity[]; can: { host: boolean; judge: boolean; super: boolean; admin: boolean };
  /* the event's places at a glance (the event's Overview) and its finalists (Final) */
  overview: DeskPlace[]; finalists: DeskFinalist[];
  /* a judge's own judging in this place: a budget (used, and per project) or their scores per project and criterion */
  judging: { budget: number; used: number; per: Record<string, number> } | { scores: Record<string, Record<string, number>> } | null;
  /* the super admins, for a super admin */
  supers: DeskPerson[];
  /* editors: places whose editor has called the server */
  counts: { listed: number; opened: number; signedIn: number; inRoom: number; entries: number; votes: number; editors?: number } | null;
  guests: DeskGuest[]; entries: DeskEntry[]; scenes: DeskScene[];
  people: DeskPerson[]; outbox: DeskOutbox[]; log: DeskLog[]; pick: { no: number; name: string; city: string; at: number } | null;
  /* Luma's calendar is read for new places when the server holds a key */
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
/* the words follow the event: votes or judging after building, and how many are revealed at the end */
export type DayWords = { vote: 'Voting' | 'Judging'; top: string; final: boolean };
const BD_WORDS: DayWords = { vote: 'Voting', top: 'the top 3', final: true };
export function nextThing(c: DeskCity, now: number, w: DayWords = BD_WORDS): Next {
  if (c.buildStart == null) {
    if (now < c.planned - 90 * 60000) return { key: 'door', label: 'Open the door', hint: 'Put Doors on the screen as people arrive. Guests on the list type the code beside the QR to check in; anyone else comes to you to be added.' };
    return { key: 'start', label: 'Start building', hint: 'Press it when the intro ends. Submit then appears on every phone in the room at once. This cannot be undone.' };
  }
  if (now < (c.buildEnd ?? 0)) return { key: 'add5', label: 'Add 5 minutes', hint: 'Only if the room needs it: the minutes cannot be taken back.' };
  if (now < (c.voteEnd ?? 0)) return { key: 'rank', label: w.vote === 'Voting' ? 'Show the ranking' : 'Show what was built', hint: 'Building is closed. ' + w.vote + ' closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  return { key: 'top3', label: 'Reveal ' + w.top, hint: w.vote + ' is closed. Reveal ' + w.top + ' on the stage' + (w.final ? ', then hand over to the final.' : '.') };
}
export function clockText(ms: number, offset: number): string {
  const d = new Date(ms + offset * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/* what every desk action answers */
export type DeskResult = { ok: boolean; error?: string; [k: string]: unknown };
export type DeskAct = (action: string, p?: Record<string, unknown>) => Promise<DeskResult>;

/* where a city is in its day, in words, for the top of Today */
export function phaseLine(c: DeskCity, now: number, w: DayWords = BD_WORDS): { word: string; line: string } {
  if (c.buildStart == null) return { word: 'Before the start', line: 'Building is planned for ' + clockText(c.planned, c.offset) + ', for ' + c.buildMin + ' minutes.' };
  if (now < (c.buildEnd ?? 0)) return { word: 'Building', line: 'Building ends ' + clockText(c.buildEnd!, c.offset) + '. ' + w.vote + ' closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  if (now < (c.voteEnd ?? 0)) return { word: w.vote, line: 'Building is closed. ' + w.vote + ' closes ' + clockText(c.voteEnd!, c.offset) + '.' };
  return { word: 'Closed', line: w.vote + ' closed at ' + clockText(c.voteEnd!, c.offset) + '.' };
}
