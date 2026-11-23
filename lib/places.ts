/* places.ts: where each city is on the globe, in degrees (latitude, longitude). The globe needs it; the model does not.
   Pure. */
export const PLACE: Record<string, [number, number]> = {
  seoul: [37.57, 126.98], singapore: [1.35, 103.82], peshawar: [34.01, 71.58], nouakchott: [18.08, -15.98], london: [51.51, -0.13],
  rosario: [-32.95, -60.64], santiago: [-33.45, -70.67], manta: [-0.95, -80.73], 'new-york': [40.71, -74.01], toronto: [43.65, -79.38],
  'san-salvador': [13.69, -89.22], austin: [30.27, -97.74], 'mexico-city': [19.43, -99.13], 'san-francisco': [37.77, -122.42],
};

/* each city's time zone (IANA). The local time is worked out from it in the browser, never from a typed offset: the
   offsets change with the clocks in some of them. */
export const ZONE: Record<string, string> = {
  seoul: 'Asia/Seoul', singapore: 'Asia/Singapore', peshawar: 'Asia/Karachi', nouakchott: 'Africa/Nouakchott', london: 'Europe/London',
  rosario: 'America/Argentina/Cordoba', santiago: 'America/Santiago', manta: 'America/Guayaquil', 'new-york': 'America/New_York', toronto: 'America/Toronto',
  'san-salvador': 'America/El_Salvador', austin: 'America/Chicago', 'mexico-city': 'America/Mexico_City', 'san-francisco': 'America/Los_Angeles',
};
/* the time in a city at ms, as 09:41 */
export function localTime(id: string, ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONE[id], hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

/* the three letters a board shows for a city */
export const CODE: Record<string, string> = {
  seoul: 'SEL', singapore: 'SIN', peshawar: 'PEW', nouakchott: 'NKC', london: 'LON', rosario: 'ROS', santiago: 'SCL',
  manta: 'MEC', 'new-york': 'NYC', toronto: 'YTO', 'san-salvador': 'SAL', austin: 'AUS', 'mexico-city': 'MEX', 'san-francisco': 'SFO',
};

/* page numbers: home 100, the cities from 101 east to west, the final 200, prizes 300, questions 400 */
export const PAGE = { home: 100, final: 200, prizes: 300, questions: 400 } as const;
export function cityPage(i: number): number { return 101 + i; }
