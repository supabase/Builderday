'use client';
import { meNow, useFormsState } from './store';
import { IN_ROOM_NEXT, notListedAnywhere } from '@/lib/event/rule';

/* The line under a city page's header, for a signed-in person on a site with the backend: where they are on the list
   (signing out is in the account sheet, opened from the header). Before the day it also says when
   building starts; in another city's page it points to their own. Nothing for anyone not signed in, and nothing on a
   site without the backend (the stand-in has no lists). */
export function YouLine({ city, cityName, date, start, state }: { city: string; cityName: string; date: string; start: string; state: 'next' | 'build' | 'vote' | 'done' }) {
  const s = useFormsState(), me = meNow();
  if (!s.signedIn || !me) return null;
  const pass = me.pass, here = !!pass && pass.city === city;
  let text: React.ReactNode;
  if (here) text = <>You are on the list for <b>{cityName}</b>{state === 'next' ? <>, {date}. Building starts <b>{start}</b>.</> : state === 'build' ? (me.entry ? <>. Your entry: <b>{me.entry.name}</b>.</> : pass.checkedIn ? '. Building is on: submit any time before the end.' : '. ' + IN_ROOM_NEXT) : '.'}</>;
  else if (pass) text = <>You are on the list for <a className="ev-you-a" href={'/city/' + pass.city}>{pass.cityName}</a>. You can vote here; you submit in {pass.cityName}.</>;
  else text = <>Signed in as <b>{me.email}</b>. {notListedAnywhere}</>;
  return (
    <p className="ev-you">
      <span className="ev-you-t" role="status">{text}</span>
    </p>
  );
}
