const CACHE_NAME = 'wedding-prep-v2';
const BASE_URL = new URL('./', self.registration.scope);
const shellUrl = (asset) => new URL(asset, BASE_URL).toString();
const INDEX_URL = shellUrl('index.html');
const APP_SHELL = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'images/couple-countdown.png',
  'src/main.js',
  'src/styles/app.css',
  'src/styles/tokens.css'
].map(shellUrl);

async function cacheShell(cache) {
  await Promise.all(APP_SHELL.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: 'no-cache' });
      if (response.ok) await cache.put(asset, response);
    } catch {
      // A production bundle uses hashed module assets; those are cached at runtime.
    }
  }));

  const index = await cache.match(INDEX_URL) || await cache.match(BASE_URL);
  if (!index) return;
  const assets = [...(await index.clone().text()).matchAll(/(?:src|href)="([^"#?]+)"/g)]
    .map((match) => new URL(match[1], index.url))
    .filter((url) => url.origin === self.location.origin);
  await Promise.all(assets.map(async (url) => {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (response.ok) await cache.put(url, response);
    } catch {
      // Individual resources can still be fetched and cached on first use.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cacheShell).then(() => self.skipWaiting()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
            await cache.put(request, response.clone());
            await cacheShell(cache);
          }));
        }
        return response;
      } catch {
        return await caches.match(request) || await caches.match(INDEX_URL);
      }
    }

    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
      }
      return response;
    } catch (error) {
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key !== CACHE_NAME)
      .map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});
