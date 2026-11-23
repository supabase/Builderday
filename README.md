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
| `/lab/home` | Tuning page for the new home. Round 1 (`?round=first`): the first viewport, today's home and three new directions behind one picker. Round 3 (`?round=final`, the default): below the picked Sheet, today's home below the fold and three ways to show the final and the prizes. Save writes `saved/lab-home.config.json`, which the home reads. |
| `/lab/city` | Tuning page for the new city page: today's sheet and three new directions, three ways to open a project, and the builder, judge and share states. Save writes `saved/lab-city.config.json`. |
| `/lab/day` | Tuning page for the earlier home (the Timetable). Four layouts and every knob. Save writes `saved/day.config.json`. |
| `/lab/city-sheet` | Tuning page for today's city page. Save writes `saved/city.config.json`. |
| `/lab/seal` | The generator for the city seals. Save writes `saved/seal.config.json`. |
| `/lab/forms` | Sign-in, submit, the voting email step, remind me and share, one button each. |
| `/lab/motion` | Every motion value on a control: press, hover, the project sheet, home to city, the wire, finalists landing and the pick. The home's moments play on the real parts; the city page runs in a frame. Save writes `saved/motion.config.json`, which the root layout turns into the motion tokens on every page. |
| `/lab/wheel` | The city wheel, the preview home until the day. `?dir=study` is the study as it was made, with its own facts; `base`, `wheel`, `rail`, `sheet` and `sheet2` are the study's layout with our facts, a tagline only, a facts rail, and two "How it works" sheets (`sheet2` is `/preview`). `?city=` opens on a city by its place in the list, `?gl=0` draws the flat fallback. Every number of the wheel, the glass and the screen is a knob. Save writes `saved/wheel.config.json`. |
| `/lab/screen` | The screen look (the lines, the colour edges, the grain, the dark corners, the lens globe) put on the real home and city page in a frame, at three depths: big type only, everything, or none. `?page=home`, `city` or `project`. The meter reads the contrast of every piece of small text with the lines on. Save writes `saved/screen.config.json`. |
| `/lab/parts` | Each part of the day pages on its own, fed by the model at a moment of the day: the header row with page numbers, the announcement line (flipper, crawl or static rail), split-flap text, the segment countdown, the six state chips, the change flash, the test cards (click one for a new card), the boarding pass, the corner bug and the globe as the day's clock. `?moment=`, `?still=1`, `?face=pixel`. Save writes `saved/parts.config.json`. |
| `/lab/explain` | The drawings for how it works and the prizes, as a generator: every scene at full size (click one for a new seed), a mode per scene and every knob. Save writes `saved/explain.config.json`. |
| `/lab/day-home` | The home on the day, drawn by the same component as `/`: today's home on the screen kit, then the departures board, the control wall, and the board with a lane per row. `?dir=base`, `board`, `wall` or `strips`; `?moment=` or `?m=` (a minute); `?worst=0`; `?still=1`. Save writes `saved/day-home.config.json`. |
| `/lab/day-city` | A city's page on the day, drawn by the same component as `/city/<id>`: today's Tower on the screen kit, then the board with the pylon, the scope rows, and the wall of the top three. `?dir=base`, `board`, `scope` or `wall`; `?city=`; `?moment=before`, `build`, `vote`, `last`, `closed` or `picked`. Save writes `saved/day-city.config.json`. |

The real pages read the three files in `saved/`. To change the look, tune it in a lab, press Save, and reload the page. Save writes the file (and a dated copy, which git ignores) only on the development server, through `/api/save`. On a deployed site it copies the config to the clipboard instead.

The labs are not linked from the real pages and are not indexed.

Every real page takes `?admin`: the same panel as its lab (the moments, the clock, the look) and Save. `\\` hides the panel.

The old addresses still work: `/index.html` goes to `/`, `/city.html?city=tokyo&moment=vote` goes to `/city/tokyo?moment=vote`, and `/lab/*-lab.html` goes to `/lab/*` (`/lab/city-lab.html` to `/lab/city-sheet`).

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
| `app/` | Routes only: the home, `city/[city]`, the labs, `api/save`, the layout and `globals.css` (every design token, and the Tailwind theme that reads them). |
| `components/day/` | The home and the city page on the day (`day-home.tsx`, `day-city.tsx`), their parts, the ranking pictures and views, and the drawings of how it works and the prizes (`scope.ts`, `tube.tsx`, `explain.tsx`). |
| `components/preview/` | The preview home: the wheel's facts and the sheet. |
| `components/admin/` | The panel the labs and `?admin` share: knobs, moments, Save and the contrast meter. |
| `components/home/`, `components/city/` | The earlier home and city page, kept for the labs that compare against them. Styles are utilities in the markup; each folder's CSS (`day.css`, `city.css`) holds only what utilities cannot say well. |
| `components/forms/` | Sign-in, submit, voting email, remind me, share. `store.ts` is the one place the browser storage lives, so an API can replace it. |
| `components/seal/`, `components/pictures/`, `components/ground/`, `components/shared/` | Seals, project pictures, the ground set before first paint, the parts both pages draw (`page-parts.tsx`) and every view transition (`view-transitions.css`). |
| `components/lab/` | The tuning pages, with the layouts that were tried and not chosen. The real pages import nothing from here. |
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
