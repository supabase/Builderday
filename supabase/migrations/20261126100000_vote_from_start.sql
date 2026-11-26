-- Voting is open from the start of a place's block. Only the counts wait: they are hidden until show_at (60), then
-- live to the close; judges still vote from judge_at (60). events.public_at was 45.
update public.events set public_at = 0 where id = 'builder-day-2026';
