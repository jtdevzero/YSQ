// Change this release id whenever any app-shell file changes.
const RELEASE = '2026-10-28-six-extras-1';
const CACHE_PREFIX = `ejfel-utan-activity18:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const SHELL_FILES = [
  './', './index.html', './styles.css', './app.js', './game.js',
  './prompts.js', './prompt-metadata.js', './difficulty.js', './custom-pack.js',
  './offline.js', './favicon.svg', './manifest.webmanifest', './icon.svg'
];
const SHELL_URLS = SHELL_FILES.map(path => new URL(path, self.registration.scope).href);
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // addAll is atomic: an unavailable file must not create a partial shell.
      await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // A newer release waits for all old game tabs to close. Never interrupt a turn.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const canonical = `${url.origin}${url.pathname}`;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && !SHELL_URLS.includes(canonical)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Serving one complete cached release avoids mixing old modules with new HTML.
    const cached = await cache.match(navigation ? INDEX_URL : canonical);
    return cached || fetch(event.request);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'OFFLINE_STATUS' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const ready = (await Promise.all(SHELL_URLS.map(url => cache.match(url)))).every(Boolean);
    event.ports[0].postMessage({ type: 'OFFLINE_STATUS', ready, release: RELEASE });
  })());
});
