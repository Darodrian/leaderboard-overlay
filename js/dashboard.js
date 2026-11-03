import { FUNCTIONS_BASE, APP_URL, SUPABASE_ANON_KEY } from './config.js';
import { createBridge } from './bridge.js';
import {
  applySettings, cssVars, DEFAULT_SETTINGS, THEMES, ALL_BOARD_TYPES, BOARD_LABELS, BOARD_UNITS, formatBoardQuantity,
} from './settings.js';

const $ = (id) => document.getElementById(id);

const BTN_CONNECT = $('btn-connect');
const BTN_DISCONNECT = $('btn-disconnect');
const BTN_COPY_URL = $('btn-copy-url');
const CONNECTION_PANEL = $('connection-panel');
const CONNECTION_CONNECTED = $('connection-connected');
const CONNECTION_TITLE = $('connection-title');
const CONNECTION_STATUS = $('connection-status');
const MSG = $('msg');
const SAVE_STATUS = $('save-status');
const BTN_SAVE = $('btn-save');
const PREVIEW_IFRAME = $('preview');

let previewUrl = '';

let broadcasterId = '';
let broadcasterLogin = '';
let obsToken = '';
let bridge = null;

function flash(text, kind = '') {
  if (!MSG) return;
  MSG.textContent = text;
  MSG.hidden = false;
  MSG.className = 'msg' + (kind ? ' ' + kind : '');
  clearTimeout(window.__msgTimer);
  window.__msgTimer = setTimeout(() => {
    MSG.hidden = true;
    MSG.textContent = '';
  }, 5000);
}

function setSaveStatus(text) {
  if (SAVE_STATUS) SAVE_STATUS.textContent = text;
}

function updateCopyButton() {
  if (!BTN_COPY_URL) return;
  BTN_COPY_URL.disabled = !obsToken;
  BTN_COPY_URL.title = obsToken ? '' : 'La URL del overlay todavía se está cargando';
}

function updatePreview() {
  if (!PREVIEW_IFRAME || !obsToken) {
    PREVIEW_IFRAME.src = 'about:blank';
    return;
  }
  const base = new URL('overlay.html', location.href);
  base.search = 'token=' + encodeURIComponent(obsToken);
  // Cache-buster so the preview reloads when settings change.
  base.search += '&_=' + Date.now();
  PREVIEW_IFRAME.src = base.href;

  // Scale the iframe down to fit inside the fixed-size preview container.
  const wrap = PREVIEW_IFRAME.parentElement;
  const wrapWidth = wrap ? wrap.clientWidth : 260;
  const layoutWidth = settings.layout.width || 420;
  const scale = Math.min(1, wrapWidth / layoutWidth);
  PREVIEW_IFRAME.style.width = layoutWidth + 'px';
  PREVIEW_IFRAME.style.transform = 'scale(' + scale + ')';
  PREVIEW_IFRAME.style.transformOrigin = 'top left';

  const note = $('preview-note');
  if (note) note.hidden = true;
}

function showConnected(connected) {
  if (CONNECTION_PANEL) CONNECTION_PANEL.hidden = false;
  if (CONNECTION_TITLE) CONNECTION_TITLE.textContent = connected ? 'Conectado' : 'Conectar Twitch';
  if (BTN_CONNECT) BTN_CONNECT.hidden = connected;
  if (CONNECTION_CONNECTED) CONNECTION_CONNECTED.hidden = !connected;
  if (BTN_COPY_URL) BTN_COPY_URL.hidden = !connected;
  if (CONNECTION_STATUS) CONNECTION_STATUS.textContent = connected ? ('Conectado: ' + broadcasterLogin) : '';
  updateCopyButton();
}

function buildOverlayUrl(token) {
  const base = new URL('overlay.html', location.href);
  base.search = 'token=' + encodeURIComponent(token);
  return base.href;
}

function copyText(text) {
  return navigator.clipboard.writeText(text).then(() => {
    flash('Copiado al portapapeles');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* no clipboard */ }
    ta.remove();
    flash('Error al copiar — selecciona manualmente');
  });
}

