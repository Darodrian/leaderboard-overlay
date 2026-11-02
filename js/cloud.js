import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const RPC_URL = SUPABASE_URL + '/rest/v1/rpc/';
const RPC_TIMEOUT_MS = 8000;

async function rpc(name: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(RPC_URL + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }

    if (!res.ok) {
      const message = data && typeof data === 'object'
        ? (data.message || data.error_description || data.error)
        : data;
      throw new Error(message || 'Supabase RPC ' + name + ' failed (' + res.status + ')');
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCheerState(broadcasterId: string) {
  return rpc('cheer_overlay_get', { p_broadcaster_id: broadcasterId });
}

export async function saveCheerState(broadcasterId: string, cheerThreshold: number) {
  return rpc('cheer_overlay_save', {
    p_broadcaster_id: broadcasterId,
    p_cheer_threshold: cheerThreshold,
  });
}
