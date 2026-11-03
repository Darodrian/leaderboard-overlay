import { FUNCTIONS_BASE, APP_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = (id) => document.getElementById(id);

const DOT_OV = $('dot-ov');
const STATUS_OV = $('status-ov');
const BTN_CONNECT = $('btn-connect');
const BTN_COPY_URL = $('btn-copy-url');
const BTN_LOGOUT = $('btn-logout');
const CONNECTION_PANEL = $('connection-panel');
const CONNECTION_CONNECTED = $('connection-connected');
const CONNECTION_TITLE = $('connection-title');
const CONNECTION_STATUS = $('connection-status');
const LICENSE_SECTION = $('license-section');
const LICENSE_STATUS = $('license-status');
const LICENSE_FORM = $('license-form');
const LICENSE_KEY_IN = $('license-key');
const BTN_BIND = $('btn-bind-license');
const OBS_SECTION = $('obs-section');
const OVERLAY_URL = $('overlay-url');
const BTN_COPY_URL_OBS = $('btn-copy-url-obs');
const BTN_REGEN = $('btn-regen-token');
const SETTINGS_SECTION = $('settings-section');
const BTN_OPEN_SETTINGS = $('btn-open-settings');
const PREVIEW = $('preview');
const PREVIEW_NOTE = $('preview-note');
const MSG = $('msg');

let broadcasterId = '';
let broadcasterLogin = '';
let obsToken = '';
let overlayUrl = '';

function setOverlay(kind, text) {
  if (DOT_OV) DOT_OV.className = 'dot' + (kind ? ' ' + kind : '');
  if (STATUS_OV) STATUS_OV.textContent = text;
}

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

function showConnected(connected) {
  if (CONNECTION_PANEL) CONNECTION_PANEL.hidden = false;
  if (CONNECTION_TITLE) CONNECTION_TITLE.textContent = connected ? 'Connected' : 'Connect Twitch';
  if (BTN_CONNECT) BTN_CONNECT.hidden = connected;
  if (CONNECTION_CONNECTED) CONNECTION_CONNECTED.hidden = !connected;
  if (BTN_COPY_URL) BTN_COPY_URL.disabled = !connected;
  if (CONNECTION_STATUS) CONNECTION_STATUS.textContent = connected ? ('Connected: ' + broadcasterLogin) : '';
  if (SETTINGS_SECTION) SETTINGS_SECTION.hidden = !connected;
  setOverlay(connected ? 'live' : '', connected ? ('Channel: ' + broadcasterLogin) : 'No channel');
}

function buildOverlayUrl(token) {
  const base = new URL('overlay.html', location.href);
  base.search = 'token=' + encodeURIComponent(token);
  return base.href;
}

function updatePreview() {
  if (obsToken) {
    PREVIEW.src = buildOverlayUrl(obsToken);
    PREVIEW.hidden = false;
    PREVIEW_NOTE.textContent = 'Live preview: what you see is what goes into OBS.';
  } else {
    PREVIEW.hidden = true;
    PREVIEW_NOTE.textContent = 'Connect your Twitch account to preview the overlay.';
  }
}

function copyText(text) {
  return navigator.clipboard.writeText(text).then(() => {
    flash('Copied to clipboard');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* no clipboard */ }
    ta.remove();
    flash('Copy failed — select manually');
  });
}

async function fetchJSON(path, opts = {}) {
  const res = await fetch(FUNCTIONS_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      ...opts.headers,
    },
    credentials: 'include',
    ...opts,
  });
  return res;
}

// ---- Session check ----
async function checkSession() {
  try {
    const res = await fetchJSON('/auth-session');
    if (!res.ok) {
      showConnected(false);
      return;
    }
    const data = await res.json();
    broadcasterId = data.streamerId;
    broadcasterLogin = data.twitchLogin;
    showConnected(true);
    if (LICENSE_SECTION) LICENSE_SECTION.hidden = false;
    await loadStreamer();
  } catch (e) {
    showConnected(false);
  }
}

// ---- Load streamer data ----
async function loadStreamer() {
  try {
    const res = await fetchJSON('/settings', { method: 'GET' });
    if (!res.ok) return;
    const data = await res.json();
    obsToken = data.obsToken;
    if (OVERLAY_URL) OVERLAY_URL.textContent = buildOverlayUrl(obsToken);
    if (OBS_SECTION) OBS_SECTION.hidden = false;
    updatePreview();

    if (LICENSE_STATUS) {
      LICENSE_STATUS.textContent = data.licenseKey
        ? 'Licensed — key bound to your Twitch account.'
        : 'No license bound yet.';
    }
    if (LICENSE_FORM) LICENSE_FORM.hidden = data.licenseKey !== null;
  } catch (e) {
    console.warn('[dashboard] load streamer failed', e);
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

// ---- Logout ----
if (BTN_LOGOUT) {
  BTN_LOGOUT.addEventListener('click', async () => {
    try {
      await fetchJSON('/auth-logout', { method: 'POST' });
    } catch { /* ignore */ }
    broadcasterId = '';
    broadcasterLogin = '';
    obsToken = '';
    showConnected(false);
    BTN_CONNECT.hidden = false;
    if (LICENSE_SECTION) LICENSE_SECTION.hidden = true;
    if (OBS_SECTION) OBS_SECTION.hidden = true;
    if (SETTINGS_SECTION) SETTINGS_SECTION.hidden = true;
    updatePreview();
    flash('Signed out');
  });
}

// ---- Copy overlay URL ----
if (BTN_COPY_URL) {
  BTN_COPY_URL.addEventListener('click', async () => {
    if (!obsToken) return;
    await copyText(buildOverlayUrl(obsToken));
  });
}

if (BTN_COPY_URL_OBS) {
  BTN_COPY_URL_OBS.addEventListener('click', async () => {
    if (!obsToken) return;
    await copyText(buildOverlayUrl(obsToken));
  });
}

// ---- Bind license ----
if (BTN_BIND) {
  BTN_BIND.addEventListener('click', async () => {
    const key = LICENSE_KEY_IN.value.trim();
    if (!key) { flash('Enter a license key'); return; }
    try {
      const res = await fetchJSON('/license-validate', {
        method: 'POST',
        body: JSON.stringify({ licenseKey: key }),
      });
      const data = await res.json();
      if (!res.ok) { flash(data.error || 'Invalid license', 'err'); return; }
      flash('License bound');
      await loadStreamer();
    } catch (e) {
      flash('Could not validate this key', 'err');
    }
  });
}

// ---- Regenerate token ----
if (BTN_REGEN) {
  BTN_REGEN.addEventListener('click', async () => {
    if (!window.confirm('Regenerate the overlay URL? Old OBS sources will stop updating.')) return;
    try {
      const res = await fetchJSON('/overlay-regenerate', { method: 'POST' });
      if (!res.ok) { flash('Regeneration failed', 'err'); return; }
      const data = await res.json();
      obsToken = data.token;
      if (OVERLAY_URL) OVERLAY_URL.textContent = buildOverlayUrl(obsToken);
      updatePreview();
      flash('New URL active — update your OBS browser source');
    } catch (e) {
      flash('Regeneration failed', 'err');
    }
  });
}

// ---- Open settings ----
if (BTN_OPEN_SETTINGS) {
  BTN_OPEN_SETTINGS.addEventListener('click', () => {
    const settingsUrl = new URL('settings.html', location.href).href;
    window.open(settingsUrl, '_blank');
  });
}

checkSession();
