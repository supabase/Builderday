# Supabase Builder Day

The site for Supabase Builder Day: fourteen city hackathons on one day, 10 December 2026, each from its own Luma event's start time (18:00 local in most). Each city builds for 90 minutes and votes while it builds, with 30 more minutes of voting after building closes. The top 3 projects by votes in each city go to the final, so there are 42 finalists. Each city's first place wins the city prize, and Ant and Copple pick one global winner from the 42.

- **Who votes:** anyone with the link, after confirming an email once.
- **Judges:** each judge has 50 votes and may put several on one project. Their votes count in the same tally and are marked on the row ("12 from judges").
- **Prizes:** a MacBook Neo for each city's first place and $10,000 for the pick. They are kept in `lib/prizes.ts`.

It is a Next.js app (App Router, TypeScript, Tailwind CSS 4). With the Supabase variables set (`env.example`) it runs on the backend in `supabase/`; without them every page draws seeded sample data.

## Run it

```bash
npm install
npm run dev
```

Then open `http://localhost:4320/`.

Before a change goes in, all three must pass:

```bash
npm run lint
npm run typecheck
npm run build
```

## Pages

| Route | What it is |
|---|---|
| `/preview` | The preview home, until the day: the city wheel with our facts, opening on the visitor's nearest city by time zone, each city with its countdown and a link to register on Luma. "How it works" opens a sheet with the day, the drawings of how it works and the prizes, and the questions. Its look is `saved/wheel.config.json`; the drawings are `saved/explain.config.json`. |
| `/` | The home on the day: the header row and the wire, the next city and its countdown, the departures board of the ten cities (state, leader and picture, votes, entries, what comes next), the final as thirty cells, how it works and the prizes. Its look comes from `saved/day-home.config.json` and `saved/parts.config.json`; the schedule and the seed from `saved/day.config.json`, which the city pages read too. |
| `/city/berlin` | One city on the day: its countdown and what to do now (Remind me, Submit your project, Vote below), the ranking with pictures beside the pylon of the top ten (ranked, random or newest, search, a list or the votes over time), how it works and the prizes. Votes, reminders and entries go through `components/forms/`. Its look comes from `saved/day-city.config.json`. An unknown city is a 404. |
| `/city/berlin/p/<slug>` | The city page with that project open in its sheet, with its own title, description and share image. Opening a project from the list pushes this address, so Back closes it. `/city/berlin?p=<slug>` redirects here. An unknown project is a 404. |

The real pages read the files in `saved/`. To change the look, open the page with `?admin`, press Save, and reload the page. Save writes the file (and a dated copy, which git ignores) only on the development server, through `/api/save`. On a deployed site it copies the config to the clipboard instead.

Every real page takes `?admin`: a panel with the moments, the clock, the look and Save. `\\` hides the panel.

The old addresses still work: `/index.html` goes to `/`, `/city.html?city=tokyo&moment=vote` goes to `/city/tokyo?moment=vote`.

## Seeing every state

The pages follow the real clock. To look at another moment, add parameters to the URL. They carry across links between the home and the city pages.

| Parameter | Values |
|---|---|
| `moment` on the home | `announced`, `first`, `mid`, `closed`, `picked`, `archived` |
| `moment` on a city page | `before`, `build`, `vote`, `last`, `closed`, `picked` |
| `m` | A minute of the day, in UTC minutes from midnight on the day |
| `still` | `1` stops the clock |
| `worst` | `1` draws the stress content: long names, a city with no entries |
| `admin` | Shows the panel |
| `city` on `/preview` | `0` to `9`: the city the wheel opens on |
| `p` on a city page | A project's slug. Opens that project. |

Both pages are rendered on each request because they start from these parameters; the city ids are fixed, so any other id is a 404.

## Checking a change

Take a still at desktop and phone size and read it before calling a change done. Run these with `npm run dev` going.

```bash
node tools/still.mjs "http://localhost:4320/?moment=mid" shots/home-mid.png 3000 "" 100
```

```bash
W=390 H=844 MOBILE=1 node tools/still.mjs "http://localhost:4320/city/berlin?moment=vote" shots/city-vote-390.png 3000 "" 100
```

Check the six moments of each page, on the ground in use, at 1440×900 and 390×844.

The home and every city page read one model, so they must agree. This checks three cities at three moments (top 3, vote counts, judge votes):

```bash
node tools/agree.mjs
```

## How styles are written

