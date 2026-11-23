# Design

Read this before changing how anything looks, reads or moves.

## The idea

**The site is the day's sheet: one drawing at three scales.**

| Scale | Rows are | The strip spans | Page |
|---|---|---|---|
| Day | ten cities | the whole day, in UTC | `/` |
| City | projects | that city's session, in local time | `/city/<id>` |
| Project | one project | the same session | the project sheet |

Time runs across. Things hang on it in rows. One green line marks now. On the home, each city sends its three finalists on three lines, and the thirty lines join into one: the pick.

## The event

| | |
|---|---|
| Name | Supabase Builder Day where it stands alone (tab title, share text, an email's subject); Builder Day where Supabase is already beside it. The mark says BUILD. "Hackathon" stays only as the common noun ("ten city hackathons"). Every visible name reads `EVENT.name` or `EVENT.short` in `lib/day-data.ts`. |
| Format | Ten cities on one day, each at its own local time. Build for 90 minutes. Voting opens when building opens and closes 30 minutes after building ends. |
| The final | The top 3 projects by votes in each city go to the final: 30 finalists. Ties at 3rd go to the earlier entry (placeholder: the tie rule is not confirmed). |
| Winners | Each city's first place wins the city prize. Ant and Copple pick one global winner from the 30, who wins the global prize. |
| Prizes | City prize: a MacBook Neo. Global prize: $10,000. Both live in `lib/prizes.ts`. |
| Judges | Each judge has 50 votes and may put several on one project. Judge votes add to the same tally as everyone's and are marked on the row ("12 from judges"). Judges are added through an admin panel, later. |
| Who votes | Anyone with the link, after confirming an email once. Sharing a project while building is a main action. |

The family is the row, not a colour. A row is always a name, a strip and a slot, on the same grid, with the same hairlines. A 400px square cropped from the home and one from a city page should look like the same drawing.

## Rules

### The drawing

1. Cities are in time-zone order, east to west, always. They are never sorted by score.
2. One now line, full height, green. It is the only thing that moves when the page is idle.
3. Day and night are two tones only: the ground, and one lifted tone for the daylight band. The band has a soft edge.
4. Every row has a fixed height. Text never reflows when a state changes.
5. Unchanged cells do not move.
6. One typeface, two weights. The heavier weight means live.
7. Angles are 0°, 45° or 90°. Vote traces are step lines.
8. Dashed means not yet. Hatched means closed.
9. Square corners everywhere. Only true markers are round.
10. A line breaks where it meets lettering.

### Meaning

11. Green means one thing: now, the leader, first place, the pick, you, or the main action. It stays under 5% of any viewport.
12. While a city is live it announces its leader. Once voting closes it shows its three finalists, first place first. The full ranking is one click away.
13. Thirty become one through joining lines: three per city. Never a pile, a carousel or a blend.
14. First place's mark is line work: the city's seal, drawn once when voting closes. The pick's seal is the ten interlaced. Nothing else is decorated.
15. Every picture is a project picture. (Open: whether one family of line drawings, for a prize or a step, is allowed as an exception.)
16. First place and the rest share one row. First place differs by order, one label, the seal and the prize.
17. The page always has a finished state. After the day, the home is the results sheet: the pick, ten city winners, 30 finalists. The past hackathons list goes.
18. A prize is named once per page, next to the thing that wins it.
19. Judge votes are in the count and are marked. A row never hides where its votes came from.
20. The wire: every line is one real event with a time, shown in one place. It speaks only at thresholds (a city opens, entry milestones, a lead change, round numbers, entries close, finalists, the pick), at most one new line every few seconds. Never a toast, never a banner.

Rules 12, 13, 16, 17 and 23 describe the revamp's target. Until the new layouts are picked in the tuning pages and built, today's pages still show one winner per city and the cut under first place.

### The city page

21. Projects re-sort; cities never do. Rows glide when the order changes. Numbers never animate.
22. A row never moves under a pointer or a focused control. Reorders are batched. A change of leader is the one reorder that does not wait.
23. One cut line, under third: "Top 3 go to the final." Gaps are measured to the cut ("4 behind 3rd", "9 clear of 4th").
24. Two densities and no duplicates: the top ten are rows in the drawing, everyone else is a compact table that starts at 11. Your own project is always in view.
25. You vote in the row and the row answers. No toast for a vote that worked.
26. Voting opens when building opens. From the first entry, projects are ranked by votes, and a project can be voted on as soon as it is in. Before a city starts there is no ranking.
27. Every vote lands where you can see it: a tick at the now line on its row.
28. The rest of the day is always in reach: a miniature of the home drawing sits in every city page's masthead.

## Colour

All colour is OKLCH and comes from `lib/palette.ts` (the base five) and `app/globals.css` (the roles derived from them). The Tailwind colours are these roles and nothing else (`bg-ground`, `text-ink`, `text-ink-2`, `bg-ink-3`, `bg-line`, `bg-tint-1` to `-3`, `bg-day`, `bg-accent`, `text-accent-ink`, `fill-brand`), and they follow the ground. Never write a raw colour in a class or in CSS.

| Ground | Value | Ink on ground | Green for lines and labels |
|---|---|---|---|
| Night (default) | `oklch(0.19 0.0025 157.5)` | 16.0:1 | `oklch(0.762 0.154 159.4)`, the brand green, 9.2:1 |
| Paper | `oklch(0.93 0.003 250)` | 14.7:1 | `oklch(0.46 0.105 159.4)`, 5.5:1 |
| Mint | `oklch(0.93 0.052 158)` | 15.7:1 | `oklch(0.46 0.105 159.4)`, 5.6:1 |

- Every grey on night carries hue 157.5, so the neutrals are faintly green.
- The brand green is 1.6:1 on the two light grounds, so it cannot draw a line or set a label there. Lines, labels and the button use the same hue at lightness 0.46. To repair contrast, move lightness only.
- The Supabase mark keeps the brand green on every ground (`--brand`).
- Roles: `--c-ink` text and strokes, `--c-ink-2` secondary text, `--c-ink-3` lines only, `--c-line` hairlines, `--c-day` the daylight band, `--c-accent` green.

## Type

- Geist 400, 500 and 600, and Geist Mono 500. No other weights: they would be synthesised.
- Display sizes are `--t-d48`, `--t-d72`, `--t-d96` and `--t-d128`, each with its own tracking. City names on the home and the city name on its own page are the largest things on their pages.
- Mono is only for small caps labels at `--t-label` (10px). Write the source in sentence case; CSS uppercases it.
- Figures that change use tabular numerals.

## Space and lines

- Space is on a 4px base: 4, 8, 12, 16, 24, 32, 48, 72.
- Layout is a 12-column grid. Home rows split 5, 5 and 2 columns (name, strip, slot). City rows split 4, 5 and 3.
- Lines are `--line-hair`, `--line-thin` and `--line-thick`. No shadows, no blur, no gradients except the daylight band's edge.
- The spacing utilities run on the same 4px base (`p-4` is 16px). The recurring marks are utilities of their own in `app/globals.css`: `type-label`, `rule-t`, `rule-b`, `edge-line`, `edge-ink`, `dash-frame`, `knockout`, `underline-link`, `stretched`.

## Motion

Every duration and curve is a token in `app/globals.css`, and the utilities name them: `duration-hover`, `duration-panel`, `ease-move` (`ease-out` is the brand curve; the plain CSS keyword is `ease-[ease-out]`). Animate transform and opacity only. Every motion has a reduced-motion version: the finished state.

The values live in `saved/motion.config.json` and are tuned at `/lab/motion`; the root layout writes them over the fallbacks in `app/globals.css`. The saved values are still the starting ones until they are settled there.

| Moment | How often | Spec |
|---|---|---|
| Arrival | Once per session | The pen draws the strip, then rows land in order, inside `--dur-scene`. |
| Now line | Always | Real time, linear. |
| A state changes | A few times | The label swaps in `--dur-panel`. Nothing else in the row moves. |
| Counts | Constantly | Never animated. |
| Press | Often | The button scales to `--press` in `--dur-press`. |
| Hover | Often | Colours in `--dur-hover`; a row's wash in `--dur-wash` (0 is a snap). The home's preview grows from `--preview-scale` and swaps its picture in `--dur-press`. Pointer devices only. |
| Home to city | Often | The city name and its bar are shared elements, `--dur-vt`, `--ease-move`. The names hug their letters so they scale as one word; only the plain bar travels, never the row's time label. |
| Reorder | Every few seconds at most | Rows glide, `--dur-panel`, `--ease-move`. |
| Open a sheet | Often | `--dur-panel`, `--ease-drawer`. Closing is `--dur-panel-exit`, `--ease-exit`. The project sheet comes from `--sheet-from` (its own width, or a nudge with a fade); the backdrop keeps the same timing. |
| A wire line arrives | A few times an hour | The list moves down one line in `--dur-slide`; the new line is lit for `--dur-flash`. Not on first draw, not under the pointer. |
| Keyboard | Repeated | Snap. No animation. |
| Finalists land, voting closes | Once per city | The three lines draw left to right, `--stagger` apart, inside `--dur-draw`; the names fade in with them. Only when it happens while the page is open. |
| The pick | Once, ever | When the join comes into view: the place underlines, the line draws green, the join fills, then the pick, inside `--dur-reveal`. |

## Words

- Short declaratives with a period. Say what happened and what it means.
- Buttons name the outcome. Errors say how to fix it.
- The event is "Supabase Builder Day" ("Builder Day" beside the Supabase mark). "Hackathon" is only the common noun. An entry is a project as soon as it is in, since voting is open from the start.
- Tense follows the phase. After voting closes, nothing says "to go" or "win".
- Times are 24-hour. The home strip is UTC; a city page is local, with UTC said once per block.
- Real characters: ’ “ ” … – ×. US spelling.

## Still open

- The ground: night, paper or mint.
- The ten cities and the date. Whether the day is tied to Launch Week (no copy says "Launch Week" until it is).
- The global prize, and whether 2nd and 3rd in a city get anything.
- Judges: 50 per city or for the whole day, whether a judge votes in more than one city, and in which window.
- The tie rule at 3rd place.
- What the final is: only the founders' pick, or do finalists present something.
- Where a project's picture comes from: an upload, or a capture of the demo link.
- How many entries a city has, venue names, and whether entries are solo.
- Drawings: allowed as an exception to rule 15, or not.
- The official Supabase mark: the masthead's is a redrawn stand-in.
- The join on the home is a thin line at the right edge. It is the signature and wants more weight; the revamp's round 3 gives it room.
