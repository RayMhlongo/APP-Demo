import { exportBackup, importBackup } from '../../services/storage.js';
import { exportTextFile } from '../../services/file-actions.js';
import { escapeHtml } from '../../utils/format.js';
import { validateSettingsInput } from '../../services/validation.js';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

function csvRow(values) {
  return values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
}

function toggleButtonBusy(button, busy, busyLabel = 'Working...') {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.originalLabel;
}

export function initSettingsFeature({
  store,
  authService,
  showToast,
  modal,
  renderAll,
  telemetry,
  onAssistantConfigUpdated,
  onObservabilityConfigUpdated
}) {
  const form = document.getElementById('settingsForm');
  const operatingDaysPicker = document.getElementById('operatingDaysPicker');
  const statusEl = document.getElementById('googleStatus');
  const telemetryStatusEl = document.getElementById('telemetryStatus');
  const connectBtn = document.getElementById('googleConnectBtn');
  const disconnectBtn = document.getElementById('googleDisconnectBtn');
  const backupBtn = document.getElementById('backupGoogleBtn');
  const restoreBtn = document.getElementById('restoreGoogleBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const downloadBackupBtn = document.getElementById('downloadBackupBtn');
  const importBackupInput = document.getElementById('importBackupInput');
  const clientIdInput = document.getElementById('settingGoogleClientId');

  let selectedDays = new Set([1, 2, 3, 4, 5, 6]);

  function selectedOperatingDays() {
    return [...selectedDays].sort((a, b) => a - b);
  }

  function renderDayPicker() {
    operatingDaysPicker.innerHTML = DAYS.map((day) => `
      <button
        class="day-toggle${selectedDays.has(day.value) ? ' is-active' : ''}"
        type="button"
        data-day="${day.value}"
        aria-pressed="${selectedDays.has(day.value) ? 'true' : 'false'}"
      >
        ${day.label}
      </button>
    `).join('');
  }

  function renderGoogleStatus(state, clientIdOverride = null) {
    const conn = state.settings.googleConnection;
    const clientId = clientIdOverride === null ? state.settings.googleClientId : String(clientIdOverride || '').trim();
    const env = authService.getEnvironmentStatus(clientId);
    statusEl.dataset.tone = env.supported ? '' : 'warning';

    if (!clientId) {
      statusEl.textContent = 'Google: Not configured. Add OAuth Client ID first.';
      return;
    }
    if (!env.supported) {
      statusEl.textContent = `Google: ${env.message}`;
      return;
    }
    if (!conn.connected) {
      statusEl.textContent = 'Google: Configured but not connected.';
      return;
    }

    const connectedAt = conn.connectedAt ? new Date(conn.connectedAt).toLocaleString('en-ZA') : 'unknown time';
    statusEl.innerHTML = `Google: Connected as <strong>${escapeHtml(conn.email || 'unknown')}</strong> on ${escapeHtml(connectedAt)}`;
  }

  function renderTelemetryStatus(state) {
    const obs = state.settings.observability || {};
    const flags = [];
    if (obs.posthogKey) flags.push('PostHog ready');
    if (obs.sentryDsn) flags.push('Sentry ready');
    telemetryStatusEl.textContent = flags.length ? `Telemetry: ${flags.join(' | ')}` : 'Telemetry: Not configured';
  }

  function syncGoogleButtonState(state, clientIdOverride = null) {
    const clientId = clientIdOverride === null ? state.settings.googleClientId : String(clientIdOverride || '').trim();
    const env = authService.getEnvironmentStatus(clientId);
    const savedClientId = String(state.settings.googleClientId || '').trim();
    const hasUnsavedClientId = clientIdOverride !== null && clientId !== savedClientId;
    const connected = Boolean(state.settings.googleConnection?.connected);
    connectBtn.disabled = !env.supported || hasUnsavedClientId;
    disconnectBtn.disabled = !connected;
    backupBtn.disabled = !env.supported || !connected;
    restoreBtn.disabled = !env.supported || !connected;
  }

  function render(state) {
    document.getElementById('settingBusinessName').value = state.settings.businessName || '';
    document.getElementById('settingCurrency').value = state.settings.currency || 'ZAR';
    document.getElementById('settingLoyaltyThreshold').value = String(state.settings.loyaltyThreshold || 10);
    clientIdInput.value = state.settings.googleClientId || '';
    document.getElementById('settingPosthogKey').value = state.settings.observability?.posthogKey || '';
    document.getElementById('settingPosthogHost').value = state.settings.observability?.posthogHost || 'https://app.posthog.com';
    document.getElementById('settingSentryDsn').value = state.settings.observability?.sentryDsn || '';
    document.getElementById('settingAssistantProvider').value = state.settings.assistant?.provider || 'none';
    document.getElementById('settingAssistantApiKey').value = state.settings.assistant?.apiKey || '';
    document.getElementById('settingAssistantModel').value = state.settings.assistant?.model || '';
    document.getElementById('settingAssistantBaseUrl').value = state.settings.assistant?.baseUrl || '';

    selectedDays = new Set((state.settings.operatingDays || []).map((day) => Number(day)));
    if (!selectedDays.size) selectedDays = new Set([1, 2, 3, 4, 5, 6]);
    renderDayPicker();
    renderGoogleStatus(state);
    renderTelemetryStatus(state);
    syncGoogleButtonState(state);
  }

  operatingDaysPicker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-day]');
    if (!btn) return;
    const value = Number(btn.dataset.day);
    if (!Number.isInteger(value)) return;
    if (selectedDays.has(value)) selectedDays.delete(value);
    else selectedDays.add(value);
    renderDayPicker();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const state = store.getState();
    const businessName = String(document.getElementById('settingBusinessName').value || '').trim();
    const currency = document.getElementById('settingCurrency').value;
    const loyaltyThreshold = Math.max(1, Number(document.getElementById('settingLoyaltyThreshold').value || 10));
    const googleClientId = String(clientIdInput.value || '').trim();
    const operatingDays = selectedOperatingDays();

    const observability = {
      posthogKey: String(document.getElementById('settingPosthogKey').value || '').trim(),
      posthogHost: String(document.getElementById('settingPosthogHost').value || '').trim() || 'https://app.posthog.com',
      sentryDsn: String(document.getElementById('settingSentryDsn').value || '').trim()
    };

    const assistantConfig = {
      provider: document.getElementById('settingAssistantProvider').value,
      apiKey: String(document.getElementById('settingAssistantApiKey').value || '').trim(),
      model: String(document.getElementById('settingAssistantModel').value || '').trim(),
      baseUrl: String(document.getElementById('settingAssistantBaseUrl').value || '').trim()
    };

    const validation = validateSettingsInput({
      businessName,
      operatingDays,
      loyaltyThreshold
    });
    if (!validation.ok) {
      showToast(validation.errors[0]);
      return;
    }

    store.update((draft) => {
      const previousClientId = String(draft.settings.googleClientId || '').trim();
      draft.settings.businessName = businessName;
      draft.settings.currency = currency;
      draft.settings.loyaltyThreshold = loyaltyThreshold;
      draft.settings.googleClientId = googleClientId;
      draft.settings.operatingDays = operatingDays;
      draft.settings.observability = observability;
      draft.settings.assistant = assistantConfig;

      if (!googleClientId || googleClientId !== previousClientId) {
        draft.settings.googleConnection = {
          connected: false,
          email: '',
          connectedAt: ''
        };
      }
    }, {
      activityMessage: 'Settings saved',
      activityType: 'settings'
    });

    telemetry.track('settings_saved');
    if (onAssistantConfigUpdated) onAssistantConfigUpdated();
    if (onObservabilityConfigUpdated) await onObservabilityConfigUpdated();
    renderAll();
    showToast('Settings saved.');
  });

  connectBtn.addEventListener('click', async () => {
    toggleButtonBusy(connectBtn, true, 'Connecting...');
    telemetry.track('google_connect_attempt');
    try {
      const typedClientId = String(clientIdInput.value || '').trim();
      const savedClientId = String(store.getState().settings.googleClientId || '').trim();
      if (typedClientId !== savedClientId) {
        await modal.alert('Save Settings First', 'Save the Google OAuth Client ID before attempting to connect.');
        return;
      }

      const result = await authService.connectGoogle();
      if (!result.ok) {
        telemetry.track('google_connect_failed', { code: result.code || 'unknown' });
        await modal.alert('Google Connect Failed', result.message || 'Unable to connect Google.');
        render(store.getState());
        return;
      }
      showToast(result.message || 'Google connected.');
      telemetry.track('google_connect_success');
      store.addActivity('Google account connected', 'auth');
      renderAll();
    } finally {
      toggleButtonBusy(connectBtn, false);
    }
  });

  disconnectBtn.addEventListener('click', async () => {
    const ok = await modal.confirm('Disconnect Google', 'Disconnect Google account from this device?');
    if (!ok) return;

    toggleButtonBusy(disconnectBtn, true, 'Disconnecting...');
    try {
      const result = authService.disconnectGoogle();
      showToast(result.message);
      telemetry.track('google_disconnect');
      store.addActivity('Google account disconnected', 'auth');
      renderAll();
    } finally {
      toggleButtonBusy(disconnectBtn, false);
    }
  });

  backupBtn.addEventListener('click', async () => {
    toggleButtonBusy(backupBtn, true, 'Backing up...');
    try {
      const payload = exportBackup(store.getState());
      const result = await authService.backupToGoogle(payload);
      if (!result.ok) {
        telemetry.track('google_backup_failed', { code: result.code || 'unknown' });
        await modal.alert('Google Backup Failed', result.message || 'Unable to backup to Google.');
        render(store.getState());
        return;
      }
      showToast(result.message || 'Backup uploaded to Google.');
      telemetry.track('google_backup_success');
      store.addActivity('Backup uploaded to Google', 'backup');
      renderAll();
    } finally {
      toggleButtonBusy(backupBtn, false);
    }
  });

  restoreBtn.addEventListener('click', async () => {
    const ok = await modal.confirm('Restore From Google', 'Restore data from Google backup? This will replace current local data.');
    if (!ok) return;

    toggleButtonBusy(restoreBtn, true, 'Restoring...');
    try {
      const result = await authService.restoreFromGoogle();
      if (!result.ok) {
        telemetry.track('google_restore_failed', { code: result.code || 'unknown' });
        await modal.alert('Google Restore Failed', result.message || 'Unable to restore from Google.');
        render(store.getState());
        return;
      }

      const imported = importBackup(result.payload);
      store.setState(imported, { activityMessage: 'State restored from Google backup', activityType: 'backup' });
      telemetry.track('google_restore_success');
      renderAll();
      showToast('Google backup restored.');
    } finally {
      toggleButtonBusy(restoreBtn, false);
    }
  });

  downloadBackupBtn.addEventListener('click', async () => {
    const payload = exportBackup(store.getState());
    const result = await exportTextFile({
      filename: `cathdel-creamy-backup-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(payload, null, 2),
      mime: 'application/json',
      title: 'Backup JSON'
    });

    if (!result.ok) {
      telemetry.track('backup_download_failed', { code: result.code || 'unknown' });
      await modal.alert('Backup Export Not Completed', result.message || 'Unable to export backup in this environment.');
      return;
    }

    telemetry.track('backup_downloaded', { method: result.method || 'unknown' });
    showToast('Backup export has started.');
  });

  importBackupInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const ok = await modal.confirm('Import Backup', 'Importing will replace local data. Continue?');
    if (!ok) {
      event.target.value = '';
      return;
    }

    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const imported = importBackup(parsed);
      store.setState(imported, { activityMessage: 'Backup imported', activityType: 'backup' });
      telemetry.track('backup_imported');
      renderAll();
      showToast('Backup imported successfully.');
    } catch {
      telemetry.track('backup_import_failed');
      await modal.alert('Invalid Backup File', 'This file is not a valid backup JSON.');
    } finally {
      event.target.value = '';
    }
  });

  exportCsvBtn.addEventListener('click', async () => {
    const state = store.getState();
    const salesRows = [
      ['id', 'type', 'date', 'amount', 'payment', 'qty', 'customerId', 'productId', 'reason', 'notes'],
      ...state.entries.map((entry) => [
        entry.id,
        entry.type,
        entry.date,
        entry.amount,
        entry.payment,
        entry.qty,
        entry.customerId,
        entry.productId,
        entry.reasonKey === 'other' ? entry.reasonText : entry.reasonKey,
        entry.notes
      ])
    ];

    const customerRows = [
      ['id', 'type', 'name', 'guardianName', 'grade', 'phone', 'qrId', 'walletId'],
      ...state.customers.map((customer) => [customer.id, customer.type, customer.name, customer.guardianName, customer.grade, customer.phone, customer.qrId, customer.walletId])
    ];

    const text = [
      '# SALES',
      ...salesRows.map(csvRow),
      '',
      '# CUSTOMERS',
      ...customerRows.map(csvRow)
    ].join('\n');

    const result = await exportTextFile({
      filename: `cathdel-creamy-export-${new Date().toISOString().slice(0, 10)}.csv`,
      content: text,
      mime: 'text/csv;charset=utf-8',
      title: 'Cathdel Creamy CSV Export'
    });

    if (!result.ok) {
      telemetry.track('settings_export_csv_failed', { code: result.code || 'unknown' });
      await modal.alert('CSV Export Not Completed', result.message || 'Unable to export CSV in this environment.');
      return;
    }

    telemetry.track('settings_export_csv', { method: result.method || 'unknown' });
    showToast('CSV export has started.');
  });

  clientIdInput.addEventListener('input', () => {
    const nextClientId = String(clientIdInput.value || '').trim();
    const state = store.getState();
    renderGoogleStatus(state, nextClientId);
    syncGoogleButtonState(state, nextClientId);
  });

  return { render };
}
