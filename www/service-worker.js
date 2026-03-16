const CACHE_VERSION = 'creamtrack-v18';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_FALLBACK_URL = new URL('./index.html', self.location.href).toString();

const APP_SHELL = [
  './',
  './index.html',
  './index.html?source=pwa',
  './manifest.json',
  './service-worker.js',
  './client-logo.png',
  './LOGOO.jpeg',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  './src/main.js',
  './src/components/modal.js',
  './src/components/nav.js',
  './src/components/toast.js',
  './src/features/assistant/assistant.js',
  './src/features/dashboard/dashboard.js',
  './src/features/loyalty/loyalty.js',
  './src/features/qr/qr.js',
  './src/features/sales/sales.js',
  './src/features/settings/settings.js',
  './src/services/analytics.js',
  './src/services/auth.js',
  './src/services/storage.js',
  './src/services/sync.js',
  './src/state/store.js',
  './src/styles/app.css',
  './src/styles/tokens.css',
  './src/utils/date.js',
  './src/utils/format.js',
  './src/utils/id.js'
];

const THIRD_PARTY_ASSETS = [
  'https://accounts.google.com/gsi/client',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shellCache = await caches.open(APP_SHELL_CACHE);
    await shellCache.addAll(APP_SHELL);

    const runtimeCache = await caches.open(RUNTIME_CACHE);
    await Promise.all(
      THIRD_PARTY_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { mode: 'no-cors' });
          await runtimeCache.put(url, response);
        } catch {
          // Optional assets can fail during install when offline.
        }
      })
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network response was not ok');
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || networkPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response) await cache.put(request, response.clone());
  return response;
}

function isStaticAsset(pathname) {
  return (
    pathname.includes('/icons/') ||
    pathname.includes('/src/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.woff2')
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.hostname.includes('script.google.com')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, OFFLINE_FALLBACK_URL));
    return;
  }

  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('accounts.google.com')
  ) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
  }
});
