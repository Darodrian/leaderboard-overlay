import { FUNCTIONS_BASE, SUPABASE_ANON_KEY } from './config.js';
export { FUNCTIONS_BASE, SUPABASE_ANON_KEY };

export const WINDOW_TYPES = [
  'this_stream', '7d', '30d', 'alltime',
];

export const ALL_BOARD_TYPES = [
  'points', 'donations', 'bits', 'subs', 'raiders', 'chat_messages', 'clips',
];

export async function loadOverlayState(token) {
  const response = await fetch(`${FUNCTIONS_BASE}/overlay-data?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return await response.json();
}
