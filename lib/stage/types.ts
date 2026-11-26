/* The stage's shapes, as the two tables hold them: a city's deck is rows of `scenes`, and
   what is on the wall now is one `stage` row per city. Both drivers (the local one for the lab, the Realtime one for
   the real pages) move the same shapes, so the wall and the remote never know which one they are on. Pure. */

export type SceneKind =
  | 'doors' | 'welcome' | 'speaker' | 'question' | 'needs' | 'tour' | 'say' | 'line' | 'deadline' | 'rules' | 'prizes' | 'submit' | 'questions'
  | 'building' | 'voting' | 'showcase' | 'top3' | 'tombola' | 'final'
  /* a host's own slides: words (a heading and up to three lines), a link (opens in a new tab while the wall holds a
     card), and a product (a Supabase product's name, one line, a picture, and its link as a QR) */
  | 'words' | 'link' | 'product';

/* the event's scenes: these can be hidden, never deleted */
export const EVENT_KINDS: SceneKind[] = ['doors', 'welcome', 'question', 'needs', 'tour', 'say', 'line', 'deadline', 'rules', 'prizes', 'submit', 'questions', 'building', 'voting', 'showcase', 'top3', 'tombola', 'final'];
/* the scenes drawn from the city's live numbers */
export const LIVE_KINDS: SceneKind[] = ['doors', 'building', 'voting', 'showcase', 'top3', 'tombola', 'final'];

export type SceneData = {
  /* welcome: the hosts' names */ hosts?: string[];
  /* speaker */ name?: string; role?: string; line?: string; picture?: string;
  /* words */ heading?: string; lines?: string[];
  /* link */ url?: string; label?: string;
  /* product: heading (its name), line, picture, and url (shown as a QR on the wall) */
  /* a city may name the tool on the wall ("your editor" when unset) */ editor?: string;
};

/* a row of `scenes` */
export type SceneRow = { id: string; city: string; position: number; kind: SceneKind; title: string; data: SceneData; notes: string; hidden: boolean };

/* the `timer` json on the stage row. ends_at and paused_left are the plan's (the talk timer of the top 3); the rest
   are this build's, kept in the same json until the row has columns of its own:
   - qr: the QR shown over any scene;
   - deadline: the deadline the wall said when it flipped (scene 9), in ms; Start building ends there;
   - spin: the tombola's draw, started at `at` with `seed`, so every screen lands on the same entry;
   - view: what the building and voting boards show (null: they take turns);
   - show: the project the showcase is on, counted by the host's presses (null: it walks them on its own). */
export type BoardView = 'arrivals' | 'pulse' | 'top10' | 'chart' | 'moments' | 'world';
export const BOARD_VIEWS: [BoardView, string][] = [['arrivals', 'Latest'], ['pulse', 'Pulse'], ['top10', 'Top 10'], ['chart', 'Chart'], ['moments', 'Moments'], ['world', 'Cities']];
export type StageTimer = { ends_at?: number | null; paused_left?: number | null; qr?: boolean; deadline?: number | null; spin?: { at: number; seed: number } | null; view?: BoardView | null; show?: number | null };

/* the `stage` row */
export type StageRow = { city: string; scene: string; step: number; timer: StageTimer; chart_on: boolean; blank: boolean; updated_at: number; updated_by: string | null };

/* the live times on the city row, as ms (the host sets them by starting the clock); planned_start is what the pages
   show before. room_code is what the wall shows beside the QR. */
export type CityLive = {
  id: string; planned_start: number; build_min: number; vote_after: number;
  build_start: number | null; build_end: number | null; vote_end: number | null;
  room_code: string | null; submissions_paused: boolean; voting_paused: boolean;
  /* the door's two counts for Doors ("142 on the list, 61 here"); null where the backend has none */
  listed: number | null; here: number | null;
  /* the place's time zone from its row (IANA); Builder Day's cities also have theirs in the code (lib/places.ts) */
  zone?: string | null;
};

/* what a screen or a remote is told: the deck, the row, the city, and how the link is doing */
export type Link = 'local' | 'live' | 'connecting' | 'reconnecting' | 'off';
export type StageSnap = { deck: SceneRow[]; row: StageRow; city: CityLive; link: Link; screens: number; can: { drive: boolean; super: boolean } };

/* what a press asks for */
export type StageAction =
  | { t: 'next' } | { t: 'back' } | { t: 'jump'; i: number }
  | { t: 'blank' } | { t: 'qr' } | { t: 'chart' }
  | { t: 'start' } | { t: 'add'; min: number } | { t: 'close' }
  | { t: 'talk' } | { t: 'spin' }
  | { t: 'view'; v: BoardView | null } | { t: 'show'; d: -1 | 0 | 1 };
