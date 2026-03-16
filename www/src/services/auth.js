const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'creamtrack-backup.json';

function parseAuthError(err) {
  const raw = String(err && (err.error || err.message || err.type) || '').toLowerCase();
  if (!raw) return { code: 'unknown', message: 'Unknown Google auth error.' };
  if (raw.includes('popup') && raw.includes('closed')) return { code: 'auth_cancelled', message: 'Google sign-in was cancelled.' };
  if (raw.includes('popup') && raw.includes('blocked')) return { code: 'popup_blocked', message: 'Popup blocked. Allow popups for this app.' };
  if (raw.includes('origin')) return { code: 'invalid_origin', message: 'Origin not allowed. Update OAuth authorized origins.' };
  if (raw.includes('redirect')) return { code: 'invalid_redirect', message: 'Redirect URI not configured correctly.' };
  if (raw.includes('access_denied')) return { code: 'access_denied', message: 'Access denied by user or OAuth policy.' };
  return { code: 'auth_error', message: `Google auth failed: ${err?.error || err?.message || 'Unknown issue'}` };
}

export function createAuthService({ getState, setState }) {
  let token = '';
  let tokenExpiresAt = 0;

  function getGoogleConfig() {
    const state = getState();
    return {
      clientId: String(state.settings.googleClientId || '').trim(),
      connection: state.settings.googleConnection || { connected: false, email: '', connectedAt: '' }
    };
  }

  async function requestToken({ interactive = true } = {}) {
    const { clientId } = getGoogleConfig();
    if (!clientId) {
      return { ok: false, code: 'missing_client_id', message: 'Google OAuth Client ID is missing in settings.' };
    }
    if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
      return { ok: false, code: 'missing_google_sdk', message: 'Google SDK not loaded. Check internet connection.' };
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
    if (!response.ok) throw new Error(`User info failed (${response.status})`);
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
        message: `Connected token received but account validation failed: ${err.message || 'Unknown error'}`
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
    if (!tokenResult.ok) throw Object.assign(new Error(tokenResult.message), { code: tokenResult.code });

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
      throw Object.assign(new Error(`Drive request failed (${response.status}) ${text.slice(0, 140)}`), { code: 'drive_error' });
    }
    return parse === 'text' ? response.text() : response.json();
  }

  async function findBackupFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
    const data = await driveRequest(`/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function backupToGoogle(payload) {
    try {
      const tokenResult = await ensureToken({ interactive: true });
      if (!tokenResult.ok) return tokenResult;

      const existing = await findBackupFile();
      const boundary = `ct-${Date.now()}`;
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
        return { ok: false, code: 'backup_failed', message: `Backup failed: ${text.slice(0, 140)}` };
      }
      return { ok: true, message: 'Backup uploaded to Google Drive app data.' };
    } catch (err) {
      const mapped = parseAuthError(err);
      return { ok: false, ...mapped };
    }
  }

  async function restoreFromGoogle() {
    try {
      const tokenResult = await ensureToken({ interactive: true });
      if (!tokenResult.ok) return tokenResult;
      const existing = await findBackupFile();
      if (!existing) return { ok: false, code: 'no_backup', message: 'No backup file found in your Google app data.' };

      const text = await driveRequest(`/files/${existing.id}?alt=media`, { parse: 'text', interactive: false });
      const parsed = JSON.parse(String(text || '{}'));
      return { ok: true, payload: parsed, message: 'Backup restored from Google.' };
    } catch (err) {
      const mapped = parseAuthError(err);
      return { ok: false, ...mapped };
    }
  }

  return {
    getGoogleConfig,
    connectGoogle,
    disconnectGoogle,
    backupToGoogle,
    restoreFromGoogle,
    ensureToken
  };
}
