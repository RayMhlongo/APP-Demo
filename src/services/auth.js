const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE_NAME = 'cathdel-creamy-backup.json';
const NATIVE_OAUTH_WEB_REDIRECT = 'https://raymhlongo.github.io/APP-Demo/oauth-callback.html';
const NATIVE_OAUTH_CALLBACK_URI = 'cathdelcreamy://oauth-callback';
const LEGACY_NATIVE_OAUTH_CALLBACK_URI = 'com.cathdelcreamy.demo://oauth-callback';
const NATIVE_CALLBACK_PREFIXES = [
  NATIVE_OAUTH_CALLBACK_URI.toLowerCase(),
  LEGACY_NATIVE_OAUTH_CALLBACK_URI.toLowerCase()
];
const PENDING_NATIVE_AUTH_KEY = 'cathdel.creamy.nativeAuth.pending';
const INCOMING_NATIVE_AUTH_KEY = 'cathdel.creamy.nativeAuth.incoming';
const AUTH_TIMEOUT_MS = 180000;

function getCapacitor() {
  return window.Capacitor || null;
}

function getPlugin(name) {
  const cap = getCapacitor();
  return cap && cap.Plugins ? cap.Plugins[name] : null;
}

function isNativeCapacitor() {
  const cap = getCapacitor();
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

function platformName() {
  const cap = getCapacitor();
  if (!(cap && typeof cap.getPlatform === 'function')) return 'web';
  try {
    return cap.getPlatform() || 'web';
  } catch {
    return 'web';
  }
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return '';
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage persistence errors.
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage persistence errors.
  }
}

function readJson(key) {
  const raw = safeStorageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  safeStorageSet(key, JSON.stringify(value));
}

function generateStateToken(length = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const cryptoApi = window.crypto || window.msCrypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return [...bytes].map((b) => chars[b % chars.length]).join('');
  }
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function parseAuthError(err) {
  const raw = String((err && (err.error || err.message || err.type)) || '').toLowerCase();
  if (!raw) return { code: 'unknown', message: 'Unknown Google auth error.' };
  if (raw.includes('popup') && raw.includes('closed')) return { code: 'auth_cancelled', message: 'Google sign-in was cancelled.' };
  if (raw.includes('popup') && raw.includes('blocked')) return { code: 'popup_blocked', message: 'Popup blocked. Allow popups and try again.' };
  if (raw.includes('idpiframe') || raw.includes('origin')) return { code: 'invalid_origin', message: 'OAuth origin mismatch. Add this app origin in Google OAuth settings.' };
  if (raw.includes('redirect')) return { code: 'invalid_redirect', message: 'OAuth redirect URI mismatch. Check Google OAuth redirect configuration.' };
  if (raw.includes('invalid_client')) return { code: 'invalid_client_id', message: 'OAuth client ID is invalid for this app.' };
  if (raw.includes('token')) return { code: 'token_error', message: 'Google token request failed. Try reconnecting Google.' };
  if (raw.includes('access_denied')) return { code: 'access_denied', message: 'Access denied by user or OAuth policy.' };
  if (raw.includes('timeout')) return { code: 'auth_timeout', message: 'Google sign-in timed out.' };
  return { code: 'auth_error', message: `Google auth failed: ${err?.error || err?.message || 'Unknown issue'}` };
}

function validateClientId(clientId) {
  const value = String(clientId || '').trim();
  if (!value) return { ok: false, code: 'missing_client_id', message: 'Google OAuth Client ID is missing in settings.' };
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(value)) {
    return { ok: false, code: 'invalid_client_id', message: 'Google OAuth Client ID format is invalid.' };
  }
  return { ok: true };
}