Tailwind CSS 4, set up in CSS (`app/globals.css`, through `postcss.config.mjs`). The default theme is cleared: the only colours, sizes, curves and durations are the site's own tokens, so `bg-ground`, `text-ink-2`, `text-label`, `tracking-d72`, `duration-panel` and `ease-move` all read `globals.css`, and a class like `bg-blue-500` does not exist.

- Write utilities in the markup. Use `clsx` for classes that depend on state, and name a class string that recurs as a constant next to the component that owns it.
- `phone:` and `tablet:` are container queries on the page frame (`FRAME` in `components/shared/page-parts.tsx`); `phone-window:` is the window, for sheets outside the frame. `hover:` only fires on a fine pointer.
- Plain CSS stays where utilities would be hard to read: grid templates driven by custom properties, `:has()` and sibling selectors, keyframes, `::backdrop`, hatching, dialog shells, controls with many states, and class names that scripts read. Keep it short, next to its area, inside `@layer components`, and on the same tokens.
- Each property of an element comes from one place: utilities or that CSS, never both.

## Layout of the repository

| Path | Holds |
|---|---|
| `app/` | Routes only: the home, `city/[city]`, `api/save`, the layout and `globals.css` (every design token, and the Tailwind theme that reads them). |
| `components/day/` | The home and the city page on the day (`day-home.tsx`, `day-city.tsx`), their parts, the ranking pictures and views, and the drawings of how it works and the prizes (`scope.ts`, `tube.tsx`, `explain.tsx`). |
| `components/preview/` | The preview home: the wheel's facts and the sheet. |
| `components/admin/` | The `?admin` panel: knobs, moments, Save and the contrast meter. |
| `components/home/` | Parts of the earlier home that the day pages still draw (the final, the prize names, the timetable). Styles are utilities in the markup; its CSS (`day.css`, `sheet.css`) holds only what utilities cannot say well. |
| `components/forms/` | Sign-in, submit, voting email, remind me, share. `store.ts` is the one place the browser storage lives, so an API can replace it. |
| `components/seal/`, `components/pictures/`, `components/ground/`, `components/shared/` | Seals, project pictures, the ground set before first paint, the parts both pages draw (`page-parts.tsx`) and every view transition (`view-transitions.css`). |
| `components/wheel/` | The city wheel: the engine (the turning names, the picture, the loop that stops at rest and when hidden), the glass pass in WebGL with a flat fallback, the click sound and the mark. |
| `components/screen/` | The screen kit: the lines, grain and corners as fixed layers, the lines and colour edges on big type, table cells, and one canvas that draws every small globe on a page. Also the state chips and the change flash. |
| `components/board/` | The parts of the day pages: the header row, the announcement line, split-flap text, the segment countdown, test cards, the boarding pass, the bug, the globe as the day's clock, the day's clock store, and `day-model.ts`, which reads the home's and a city's world for them. Their look comes from `saved/parts.config.json`. |
| `lib/` | Plain typed modules with no React: the clock, the sample data, the home and city models, the palette, the seal drawing, the form checks. |
| `lib/palette.ts` | The three grounds, written once as OKLCH. |
| `lib/day-data.ts`, `lib/data.ts` | The sample data: cities, schedules, projects, arrivals, votes, judge votes, the top 3, past events, questions. |
| `lib/wire.ts` | The wire: the day's events (a city opens, entry milestones, lead changes, entries close, finalists, the pick), each with a minute and one sentence, and the live sentence. |
| `lib/prizes.ts` | The prizes: $10,000 for the pick, a MacBook Neo for first place in each city. |
| `lib/pictures.ts` | Draws the sample project pictures. One function returns a project's picture URL, so real image URLs can replace it. |
| `saved/` | The saved configs the pages read. |
| `proxy.ts` | Sends the old `/city.html?city=` address to `/city/<id>`. |
| `tools/still.mjs` | The screenshot tool. |
| `tools/bake-land.mjs` | Draws the land of the wheel's globe once, from the study's land points, into `public/wheel/land.png`. |
| `DESIGN.md` | The idea, the rules and the tokens. Read it before changing how anything looks or moves. |

## Not real yet

- **Without the backend**, projects, votes, judge votes and pictures are generated from a seed. With it, hosts and judges are added at the desk (`/desk`).
- **Venues.** The Luma events give only the city, so no venue is named yet.
- **The Supabase mark** in the masthead is a redrawn stand-in. Replace it with the official asset.
- **Past hackathons** list three events and no winners.
