import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const scope = 'https://example.test/YSQ/activity18/';
const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const offlineSource = await readFile(new URL('../offline.js', import.meta.url), 'utf8');

function serviceWorkerHarness({ failFile = null } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const requests = [];
  const network = [];
  let claims = 0;
  let skips = 0;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(batch) {
          const results = await Promise.all(batch.map(async request => {
            requests.push(request);
            if (request.url.endsWith(failFile || '\0')) throw new Error('offline');
            return [request.url, new Response(`cached:${new URL(request.url).pathname}`)];
          }));
          for (const [url, response] of results) store.set(url, response);
        },
        async match(request) { return store.get(typeof request === 'string' ? request : request.url)?.clone(); }
      };
    }
  };
  const self = {
    registration: { scope },
    clients: { async claim() { claims++; } },
    skipWaiting() { skips++; },
    addEventListener(type, callback) { handlers.set(type, callback); }
  };
  vm.runInNewContext(swSource, {
    self, caches, Request, Response, URL,
    fetch: async request => { network.push(request); throw new Error('network unavailable'); }
  });
  async function lifecycle(type, extra = {}) {
    let task;
    handlers.get(type)({ ...extra, waitUntil(promise) { task = promise; } });
    await task;
  }
  async function fetchRequest(url, options = {}) {
    let response;
    let handled = false;
    handlers.get('fetch')({
      request: { url, method: 'GET', mode: 'cors', ...options },
      respondWith(promise) { handled = true; response = promise; }
    });
    return { handled, response: await response };
  }
  async function status() {
    let result;
    await lifecycle('message', { data: { type: 'OFFLINE_STATUS' }, ports: [{ postMessage(value) { result = value; } }] });
    return result;
  }
  return { lifecycle, fetchRequest, status, stores, requests, network, counts: () => ({ claims, skips }) };
}

test('offline readiness requires every shell asset, fetched without stale HTTP cache', async () => {
  const h = serviceWorkerHarness();
  assert.equal((await h.status()).ready, false);
  await h.lifecycle('install');
  assert.equal((await h.status()).ready, true);
  for (const path of ['index.html', 'app.js', 'game.js', 'difficulty.js', 'custom-pack.js', 'prompts.js', 'prompt-metadata.js', 'offline.js', 'styles.css', 'manifest.webmanifest', 'icon.svg']) {
    assert.ok(h.requests.some(request => request.url === `${scope}${path}`), path);
  }
  assert.ok(h.requests.every(request => request.cache === 'reload'));
  assert.equal(h.counts().skips, 0);
  const shell = [...h.stores.values()][0];
  shell.delete(`${scope}game.js`);
  assert.equal((await h.status()).ready, false);
});

test('failed offline installation removes its cache and preserves existing releases', async () => {
  const h = serviceWorkerHarness({ failFile: 'custom-pack.js' });
  const previous = `ejfel-utan-activity18:${scope}:previous`;
  h.stores.set(previous, new Map([['saved', new Response('old release')]]));
  await assert.rejects(h.lifecycle('install'), /offline/);
  assert.deepEqual([...h.stores.keys()], [previous]);
  assert.equal(h.counts().claims, 0);
  assert.equal(h.counts().skips, 0);
});

test('waiting release leaves old games intact; activation cleans only the same app scope', async () => {
  const h = serviceWorkerHarness();
  const obsolete = `ejfel-utan-activity18:${scope}:previous`;
  const otherScope = 'ejfel-utan-activity18:https://example.test/another/:previous';
  h.stores.set(obsolete, new Map());
  h.stores.set(otherScope, new Map());
  h.stores.set('unrelated-site-cache', new Map());
  await h.lifecycle('install');
  assert.ok(h.stores.has(obsolete));
  assert.deepEqual(h.counts(), { claims: 0, skips: 0 });
  await h.lifecycle('activate');
  assert.equal(h.stores.has(obsolete), false);
  assert.ok(h.stores.has(otherScope));
  assert.ok(h.stores.has('unrelated-site-cache'));
  assert.deepEqual(h.counts(), { claims: 1, skips: 0 });
});

