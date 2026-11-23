/* look.ts: how the emails look. Saved in saved/email.config.json, tuned at /lab/email. Pure, so the server (which sends)
   and the lab (which shows) clamp the same way.

   The rules (never knobs):
   - The picture is characters, never an image: the text globe's hatch `::|` and its dots, set as live monospace text.
     It shows with images off, needs no hosting, and is the same stuff the site and the shirt are made of.
   - Every word a person needs (the code, the city, the time, the link) is also real text, outside the picture. The
     picture is aria-hidden; a screen reader and a copy-paste never meet a hatch.
   - The wheel's neutral ground and white ink; green for one thing only: the city's [+] mark and the main action.
   - Square corners and hairlines, as on the site. One link a mail, said twice (the action, then the address).
   - The code goes in the subject first, as it does now, so it reads from the notification without opening the mail. */

export type EmailMode = 'pass' | 'board' | 'globe' | 'plain';
/* none: the black ticket as on night, with no background around it, so it sits on the inbox's own white */
export type EmailGround = 'none' | 'night' | 'paper';
export type EmailHatch = 'globe' | 'dense' | 'dots';
export type EmailButton = 'solid' | 'bracket' | 'outline';
export type EmailLook = {
  mode: EmailMode; ground: EmailGround; seed: number;
  /* the picture: its width in columns; the type size of a column at 600 px and on a phone; line height over size */
  cols: number; size: number; sizePhone: number; leading: number;
  /* the word in 5 by 7 dot matrix: columns and rows a dot takes (the width steps down by itself to fit) */
  dotW: number; dotH: number;
  hatch: EmailHatch;
  /* the print's offset shadow in cells (0: none) and its ink; the dotted grid behind (a dot every n cells, 0: none) */
  shadow: number; shadowInk: number; grid: number; gridInk: number;
  /* the text globe facing the person's city: on, its rows; the city's green [+] */
  globe: boolean; globeRows: number; mark: boolean;
  /* the ticket's perforation between the stub and the body (pass) */
  perf: boolean;
  /* the main action: a green block, mono in brackets, or a hairline box */
  button: EmailButton;
  /* Geist from Google Fonts for the clients that load web fonts (Apple Mail); the rest use the system sans */
  webfont: boolean;
};
export const EMAIL_MODES: EmailMode[] = ['pass', 'board', 'globe', 'plain'];
export const EMAIL_GROUNDS: EmailGround[] = ['none', 'night', 'paper'];
export const EMAIL_HATCHES: EmailHatch[] = ['globe', 'dense', 'dots'];
export const EMAIL_BUTTONS: EmailButton[] = ['solid', 'bracket', 'outline'];
export const EMAIL_DEF: EmailLook = {
  mode: 'pass', ground: 'none', seed: 7,
  cols: 72, size: 11, sizePhone: 7, leading: 1.15,
  dotW: 2, dotH: 1, hatch: 'globe',
  shadow: 1, shadowInk: 0.3, grid: 4, gridInk: 0.22,
  globe: true, globeRows: 11, mark: true,
  perf: true, button: 'solid', webfont: true,
};
export const EMAIL_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], cols: [40, 80, 1], size: [9, 16, 0.5], sizePhone: [6, 11, 0.5], leading: [1, 1.4, 0.01],
  dotW: [1, 3, 1], dotH: [1, 2, 1],
  shadow: [0, 2, 1], shadowInk: [0, 0.6, 0.02], grid: [0, 8, 1], gridInk: [0, 0.5, 0.02],
  globeRows: [7, 17, 2],
};
export function clampEmail(s: Partial<EmailLook>): EmailLook {
  const o = { ...EMAIL_DEF, ...s } as EmailLook & Record<string, unknown>;
  if (!EMAIL_MODES.includes(o.mode)) o.mode = EMAIL_DEF.mode;
  if (!EMAIL_GROUNDS.includes(o.ground)) o.ground = EMAIL_DEF.ground;
  if (!EMAIL_HATCHES.includes(o.hatch)) o.hatch = EMAIL_DEF.hatch;
  if (!EMAIL_BUTTONS.includes(o.button)) o.button = EMAIL_DEF.button;
  for (const [k, [a, b]] of Object.entries(EMAIL_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : EMAIL_DEF[k as keyof EmailLook]; }
  for (const k of ['seed', 'cols', 'dotW', 'dotH', 'shadow', 'grid'] as const) o[k] = Math.round(o[k]);
  o.globeRows = Math.round(o.globeRows) | 1;
  o.globe = !!o.globe; o.mark = !!o.mark; o.perf = !!o.perf; o.webfont = !!o.webfont;
  return o;
}

/* the grounds in sRGB hex (mail clients know no oklch), from lib/palette.ts: night and paper; none is the page
   around the black ticket (its ground is never painted; its inks are the foot's). green: the mark and green text; fill: the
   main action's block and onFill its words */
type Inks = { ground: string; card: string; ink: string; ink2: string; ink3: string; line: string; green: string; fill: string; onFill: string };
export const EMAIL_INK: Record<EmailGround, Inks> = {
  none: { ground: '#ffffff', card: '#ffffff', ink: '#1d1e20', ink2: '#45474a', ink3: '#6b6d70', line: '#d4d6d9', green: '#006942', fill: '#3ecf8e', onFill: '#07180f' },
  night: { ground: '#131413', card: '#1b1c1b', ink: '#edefee', ink2: '#b9bbba', ink3: '#8a8c8b', line: '#3a3b3a', green: '#3ecf8e', fill: '#3ecf8e', onFill: '#07180f' },
  paper: { ground: '#e6e8ea', card: '#f1f2f3', ink: '#1d1e20', ink2: '#45474a', ink3: '#6b6d70', line: '#c3c5c8', green: '#006942', fill: '#006942', onFill: '#f4faf6' },
};
