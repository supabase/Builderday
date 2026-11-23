// clock.mjs: put one city's live clock at a moment, so the real pages can be checked on local data at each of the six
// moments the labs use. Local stack only.
//   node supabase/scripts/clock.mjs berlin build      (before | build | vote | last | closed | picked | reset)
// The moments match the city page's: before = 30 min to the start, build = 45% through building, vote = 40% through
// the last votes, last = 2 min to the end, closed = after the end, picked = long after. reset clears the live times.
// The seeded votes are moved with the clock, so they fall inside the session.
import { env, rest } from './env.mjs';

const [city, moment] = process.argv.slice(2), e = env();
if (!city || !moment) { console.error('usage: node supabase/scripts/clock.mjs <city> <before|build|vote|last|closed|picked|reset>'); process.exit(2); }
const [c] = await rest(e, 'cities?id=eq.' + city + '&select=build_min,vote_after');
if (!c) { console.error('no city ' + city); process.exit(2); }
const B = c.build_min, V = c.vote_after, now = Date.now(), min = 60000;
const offset = { before: -30, build: B * 0.45, vote: B + V * 0.4, last: B + V - 2, closed: B + V + 20, picked: B + V + 120 }[moment];
if (moment === 'reset') {
  await rest(e, 'cities?id=eq.' + city, { method: 'PATCH', body: JSON.stringify({ build_start: null, build_end: null, vote_end: null }) });
  console.log(city + ': live times cleared'); process.exit(0);
}
if (offset == null) { console.error('unknown moment ' + moment); process.exit(2); }
const start = now - offset * min, iso = (t) => new Date(t).toISOString();
await rest(e, 'cities?id=eq.' + city, { method: 'PATCH', body: JSON.stringify({ build_start: iso(start), build_end: iso(start + B * min), vote_end: iso(start + (B + V) * min) }) });
// entries arrive through building, votes after each entry's arrival and before now (and before the end)
const entries = await rest(e, 'entries?city=eq.' + city + '&select=id,no&order=no');
const last = Math.min(now, start + (B + V) * min);
for (const [k, en] of entries.entries()) {
  const arrive = Math.min(start + (k + 0.5) / entries.length * B * min * 0.8, Math.max(start, now - 60000));
  if (moment === 'before') continue;
  await rest(e, 'entries?id=eq.' + en.id, { method: 'PATCH', body: JSON.stringify({ created_at: iso(arrive) }) });
  const votes = await rest(e, 'votes?entry=eq.' + en.id + '&select=id&order=id');
  for (const [j, v] of votes.entries()) {
    const at = arrive + (last - arrive) * Math.pow((j + 1) / (votes.length + 1), 0.8);
    await rest(e, 'votes?id=eq.' + v.id, { method: 'PATCH', body: JSON.stringify({ created_at: iso(at) }) });
  }
  await rest(e, 'tally?entry=eq.' + en.id, { method: 'PATCH', body: JSON.stringify({ reached_at: iso(votes.length ? arrive + (last - arrive) * Math.pow(votes.length / (votes.length + 1), 0.8) : arrive) }) });
}
console.log(city + ': ' + moment + ', building ' + iso(start) + ' to ' + iso(start + B * min) + ', voting to ' + iso(start + (B + V) * min));