async function startRoom() {
  if (bridge) {
    await bridge.leave();
    bridge = null;
  }
  if (!obsToken) return;

  const next = createBridge('overlay:' + obsToken);
  // Do NOT broadcast settings.update on hello. The preview iframe reloads and
  // reconnects on every dashboard setting change (updatePreview reloads its src),
  // which would trigger a broadcast to every client in the room — including the
  // actual OBS overlay — causing it to refresh before the user hits Save.
  // Settings are pushed to the overlay only on explicit save (PUT /settings
  // triggers a server broadcast) and once on initial dashboard load below.
  next.on('status', (status) => {
    if (status === 'CHANNEL_ERROR') console.warn('[dashboard] live channel error');
  });

  try {
    await next.connect();
    bridge = next;
    next.send('settings.update', { settings });
  } catch (e) {
    bridge = null;
    console.warn('[dashboard] live updates unavailable', e?.message ?? e);
  }
}

const SESSION_STORAGE_KEY = 'lb_session_token';
const STREAMER_STORAGE_KEY = 'lb_streamer_id';
const LOGIN_STORAGE_KEY = 'lb_twitch_login';

function readStored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function storeValue(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(STREAMER_STORAGE_KEY);
    localStorage.removeItem(LOGIN_STORAGE_KEY);
  } catch { /* storage blocked */ }
}

async function fetchJSON(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    ...(opts.headers || {}),
  };
  const session = readStored(SESSION_STORAGE_KEY);
  if (session) headers.Authorization = 'Bearer ' + session;

  const { headers: _ignored, ...rest } = opts;
  return fetch(FUNCTIONS_BASE + path, {
    ...rest,
    headers,
  });
}

// ---- Session check ----
async function checkSession() {
  const urlParams = new URLSearchParams(location.search);
  const connected = urlParams.get('connected');
  const broadcasterIdFromUrl = urlParams.get('broadcaster_id');
  const error = urlParams.get('error');

  // The OAuth callback passes the session token in the URL hash so it never
  // reaches a server or referrer. Persist it, then strip it from the address bar.
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashSession = hashParams.get('session');
  if (hashSession) {
    storeValue(SESSION_STORAGE_KEY, hashSession);
    window.history.replaceState({}, document.title, location.pathname + location.search);
  }

  if (error) {
    flash('Error de conexión de Twitch: ' + error, 'err');
    window.history.replaceState({}, document.title, location.pathname);
  }

  if (connected && broadcasterIdFromUrl) {
    broadcasterId = broadcasterIdFromUrl;
    broadcasterLogin = connected;
    storeValue(STREAMER_STORAGE_KEY, broadcasterId);
    storeValue(LOGIN_STORAGE_KEY, broadcasterLogin);
    showConnected(true);
    window.history.replaceState({}, document.title, location.pathname);
    await loadServerSettings();
    return;
  }

  // Restore the last known streamer immediately so a blocked third-party
  // cookie does not make a connected account look disconnected on reload.
  const storedId = readStored(STREAMER_STORAGE_KEY);
  if (storedId) {
    broadcasterId = storedId;
    broadcasterLogin = readStored(LOGIN_STORAGE_KEY);
    showConnected(true);
    await loadServerSettings();
  }

  try {
    const res = await fetchJSON('/auth-session');
    if (!res.ok) {
      clearStoredSession();
      broadcasterId = '';
      broadcasterLogin = '';
      obsToken = '';
      showConnected(false);
      return;
    }
    const data = await res.json();
    broadcasterId = data.streamerId;
    broadcasterLogin = data.twitchLogin;
    storeValue(STREAMER_STORAGE_KEY, broadcasterId);
    storeValue(LOGIN_STORAGE_KEY, broadcasterLogin);
    showConnected(true);
    await loadServerSettings();
  } catch (e) {
    if (!storedId) showConnected(false);
  }
}

// ---- Connect Twitch ----
if (BTN_CONNECT) {
  BTN_CONNECT.addEventListener('click', () => {
    const redirect = new URL('.', location.href).href;
    const authUrl = `${FUNCTIONS_BASE}/auth-twitch?redirect=${encodeURIComponent(redirect)}`;
    location.href = authUrl;
  });
}

