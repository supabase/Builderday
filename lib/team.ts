/* team.ts: a team's code as people see and type it. Stored as KTR482, shown as KTR-482: three letters and three
   numbers, with no I, L, O, 0 or 1, so it can be said across a room. Typed codes are read loosely (any case, any
   separator). Pure. */

export const TEAM_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const TEAM_DIGITS = '23456789';

/* KTR482 or ktr 482 to KTR-482; anything else as typed, upper case */
export function teamCode(s: string): string {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[0-9]{3}$/.test(c) ? c.slice(0, 3) + '-' + c.slice(3) : c;
}
/* the code as the database keeps it */
export const teamKey = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const teamCodeOK = (s: string) => /^[A-Z]{3}[0-9]{3}$/.test(teamKey(s));

/* a list of names in words: "Ana", "Ana and Bo", "Ana, Bo and Chi" */
export function namesInWords(names: string[]): string {
  if (names.length < 2) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
