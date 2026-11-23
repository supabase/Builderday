/* A driver joins a wall and a remote. It holds the deck, the stage row and the city's times, takes presses, and tells
   every screen what changed. Two exist:
   - local (here): everything in the page, shared with the page's other tabs through a BroadcastChannel, so the lab's
     wall and remote, or two tabs of the lab, drive each other with no backend;
   - realtime (realtime.ts): the `stage`, `scenes` and `cities` rows in Supabase, followed through Realtime.
   The wall and the remote only ever see a StageSnap and call send(). */

import { act, askOf } from './act';
import type { CityLive, Link, SceneRow, StageAction, StageRow, StageSnap } from './types';

export type SendResult = { ok: true } | { ok: false; why: string };
export type StageDriver = {
  get: () => StageSnap;
  subscribe: (fn: () => void) => () => void;
  /* a press; asks nothing (the remote asks first, through askOf) */
  send: (a: StageAction) => Promise<SendResult>;
  /* the time on this driver's clock, ms (the lab can hold it still) */
  now: () => number;
  /* a wall says it is showing, so the remote can say "Screen connected" */
  attach: () => () => void;
  /* the question a press asks first, or null */
  ask: (a: StageAction, cityName: string, at: (ms: number) => string) => string | null;
  talkMin: number;
  kind: 'local' | 'realtime';
  close: () => void;
};

export type Clock = { now: () => number };
export const realClock: Clock = { now: () => Date.now() };

export type LocalDriver = StageDriver & {
  setCity: (c: Partial<CityLive>) => void;
  setDeck: (d: SceneRow[]) => void;
  setLink: (l: Link) => void;
  setRow: (r: Partial<StageRow>) => void;
  setCan: (can: StageSnap['can']) => void;
};

type Msg = { from: string; snap?: Pick<StageSnap, 'row' | 'city' | 'deck'>; hello?: boolean; screen?: number };

export function createLocalDriver(o: { deck: SceneRow[]; row: StageRow; city: CityLive; clock?: Clock; talkMin?: number; channel?: string }): LocalDriver {
  const clock = o.clock ?? realClock, me = Math.random().toString(36).slice(2);
  let snap: StageSnap = { deck: o.deck, row: o.row, city: o.city, link: 'local', screens: 0, can: { drive: true, super: true } };
  let mine = 0; const theirs = new Map<string, number>();
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  /* the channel opens on first use and again after close (React's development double mount closes it once) */
  let bc: BroadcastChannel | null = null;
  const post = (m: Msg) => { try { bc?.postMessage(m); } catch { /* closed */ } };
  const open = () => {
    if (bc || !o.channel || typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel(o.channel);
    bc.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data; if (!m || m.from === me) return;
      if (m.screen !== undefined) { theirs.set(m.from, m.screen); set({}, false); }
      if (m.snap) set({ ...m.snap }, false);
      if (m.hello) post({ from: me, snap: { row: snap.row, city: snap.city, deck: snap.deck }, screen: mine });
    };
    post({ from: me, hello: true });
  };
  const screens = () => mine + [...theirs.values()].reduce((a, b) => a + b, 0);
  const set = (s: Partial<StageSnap>, share = true) => {
    snap = { ...snap, ...s, screens: screens() };
    if (share) post({ from: me, snap: { row: snap.row, city: snap.city, deck: snap.deck } });
    emit();
  };
  const talkMin = o.talkMin ?? 2;
  return {
    kind: 'local', talkMin,
    get: () => snap,
    subscribe: (fn) => { open(); subs.add(fn); return () => { subs.delete(fn); }; },
    now: () => clock.now(),
    send: async (a) => {
      if (snap.link !== 'local') return { ok: false, why: 'The link is down. Nothing was sent.' };
      const r = act(snap.deck, snap.row, snap.city, a, clock.now(), 'lab', talkMin);
      if (!r) return { ok: false, why: 'Nothing to do here.' };
      set({ row: r.row, city: r.city ? { ...snap.city, ...r.city } : snap.city });
      return { ok: true };
    },
    ask: (a, name, at) => askOf(snap.deck, snap.row, snap.city, a, name, at, clock.now()),
    attach: () => {
      open(); mine++; set({}, false); post({ from: me, screen: mine });
      return () => { mine--; set({}, false); post({ from: me, screen: mine }); };
    },
    setCity: (c) => set({ city: { ...snap.city, ...c } }),
    setDeck: (d) => set({ deck: d }),
    setRow: (r) => set({ row: { ...snap.row, ...r } }),
    setCan: (can) => set({ can }, false),
    /* the lab can drop the link, to see what the remote does then */
    setLink: (l) => set({ link: l }, false),
    close: () => { bc?.close(); bc = null; theirs.clear(); },
  };
}
