-- Twitch Leaderboard Overlay — dedupe chat events by Twitch message id
-- Run in the Supabase SQL editor.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chat_events' and column_name = 'twitch_message_id'
  ) then
    alter table chat_events add column twitch_message_id text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_events_streamer_id_twitch_message_id_key'
      and conrelid = 'chat_events'::regclass
  ) then
    alter table chat_events
      add constraint chat_events_streamer_id_twitch_message_id_key
      unique (streamer_id, twitch_message_id);
  end if;
end $$;

create index if not exists idx_chat_events_streamer_message on chat_events (streamer_id, twitch_message_id);
