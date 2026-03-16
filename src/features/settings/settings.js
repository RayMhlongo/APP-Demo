import { exportBackup, importBackup } from '../../services/storage.js';
import { escapeHtml } from '../../utils/format.js';
import { validateSettingsInput } from '../../services/validation.js';

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

function downloadBlob(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
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
  const operatingDaysSelect = document.getElementById('settingOperatingDays');
  const statusEl = document.getElementById('googleStatus');
  const telemetryStatusEl = document.getElementById('telemetryStatus');
  const connectBtn = document.getElementById('googleConnectBtn');
  const disconnectBtn = document.getElementById('googleDisconnectBtn');
  const backupBtn = document.getElementById('backupGoogleBtn');
  const restoreBtn = document.getElementById('restoreGoogleBtn');

  operatingDaysSelect.innerHTML = DAYS.map((day) => `<option value="${day.value}">${day.label}</option>`).join('');

  function selectedValues(select) {
    return [...select.options].filter((option) => option.selected).map((option) => Number(option.value));
  }

  function renderGoogleStatus(state) {
    const conn = state.settings.googleConnection;
    if (!state.settings.googleClientId) {
      statusEl.innerHTML = 'Google: Not configured. Add OAuth Client ID first.';
      return;
    }
    if (!conn.connected) {
      statusEl.innerHTML = 'Google: Configured but not connected.';
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

  function render(state) {
    document.getElementById('settingBusinessName').value = state.settings.businessName || '';
    document.getElementById('settingCurrency').value = state.settings.currency || 'ZAR';
    document.getElementById('settingLoyaltyThreshold').value = String(state.settings.loyaltyThreshold || 10);
    document.getElementById('settingGoogleClientId').value = state.settings.googleClientId || '';
    document.getElementById('settingPosthogKey').value = state.settings.observability?.posthogKey || '';
    document.getElementById('settingPosthogHost').value = state.settings.observability?.posthogHost || 'https://app.posthog.com';
    document.getElementById('settingSentryDsn').value = state.settings.observability?.sentryDsn || '';
    document.getElementById('settingAssistantProvider').value = state.settings.assistant?.provider || 'none';
    document.getElementById('settingAssistantApiKey').value = state.settings.assistant?.apiKey || '';
    document.getElementById('settingAssistantModel').value = state.settings.assistant?.model || '';
    document.getElementById('settingAssistantBaseUrl').value = state.settings.assistant?.baseUrl || '';

    [...operatingDaysSelect.options].forEach((option) => {
      option.selected = (state.settings.operatingDays || []).includes(Number(option.value));
    });

    renderGoogleStatus(state);
    renderTelemetryStatus(state);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const businessName = String(document.getElementById('settingBusinessName').value || '').trim();
    const currency = document.getElementById('settingCurrency').value;
    const loyaltyThreshold = Math.max(1, Number(document.getElementById('settingLoyaltyThreshold').value || 10));
    const googleClientId = String(document.getElementById('settingGoogleClientId').value || '').trim();
    const operatingDays = selectedValues(operatingDaysSelect);

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
      draft.settings.businessName = businessName;
      draft.settings.currency = currency;
      draft.settings.loyaltyThreshold = loyaltyThreshold;
      draft.settings.googleClientId = googleClientId;
      draft.settings.operatingDays = operatingDays;
      draft.settings.observability = observability;
      draft.settings.assistant = assistantConfig;
      if (!googleClientId) {
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

  document.getElementById('downloadBackupBtn').addEventListener('click', () => {
    const payload = exportBackup(store.getState());
    downloadBlob(`creamtrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    telemetry.track('backup_downloaded');
    showToast('Backup downloaded.');
  });

  document.getElementById('importBackupInput').addEventListener('change', async (event) => {
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

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const state = store.getState();

    const salesCsv = [
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
    ].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

    const customerCsv = [
      ['id', 'type', 'name', 'guardianName', 'grade', 'phone', 'qrId', 'walletId'],
      ...state.customers.map((customer) => [customer.id, customer.type, customer.name, customer.guardianName, customer.grade, customer.phone, customer.qrId, customer.walletId])
    ].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

    downloadBlob(`creamtrack-sales-${new Date().toISOString().slice(0, 10)}.csv`, salesCsv, 'text/csv;charset=utf-8');
    downloadBlob(`creamtrack-customers-${new Date().toISOString().slice(0, 10)}.csv`, customerCsv, 'text/csv;charset=utf-8');
    telemetry.track('settings_export_csv');
    showToast('CSV exports downloaded.');
  });

  return { render };
}
