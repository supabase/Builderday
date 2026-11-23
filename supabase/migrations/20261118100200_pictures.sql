-- Pictures of entries: one public bucket. Only the server writes to it (with the service role), after the person's
-- sign-in and the clock have been checked; anyone may read, as the pictures are on the public pages.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