function buildNativeAuthUrl(clientId, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: NATIVE_OAUTH_WEB_REDIRECT,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function isKnownNativeCallbackUrl(url) {
  const incoming = String(url || '').toLowerCase();
  return NATIVE_CALLBACK_PREFIXES.some((prefix) => incoming.startsWith(prefix));
}

function storePendingNativeAuth(data) {
  writeJson(PENDING_NATIVE_AUTH_KEY, data);
}

function readPendingNativeAuth() {
  return readJson(PENDING_NATIVE_AUTH_KEY);
}

function clearPendingNativeAuth() {
  safeStorageRemove(PENDING_NATIVE_AUTH_KEY);
}

function storeIncomingNativeCallback(url) {
  safeStorageSet(INCOMING_NATIVE_AUTH_KEY, String(url || ''));
}

function readIncomingNativeCallback() {
  return String(safeStorageGet(INCOMING_NATIVE_AUTH_KEY) || '').trim();
}

function clearIncomingNativeCallback() {
  safeStorageRemove(INCOMING_NATIVE_AUTH_KEY);
}

function parseNativeCallback(url, expectedState = '') {
  const incoming = String(url || '').trim();
  if (!incoming || !isKnownNativeCallbackUrl(incoming)) {
    return { ok: false, code: 'invalid_callback_uri', message: 'Google callback did not return through the registered app link.' };
  }

  try {
    const parsed = new URL(incoming);
    const returnedState = parsed.searchParams.get('state');
    if (expectedState && returnedState !== expectedState) {
      return { ok: false, code: 'state_mismatch', message: 'Google sign-in state mismatch. Please retry.' };
    }

    const error = parsed.searchParams.get('error');
    if (error) {
      return {
        ok: false,
        code: error,
        message: parsed.searchParams.get('error_description') || `Google sign-in failed (${error}).`
      };
    }

    const accessToken = parsed.searchParams.get('access_token');
    if (!accessToken) {
      return { ok: false, code: 'missing_access_token', message: 'Google callback did not return an access token.' };
    }

    return {
      ok: true,
      token: accessToken,
      expiresIn: Math.max(30, Number(parsed.searchParams.get('expires_in') || 3600))
    };
  } catch (error) {
    return {
      ok: false,
      code: 'callback_parse_failed',
      message: `Unable to parse OAuth callback: ${error.message || 'unknown'}`
    };
  }
}

function summarizeBackupPayload(payload) {
  const state = payload && payload.state ? payload.state : payload || {};
  const products = Array.isArray(state.products) ? state.products.length : 0;
  const customers = Array.isArray(state.customers) ? state.customers.length : 0;
  const wallets = Array.isArray(state.wallets) ? state.wallets.length : 0;
  const entries = Array.isArray(state.entries) ? state.entries.length : 0;
  const saleEntries = Array.isArray(state.entries) ? state.entries.filter((entry) => entry.type === 'sale').length : 0;
  const noSaleEntries = Array.isArray(state.entries) ? state.entries.filter((entry) => entry.type === 'no_sale').length : 0;
  const activity = Array.isArray(state.activity) ? state.activity.length : 0;
  const exportedAt = String((payload && payload.exportedAt) || '').trim();
  const text = `${customers} customer${customers === 1 ? '' : 's'}, ${wallets} wallet${wallets === 1 ? '' : 's'}, ${entries} log${entries === 1 ? '' : 's'}`;
  return {
    exportedAt,
    products,
    customers,
    wallets,
    entries,
    saleEntries,
    noSaleEntries,
    activity,
    text
  };
}

function environmentStatus(clientId = '') {
  const native = isNativeCapacitor();
  const platform = platformName();
  const clientCheck = validateClientId(clientId);
  if (!clientCheck.ok) {
    return {
      supported: false,
      code: clientCheck.code,
      platform,
      message: clientCheck.message
    };
  }

  if (native && platform !== 'web') {
    const Browser = getPlugin('Browser');
    const App = getPlugin('App');
    if (!Browser || !App || typeof Browser.open !== 'function' || typeof App.addListener !== 'function') {
      return {
        supported: false,
        code: 'native_oauth_plugins_missing',
        platform,
        message: 'Native Browser/App plugins are required for Android Google sign-in.'
      };
    }
    return {
      supported: true,
      code: 'ok',
      platform,
      message: 'Native Google sign-in is ready.',
      redirectUri: NATIVE_OAUTH_WEB_REDIRECT,
      callbackUri: NATIVE_OAUTH_CALLBACK_URI
    };
  }

  if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
    return {
      supported: false,
      code: 'missing_google_sdk',
      platform,
      message: 'Google SDK not loaded. Check internet connection and retry.'
    };
  }
  return { supported: true, platform, code: 'ok', message: 'Google OAuth ready.' };
}

