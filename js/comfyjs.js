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
    if (!ComfyJS) {
      reject(new Error('ComfyJS not loaded. Include the CDN script tag.'));
      return;
    }

    ComfyJS.Init(channel.replace('#', ''), null, channel.replace('#', ''));

    ComfyJS.onChat = (user, message, badges, self, extra) => {
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

    ComfyJS.onConnected = () => {
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
