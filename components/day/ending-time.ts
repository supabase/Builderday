/* A city's opening in the visitor's own time, for the ending's cells: "17:00 your time", with the date when it falls on
   another day where the visitor is, and "The same where you are" when nothing differs. `tz` is the visitor's time zone
   (the browser's when left out), so the words can be checked for any zone without a browser. */
export function yourTime(ms: number, cityZone: string, tz?: string): string {
  const f = (zone: string | undefined, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...o }).format(ms);
  const hm: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, dm: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const here = f(tz, hm), there = f(cityZone, hm), dayHere = f(tz, dm), dayThere = f(cityZone, dm);
  if (here === there && dayHere === dayThere) return 'The same where you are';
  return dayHere === dayThere ? `${here} your time` : `${here} on ${dayHere} your time`;
}

/* the time in a zone at ms, as 09:00 */
export function atZone(ms: number, zone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}