// ---- Disconnect ----
if (BTN_DISCONNECT) {
  BTN_DISCONNECT.addEventListener('click', async () => {
    try {
      await fetchJSON('/auth-logout', { method: 'POST' });
    } catch { /* ignore */ }
    clearStoredSession();
    broadcasterId = '';
    broadcasterLogin = '';
    obsToken = '';
    if (bridge) {
      await bridge.leave();
      bridge = null;
    }
    showConnected(false);
    setSaveStatus('');
    flash('Sesión cerrada');
  });
}

// ---- Copy overlay URL ----
if (BTN_COPY_URL) {
  BTN_COPY_URL.addEventListener('click', async () => {
    if (!obsToken) {
      flash('La URL del overlay todavía se está cargando — inténtalo de nuevo en un momento', 'err');
      return;
    }
    await copyText(buildOverlayUrl(obsToken));
  });
}

// ==== Settings (always visible) ====
let settings = structuredClone(DEFAULT_SETTINGS);

const FIELDS = {
  'display-ranks': { path: ['display', 'ranks'], type: 'checkbox' },
  'display-medals': { path: ['display', 'medals'], type: 'checkbox' },
  'display-rank-numbers': { path: ['display', 'rankNumbers'], type: 'checkbox' },
  'display-bars': { path: ['display', 'bars'], type: 'checkbox' },
  'display-amounts': { path: ['display', 'amounts'], type: 'checkbox' },
  'points-tip': { path: ['pointConfig', 'tip'], type: 'number' },
  'points-bit': { path: ['pointConfig', 'bit'], type: 'number' },
  'points-sub': { path: ['pointConfig', 'sub'], type: 'number' },
  'points-gift': { path: ['pointConfig', 'gift'], type: 'number' },
  'points-raid': { path: ['pointConfig', 'raid'], type: 'number' },
  'tip-threshold': { path: ['tipThresholdCents'], type: 'number' },
  'anonymous-mask': { path: ['anonymousMaskName'], type: 'text' },
  'screen-layout': { path: ['screenLayout'], type: 'select' },
  'layout-width': { path: ['layout', 'width'], type: 'slider' },
  'layout-padding': { path: ['layout', 'padding'], type: 'slider' },
  'layout-radius': { path: ['layout', 'borderRadius'], type: 'slider' },
  'visual-opacity': { path: ['visuals', 'opacity'], type: 'slider' },
  'visual-font-size': { path: ['visuals', 'fontSize'], type: 'slider' },
  'font-family': { path: ['fontFamily'], type: 'select' },
  'label-alignment': { path: ['labelAlignment'], type: 'select' },
  'theme-preset': { path: ['theme', 'preset'], type: 'select' },
  'rotation-enabled': { path: ['rotation', 'enabled'], type: 'checkbox' },
  'rotation-mode': { path: ['rotationMode'], type: 'select' },
};

function getValue(el) {
  const type = el.dataset.type || el.type;
  if (type === 'checkbox') return el.checked;
  if (type === 'select-one') return el.value;
  if (type === 'range') return Number(el.value);
  if (type === 'number') return Number(el.value);
  return el.value;
}

function setValue(el, val) {
  const type = el.dataset.type || el.type;
  if (type === 'checkbox') { el.checked = !!val; return; }
  if (type === 'select-one') { el.value = val; return; }
  if (type === 'range') { el.value = val; el.nextElementSibling?.textContent === undefined || (el.nextElementSibling.textContent = val + (el.id.includes('layout') ? ' px' : el.id.includes('visual') ? (el.id === 'visual-opacity' ? '%' : ' px') : '')); return; }
  if (type === 'number') { el.value = val; return; }
  el.value = val;
}

function setNested(obj, path, val) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]]) cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = val;
}

