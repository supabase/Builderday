/* time.ts: a moment in a city's own clock, as the emails and the desk say it. Pure. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* "09:00 on 10 December", in the city's time (offset in minutes from UTC) */
export function whenLocal(iso: string | number | Date, offset: number): string {
  const d = new Date(new Date(iso).getTime() + offset * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' on ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
}

/* "09:00" in the city's time */
export function hhmmLocal(iso: string | number | Date, offset: number): string {
  const d = new Date(new Date(iso).getTime() + offset * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
