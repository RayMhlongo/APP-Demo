import { createModal } from './components/modal.js';
import { createNav } from './components/nav.js';
import { createToast } from './components/toast.js';
import { initAssistantFeature } from './features/assistant/assistant.js';
import { initDashboardFeature } from './features/dashboard/dashboard.js';
import { initLoyaltyFeature } from './features/loyalty/loyalty.js';
import { initSalesFeature } from './features/sales/sales.js';
import { initSettingsFeature } from './features/settings/settings.js';
import { createAuthService } from './services/auth.js';
import { createSyncService } from './services/sync.js';
import { createStore } from './state/store.js';
import { todayISO } from './utils/date.js';

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

  const authService = createAuthService({
    getState: store.getState,
    setState: store.setState
  });

  let deferredPrompt = null;
  let syncStatus = navigator.onLine ? 'online' : 'offline';
  let renderLock = false;

  const nav = createNav(navRoot, screenRoot, () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function updateSyncUi(state) {
    const linked = state.settings.googleConnection?.connected;
    let modeLabel = linked ? 'Google' : 'Local';
    if (syncStatus === 'offline') modeLabel = 'Offline';
    syncChip.textContent = `Sync: ${modeLabel}`;
    syncChip.dataset.status = syncStatus;
    offlineBanner.hidden = syncStatus !== 'offline';
  }

  const syncService = createSyncService(toast);
  syncService.subscribe((status) => {
    syncStatus = status;
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
  const sales = initSalesFeature({ store, showToast: toast, modal, renderAll });
  const loyalty = initLoyaltyFeature({ store, showToast: toast, modal, renderAll });
  const assistant = initAssistantFeature({ store, showToast: toast });
  const settings = initSettingsFeature({ store, authService, showToast: toast, modal, renderAll });
  features.push(dashboard, sales, loyalty, assistant, settings);

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
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshInstallButton();
    toast('App installed. You can open it from your home screen.');
  });

  window.addEventListener('error', () => {
    toast('An unexpected error occurred. Please try again.');
  });
  window.addEventListener('unhandledrejection', () => {
    toast('A background task failed. Check connection and retry.');
  });

  store.subscribe(() => {
    renderAll();
  });

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
