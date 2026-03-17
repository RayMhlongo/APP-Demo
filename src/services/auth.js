const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE_NAME = 'cathdel-creamy-backup.json';

function isNativeCapacitor() {
  try {
    return Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

function platformName() {
  try {
    if (!(window.Capacitor && typeof window.Capacitor.getPlatform === 'function')) return 'web';
    return window.Capacitor.getPlatform() || 'web';
  } catch {
    return 'web';
  }
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

function environmentStatus(clientId = '') {
  const native = isNativeCapacitor();
  const platform = platformName();
  if (native && platform !== 'web') {
    return {
      supported: false,
      code: 'unsupported_environment',
      platform,
      message: 'Google popup OAuth is not supported in this APK WebView build. Use the web app in Chrome, or add native Google Sign-In plugins and redirect flow.'
    };
  }
  const clientCheck = validateClientId(clientId);
  if (!clientCheck.ok) {
    return {
      supported: false,
      code: clientCheck.code,
      platform,
      message: clientCheck.message
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
      environment: environmentStatus(clientId)
    };
  }

  function getEnvironmentStatus(clientIdOverride = null) {
    if (clientIdOverride !== null && clientIdOverride !== undefined) {
      return environmentStatus(String(clientIdOverride || '').trim());
    }
    return getGoogleConfig().environment;
  }

  async function requestToken({ interactive = true } = {}) {
    const { clientId, environment } = getGoogleConfig();
    if (!environment.supported) {
      return { ok: false, code: environment.code, message: environment.message };
    }

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

      token = result.access_token;
      tokenExpiresAt = Date.now() + ((Number(result.expires_in || 3600) - 30) * 1000);
      return { ok: true, token };
    } catch (err) {
      const mapped = parseAuthError(err);
      return { ok: false, ...mapped };
    }
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
      throw new Error(`User info failed (${response.status}) ${text.slice(0, 120)}`);
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
      return {
        ok: true,
        email: profile.email || '',
        message: `Connected as ${profile.email || 'Google user'}`
      };
    } catch (err) {
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
      throw Object.assign(new Error(`Drive request failed (${response.status}) ${text.slice(0, 160)}`), { code: 'drive_error' });
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
        return { ok: false, code: 'backup_failed', message: `Backup failed: ${text.slice(0, 160)}` };
      }
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
