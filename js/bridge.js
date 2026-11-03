// Supabase Realtime broadcast bridge, same pattern as goal-overlay / miguelium-wisdom.
// The dashboard and the overlay join the same room; the dashboard pushes the
// full settings object and the overlay applies it locally, with no polling.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SUPABASE_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const EVENTS = [
  'hello',
  'settings.update',
  'leaderboard.update',
  'command.refresh',
  'command.clear-stream',
];

export function createBridge(room) {
  const handlers = new Map();
  let channel = null;
  let client = null;
  let subscribed = false;
  let connectPromise = null;

  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(fn);
  }

  function emit(event, payload) {
    const set = handlers.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.warn('[bridge] handler failed', event, e); }
    }
  }

  async function getClient() {
    if (!client) {
      const mod = await import(SUPABASE_MODULE);
      client = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return client;
  }

  function connect() {
    if (subscribed) return Promise.resolve();
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      const c = await getClient();
      channel = c.channel(room, { config: { broadcast: { self: false } } });

      for (const event of EVENTS) {
        channel.on('broadcast', { event }, (msg) => emit(event, (msg && msg.payload) || {}));
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(arg);
        };
        const timer = setTimeout(() => finish(reject, new Error('TIMED_OUT')), 15000);

        channel.subscribe((status) => {
          emit('status', status);
          if (status === 'SUBSCRIBED') {
            subscribed = true;
            finish(resolve);
          } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
            subscribed = false;
            finish(reject, new Error(status));
          }
        });
      });
    })().finally(() => {
      connectPromise = null;
    });

    return connectPromise;
  }

  function send(event, payload) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event, payload });
  }

  async function leave() {
    const ch = channel;
    channel = null;
    subscribed = false;
    if (ch && client) {
      try { await client.removeChannel(ch); } catch { /* already gone */ }
    }
  }

  return {
    connect,
    leave,
    send,
    on,
    isConnected: () => subscribed,
    sendHello(payload = { at: Date.now() }) { send('hello', payload); },
  };
}
