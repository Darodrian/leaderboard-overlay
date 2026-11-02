// ComfyJS wrapper for supplementary chat message counting.
// ComfyJS connects to Twitch IRC from the browser and emits chat events.
// This complements (does not replace) the EventSub / tips pipeline.
export type ComfyMessage = {
  userId: string;
  username: string;
  text: string;
  badges: Record<string, string>;
  isBot: boolean;
  isBroadcaster: boolean;
  isMod: boolean;
};

export type ComfyHandlers = {
  onMessage?: (msg: ComfyMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

let comfy: any = null;
let handlers: ComfyHandlers = {};

export function initComfyJS(
  channel: string,
  handlersArg: ComfyHandlers,
): Promise<void> {
  handlers = handlersArg;
  return new Promise((resolve, reject) => {
    // ComfyJS is loaded via CDN script tag before this module runs.
    const ComfyJS = (window as any).ComfyJS;
    if (!ComfyJS) {
      reject(new Error('ComfyJS not loaded. Include the CDN script tag.'));
      return;
    }

    ComfyJS.Init({
      channel: channel.replace('#', ''),
      commands: true,
    });

    ComfyJS.onChat = (user: string, message: string, self: boolean, extra: any) => {
      if (self) return;
      const msg: ComfyMessage = {
        userId: (extra && extra.userId) || '',
        username: user,
        text: message,
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
