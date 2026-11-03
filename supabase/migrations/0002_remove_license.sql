-- Twitch Leaderboard Overlay — remove license system
-- Run in the Supabase SQL editor.

-- Drop licenses table policies first
drop policy if exists licenses_select_self on licenses;

-- Drop licenses table
drop table if exists licenses;

-- Remove license_key column from streamers
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'license_key'
  ) then
    alter table streamers drop column license_key;
  end if;
end $$;
