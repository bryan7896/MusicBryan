// ============================================
// SERVICE WORKER - CACHE DE RECURSOS (v6)
// La app transmite las canciones directo (streaming) y solo
// guarda offline las del TOP inteligente o las descargadas
// manualmente, vía IndexedDB. Este SW ya NO intercepta .mp3:
// así el navegador puede usar peticiones por rangos (range
// requests) para buffer progresivo y saltos en la barra.
// ============================================

const CACHE_NAME = 'music-player-shell-v13';
const OFFLINE_URL = 'index.html';

const STATIC_ASSETS = [
    'index.html',
    'styles.css',
    'manifest.json',
    'songs.js',
    'icons.js',
    'catalog.js',
    'db.js',
    'effects.js',
    'player-core.js',
    'player-ui.js',
    'app.js',
    'icon-192.png',
    'icon-512.png'
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch((error) => console.error('Error cacheando recursos:', error))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Nunca interceptar audio: dejar que el navegador maneje streaming/range nativamente.
    if (url.pathname.endsWith('.mp3')) return;

    // Fuentes de Google: cache-first para que funcionen offline tras la primera carga.
    if (FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
                    return response;
                }).catch(() => cached);
            })
        );
        return;
    }

    // Navegación offline: servir el shell cacheado.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Imágenes: cache first.
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(request).then((response) => {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse));
                    return response;
                }).catch(() => new Response('', { status: 404, statusText: 'Not Found' }));
            })
        );
        return;
    }

    // Resto de recursos propios: network first con fallback a caché.
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request).then((response) => {
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse)).catch(() => {});
                return response;
            }).catch(() => {
                return caches.match(request).then((cachedResponse) => {
                    return cachedResponse || new Response('Recurso no disponible offline', { status: 404, statusText: 'Not Found' });
                });
            })
        );
    }
});