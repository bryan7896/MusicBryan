// ============================================
// SERVICE WORKER - CACHE DE RECURSOS
// ============================================

const CACHE_NAME = 'music-player-v1';
const OFFLINE_URL = 'index.html';

// Recursos a cachear (siempre disponibles offline)
const STATIC_ASSETS = [
    'index.html',
    'manifest.json',
    'icon-192.png',
    'icon-512.png'
];

// ============================================
// INSTALACIÓN - Cachear recursos estáticos
// ============================================
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Cacheando recursos estáticos...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('✅ Recursos cacheados correctamente');
                // Forzar activación inmediata
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Error cacheando recursos:', error);
            })
    );
});

// ============================================
// ACTIVACIÓN - Limpiar cachés viejos
// ============================================
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: Activando...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eliminando caché vieja:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activado y controlando la página');
            return self.clients.claim();
        })
    );
});

// ============================================
// INTERCEPCIÓN DE PETICIONES - Estrategia Offline
// ============================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Permitir navegación offline
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    console.log('📡 Offline: Sirviendo index.html desde caché');
                    return caches.match(OFFLINE_URL);
                })
        );
        return;
    }

    // Estrategia: Cache First para archivos MP3
    if (url.pathname.endsWith('.mp3')) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        console.log('💾 MP3 desde caché:', url.pathname);
                        return cachedResponse;
                    }
                    console.log('🌐 MP3 desde red:', url.pathname);
                    return fetch(request)
                        .then((response) => {
                            // Cachear la respuesta para futuras visitas
                            const clonedResponse = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, clonedResponse);
                                })
                                .catch((err) => console.error('Error cacheando MP3:', err));
                            return response;
                        })
                        .catch(() => {
                            console.warn('⚠️ No se pudo cargar el MP3:', url.pathname);
                            // Retornar un silencio en lugar de error
                            return new Response('', {
                                status: 200,
                                statusText: 'OK',
                                headers: {
                                    'Content-Type': 'audio/mpeg',
                                    'Content-Length': '0'
                                }
                            });
                        });
                })
        );
        return;
    }

    // Estrategia: Cache First para imágenes
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            const clonedResponse = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(request, clonedResponse));
                            return response;
                        })
                        .catch(() => {
                            // Retornar imagen de respaldo
                            return new Response('', {
                                status: 404,
                                statusText: 'Not Found'
                            });
                        });
                })
        );
        return;
    }

    // Estrategia: Network First con fallback a caché para otros recursos
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cachear la respuesta para futuras visitas
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(request, clonedResponse);
                    })
                    .catch((err) => console.error('Error cacheando recurso:', err));
                return response;
            })
            .catch(() => {
                console.log('📡 Offline: Buscando en caché:', url.pathname);
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        console.warn('⚠️ No encontrado en caché:', url.pathname);
                        // Retornar respuesta por defecto
                        return new Response('Recurso no disponible offline', {
                            status: 404,
                            statusText: 'Not Found'
                        });
                    });
            })
    );
});

console.log('🎵 Service Worker cargado correctamente');