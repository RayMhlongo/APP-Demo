const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE_NAME = 'cathdel-creamy-backup.json';
const NATIVE_OAUTH_WEB_REDIRECT = 'https://raymhlongo.github.io/APP-Demo/oauth-callback.html';
const NATIVE_OAUTH_CALLBACK_URI = 'com.cathdelcreamy.demo://oauth-callback';
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
  const raw = String(err && (err.error || err.message || err.type) || '').toLowerCase();
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
      redirectUri: NATIVE_OAUTH_WEB_REDIRECT
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

  function getGoogleConfig() {
    const state = getState();
    const clientId = String(state.settings.googleClientId || '').trim();
    return {
      clientId,
      connection: state.settings.googleConnection || { connected: false, email: '', connectedAt: '' },
      environment: environmentStatus(clientId),
      nativeRedirectUri: NATIVE_OAUTH_WEB_REDIRECT
    };
  }

  function getEnvironmentStatus(clientIdOverride = null) {
    if (clientIdOverride !== null && clientIdOverride !== undefined) {
      return environmentStatus(String(clientIdOverride || '').trim());
    }
    return getGoogleConfig().environment;
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
    if (!interactive) {
      return { ok: false, code: 'token_missing', message: 'Google token expired. Reconnect Google to continue.' };
    }

    const Browser = getPlugin('Browser');
    const App = getPlugin('App');
    if (!Browser || !App || typeof Browser.open !== 'function' || typeof App.addListener !== 'function') {
      return { ok: false, code: 'native_oauth_plugins_missing', message: 'Android Browser/App plugins are unavailable.' };
    }

    const stateToken = generateStateToken();
    const authUrl = buildNativeAuthUrl(clientId, stateToken);
    console.info('[auth] opening native browser oauth', { redirect: NATIVE_OAUTH_WEB_REDIRECT });

    return new Promise(async (resolve) => {
      let settled = false;
      let appHandle = null;
      let browserFinishedHandle = null;

      const finish = async (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        try {
          if (appHandle && typeof appHandle.remove === 'function') await appHandle.remove();
          if (browserFinishedHandle && typeof browserFinishedHandle.remove === 'function') await browserFinishedHandle.remove();
        } catch {
          // ignore listener cleanup errors
        }
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        finish({ ok: false, code: 'auth_timeout', message: 'Google sign-in timed out.' });
      }, AUTH_TIMEOUT_MS);

      appHandle = await App.addListener('appUrlOpen', async ({ url }) => {
        const incoming = String(url || '');
        if (!incoming.toLowerCase().startsWith(NATIVE_OAUTH_CALLBACK_URI.toLowerCase())) return;

        try {
          const parsed = new URL(incoming);
          const returnedState = parsed.searchParams.get('state');
          if (!returnedState || returnedState !== stateToken) {
            await finish({ ok: false, code: 'state_mismatch', message: 'Google sign-in state mismatch. Please retry.' });
            return;
          }

          const error = parsed.searchParams.get('error');
          if (error) {
            await finish({
              ok: false,
              code: error,
              message: parsed.searchParams.get('error_description') || `Google sign-in failed (${error}).`
            });
            return;
          }

          const accessToken = parsed.searchParams.get('access_token');
          if (!accessToken) {
            await finish({ ok: false, code: 'missing_access_token', message: 'Google callback did not return an access token.' });
            return;
          }

          const expiresIn = Math.max(30, Number(parsed.searchParams.get('expires_in') || 3600));
          try {
            if (typeof Browser.close === 'function') await Browser.close();
          } catch {
            // ignore browser close errors
          }
          await finish({ ok: true, token: accessToken, expiresIn });
        } catch (errorObj) {
          await finish({ ok: false, code: 'callback_parse_failed', message: `Unable to parse OAuth callback: ${errorObj.message || 'unknown'}` });
        }
      });

      if (typeof Browser.addListener === 'function') {
        browserFinishedHandle = await Browser.addListener('browserFinished', () => {
          setTimeout(() => {
            if (!settled) finish({ ok: false, code: 'auth_cancelled', message: 'Google sign-in was closed before completion.' });
          }, 400);
        });
      }

      try {
        await Browser.open({
          url: authUrl,
          presentationStyle: 'fullscreen'
        });
      } catch (error) {
        const mapped = parseAuthError(error);
        await finish({ ok: false, ...mapped });
      }
    });
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

  function updateConnection(data) {
    const state = getState();
    setState({
      ...state,
      settings: {
        ...state.settings,
        googleConnection: {
          connected: Boolean(data.connected),
          email: String(data.email || ''),
          connectedAt: String(data.connectedAt || '')
        }
      }
    }, { skipActivity: true });
  }

  async function connectGoogle() {
    const tokenResult = await requestToken({ interactive: true });
    if (!tokenResult.ok) return tokenResult;

    try {
      const profile = await fetchUserInfo(tokenResult.token);
      updateConnection({ connected: true, email: profile.email || '', connectedAt: new Date().toISOString() });
      console.info('[auth] google connected', { email: profile.email || '' });
      return {
        ok: true,
        email: profile.email || '',
        message: `Connected as ${profile.email || 'Google user'}`
      };
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
    updateConnection({ connected: false, email: '', connectedAt: '' });
    return { ok: true, message: 'Google disconnected.' };
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

  async function findBackupFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
    const data = await driveRequest(`/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function backupToGoogle(payload) {
    const env = getEnvironmentStatus();
    if (!env.supported) return { ok: false, code: env.code, message: env.message };

    try {
      const tokenResult = await ensureToken({ interactive: true });
      if (!tokenResult.ok) return tokenResult;

      const existing = await findBackupFile();
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

      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const response = await fetch(url, {
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
      console.info('[auth] google backup uploaded');
      return { ok: true, message: 'Backup uploaded to Google Drive app data.' };
    } catch (err) {
      const mapped = parseAuthError(err);
      return { ok: false, ...mapped };
    }
  }

  async function restoreFromGoogle() {
    const env = getEnvironmentStatus();
    if (!env.supported) return { ok: false, code: env.code, message: env.message };

    try {
      const tokenResult = await ensureToken({ interactive: true });
      if (!tokenResult.ok) return tokenResult;

      const existing = await findBackupFile();
      if (!existing) return { ok: false, code: 'no_backup', message: 'No backup file found in your Google app data.' };

      const text = await driveRequest(`/files/${existing.id}?alt=media`, { parse: 'text', interactive: false });
      const parsed = JSON.parse(String(text || '{}'));
      console.info('[auth] google backup restored');
      return { ok: true, payload: parsed, message: 'Backup restored from Google.' };
    } catch (err) {
      if (String(err && err.message || '').toLowerCase().includes('json')) {
        return { ok: false, code: 'invalid_backup_payload', message: 'Google backup file is invalid JSON.' };
      }
      const mapped = parseAuthError(err);
      return { ok: false, ...mapped };
    }
  }

  return {
    getGoogleConfig,
    getEnvironmentStatus,
    connectGoogle,
    disconnectGoogle,
    backupToGoogle,
    restoreFromGoogle,
    ensureToken
  };
}
