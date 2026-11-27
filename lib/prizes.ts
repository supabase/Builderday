/* prizes.ts: what the day gives away (the prize sheet of 2026-11-25, final list of 2026-11-26).

   City: the top 3 in each city are its finalists and all go on to the global round. First place wins the city:
   a Meta Quest 3, $300 in Supabase credits and a swag box. The other two finalists get $150 in credits and a swag
   box each. There is no 2nd or 3rd prize in a city.
   Global: the Supabase team picks 1st, 2nd and 3rd from all the finalists, announced at the end of Launch Week.

   Specs and prices are the configurations those prices buy on apple.com and meta.com (checked 2026-11-26). No page prints a price (owner, 2026-11-26, reversing "add dollar amount"), and never a total; `price` stays in the sheet. Every page, drawing, email and editor answer reads
   from here. Pure. */

export type Prize = {
  /* the thing, as it is called on the page ("MacBook Pro"); null when the prize is credits and swag only */
  thing: string | null;
  /* the model, small under the name ("14-inch, M6, 24GB, 1TB") */
  spec: string | null;
  /* the price of the thing in US dollars, printed after its spec; null for credits and swag */
  price?: number | null;
  /* Supabase credits, in US dollars */
  credits: number;
  swag: boolean;
};
export type GlobalPrize = Prize & { place: 1 | 2 | 3 };

export const PRIZE_SHEET = {
  city: {
    winner: { thing: 'Meta Quest 3', spec: '512GB', price: 599, credits: 300, swag: true } as Prize,
    finalist: { thing: null, spec: null, credits: 150, swag: true } as Prize,
  },
  global: [
    { place: 1, thing: 'MacBook Pro', spec: '14-inch, M6, 24GB, 1TB', price: 2199, credits: 1000, swag: false },
    { place: 2, thing: 'Mac mini', spec: 'M6, 16GB, 512GB', price: 1099, credits: 750, swag: false },
    { place: 3, thing: 'MacBook Neo', spec: '13-inch, A18 Pro, 8GB, 256GB', price: 699, credits: 500, swag: false },
  ] as GlobalPrize[],
  picker: 'the Supabase team',
  announce: 'at the end of Launch Week',
} as const;

/* the spec as printed (owner, 2026-11-26: no prices shown; `price` stays in the sheet, unprinted) */
export function specLine(p: Prize): string | null {
  return p.spec || null;
}
/* "$1,000 in Supabase credits" */
export function credits(p: Prize): string { return '$' + p.credits.toLocaleString('en-US') + ' in Supabase credits'; }
/* everything in a prize as one line: "Meta Quest 3, $300 in Supabase credits and a swag box" */
export function prizeLine(p: Prize): string {
  const parts = [p.thing, credits(p)].filter(Boolean) as string[];
  return parts.join(', ') + (p.swag ? ' and a swag box' : '');
}

/* The short forms older parts read: the one thing a city's first place wins, and the global 1st. */
export type PrizeWord = { what: string | null; confirmed: boolean };
export const PRIZES: { city: PrizeWord; global: PrizeWord } = {
  city: { what: 'a Meta Quest 3', confirmed: true },
  global: { what: 'a MacBook Pro', confirmed: true },
};

/* the city prize as a line: at the cut, beside first place */
export function cityPrize(city?: string, done?: boolean): string {
  return '1st' + (city ? ' in ' + city : '') + (done ? ' won ' : ' wins ') + PRIZES.city.what + '.';
}
/* the global prizes as a line: at the join */
export function globalPrize(done?: boolean): string {
  const g = PRIZE_SHEET.global;
  return done ? 'The global 1st won ' + PRIZES.global.what + '.' : 'The global 1st, 2nd and 3rd win a ' + g[0].thing + ', a ' + g[1].thing + ' and a ' + g[2].thing + '.';
}
/* short forms for a fact cell: a label and a value */
export function prizeFacts(): [string, string][] {
  return [['City winner', PRIZE_SHEET.city.winner.thing!], ['Global 1st', PRIZE_SHEET.global[0].thing!]];
}
