import { createModal } from './components/modal.js';
import { createNav } from './components/nav.js';
import { createToast } from './components/toast.js';
import { initAssistantFeature } from './features/assistant/assistant.js';
import { initDashboardFeature } from './features/dashboard/dashboard.js';
import { initReportsFeature } from './features/dashboard/reports.js';
import { initLoyaltyFeature } from './features/loyalty/loyalty.js';
import { initSalesFeature } from './features/sales/sales.js';
import { initSettingsFeature } from './features/settings/settings.js';
import { createAssistantEngine } from './services/assistant-engine.js';
import { createAuthService } from './services/auth.js';
import { createSyncService } from './services/sync.js';
import { createTelemetryService } from './services/telemetry.js';
import { createStore } from './state/store.js';
import { todayISO } from './utils/date.js';

const APP_VERSION = '1.9.0';

function isStandaloneMode() {
  const mq = window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : false;
  const iosStandalone = window.navigator && window.navigator.standalone === true;
  return Boolean(mq || iosStandalone);
}

function isIOSLike() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

function focusSelector(selector) {
  if (!selector) return;
  const target = document.querySelector(selector);
  if (target && typeof target.focus === 'function') target.focus();
}

function bootstrap() {
  const store = createStore();
  const toast = createToast(document.getElementById('toast'));
  const modal = createModal(document.getElementById('modalRoot'));
  const offlineBanner = document.getElementById('offlineBanner');
  const businessNameHeader = document.getElementById('businessNameHeader');
  const brandEyebrow = document.getElementById('brandEyebrow');
  const syncChip = document.getElementById('syncChip');
  const installBtn = document.getElementById('installBtn');
  const splash = document.getElementById('splashScreen');
  const screenRoot = document.getElementById('screenRoot');
  const navRoot = document.querySelector('.bottom-nav');

  const telemetry = createTelemetryService({
    getState: store.getState,
    appVersion: APP_VERSION
  });
  const authService = createAuthService({
    getState: store.getState,
    setState: store.setState
  });
  const assistantEngine = createAssistantEngine({
    getState: store.getState,
    telemetry
  });

  let deferredPrompt = null;
  let syncMeta = { status: navigator.onLine ? 'online' : 'offline', offlineWrites: 0 };
  let renderLock = false;
  let lastSavedAt = store.getState().lastSavedAt;

  const nav = createNav(navRoot, screenRoot, (screen) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    telemetry.track('screen_view', { screen });
    if (screen === 'assistant') telemetry.track('chatbot_opened');
  });

  function updateSyncUi(state) {
    const linked = state.settings.googleConnection?.connected;
    const modeLabel = linked ? 'Google linked' : 'Local storage';
    if (syncMeta.status === 'offline') {
      const suffix = syncMeta.offlineWrites > 0 ? ` (${syncMeta.offlineWrites} local changes)` : '';
      syncChip.textContent = `Offline${suffix}`;
      syncChip.dataset.status = 'offline';
      offlineBanner.hidden = false;
      return;
    }
    syncChip.textContent = `Online: ${modeLabel}`;
    syncChip.dataset.status = 'online';
    offlineBanner.hidden = true;
  }

  const syncService = createSyncService(toast);
  syncService.subscribe((meta) => {
    syncMeta = meta;
    updateSyncUi(store.getState());
  });

  function navigateToSalesDate(date) {
    nav.activate('sales');
    const saleDateInput = document.getElementById('saleDate');
    const noSaleDateInput = document.getElementById('noSaleDate');
    if (saleDateInput) saleDateInput.value = date || todayISO();
    if (noSaleDateInput) noSaleDateInput.value = date || todayISO();
    focusSelector('#saleAmount');
  }

  const features = [];
  const dashboard = initDashboardFeature({ store, modal, navigateToSalesDate });
  const reports = initReportsFeature({ store, showToast: toast, telemetry });
  const sales = initSalesFeature({ store, showToast: toast, modal, renderAll, telemetry });
  const loyalty = initLoyaltyFeature({ store, showToast: toast, modal, renderAll, telemetry });
  const assistant = initAssistantFeature({ assistantEngine, showToast: toast, telemetry });
  const settings = initSettingsFeature({
    store,
    authService,
    showToast: toast,
    modal,
    renderAll,
    telemetry,
    onAssistantConfigUpdated: () => {
      telemetry.track('assistant_config_updated');
    },
    onObservabilityConfigUpdated: async () => {
      const result = await telemetry.initialize();
      const ready = [];
      if (result.posthog.ok) ready.push('PostHog');
      if (result.sentry.ok) ready.push('Sentry');
      if (ready.length) toast(`Telemetry ready: ${ready.join(' + ')}`);
    }
  });
  features.push(dashboard, reports, sales, loyalty, assistant, settings);

  function renderShell(state) {
    businessNameHeader.textContent = state.settings.businessName || 'CreamTrack Vendor';
    brandEyebrow.textContent = state.settings.valueProp || 'Small Business Console';
    updateSyncUi(state);
  }

  function renderAll() {
    if (renderLock) return;
    renderLock = true;
    const state = store.getState();
    renderShell(state);
    features.forEach((feature) => feature.render(state));
    renderLock = false;
  }

  function refreshInstallButton() {
    if (isStandaloneMode()) {
      installBtn.hidden = true;
      return;
    }
    installBtn.hidden = !(deferredPrompt || isIOSLike());
  }

  installBtn.addEventListener('click', async () => {
    if (isStandaloneMode()) {
      toast('App is already installed on this device.');
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      refreshInstallButton();
      telemetry.track('install_prompt_result', { outcome: choice.outcome });
      toast(choice.outcome === 'accepted' ? 'App installed successfully.' : 'Install cancelled.');
      return;
    }
    if (isIOSLike()) {
      await modal.alert('Install App', 'On iPhone/iPad, tap Share and then "Add to Home Screen".');
      return;
    }
    toast('Install option is not available yet. Reload and try again.');
  });

  syncChip.addEventListener('click', () => nav.activate('settings'));

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-go-screen]');
    if (!btn) return;
    nav.activate(btn.dataset.goScreen || 'dashboard');
    focusSelector(btn.dataset.focus || '');
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    refreshInstallButton();
    telemetry.track('install_prompt_shown');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshInstallButton();
    telemetry.track('install_completed');
    toast('App installed. You can open it from your home screen.');
  });

  window.addEventListener('error', (event) => {
    telemetry.captureError(event.error || new Error(event.message || 'Window error'), { area: 'window_error' });
    toast('An unexpected error occurred. Please try again.');
  });
  window.addEventListener('unhandledrejection', (event) => {
    telemetry.captureError(event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled rejection')), { area: 'promise_rejection' });
    toast('A background task failed. Check connection and retry.');
  });

  store.subscribe((state) => {
    if (state.lastSavedAt !== lastSavedAt) {
      if (syncMeta.status === 'offline') syncService.recordLocalWrite();
      lastSavedAt = state.lastSavedAt;
    }
    renderAll();
  });

  telemetry.initialize().then((result) => {
    const ready = [];
    if (result.posthog.ok) ready.push('PostHog');
    if (result.sentry.ok) ready.push('Sentry');
    if (ready.length) {
      telemetry.identify(store.getState().settings.businessName || 'creamtrack-user');
      telemetry.track('app_boot', { tools: ready.join(',') });
    }
  }).catch(() => {});

  renderAll();
  refreshInstallButton();

  setTimeout(() => {
    if (splash) splash.classList.add('is-hidden');
  }, 900);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        registration.update().catch(() => {});
      } catch {
        toast('Offline mode could not initialize.');
      }
    });
  }
}

bootstrap();
