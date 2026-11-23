/* The Realtime driver: the real wall and remote, joined through Supabase. The browser
   follows the city's `stage` and `scenes` rows on one channel, `stage:<city>`; presence on the same channel counts
   the walls, so the remote can say "Screen connected". Presses never write a table from the browser: they go to the
   server action (send), which checks the host and writes the row, and the change comes back to every screen.
   The city's clock is on `cities`, which the channel does not carry: it is read again (refresh) whenever the stage
   row changes, when the channel joins, and every ten seconds. The clock on the screens is the server's: the offset
   is measured on each refresh. While the channel is down the link says so and every key is off. */

import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { askOf } from './act';
import type { StageDriver, SendResult } from './driver';
import { deckFrom, stageFrom } from './rows';
import type { CityLive, Link, SceneRow, StageAction, StageRow, StageSnap } from './types';

type Start = { deck: SceneRow[]; row: StageRow; city: CityLive };
export type RealtimeOpts = {
  url: string; anon: string; start: Start; can: StageSnap['can']; talkMin: number;
  send: (a: StageAction) => Promise<{ ok: true; row: StageRow; city: CityLive } | { ok: false; why: string }>;
  refresh: () => Promise<{ city: CityLive; at: number } | null>;
};
const SCENE_COLS = 'id, city, position, kind, title, data, notes, hidden';

