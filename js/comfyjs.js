// ComfyJS wrapper for supplementary chat message counting.
// ComfyJS connects to Twitch IRC from the browser and emits chat events.
// This complements (does not replace) the EventSub / tips pipeline.

let comfy = null;
let handlers = {};

export function initComfyJS(channel, handlersArg) {
  handlers = handlersArg || {};
  return new Promise((resolve, reject) => {
    // ComfyJS is loaded via CDN script tag before this module runs.
    const ComfyJS = window.ComfyJS;
    console.log('[debug] comfyjs: initComfyJS called, ComfyJS loaded:', !!ComfyJS);
    if (!ComfyJS) {
      reject(new Error('ComfyJS not loaded. Include the CDN script tag.'));
      return;
    }

    console.log('[debug] comfyjs: calling ComfyJS.Init with channel:', channel.replace('#', ''));
    ComfyJS.Init(channel.replace('#', ''));

    ComfyJS.onChat = (user, message, flags, self, extra) => {
      const msg = {
        userId: (extra && extra.userId) || '',
        username: user,
        text: message,
        isSelf: !!self,
        badges: (extra && extra.badges) || {},
        isBot: (extra && extra.badges && extra.badges.bot) === '1',
        isBroadcaster: (extra && extra.badges && extra.badges.broadcaster) === '1',
        isMod: (extra && extra.badges && extra.badges.mod) === '1',
      };
      if (handlers.onMessage) handlers.onMessage(msg);
    };

    ComfyJS.onError = (err) => {
      console.warn('[comfyjs] error', err);
      if (handlers.onError) handlers.onError(err);
    };

    ComfyJS.onConnected = () => {
      console.log('[debug] comfyjs: onConnected fired');
      comfy = ComfyJS;
      if (handlers.onConnect) handlers.onConnect();
      resolve();
    };

    ComfyJS.onDisconnected = () => {
      if (handlers.onDisconnect) handlers.onDisconnect();
    };
  });
}

export function disconnectComfyJS() {
  if (comfy) {
    try { comfy.Disconnect(); } catch { /* ignore */ }
    comfy = null;
  }
}