export function createAuthService({ getState, setState }) {
  let token = '';
  let tokenExpiresAt = 0;
  let nativeBridgeReady = null;
  let callbackResolver = null;
  let launchUrlChecked = false;

  function getGoogleConfig() {
    const state = getState();
    const clientId = String(state.settings.googleClientId || '').trim();
    return {
      clientId,
      connection: state.settings.googleConnection || {
        connected: false,
        email: '',
        connectedAt: '',
        backupExists: false,
        backupModifiedAt: '',
        backupSummary: '',
        lastBackupAt: '',
        lastRestoreAt: ''
      },
      environment: environmentStatus(clientId),
      nativeRedirectUri: NATIVE_OAUTH_WEB_REDIRECT,
      nativeCallbackUri: NATIVE_OAUTH_CALLBACK_URI
    };
  }

  function getEnvironmentStatus(clientIdOverride = null) {
    if (clientIdOverride !== null && clientIdOverride !== undefined) {
      return environmentStatus(String(clientIdOverride || '').trim());
    }
    return getGoogleConfig().environment;
  }

  function updateConnection(data) {
    const state = getState();
    const previous = state.settings.googleConnection || {};
    setState({
      ...state,
      settings: {
        ...state.settings,
        googleConnection: {
          connected: 'connected' in data ? Boolean(data.connected) : Boolean(previous.connected),
          email: 'email' in data ? String(data.email || '') : String(previous.email || ''),
          connectedAt: 'connectedAt' in data ? String(data.connectedAt || '') : String(previous.connectedAt || ''),
          backupExists: 'backupExists' in data ? Boolean(data.backupExists) : Boolean(previous.backupExists),
          backupModifiedAt: 'backupModifiedAt' in data ? String(data.backupModifiedAt || '') : String(previous.backupModifiedAt || ''),
          backupSummary: 'backupSummary' in data ? String(data.backupSummary || '') : String(previous.backupSummary || ''),
          lastBackupAt: 'lastBackupAt' in data ? String(data.lastBackupAt || '') : String(previous.lastBackupAt || ''),
          lastRestoreAt: 'lastRestoreAt' in data ? String(data.lastRestoreAt || '') : String(previous.lastRestoreAt || '')
        }
      }
    }, { skipActivity: true });
  }

  async function ensureNativeBridge() {
    if (!(isNativeCapacitor() && platformName() !== 'web')) return false;
    const App = getPlugin('App');
    if (!App || typeof App.addListener !== 'function') return false;

    if (!nativeBridgeReady) {
      nativeBridgeReady = (async () => {
        await App.addListener('appUrlOpen', ({ url }) => {
          if (!isKnownNativeCallbackUrl(url)) return;
          console.info('[auth] appUrlOpen received', { callbackUri: String(url || '').split('?')[0] });
          storeIncomingNativeCallback(url);
          if (callbackResolver) {
            const resolver = callbackResolver;
            callbackResolver = null;
            resolver(url);
          }
        });
        return true;
      })();
    }

    await nativeBridgeReady;

    if (!launchUrlChecked && typeof App.getLaunchUrl === 'function') {
      launchUrlChecked = true;
      try {
        const launched = await App.getLaunchUrl();
        if (launched?.url && isKnownNativeCallbackUrl(launched.url)) {
          console.info('[auth] launchUrl callback detected', { callbackUri: String(launched.url).split('?')[0] });
          storeIncomingNativeCallback(launched.url);
        }
      } catch {
        // Ignore launch URL lookup errors.
      }
    }

    return true;
  }

  function waitForIncomingNativeCallback(timeoutMs) {
    const existing = readIncomingNativeCallback();
    if (existing) {
      clearIncomingNativeCallback();
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (callbackResolver === resolver) callbackResolver = null;
        resolve('');
      }, timeoutMs);

      const resolver = (url) => {
        clearTimeout(timer);
        if (callbackResolver === resolver) callbackResolver = null;
        clearIncomingNativeCallback();
        resolve(String(url || ''));
      };

      callbackResolver = resolver;
    });
  }

  async function requestWebToken(clientId, { interactive = true } = {}) {
    try {
      const result = await new Promise((resolve, reject) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp && resp.access_token) resolve(resp);
            else reject(resp || new Error('No access token returned'));
          },
          error_callback: (err) => reject(err)
        });
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
      return { ok: true, token: result.access_token, expiresIn: Number(result.expires_in || 3600) };
    } catch (error) {
      const mapped = parseAuthError(error);
      return { ok: false, ...mapped };
    }
  }

  async function requestNativeToken(clientId, { interactive = true } = {}) {
    const Browser = getPlugin('Browser');
    if (!Browser || typeof Browser.open !== 'function') {
      return { ok: false, code: 'native_oauth_plugins_missing', message: 'Android Browser plugin is unavailable.' };
    }

    const bridgeReady = await ensureNativeBridge();
    if (!bridgeReady) {
      return { ok: false, code: 'native_oauth_plugins_missing', message: 'Android App deep-link listener is unavailable.' };
    }

    const pending = readPendingNativeAuth();
    if (!interactive) {
      if (pending?.state) {
        const incoming = readIncomingNativeCallback();
        if (incoming) {
          clearIncomingNativeCallback();
          const parsed = parseNativeCallback(incoming, pending.state);
          clearPendingNativeAuth();
          if (parsed.ok) return parsed;
          return parsed;
        }
      }
      return { ok: false, code: 'token_missing', message: 'Google token expired. Reconnect Google to continue.' };
    }

    clearIncomingNativeCallback();
    const stateToken = generateStateToken();
    storePendingNativeAuth({
      state: stateToken,
      startedAt: new Date().toISOString(),
      callbackUri: NATIVE_OAUTH_CALLBACK_URI
    });

    const authUrl = buildNativeAuthUrl(clientId, stateToken);
    console.info('[auth] opening native browser oauth', {
      redirectUri: NATIVE_OAUTH_WEB_REDIRECT,
      callbackUri: NATIVE_OAUTH_CALLBACK_URI
    });

    let browserFinishedHandle = null;
    try {
      if (typeof Browser.addListener === 'function') {
        browserFinishedHandle = await Browser.addListener('browserFinished', () => {
          setTimeout(() => {
            if (!readIncomingNativeCallback() && callbackResolver) {
              const resolver = callbackResolver;
              callbackResolver = null;
              resolver('__browser_closed__');
            }
          }, 1200);
        });
      }

      await Browser.open({
        url: authUrl,
        presentationStyle: 'fullscreen'
      });

      const incoming = await waitForIncomingNativeCallback(AUTH_TIMEOUT_MS);
      if (!incoming) {
        clearPendingNativeAuth();
        return { ok: false, code: 'auth_timeout', message: 'Google sign-in timed out.' };
      }

      if (incoming === '__browser_closed__') {
        clearPendingNativeAuth();
        return { ok: false, code: 'auth_cancelled', message: 'Google sign-in was closed before completion.' };
      }

      const parsed = parseNativeCallback(incoming, stateToken);
      clearPendingNativeAuth();
      if (!parsed.ok) return parsed;

      try {
        if (typeof Browser.close === 'function') await Browser.close();
      } catch {
        // Ignore browser close errors.
      }

      return parsed;
    } catch (error) {
      clearPendingNativeAuth();
      const mapped = parseAuthError(error);
      return { ok: false, ...mapped };
    } finally {
      try {
        if (browserFinishedHandle && typeof browserFinishedHandle.remove === 'function') await browserFinishedHandle.remove();
      } catch {
        // Ignore listener cleanup errors.
      }
    }
  }

  async function requestToken({ interactive = true } = {}) {
    const { clientId, environment } = getGoogleConfig();
    if (!environment.supported) {
      return { ok: false, code: environment.code, message: environment.message };
    }

    const native = isNativeCapacitor() && platformName() !== 'web';
    const result = native
      ? await requestNativeToken(clientId, { interactive })
      : await requestWebToken(clientId, { interactive });

    if (!result.ok) return result;
    token = result.token;
    tokenExpiresAt = Date.now() + ((Math.max(30, Number(result.expiresIn || 3600)) - 30) * 1000);
    return { ok: true, token };
  }

  async function ensureToken({ interactive = false } = {}) {
    if (token && Date.now() < tokenExpiresAt) return { ok: true, token };
    return requestToken({ interactive });
  }

  async function fetchUserInfo(accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`User info failed (${response.status}) ${text.slice(0, 140)}`);
    }
    return response.json();
  }

  async function driveRequest(path, { method = 'GET', body = null, parse = 'json', interactive = false } = {}) {
    const tokenResult = await ensureToken({ interactive });
    if (!tokenResult.ok) throw Object.assign(new Error(tokenResult.message), { code: tokenResult.code || 'auth_error' });

    const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        ...(body && typeof body === 'string' ? { 'Content-Type': 'application/json' } : {})
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw Object.assign(new Error(`Drive request failed (${response.status}) ${text.slice(0, 180)}`), { code: 'drive_error' });
    }
    return parse === 'text' ? response.text() : response.json();
  }

  async function findBackupFile({ interactive = false } = {}) {
    const q = encodeURIComponent(`name='${FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
    const data = await driveRequest(`/files?q=${q}&spaces=appDataFolder&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)`, {
      interactive
    });
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function inspectGoogleBackup({ interactive = false } = {}) {
    const env = getEnvironmentStatus();
    if (!env.supported) return { ok: false, code: env.code, message: env.message };

    try {
      const existing = await findBackupFile({ interactive });
      if (!existing) {
        updateConnection({
          backupExists: false,
          backupModifiedAt: '',
          backupSummary: ''
        });
        return {
          ok: true,
          exists: false,
          message: 'No Google backup found yet.'
        };
      }

      const text = await driveRequest(`/files/${existing.id}?alt=media`, { parse: 'text', interactive });
      const payload = JSON.parse(String(text || '{}'));
      const snapshot = summarizeBackupPayload(payload);
      updateConnection({
        backupExists: true,
        backupModifiedAt: existing.modifiedTime || '',
        backupSummary: snapshot.text
      });
      return {
        ok: true,
        exists: true,
        fileId: existing.id,
        modifiedAt: existing.modifiedTime || '',
        snapshot,
        message: `Google backup found: ${snapshot.text}.`
      };
    } catch (err) {
      if (String(err && err.message || '').toLowerCase().includes('json')) {
        return { ok: false, code: 'invalid_backup_payload', message: 'Google backup file is invalid JSON.' };
      }
      const mapped = parseAuthError(err);
      if (mapped.code !== 'auth_error' || mapped.message !== `Google auth failed: ${err?.error || err?.message || 'Unknown issue'}`) {
        return { ok: false, ...mapped };
      }
      return { ok: false, code: err.code || 'drive_error', message: err.message || 'Unable to inspect Google backup.' };
    }
  }

  async function finalizeConnection(accessToken, connectedAt = new Date().toISOString()) {
    const profile = await fetchUserInfo(accessToken);
    updateConnection({
      connected: true,
      email: profile.email || '',
      connectedAt
    });

    const backupInfo = await inspectGoogleBackup({ interactive: false });
    console.info('[auth] google connected', { email: profile.email || '' });
    return {
      ok: true,
      email: profile.email || '',
      backup: backupInfo.ok ? backupInfo : null,
      message: `Connected as ${profile.email || 'Google user'}`
    };
  }

  async function resumePendingGoogleConnection() {
    if (!(isNativeCapacitor() && platformName() !== 'web')) {
      return { ok: false, code: 'not_native', message: 'Native callback resume is only available in the Android app.' };
    }

    const bridgeReady = await ensureNativeBridge();
    if (!bridgeReady) {
      return { ok: false, code: 'native_oauth_plugins_missing', message: 'Android App deep-link listener is unavailable.' };
    }

    const pending = readPendingNativeAuth();
    const incoming = readIncomingNativeCallback();
    if (!pending?.state || !incoming) {
      return { ok: false, code: 'no_pending_auth', message: 'No pending Google sign-in was found.' };
    }

    clearIncomingNativeCallback();
    clearPendingNativeAuth();
    const parsed = parseNativeCallback(incoming, pending.state);
    if (!parsed.ok) return parsed;

    token = parsed.token;
    tokenExpiresAt = Date.now() + ((Math.max(30, Number(parsed.expiresIn || 3600)) - 30) * 1000);

    try {
      return await finalizeConnection(parsed.token, new Date().toISOString());
    } catch (err) {
      console.error('[auth] resume user info failed', err);
      return {
        ok: false,
        code: 'userinfo_failed',
        message: `Google token acquired, but account validation failed after returning to app: ${err.message || 'Unknown error'}`
      };
    }
  }

  async function connectGoogle() {
    const tokenResult = await requestToken({ interactive: true });
    if (!tokenResult.ok) return tokenResult;

    try {
      return await finalizeConnection(tokenResult.token, new Date().toISOString());
    } catch (err) {
      console.error('[auth] user info failed', err);
      return {
        ok: false,
        code: 'userinfo_failed',
        message: `Google token acquired, but account validation failed: ${err.message || 'Unknown error'}`
      };
    }
  }

  function disconnectGoogle() {
    token = '';
    tokenExpiresAt = 0;
    clearPendingNativeAuth();
    clearIncomingNativeCallback();
    updateConnection({
      connected: false,
      email: '',
      connectedAt: '',
      backupExists: false,
      backupModifiedAt: '',
      backupSummary: '',
      lastBackupAt: '',
      lastRestoreAt: ''
    });
    return { ok: true, message: 'Google disconnected.' };
  }

  async function backupToGoogle(payload) {
    const env = getEnvironmentStatus();
    if (!env.supported) return { ok: false, code: env.code, message: env.message };

    try {
      const tokenResult = await ensureToken({ interactive: true });
      if (!tokenResult.ok) return tokenResult;

      const existing = await findBackupFile({ interactive: false });
      const boundary = `cc-${Date.now()}`;
      const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
      const content = JSON.stringify(payload, null, 2);
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        content,
        `--${boundary}--`
      ].join('\r\n');

      const baseUrl = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,modifiedTime`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';

      const response = await fetch(baseUrl, {
        method: existing ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipart
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, code: 'backup_failed', message: `Backup failed: ${text.slice(0, 180)}` };
      }

      const uploaded = await response.json();
      const snapshot = summarizeBackupPayload(payload);
      const now = new Date().toISOString();
      updateConnection({
        backupExists: true,
        backupModifiedAt: uploaded.modifiedTime || now,
        backupSummary: snapshot.text,
        lastBackupAt: now
      });

      console.info('[auth] google backup uploaded', { summary: snapshot.text });
      return {
        ok: true,
        snapshot,
        message: `Backup uploaded to Google Drive app data. Includes ${snapshot.text}.`
      };
    } catch (err) {
      const mapped = parseAuthError(err);
      if (mapped.code !== 'auth_error' || mapped.message !== `Google auth failed: ${err?.error || err?.message || 'Unknown issue'}`) {
        return { ok: false, ...mapped };
      }
      return { ok: false, code: err.code || 'backup_failed', message: err.message || 'Unable to upload Google backup.' };
    }
  }

  async function restoreFromGoogle() {
    const env = getEnvironmentStatus();
    if (!env.supported) return { ok: false, code: env.code, message: env.message };

    try {
      const existing = await findBackupFile({ interactive: true });
      if (!existing) {
        updateConnection({
          backupExists: false,
          backupModifiedAt: '',
          backupSummary: ''
        });
        return { ok: false, code: 'no_backup', message: 'No backup file found in your Google app data.' };
      }

      const text = await driveRequest(`/files/${existing.id}?alt=media`, { parse: 'text', interactive: false });
      const parsed = JSON.parse(String(text || '{}'));
      const snapshot = summarizeBackupPayload(parsed);
      const now = new Date().toISOString();
      updateConnection({
        backupExists: true,
        backupModifiedAt: existing.modifiedTime || now,
        backupSummary: snapshot.text,
        lastRestoreAt: now
      });

      console.info('[auth] google backup restored', { summary: snapshot.text });
      return {
        ok: true,
        payload: parsed,
        snapshot,
        message: `Backup restored from Google. Loaded ${snapshot.text}.`
      };
    } catch (err) {
      if (String(err && err.message || '').toLowerCase().includes('json')) {
        return { ok: false, code: 'invalid_backup_payload', message: 'Google backup file is invalid JSON.' };
      }
      const mapped = parseAuthError(err);
      if (mapped.code !== 'auth_error' || mapped.message !== `Google auth failed: ${err?.error || err?.message || 'Unknown issue'}`) {
        return { ok: false, ...mapped };
      }
      return { ok: false, code: err.code || 'restore_failed', message: err.message || 'Unable to restore Google backup.' };
    }
  }

  return {
    getGoogleConfig,
    getEnvironmentStatus,
    connectGoogle,
    disconnectGoogle,
    backupToGoogle,
    restoreFromGoogle,
    inspectGoogleBackup,
    ensureToken,
    resumePendingGoogleConnection
  };
}