function getNested(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function syncUI() {
  for (const [id, def] of Object.entries(FIELDS)) {
    const el = $(id);
    if (!el) continue;
    const val = getNested(settings, def.path);
    setValue(el, val);
  }

  const hiddenInput = $('hidden-accounts');
  if (hiddenInput) hiddenInput.value = settings.hiddenAccounts.join(', ');

  const rotationInput = $('rotation-interval');
  if (rotationInput) rotationInput.value = Math.round(settings.rotation.intervalMs / 1000);

  ['this_stream', '7d', '30d', 'alltime'].forEach((w) => {
    const el = $('win-' + w);
    if (el) {
      const allActive = Object.values(settings.boards).every((cfg) => cfg.windows.includes(w));
      el.checked = allActive;
    }
  });

  const topInput = $('top-maximo');
  if (topInput && settings.boards) {
    const first = Object.values(settings.boards)[0];
    topInput.value = first ? first.rankCount : 10;
  }

  document.querySelectorAll('input[type="range"]').forEach((el) => {
    const label = el.nextElementSibling;
    if (label && label.tagName === 'SPAN') {
      let suffix = '';
      if (el.id === 'visual-opacity') suffix = '%';
      else if (el.id.includes('layout')) suffix = ' px';
      else if (el.id === 'visual-font-size') suffix = ' px';
      label.textContent = el.value + suffix;
    }
  });

  renderThemeColors();

  const vars = cssVars(settings);
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
  updatePreview();
}

let themeColorsPreset = '';

function renderThemeColors() {
  const container = $('theme-colors');
  if (!container) return;
  const preset = THEMES[settings.theme.preset] ?? THEMES.midnight;
  const fields = [
    { key: '--lb-bg', label: 'Background color', default: preset.background },
    { key: '--lb-text', label: 'Text color', default: preset.text },
    { key: '--lb-accent', label: 'Accent color', default: preset.accent },
    { key: '--lb-bar', label: 'Bar track color', default: preset.bar },
    { key: '--lb-rank', label: 'Rank color', default: preset.accent },
  ];

  // Rebuild only when the preset changes; rebuilding on every color input
  // destroys the element the native picker is bound to.
  if (themeColorsPreset !== settings.theme.preset || container.childElementCount !== fields.length) {
    container.innerHTML = fields.map((f) => {
      const val = settings.theme.overrides[f.key] ?? f.default;
      return `
        <label class="field">
          <span>${f.label}</span>
          <input type="color" id="color-${f.key.replace('--lb-','')}" value="${val}" class="color-input">
        </label>
      `;
    }).join('');

    fields.forEach((f) => {
      const el = $('color-' + f.key.replace('--lb-', ''));
      if (el) {
        el.addEventListener('input', (e) => {
          const overrides = { ...settings.theme.overrides };
          overrides[f.key] = e.target.value;
          settings = applySettings(settings, { theme: { overrides } });
          syncUI();
        });
      }
    });

    themeColorsPreset = settings.theme.preset;
    return;
  }

  for (const f of fields) {
    const el = $('color-' + f.key.replace('--lb-', ''));
    if (el) el.value = settings.theme.overrides[f.key] ?? f.default;
  }
}

function renderBoards() {
  const container = $('boards-list');
  container.innerHTML = ALL_BOARD_TYPES.map((board) => {
    const cfg = settings.boards[board] || { active: false, windows: ['this_stream'], rankCount: 10 };
    return `
      <div class="board-section">
        <label class="field row">
          <input type="checkbox" id="board-active-${board}" ${cfg.active ? 'checked' : ''}>
          <span>${BOARD_LABELS[board]}</span>
          <span class="board-symbol">${BOARD_UNITS[board].symbol}</span>
        </label>
        <label class="field">
          <span>Etiqueta</span>
          <input id="board-label-${board}" type="text" placeholder="${BOARD_LABELS[board]}" value="${settings.boardLabels[board] ?? ''}" class="input" data-board="${board}">
        </label>
      </div>
    `;
  }).join('');

  container.querySelectorAll('input[type="checkbox"][id^="board-active-"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const board = e.target.id.replace('board-active-', '');
      const cfg = settings.boards[board] || {};
      settings = applySettings(settings, { boards: { ...settings.boards, [board]: { ...cfg, active: e.target.checked } } });
      syncUI();
    });
  });
  container.querySelectorAll('input[id^="board-label-"]').forEach((el) => {
    const applyLabel = (e) => {
      const board = e.target.dataset.board;
      const boardLabels = { ...settings.boardLabels };
      const value = (e.target.value || '').trim();
      console.log(`[dashboard] board-label ${e.type} board="${board}" value="${value}" before boardLabels=${JSON.stringify(settings.boardLabels)}`);
      if (value) boardLabels[board] = value;
      else delete boardLabels[board];
      console.log(`[dashboard] board-label ${e.type} board="${board}" after boardLabels=${JSON.stringify(boardLabels)}`);
      settings = applySettings(settings, { boardLabels });
      syncUI();
      renderBoards();
    };
    el.addEventListener('input', applyLabel);
    el.addEventListener('change', applyLabel);
  });
}