test('offline navigation and modules use one complete cached release, including query URLs', async () => {
  const h = serviceWorkerHarness();
  await h.lifecycle('install');
  const page = await h.fetchRequest(`${scope}?resume=1`, { mode: 'navigate' });
  assert.equal(page.handled, true);
  assert.equal(await page.response.text(), 'cached:/YSQ/activity18/index.html');
  const module = await h.fetchRequest(`${scope}game.js?release=new`);
  assert.equal(await module.response.text(), 'cached:/YSQ/activity18/game.js');
  assert.equal(h.network.length, 0);
});

test('worker does not intercept unrelated apps, cross-origin, non-shell files or mutations', async () => {
  const h = serviceWorkerHarness();
  for (const [url, options] of [
    ['https://example.test/YSQ/maeste/', { mode: 'navigate' }],
    ['https://example.test/YSQ/activity18-copy/', { mode: 'navigate' }],
    ['https://cdn.test/YSQ/activity18/app.js', {}],
    [`${scope}user-upload.json`, {}],
    [`${scope}app.js`, { method: 'POST' }]
  ]) assert.equal((await h.fetchRequest(url, options)).handled, false, url);
});

class FakeChannel {
  constructor() {
    this.port1 = { close() {}, onmessage: null };
    this.port2 = { close() {}, postMessage: value => queueMicrotask(() => this.port1.onmessage?.({ data: value })) };
  }
}

async function offlineUI({ supported = true, secure = true, ready = false, waiting = false, registrationError = false } = {}) {
  const status = { textContent: '' };
  const listeners = new Map();
  const worker = { postMessage(message, ports) { ports[0].postMessage({ type: message.type, ready }); } };
  const installing = { state: 'installing', addEventListener(type, callback) { listeners.set(type, callback); } };
  const registration = {
    active: ready ? worker : null, waiting: waiting ? worker : null, installing,
    addEventListener() {}, async update() {}
  };
  const registrationCalls = [];
  const serviceWorker = {
    async register(url, options) {
      registrationCalls.push({ url: url.href, options });
      if (registrationError) throw new Error('disabled');
      return registration;
    },
    addEventListener() {},
    ready: ready ? Promise.resolve(registration) : new Promise(() => {})
  };
  const context = vm.createContext({
    document: { getElementById: () => status },
    navigator: supported ? { serviceWorker, onLine: true } : {},
    isSecureContext: secure, MessageChannel: FakeChannel, URL,
    setTimeout: () => 1, clearTimeout() {}, addEventListener() {}
  });
  vm.runInContext(offlineSource.replace('export async function setupOffline', 'async function setupOffline').replace('import.meta.url', JSON.stringify(`${scope}offline.js`)) + '\nglobalThis.runSetup = setupOffline;', context);
  await context.runSetup();
  await new Promise(resolve => setImmediate(resolve));
  return { status, registrationCalls, installing, listeners };
}

test('offline UI never declares readiness for pending, unsupported or rejected installation', async () => {
  const pending = await offlineUI();
  assert.match(pending.status.textContent, /letöltése folyamatban/);
  assert.equal(pending.registrationCalls[0].url, `${scope}sw.js`);
  assert.equal(pending.registrationCalls[0].options.updateViaCache, 'none');
  pending.installing.state = 'redundant';
  pending.listeners.get('statechange')();
  assert.match(pending.status.textContent, /nem tölthető le/);
  for (const options of [{ supported: false }, { secure: false }, { registrationError: true }]) {
    assert.match((await offlineUI(options)).status.textContent, /nem érhető el/);
  }
});

test('offline UI confirms active cached shell and explains waiting updates without reloading', async () => {
  assert.match((await offlineUI({ ready: true })).status.textContent, /Offline játékra kész/);
  const update = await offlineUI({ ready: true, waiting: true });
  assert.match(update.status.textContent, /Offline játékra kész/);
  assert.match(update.status.textContent, /A játék végén zárjátok be/);
});

test('PWA manifest stays inside its deployment directory and uses bundled icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'));
    assert.ok((await readFile(new URL(`../${icon.src}`, import.meta.url), 'utf8')).includes('<svg'));
  }
});
