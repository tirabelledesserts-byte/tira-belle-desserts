/**
 * TIRA Belle - Progressive Web App Service Worker
 * Provides offline caching, network-resilience, and instant app-like loading.
 */

const CACHE_NAME = 'tira-belle-v44';

const STATIC_ASSETS = [
    './',
    './index.html',
    './admin.html',
    './tracker.html',
    './css/style.css',
    './js/icons.js',
    './js/alerts.js',
    './js/db.js',
    './js/app.js',
    './js/admin.js',
    './js/tracker.js',
    './js/pwa.js',
    './js/qrcode.min.js',
    './manifest.json',
    './assets/tira-belle-logo.png',
    './assets/poster/tiramisu-classic-poster.png',
    './assets/tiramisu-150g.jpg',
    './assets/tiramisu-350g.jpg',
    './assets/cup-empty.png',
    './assets/cup-filled.png',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

// Install: Cache all static shell assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('Some non-critical assets failed precaching:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Strategy based on request type
self.addEventListener('fetch', event => {
    const request = event.request;
    
    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Handle HTML navigation requests: Network first, fall back to cached page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => {
                return caches.match(request).then(cached => {
                    if (cached) return cached;
                    // Fall back to main storefront if specific page not cached
                    return caches.match('./index.html');
                });
            })
        );
        return;
    }

    // For Scripts and Styles: Network first, fall back to cache when offline
    if (request.destination === 'script' || request.destination === 'style' || request.url.includes('.js') || request.url.includes('.css')) {
        event.respondWith(
            fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request);
            })
        );
        return;
    }

    // Static assets (images, fonts): Cache-first with background network update (Stale-While-Revalidate)
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
                // Fetch in background to update cache for next time
                fetch(request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
                    }
                }).catch(() => {/* Ignore background fetch errors */});
                return cachedResponse;
            }

            return fetch(request).then(networkResponse => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // Return fallback image or empty response if offline
                if (request.destination === 'image') {
                    return caches.match('./assets/tira-belle-logo.png');
                }
            });
        })
    );
});