export function createRealtimeDriver(o: RealtimeOpts): StageDriver {
  const id = o.start.city.id, me = Math.random().toString(36).slice(2);
  let snap: StageSnap = { ...o.start, link: 'connecting', screens: 0, can: o.can };
  let offset = 0, walls = 0, closing = false, tracked = false, poll = 0, ending = 0;
  let sb: SupabaseClient | null = null, ch: RealtimeChannel | null = null;
  const subs = new Set<() => void>();
  const set = (s: Partial<StageSnap>) => { snap = { ...snap, ...s }; subs.forEach((f) => f()); };
  const link = (l: Link) => { if (snap.link !== l) set({ link: l }); };

  const pullCity = async () => {
    try {
      const t0 = Date.now(), r = await o.refresh(), t1 = Date.now();
      if (!r) return;
      offset = r.at - (t0 + t1) / 2;
      set({ city: r.city });
    } catch { /* the next change or the half-minute read tries again */ }
  };
  const pullDeck = async () => {
    if (!sb) return;
    const { data, error } = await sb.from('scenes').select(SCENE_COLS).eq('city', id).order('position');
    if (!error && data) set({ deck: deckFrom(data) });
  };
  const pullRow = async () => {
    if (!sb) return;
    const { data, error } = await sb.from('stage').select('*').eq('city', id).maybeSingle();
    if (!error && data) set({ row: stageFrom(data) });
  };
  const track = () => { if (ch && walls > 0 && !tracked && snap.link === 'live') { tracked = true; void ch.track({ screen: true }); } };

  /* the channel. A page that was frozen or hidden (a background tab, a laptop lid, a lost network) can come back
     with its channel dead and its presence gone; so whenever the page shows again, comes back online or resumes,
     and every ten seconds while it runs, a channel that is not joined is made again, the row, deck and times are
     read again, and a wall announces itself again. The remote then never says "no screen" about a wall that is up,
     and a wall never sits on an old scene. */
  let made = 0, sick = 0;
  const make = () => {
    if (!sb) return;
    const mine = ++made;
    const c = sb.channel('stage:' + id, { config: { presence: { key: me } } });
    c.on('postgres_changes', { event: '*', schema: 'public', table: 'stage', filter: 'city=eq.' + id }, (p) => {
      const n = p.new as Record<string, unknown> | undefined;
      if (n && n.city === id) set({ row: stageFrom(n) });
      void pullCity();
    });
    c.on('postgres_changes', { event: '*', schema: 'public', table: 'scenes', filter: 'city=eq.' + id }, () => { void pullDeck(); });
    c.on('presence', { event: 'sync' }, () => {
      const st = c.presenceState() as Record<string, { screen?: boolean }[]>;
      set({ screens: Object.values(st).filter((m) => m.some((x) => x.screen)).length });
    });
    c.subscribe((status) => {
      if (closing || mine !== made) return;
      if (status === 'SUBSCRIBED') {
        sick = 0; tracked = false; link('live'); track();
        /* catch up on whatever changed while the channel was down */
        void pullRow(); void pullDeck(); void pullCity();
      } else link('reconnecting');
    });
    ch = c;
  };
  const remake = async () => {
    const old = ch; ch = null; tracked = false; link('reconnecting');
    if (!sb) return;
    /* the old channel goes at once: a leave is sent if the socket can still carry it, but nothing waits for it */
    if (old) { old.unsubscribe().catch(() => {}); old.teardown(); sb.realtime.channels = sb.realtime.channels.filter((x) => x !== old); }
    /* the socket itself may be dead after a freeze: close it (a second at most); the new join opens a fresh one */
    await Promise.race([sb.realtime.disconnect().catch(() => {}), new Promise((r) => window.setTimeout(r, 1000))]);
    if (!closing) make();
  };
  /* after a freeze the channel can still say "joined" over a socket that is gone, so waking always joins afresh
     (at most once a second); the new join reads the row, deck and times and announces the wall */
  let woke = 0;
  const wake = () => {
    if (closing || !sb || Date.now() - woke < 1000) return;
    woke = Date.now(); void remake();
  };
  const onShow = () => { if (document.visibilityState === 'visible') wake(); };
  /* every ten seconds: catch up, and a channel that is not joined, or a wall that cannot see itself in presence,
     joins again after two checks in a row */
  const check = () => {
    if (closing || !ch) return;
    const here = walls === 0 || me in (ch.presenceState() as Record<string, unknown>);
    if (ch.state === 'joined' && here) { sick = 0; void pullRow(); void pullCity(); return; }
    if (++sick >= 2) { sick = 0; void remake(); }
  };

  /* the channel opens on first use (in the browser only) and again after close. A close is carried out a moment
     later, so a page that closes and opens again at once (React's development double mount) keeps its channel. */
  const open = () => {
    if (ending) { window.clearTimeout(ending); ending = 0; }
    if (ch || typeof window === 'undefined') return;
    closing = false;
    sb ??= createBrowserClient(o.url, o.anon);
    make();
    poll = window.setInterval(check, 10000);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', wake); window.addEventListener('pageshow', wake); document.addEventListener('resume', wake);
  };

  return {
    kind: 'realtime', talkMin: o.talkMin,
    get: () => snap,
    subscribe: (fn) => { open(); subs.add(fn); return () => { subs.delete(fn); }; },
    now: () => Date.now() + offset,
    send: async (a): Promise<SendResult> => {
      if (snap.link !== 'live') return { ok: false, why: 'The link is down. Nothing was sent.' };
      if (!snap.can.drive) return { ok: false, why: 'Only a host for this city can drive the wall.' };
      try {
        const r = await o.send(a);
        if (!r.ok) return r;
        /* the answer is the new row: show it now, Realtime brings the same to the other screens */
        set({ row: r.row, city: r.city });
        return { ok: true };
      } catch { return { ok: false, why: 'Not sent. Try again.' }; }
    },
    ask: (a, name, at) => askOf(snap.deck, snap.row, snap.city, a, name, at, Date.now() + offset),
    attach: () => {
      open(); walls++; track();
      return () => { walls--; if (walls === 0 && tracked && ch) { tracked = false; void ch.untrack(); } };
    },
    close: () => {
      if (ending || !ch) return;
      ending = window.setTimeout(() => {
        ending = 0; closing = true; window.clearInterval(poll);
        document.removeEventListener('visibilitychange', onShow);
        window.removeEventListener('online', wake); window.removeEventListener('pageshow', wake); document.removeEventListener('resume', wake);
        if (ch && sb) void sb.removeChannel(ch);
        ch = null; tracked = false;
      }, 100);
    },
  };
}
