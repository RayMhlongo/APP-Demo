const POSTHOG_SCRIPT_ID = 'creamtrack-posthog-sdk';
const SENTRY_SCRIPT_ID = 'creamtrack-sentry-sdk';

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function safeCall(fn) {
  try {
    fn();
  } catch {
    // Never allow telemetry failures to break product behavior.
  }
}

export function createTelemetryService({ getState, appVersion = 'dev' }) {
  let posthogReady = false;
  let sentryReady = false;

  async function initPosthog(config) {
    if (!config.posthogKey) return { ok: false, code: 'missing_posthog_key' };
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/posthog-js@1.228.0/dist/posthog.js', POSTHOG_SCRIPT_ID);
      if (!window.posthog || !window.posthog.init) return { ok: false, code: 'posthog_unavailable' };
      if (!posthogReady) {
        window.posthog.init(config.posthogKey, {
          api_host: config.posthogHost || 'https://app.posthog.com',
          person_profiles: 'identified_only',
          capture_pageview: false,
          persistence: 'localStorage'
        });
        posthogReady = true;
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, code: 'posthog_load_failed', message: error.message };
    }
  }

  async function initSentry(config) {
    if (!config.sentryDsn) return { ok: false, code: 'missing_sentry_dsn' };
    try {
      await loadScript('https://browser.sentry-cdn.com/8.33.0/bundle.min.js', SENTRY_SCRIPT_ID);
      if (!window.Sentry || !window.Sentry.init) return { ok: false, code: 'sentry_unavailable' };
      if (!sentryReady) {
        window.Sentry.init({
          dsn: config.sentryDsn,
          environment: 'production',
          release: `creamtrack@${appVersion}`,
          tracesSampleRate: 0.05
        });
        sentryReady = true;
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, code: 'sentry_load_failed', message: error.message };
    }
  }

  async function initialize() {
    const state = getState();
    const obs = state.settings.observability || {};
    const posthog = await initPosthog(obs);
    const sentry = await initSentry(obs);
    return { posthog, sentry };
  }

  function track(event, properties = {}) {
    const state = getState();
    safeCall(() => {
      if (!posthogReady || !window.posthog || !window.posthog.capture) return;
      window.posthog.capture(event, {
        app: 'CreamTrack Vendor',
        app_version: appVersion,
        business_name: state.settings.businessName || '',
        ...properties
      });
    });
  }

  function identify(identity) {
    safeCall(() => {
      if (!posthogReady || !window.posthog || !window.posthog.identify) return;
      window.posthog.identify(String(identity || '').trim() || 'anonymous');
    });
  }

  function captureError(error, context = {}) {
    safeCall(() => {
      if (sentryReady && window.Sentry && window.Sentry.captureException) {
        window.Sentry.captureException(error, { extra: context });
      }
    });
  }

  return {
    initialize,
    identify,
    track,
    captureError,
    isPosthogReady: () => posthogReady,
    isSentryReady: () => sentryReady
  };
}
