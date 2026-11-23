-- The event as one record, and a place that keeps the email it was listed under.
--
--   * events: one row per event. What changes while the site is live lives here: when the day pages open (opens_at,
--     null means three hours before the first city's planned start) and the desk's override (open). The name, the
--     short name and the date stay in the site's code (EVENT in lib/day-data.ts), so pages draw without a database.
--   * passes: a place is a line on a city's list. It keeps list_email, the address it was listed under, lower case;
--     the account holding it (person) can change when someone claims it from another email. Luma's sync, its
--     webhook and the check of one email match on list_email, never on the account's email, so a claimed place is
--     not made again for the old address at the next sync.
--   * editor_version: the editor key's own version, so replacing the editor key does not end the emailed link.
--     editor_seen_at: the last call from an editor with a good key ("editor connected").
--   * claims: the six-digit codes sent to a listed address when a signed-in person claims that place.
--
-- Nothing new is granted to anon or authenticated: the server reads all of it with the service role.

create table public.events (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  opens_at timestamptz,                        -- when the day pages open; null: three hours before the first start
  open text not null default 'auto' check (open in ('auto', 'open', 'closed')),   -- the desk's override
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null
);
alter table public.events enable row level security;
insert into public.events (id) values ('builder-day-2026');

alter table public.cities add column event text not null default 'builder-day-2026' references public.events (id);

alter table public.passes
  add column event text not null default 'builder-day-2026' references public.events (id),
  add column list_email extensions.citext,
  add column luma_guest_id text,
  add column luma_status text,
  add column luma_registered_at timestamptz,
  add column claimed_at timestamptz,
  add column editor_version int not null default 1,
  add column editor_seen_at timestamptz;

update public.passes s set list_email = lower(p.email::text) from public.people p where p.id = s.person and s.list_email is null;

-- a place made without naming its email (older scripts, the seed) is listed under its person's email
create function public.pass_list_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.list_email is null then select lower(email::text) into new.list_email from public.people where id = new.person; end if;
  new.list_email := lower(new.list_email::text);
  return new;
end $$;
create trigger passes_list_email before insert or update of list_email on public.passes for each row execute function public.pass_list_email();

alter table public.passes alter column list_email set not null,
  add constraint passes_list_email_check check (position('@' in list_email::text) > 1);
alter table public.passes drop constraint passes_person_key;
alter table public.passes add constraint passes_person_event unique (person, event);
alter table public.passes add constraint passes_event_list_email unique (event, list_email);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.people (id) on delete cascade,   -- who is claiming (signed in)
  list_email extensions.citext not null,       -- the address the code went to
  pass uuid references public.passes (id) on delete cascade,              -- null when no place is listed there
  code_hash text not null,
  tries int not null default 0,
  ip inet,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index claims_person on public.claims (person, created_at desc);
create index claims_email on public.claims (list_email, created_at desc);
create index claims_ip on public.claims (ip, created_at desc);
alter table public.claims enable row level security;

alter table public.outbox drop constraint outbox_template_check;
alter table public.outbox add constraint outbox_template_check check (template in ('link', 'code', 'role', 'reminder', 'again', 'claim'));
