/* Relief service worker — generated at build time from web/sw-template.js.
 * App shell: cache-first. Washroom data: network-first with an offline copy.
 * Map tiles/fonts: cache-first with a size cap. Contributions: never cached. */

const VERSION = "mw01vc7w";
// Base path of this deployment ('' at a domain root, '/relief-gta' on a sub-path).
const BASE = new URL(self.registration ? self.registration.scope : new URL('./', self.location.href).href).pathname.replace(/\/$/, '');
const PRECACHE = ["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/index-B8KYSXVk.css","/assets/index-BmdJs49z.js"].map((p) => BASE + p);
const SHELL = `relief-shell-${VERSION}`;
const DATA = 'relief-data-v1';
const TILES = 'relief-tiles-v1';
const MAX_TILE_ENTRIES = 1200;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)));
      // Warm the dataset so the very first offline moment already works.
      const data = await caches.open(DATA);
      await data.add(BASE + '/data/places.json').catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('relief-shell-') && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request, cacheName, ms) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([fetch(request), timeout(ms)]);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set('x-relief-cache', 'offline');
    return new Response(await hit.blob(), { status: 200, headers });
  }
}

async function cacheFirst(request, cacheName, cap) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    if (cap) trim(cache, cap);
  }
  return response;
}

async function trim(cache, cap) {
  const keys = await cache.keys();
  if (keys.length <= cap) return;
  for (const k of keys.slice(0, keys.length - cap)) await cache.delete(k);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(
        (async () => {
          try {
            return await Promise.race([fetch(request), timeout(4000)]);
          } catch {
            return (await caches.match(BASE + '/index.html')) ?? (await caches.match(BASE + '/')) ?? Response.error();
          }
        })(),
      );
      return;
    }
    const path = BASE && url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
    if (path.startsWith('/data/')) {
      event.respondWith(networkFirst(request, DATA, 6000));
      return;
    }
    if (path === '/api/signals' || path === '/api/config') {
      event.respondWith(networkFirst(request, DATA, 5000));
      return;
    }
    if (path.startsWith('/api/')) return; // contributions & admin: network only
    if (path.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
      event.respondWith(cacheFirst(request, SHELL));
      return;
    }
    return;
  }

  // Map tiles, glyphs, sprites and styles from the tile host.
  if (/tiles\.openfreemap\.org$/.test(url.hostname)) {
    if (url.pathname.startsWith('/styles/') || url.pathname === '/planet') event.respondWith(networkFirst(request, TILES, 5000));
    else event.respondWith(cacheFirst(request, TILES, MAX_TILE_ENTRIES));
  }
});
