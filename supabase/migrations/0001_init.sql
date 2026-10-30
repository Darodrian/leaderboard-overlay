-- Twitch Leaderboard Overlay â€” initial schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists streamers (
  id uuid primary key default gen_random_uuid(),
  twitch_user_id text unique not null,
  twitch_login text not null,
  access_token text,
  license_key text unique,
  obs_token text unique not null,
  obs_token_regenerated_at timestamptz,
  anonymous_mask_name text default 'Mystery Supporter',
  tip_threshold_cents integer not null default 0 check (tip_threshold_cents >= 0),
  point_config jsonb not null default '{"tip":100,"bit":1,"sub":500,"gift":300,"raid":50}'::jsonb,
  display_toggles jsonb not null default '{"ranks":true,"medals":true,"rankNumbers":true,"bars":true,"amounts":true}'::jsonb,
  hidden_accounts text[] not null default '{}',
  layout jsonb not null default '{"width":420,"padding":12,"borderRadius":16}'::jsonb,
  visuals jsonb not null default '{"opacity":100,"fontSize":18}'::jsonb,
  theme jsonb not null default '{"preset":"midnight","overrides":{}}'::jsonb,
  rotation jsonb not null default '{"enabled":false,"intervalMs":30000}'::jsonb,
  boards jsonb not null default '{"points":{"active":true,"windows":["this_stream","7d","30d","alltime"],"rankCount":25}}'::jsonb,
  last_flush_at timestamptz,
  flush_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- For existing tables created without the boards column, add it.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'boards'
  ) then
    alter table streamers
      add column boards jsonb not null default '{"points":{"active":true,"windows":["this_stream","7d","30d","alltime"],"rankCount":25}}'::jsonb;
  end if;
end $$;

-- Add remaining new streamers settings columns if missing
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'points_suffix'
  ) then
    alter table streamers
      add column points_suffix text not null default 'pts';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'screen_layout'
  ) then
    alter table streamers
      add column screen_layout text not null default 'single';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'rotation_mode'
  ) then
    alter table streamers
      add column rotation_mode text not null default 'both';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'font_family'
  ) then
    alter table streamers
      add column font_family text not null default 'system';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'label_alignment'
  ) then
    alter table streamers
      add column label_alignment text not null default 'center';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'board_labels'
  ) then
    alter table streamers
      add column board_labels text not null default '{}';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'exclude_broadcaster_from_chat_messages'
  ) then
    alter table streamers
      add column exclude_broadcaster_from_chat_messages boolean not null default false;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'streamers' and column_name = 'exclude_mods_from_chat_messages'
  ) then
    alter table streamers
      add column exclude_mods_from_chat_messages boolean not null default false;
  end if;
end $$;

create table if not exists licenses (
  key text primary key,
  twitch_user_id text,
  is_active boolean not null default true,
  expires_at timestamptz,
  etsy_order_id text,
  bound_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists overlay_sessions (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references streamers(id) on delete cascade,
  token text unique not null,
  is_active boolean not null default true,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references streamers(id) on delete cascade,
  twitch_event_id text not null,
  event_type text not null check (event_type in ('tip', 'bit', 'sub', 'gift', 'raid')),
  credited_user_id text not null,
  credited_username text not null,
  amount_cents integer not null default 0,
  points_awarded integer not null check (points_awarded >= 0),
  is_anonymous boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (streamer_id, twitch_event_id)
);

create index if not exists idx_point_events_streamer_created
  on point_events (streamer_id, created_at desc);

create table if not exists stream_windows (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references streamers(id) on delete cascade,
  window_type text not null default 'this_stream'
    check (window_type in ('this_stream', '7d', '30d', 'alltime')),
  started_at timestamptz not null,
  ended_at timestamptz,
  is_active boolean not null default true
);

create index if not exists idx_stream_windows_streamer_active
  on stream_windows (streamer_id, window_type, is_active);

create table if not exists leaderboard_aggregates (
  streamer_id uuid not null references streamers(id) on delete cascade,
  window_type text not null
    check (window_type in ('this_stream', '7d', '30d', 'alltime')),
  board_type text not null
    check (board_type in ('points','donations','bits','subs','raiders','view_time','chat_messages','clips')),
  user_id text not null,
  username text not null,
  quantity integer not null default 0 check (quantity >= 0),
  last_event_at timestamptz not null default now(),
  primary key (streamer_id, window_type, board_type, user_id)
);

-- For existing tables created without board_type, add the column
-- and recreate the primary key to include it BEFORE creating the index.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'leaderboard_aggregates' and column_name = 'board_type'
  ) then
    alter table leaderboard_aggregates
      add column board_type text not null default 'points'
        check (board_type in ('points','donations','bits','subs','raiders','view_time','chat_messages','clips'));
  end if;
