// Supabase Realtime broadcast channel for panel <-> overlay sync.
// Mirrors the bridge.js pattern from miguelium-wisdom / goal-overlay.
import { cfg } from './config.js';

const SUPA_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

export function createBridge(room: string) {
  const handlers = {
    status: [], hello: [], ping: [], set: [], flip: [], test: [], disconnect: [],
  };
  let channel: any = null;
  let client: any = null;

  async function getClient() {
    if (!client) {
      const mod = await import(SUPA_URL);
      client = mod.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    }
    return client;
  }

  function listen(event: string, fn: (p: Record<string, unknown>) => void) {
    channel.on('broadcast', { event }, (msg: any) => fn((msg && msg.payload) || {}));
  }

  async function connect() {
    const c = await getClient();
    channel = c.channel(room, { config: { broadcast: { self: false } } });
    listen('hello', (p) => handlers.hello.forEach((h) => h(p)));
    listen('ping', (p) => handlers.ping.forEach((h) => h(p)));
    listen('set', (p) => handlers.set.forEach((h) => h(p)));
    listen('flip', (p) => handlers.flip.forEach((h) => h(p)));
    listen('test', (p) => handlers.test.forEach((h) => h(p)));
    listen('disconnect', (p) => handlers.disconnect.forEach((h) => h(p)));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: any, arg: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(arg);
      };
      const timer = setTimeout(() => finish(reject, new Error('TIMED_OUT')), 15000);
      channel.subscribe((status: string) => {
        handlers.status.forEach((h) => h(status));
        if (status === 'SUBSCRIBED') finish(resolve);
        else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') finish(reject, new Error(status));
      });
    });
  }

  function send(type: string, payload: Record<string, unknown>) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: type, payload });
  }

  return {
    connect,
    async leave() {
      if (channel && client) await client.removeChannel(channel);
      channel = null;
    },
    sendHello() { send('hello', { at: Date.now() }); },
    sendPing() { send('ping', { at: Date.now() }); },
    sendSet(payload: Record<string, unknown> | number) {
      if (typeof payload === 'number') {
        send('set', { amount: Math.max(1, Math.floor(Number(payload) || 100)) });
      } else {
        send('set', payload);
      }
    },
    sendFlip(flip: boolean) { send('flip', { flip: !!flip }); },
    sendTest() { send('test', { at: Date.now() }); },
    sendDisconnect() { send('disconnect', { at: Date.now() }); },
    onStatus(fn: (s: string) => void) { handlers.status.push(fn); },
    onHello(fn: (p: Record<string, unknown>) => void) { handlers.hello.push(fn); },
    onPing(fn: (p: Record<string, unknown>) => void) { handlers.ping.push(fn); },
    onSet(fn: (p: Record<string, unknown>) => void) { handlers.set.push(fn); },
    onFlip(fn: (p: { flip: boolean }) => void) { handlers.flip.push(fn); },
    onTest(fn: (p: Record<string, unknown>) => void) { handlers.test.push(fn); },
    onDisconnect(fn: (p: Record<string, unknown>) => void) { handlers.disconnect.push(fn); },
  };
}
