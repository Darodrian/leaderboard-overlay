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

    ComfyJS.Init(channel.replace('#', ''));

    ComfyJS.onChat = (user, message, flags, self, extra) => {
      const userBadges = (extra && extra.userBadges) || {};
      const msg = {
        userId: (extra && extra.userId) || '',
        username: user,
        text: message,
        messageId: (extra && extra.id) || '',
        isSelf: !!self,
        badges: userBadges,
        isBot: (userBadges && userBadges.bot) === '1',
        isBroadcaster: (userBadges && userBadges.broadcaster) === '1',
        isMod: (userBadges && userBadges.mod) === '1',
      };
      if (handlers.onMessage) handlers.onMessage(msg);
    };

    ComfyJS.onCommand = (user, command, message, flags, extra) => {
      const userBadges = (extra && extra.userBadges) || {};
      const text = message ? `!${command} ${message}` : `!${command}`;
      const msg = {
        userId: (extra && extra.userId) || '',
        username: user,
        text,
        messageId: (extra && extra.id) || '',
        isSelf: !!(flags && flags.self),
        badges: userBadges,
        isBot: (userBadges && userBadges.bot) === '1',
        isBroadcaster: !!(flags && flags.broadcaster) || (userBadges && userBadges.broadcaster) === '1',
        isMod: !!(flags && flags.mod) || (userBadges && userBadges.mod) === '1',
      };
      if (handlers.onMessage) handlers.onMessage(msg);
    };

    ComfyJS.onError = (err) => {
      console.warn('[comfyjs] error', err);
      if (handlers.onError) handlers.onError(err);
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
