-- Each city's Luma event, for the guest sync and the door's check of one email (only with LUMA_API_KEY on the server).
-- Not in the public column grant: only the service role and the desk read it.
alter table public.cities add column if not exists luma_event_id text
  check (luma_event_id is null or luma_event_id ~ '^[A-Za-z0-9_-]{3,80}$');
