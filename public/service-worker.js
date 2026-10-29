const CACHE_NAME = 'care-attendance-pwa-v2';
const CACHE_PREFIX = 'care-attendance-pwa-';
const OFFLINE_URL = '/offline.html';
const STATIC_PREFIXES = ['/assets/fonts/', '/assets/img/', '/css/', '/js/', '/vendor/'];
const STATIC_FILE = /\.(?:css|eot|gif|ico|jpe?g|js|otf|png|svg|ttf|webp|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

function isSafeStaticAsset(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && !url.search
    && !request.headers.has('authorization')
    && !url.pathname.startsWith('/api/')
    && STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    && STATIC_FILE.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.open(CACHE_NAME)
        .then((cache) => cache.match(OFFLINE_URL))
        .then((offlinePage) => offlinePage || Response.error())),
    );
    return;
  }

  if (!isSafeStaticAsset(request, url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok || response.type !== 'basic') {
          return response;
        }
        return cache.put(request, response.clone())
          .then(() => response)
          .catch((error) => {
            console.error('[service-worker] static asset could not be cached', error);
            return response;
          });
      })
      .catch((error) => cache.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        throw error;
      }))),
  );
});
