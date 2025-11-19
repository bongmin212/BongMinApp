const CACHE_VERSION = 'bongmin-app-v3';
const APP_SHELL = ['/', '/manifest.json', '/logo.png'];
const NETWORK_ONLY_HOSTS = ['supabase.co', 'supabase.in', 'supabase.net'];

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(APP_SHELL);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_VERSION);
  cache.put(request, response.clone());
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNetworkOnly = NETWORK_ONLY_HOSTS.some(host => url.hostname.endsWith(host));
  const isHtmlRequest = request.mode === 'navigate';
  const isAssetRequest = /\.(js|css)$/.test(url.pathname);

  if (isNetworkOnly) {
    event.respondWith(fetch(request));
    return;
  }

  if (isHtmlRequest || isAssetRequest) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

