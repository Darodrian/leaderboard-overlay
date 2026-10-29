-- Twitch Leaderboard Overlay — initial schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists streamers (
  id uuid primary key default gen_random_uuid(),
  twitch_user_id text unique not null,
  twitch_login text not null,
  access_token text,
  license_key text unique not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  user_id text not null,
  username text not null,
  points integer not null default 0 check (points >= 0),
  last_event_at timestamptz not null default now(),
  primary key (streamer_id, window_type, user_id)
);

create index if not exists idx_aggregates_streamer_window
  on leaderboard_aggregates (streamer_id, window_type);

-- Row Level Security: deny by default.
alter table streamers enable row level security;
alter table licenses enable row level security;
alter table overlay_sessions enable row level security;
alter table point_events enable row level security;
alter table stream_windows enable row level security;
alter table leaderboard_aggregates enable row level security;

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

-- Recompute every window for one streamer. Idempotent; serialised per streamer.
create or replace function flush_streamer_aggregates(p_streamer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window text;
  v_since timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_streamer_id::text));

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
      where streamer_id = p_streamer_id and window_type = v_window;

    insert into leaderboard_aggregates
      (streamer_id, window_type, user_id, username, points, last_event_at)
    select
      p_streamer_id,
      v_window,
      credited_user_id,
      max(credited_username),
      sum(points_awarded)::integer,
      max(created_at)
    from point_events
    where streamer_id = p_streamer_id
      and created_at >= v_since
    group by credited_user_id;
  end loop;
end;
$$;
