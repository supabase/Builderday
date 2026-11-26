# Supabase Builder Day

The page for Supabase Builder Day: fourteen city hackathons on one day, 10 December 2026, each from its own Luma event's start time. It is one screen: the city wheel, opening on the visitor's nearest city, with each city's local session time, its state on Luma and a Register link to its Luma event.

It is a Next.js app (App Router, TypeScript, Tailwind CSS 4), served under `/builderday` on supabase.com.

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

## Settings

`env.example` lists them. `LUMA_API_KEY` gives each city its state from its Luma event (Open, Filling up, Waiting list, Sold out), checked at most every five minutes; without it every city shows Open. `NEXT_PUBLIC_BASE_PATH` is `/builderday` on the host and empty on the dev server.

Parameters: `?city=` opens on a city by its place in the list (from 0), `?at=lat,lon` tries a visitor's position, `?gl=0` draws without WebGL.

## Layout of the repository

| Path | Holds |
|---|---|
| `app/` | The page, the layout, the share image, robots and the sitemap. `globals.css` holds the design tokens. |
| `components/wheel/` | The city wheel: the engine, the text globe, the mark and the Register ticket. |
| `components/preview/` | The page around the wheel: the header, the arrival, the city facts. |
| `components/screen/` | The screen look over the page: the lines, grain and corners. |
| `lib/luma.ts` | Each city's Luma event (its page and id). |
| `lib/server/signups.ts` | Each city's state, read from Luma. |
| `lib/day-data.ts` | The event and its cities, with their start times. |
| `saved/` | The saved looks the page reads. |