end $$;

-- Rename old 'points' column to 'quantity' if it still exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leaderboard_aggregates' and column_name = 'points'
  ) then
    alter table leaderboard_aggregates rename column points to quantity;
  end if;
end $$;

do $$
declare
  has_board_type_in_pk boolean;
begin
  select count(*) > 0 into has_board_type_in_pk
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
  where tc.table_name = 'leaderboard_aggregates'
    and tc.constraint_type = 'PRIMARY KEY'
    and ccu.column_name = 'board_type';

  if not has_board_type_in_pk then
    alter table leaderboard_aggregates drop constraint if exists leaderboard_aggregates_pkey;
    alter table leaderboard_aggregates
      add primary key (streamer_id, window_type, board_type, user_id);
  end if;
end $$;

create index if not exists idx_aggregates_streamer_window_board
  on leaderboard_aggregates (streamer_id, window_type, board_type);

-- Row Level Security: deny by default.
alter table streamers enable row level security;
alter table licenses enable row level security;
alter table overlay_sessions enable row level security;
alter table point_events enable row level security;
alter table stream_windows enable row level security;
alter table leaderboard_aggregates enable row level security;

create table if not exists chat_events (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references streamers(id) on delete cascade,
  twitch_user_id text not null,
  username text not null,
  is_bot boolean not null default false,
  is_broadcaster boolean not null default false,
  is_mod boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_events_streamer_created
  on chat_events (streamer_id, created_at desc);

create table if not exists clip_events (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references streamers(id) on delete cascade,
  twitch_user_id text not null,
  username text not null,
  clip_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_clip_events_streamer_created
  on clip_events (streamer_id, created_at desc);

-- Dashboard server routes use the service role, which bypasses RLS.
-- These policies are defense-in-depth for a future Supabase-Auth session
-- where auth.uid() maps to streamers.id.
drop policy if exists streamers_select_self on streamers;
create policy streamers_select_self on streamers
  for select using (id = auth.uid());

drop policy if exists streamers_update_self on streamers;
create policy streamers_update_self on streamers
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists licenses_select_self on licenses;
create policy licenses_select_self on licenses
  for select using (
    twitch_user_id = (select s.twitch_user_id from streamers s where s.id = auth.uid())
  );

drop policy if exists overlay_sessions_self on overlay_sessions;
create policy overlay_sessions_self on overlay_sessions
  for all using (
    streamer_id = auth.uid()
  ) with check (
    streamer_id = auth.uid()
  );

drop policy if exists point_events_self on point_events;
create policy point_events_self on point_events
  for select using (streamer_id = auth.uid());

drop policy if exists stream_windows_self on stream_windows;
create policy stream_windows_self on stream_windows
  for all using (streamer_id = auth.uid()) with check (streamer_id = auth.uid());

drop policy if exists leaderboard_aggregates_self on leaderboard_aggregates;
create policy leaderboard_aggregates_self on leaderboard_aggregates
  for select using (streamer_id = auth.uid());

drop policy if exists chat_events_self on chat_events;
create policy chat_events_self on chat_events
  for all using (streamer_id = auth.uid()) with check (streamer_id = auth.uid());

drop policy if exists clip_events_self on clip_events;
create policy clip_events_self on clip_events
  for all using (streamer_id = auth.uid()) with check (streamer_id = auth.uid());

-- Recompute aggregates for one streamer. Idempotent; serialised per streamer.
-- At most one recompute per two seconds unless p_force is true: a skipped call
-- marks the streamer as pending so the next read can drain it.
-- When p_board_type is null, recomputes all board types; otherwise only that one.
drop function if exists public.flush_streamer_aggregates(uuid, boolean, text);

create or replace function flush_streamer_aggregates(
  p_streamer_id uuid,
  p_force boolean default false,
  p_board_type text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board text;
  v_window text;
  v_since timestamptz;
  v_last timestamptz;
  v_boards text[] := array['points','donations','bits','subs','raiders','chat_messages','clips'];
begin
  perform pg_advisory_xact_lock(hashtext(p_streamer_id::text));

  select last_flush_at into v_last
    from streamers where id = p_streamer_id;

  if not p_force
     and v_last is not null
     and now() - v_last < interval '2 seconds' then
    update streamers set flush_pending = true where id = p_streamer_id;
    return false;
  end if;

  update streamers
    set last_flush_at = now(), flush_pending = false
    where id = p_streamer_id;

  foreach v_board in array v_boards
  loop
    if p_board_type is not null and v_board <> p_board_type then
      continue;
    end if;

    foreach v_window in array array['this_stream', '7d', '30d', 'alltime']
    loop
      v_since := case v_window
        when 'this_stream' then coalesce(
          (select started_at from stream_windows
            where streamer_id = p_streamer_id
              and window_type = 'this_stream'
              and is_active
            order by started_at desc
            limit 1),
          '-infinity'::timestamptz)
        when '7d' then now() - interval '7 days'
        when '30d' then now() - interval '30 days'
        else '-infinity'::timestamptz
      end;

      delete from leaderboard_aggregates
        where streamer_id = p_streamer_id and window_type = v_window and board_type = v_board;

      case v_board
        when 'points' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            credited_user_id,
            (array_agg(credited_username order by is_anonymous desc, created_at desc))[1],
            sum(points_awarded)::integer,
            max(created_at)
          from point_events
          where streamer_id = p_streamer_id
            and created_at >= v_since
          group by credited_user_id;

        when 'donations' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            credited_user_id,
            (array_agg(credited_username order by is_anonymous desc, created_at desc))[1],
            sum(amount_cents)::integer / 100,
            max(created_at)
          from point_events
          where streamer_id = p_streamer_id
            and event_type = 'tip'
            and created_at >= v_since
          group by credited_user_id;

        when 'bits' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            credited_user_id,
            (array_agg(credited_username order by is_anonymous desc, created_at desc))[1],
            sum(amount_cents)::integer,
            max(created_at)
          from point_events
          where streamer_id = p_streamer_id
            and event_type = 'bit'
            and created_at >= v_since
          group by credited_user_id;

        when 'subs' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            credited_user_id,
            (array_agg(credited_username order by is_anonymous desc, created_at desc))[1],
            count(*)::integer,
            max(created_at)
          from point_events
          where streamer_id = p_streamer_id
            and event_type = 'sub'
            and created_at >= v_since
          group by credited_user_id;

        when 'raiders' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            credited_user_id,
            (array_agg(credited_username order by is_anonymous desc, created_at desc))[1],
            sum(amount_cents)::integer,
            max(created_at)
          from point_events
          where streamer_id = p_streamer_id
            and event_type = 'raid'
            and created_at >= v_since
          group by credited_user_id;

when 'chat_messages' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            ce.twitch_user_id,
            max(ce.username),
            count(*)::integer,
            max(ce.created_at)
          from chat_events ce
          where ce.streamer_id = p_streamer_id
            and ce.created_at >= v_since
          group by ce.twitch_user_id;

        when 'clips' then
          insert into leaderboard_aggregates
            (streamer_id, window_type, board_type, user_id, username, quantity, last_event_at)
          select
            p_streamer_id,
            v_window,
            v_board,
            cl.twitch_user_id,
            max(cl.username),
            count(*)::integer,
            max(cl.created_at)
          from clip_events cl
          where cl.streamer_id = p_streamer_id
            and cl.created_at >= v_since
          group by cl.twitch_user_id;
      end case;
    end loop;
  end loop;

  return true;
end;
$$;

-- The anon key ships to browsers, so the recompute function must not be
-- callable by anon/authenticated clients. Server routes use the service role.
revoke all on function public.flush_streamer_aggregates(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.flush_streamer_aggregates(uuid, boolean, text)
  to service_role;





