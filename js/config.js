// Shared configuration between overlay, dashboard, and edge functions.
// Copy .env.example to .env.local and fill in the values.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
export const TWITCH_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || '';
export const TWITCH_CLIENT_SECRET = import.meta.env.VITE_TWITCH_CLIENT_SECRET || '';
export const TWITCH_WEBHOOK_SECRET = import.meta.env.VITE_TWITCH_WEBHOOK_SECRET || '';
export const CHAT_BOT_SECRET = import.meta.env.VITE_CHAT_BOT_SECRET || '';
export const TOKEN_ENCRYPTION_KEY = import.meta.env.VITE_TOKEN_ENCRYPTION_KEY || '';
export const NEXT_PUBLIC_APP_URL = import.meta.env.VITE_NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const FUNCTIONS_BASE = SUPABASE_URL + '/functions/v1';

export const cfg = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_ANON_KEY,
};
