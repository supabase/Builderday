-- Deleting an entry (or a person, whose entry and votes go with them) removes its votes by cascade. The tally trigger
-- then tried to update the tally of an entry that was already gone, and the whole delete failed on the tally's
-- foreign key. A vote whose entry no longer exists has no tally to keep.
create or replace function public.tally_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e uuid := coalesce(new.entry, old.entry);
  d int := coalesce(case when tg_op = 'DELETE' then 0 else new.n end, 0) - coalesce(case when tg_op = 'INSERT' then 0 else old.n end, 0);
  dj int := case when coalesce(new.kind, old.kind) = 'judge' then d else 0 end;
begin
  if d = 0 then return null; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.entries where id = e) then return null; end if;
  update public.tally t set
    votes = t.votes + d,
    judge_votes = t.judge_votes + dj,
    -- reaching a higher count is a new time; dropping back keeps the time the remaining votes reached it
    reached_at = case when d > 0 then now()
      else coalesce((select max(v.created_at) from public.votes v where v.entry = e and v.n > 0), t.reached_at) end
  where t.entry = e;
  return null;
end $$;
