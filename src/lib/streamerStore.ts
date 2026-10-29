import "server-only";
import { licenseIsActive } from "./access";
import { mapStreamerRow, type StreamerRow } from "./streamers";
import { createAdminClient } from "./supabase/admin";
import type { Streamer } from "./types";

export async function loadStreamerById(id: string): Promise<Streamer | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("streamers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapStreamerRow(data as StreamerRow);
}

export async function loadStreamerByToken(
  token: string,
): Promise<Streamer | null> {
  if (!token) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("streamers")
    .select("*")
    .eq("obs_token", token)
    .maybeSingle();

  if (error || !data) return null;
  const streamer = mapStreamerRow(data as StreamerRow);
  if (!(await licenseIsActive(streamer.licenseKey))) return null;
  return streamer;
}
