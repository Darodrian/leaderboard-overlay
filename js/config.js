// Shared configuration between overlay, dashboard, and edge functions.
// Frontend-safe values only — secrets stay out of the browser bundle.
export const SUPABASE_URL = 'https://liuhcwkpuivcletiwpab.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpdWhjd2twdWl2Y2xldGl3cGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwOTY0NjIsImV4cCI6MjEwNjY3MjQ2Mn0.yFG1MI6X-vVVxe4nCJ8ZFICCu0i_1OkORTRRtET7ez4';
// SUPABASE_SERVICE_ROLE_KEY is a secret — not shipped to the frontend.
export const SUPABASE_SERVICE_ROLE_KEY = '';
export const TWITCH_CLIENT_ID = '7jd8d3d0838uhyw7do7til33qprdsw';
// TWITCH_CLIENT_SECRET, TWITCH_WEBHOOK_SECRET, CHAT_BOT_SECRET, TOKEN_ENCRYPTION_KEY are secrets — not shipped to the frontend.
export const TWITCH_CLIENT_SECRET = '';
export const TWITCH_WEBHOOK_SECRET = '';
export const CHAT_BOT_SECRET = '';
export const TOKEN_ENCRYPTION_KEY = '';
export const APP_URL = 'https://darodrian.github.io/leaderboard-overlay';

export const FUNCTIONS_BASE = SUPABASE_URL + '/functions/v1';

export const cfg = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_ANON_KEY,
};