Object.entries(FIELDS).forEach(([id, def]) => {
  const el = $(id);
  if (!el) return;
  const event = def.type === 'slider' ? 'input' : def.type === 'number' ? 'change' : 'change';
  el.addEventListener(event, () => {
    const val = getValue(el);
    const partial = {};
    setNested(partial, def.path, val);
    settings = applySettings(settings, partial);
    syncUI();
  });
});

$('hidden-accounts').addEventListener('input', (e) => {
  settings = applySettings(settings, {
    hiddenAccounts: e.target.value.split(',').map((a) => a.trim()).filter(Boolean),
  });
  syncUI();
});

$('rotation-interval').addEventListener('change', (e) => {
  settings = applySettings(settings, { rotation: { intervalMs: (Number(e.target.value) || 30) * 1000 } });
  syncUI();
});

['this_stream', '7d', '30d', 'alltime'].forEach((w) => {
  const el = $('win-' + w);
  if (el) {
    el.addEventListener('change', (e) => {
      const boards = { ...settings.boards };
      for (const b of Object.keys(boards)) {
        const cfg = boards[b];
        const windows = e.target.checked
          ? ([...new Set([...cfg.windows, w])])
          : cfg.windows.filter((x) => x !== w);
        boards[b] = { ...cfg, windows };
      }
      settings = applySettings(settings, { boards });
      syncUI();
      renderBoards();
    });
  }
});

$('top-maximo').addEventListener('change', (e) => {
  const n = Number(e.target.value) || 10;
  const boards = { ...settings.boards };
  for (const b of Object.keys(boards)) {
    boards[b] = { ...boards[b], rankCount: n };
  }
  settings = applySettings(settings, { boards });
  syncUI();
  renderBoards();
});

const BTN_THEME_RESET = $('theme-reset');
if (BTN_THEME_RESET) {
  BTN_THEME_RESET.addEventListener('click', () => {
    settings = applySettings(settings, { theme: { overrides: {} } });
    syncUI();
  });
}

async function loadServerSettings() {
  try {
    const res = await fetchJSON('/settings', { method: 'GET' });
    if (!res.ok) {
      setSaveStatus('No se pudieron cargar las configuraciones');
      return;
    }
    const data = await res.json();
    obsToken = data.obsToken || '';
    updateCopyButton();
    updatePreview();
    if (data.settings) {
      settings = applySettings(DEFAULT_SETTINGS, data.settings);
      syncUI();
      renderBoards();
    }
    await startRoom();
  } catch (e) {
    console.warn('[settings] load failed', e);
  }
}

BTN_SAVE.addEventListener('click', async () => {
  BTN_SAVE.disabled = true;
  BTN_SAVE.textContent = 'Saving…';
  setSaveStatus('Guardando…');
  try {
    console.log('[dashboard] save payload boardLabels:', JSON.stringify(settings.boardLabels));
    const res = await fetchJSON('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveStatus('Save failed: ' + (data.error || 'unknown error'));
      flash('Save failed', 'err');
      return;
    }
    const data = await res.json();
    console.log('[dashboard] save response boardLabels:', JSON.stringify(data.settings?.boardLabels));
    settings = applySettings(DEFAULT_SETTINGS, data.settings);
    syncUI();
    renderBoards();
    setSaveStatus('Guardado — overlay actualizado');
    flash('Configuración guardada');
  } catch (e) {
    setSaveStatus('Error al guardar');
    flash('Error al guardar', 'err');
  } finally {
    BTN_SAVE.disabled = false;
    BTN_SAVE.textContent = 'Guardar configuración';
  }
});

// ---- Init ----
syncUI();
renderBoards();
checkSession();
