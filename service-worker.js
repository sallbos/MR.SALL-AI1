/**
 * MR.SALL AI — Progressive Web App Service Worker
 * Version: 1.0.0
 * 
 * Provides offline application shell, asset caching, cache management,
 * and seamless fallback handling while strictly excluding private API
 * endpoints and sensitive user communications.
 */

const CACHE_VERSION = 'mrsall-ai-v1.0.0';
const CACHE_NAME = `mrsall-cache-${CACHE_VERSION}`;

// Essential App Shell resources cached on installation
const APP_SHELL = [
  './',
  './index.html',
  './founder.html',
  './login.html',
  './offline.html',
  './privacy.html',
  './terms.html',
  './manifest.webmanifest',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/auth.js',
  './js/theme.js',
  './js/language.js',
  './js/pwa.js',
  './js/tools.js',
  './assets/logo.png',
  './assets/mascot.jpg',
  './assets/mascot.png',
  './assets/favicon.png',
  './assets/icons/chat.svg',
  './assets/icons/writer.svg',
  './assets/icons/translator.svg',
  './assets/icons/study.svg',
  './assets/icons/image.svg',
  './assets/icons/code.svg',
  './assets/icons/pdf.svg',
  './assets/icons/pwa/icon-72x72.png',
  './assets/icons/pwa/icon-96x96.png',
  './assets/icons/pwa/icon-128x128.png',
  './assets/icons/pwa/icon-144x144.png',
  './assets/icons/pwa/icon-152x152.png',
  './assets/icons/pwa/icon-192x192.png',
  './assets/icons/pwa/icon-384x384.png',
  './assets/icons/pwa/icon-512x512.png',
  './assets/icons/pwa/icon-maskable-512x512.png',
  './assets/icons/pwa/apple-touch-icon.png',
  './tools/chat.html',
  './tools/writer.html',
  './tools/translator.html',
  './tools/study.html',
  './tools/image.html',
  './tools/code.html',
  './tools/pdf.html'
];

// 1. Installation — Cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use allSettled so single asset failures don't block install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[ServiceWorker] Precache failed for ${url}:`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Activation — Clean up outdated caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log(`[ServiceWorker] Removing legacy cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Determine if request is an API or sensitive request
function isApiOrSensitive(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/api') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('stability.ai')
  );
}

// 3. Fetch Event — Strict Security & Intelligent Routing
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never intercept non-GET requests (e.g. POST to AI Worker)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // SECURITY: Never cache API endpoints, OAuth tokens, or AI responses
  if (isApiOrSensitive(url)) {
    return; // Pass through directly to network
  }

  // A. Navigation Requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid, save copy in cache for offline use
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Attempt to match cached page
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback to offline page
          const offlinePage = await caches.match('./offline.html');
          return offlinePage || new Response('Offline — MR.SALL AI', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=UTF-8' }
          });
        })
    );
    return;
  }

  // B. Static Assets (CSS, JS, Images, Fonts, Icons)
  // Stale-While-Revalidate strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed; already handled by returning cachedResponse
        });

      // Return cached version immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Message Event — Manual skip-waiting trigger
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
