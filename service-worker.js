/* Manifest version: XwnBHZXj */
self.importScripts('./service-worker-assets.js');

const cacheNamePrefix = 'pachinkotracker-cache-';
const cacheName = cacheNamePrefix + self.assetsManifest.version;
const included = [/\.dll$/, /\.wasm$/, /\.html$/, /\.js$/, /\.json$/, /\.css$/, /\.png$/, /\.dat$/, /\.blat$/];
const excluded = [/^service-worker\.js$/];
self.addEventListener('install', event => event.waitUntil((async () => {
    const requests = self.assetsManifest.assets.filter(a => included.some(p => p.test(a.url)))
        .filter(a => !excluded.some(p => p.test(a.url)))
        .map(a => new Request(a.url, { integrity: a.hash, cache: 'no-cache' }));
    const cache = await caches.open(cacheName);
    await cache.addAll(requests);
    await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(cacheNamePrefix) && k !== cacheName).map(k => caches.delete(k)));
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
    event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        const request = event.request.mode === 'navigate' ? new URL('index.html', self.registration.scope) : event.request;
        return await cache.match(request) || await fetch(event.request);
    })());
});
