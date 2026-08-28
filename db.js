// ============================================
// BASE DE DATOS (IndexedDB) — caché de audio, estadísticas y ajustes
// ============================================
class MusicDB {
    constructor() { this.dbName = 'MusicPlayerDB'; this.db = null; }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 5);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                ['songs'].forEach(old => { if (db.objectStoreNames.contains(old)) db.deleteObjectStore(old); });
                if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    _tx(store, mode = 'readonly') { return this.db.transaction([store], mode).objectStore(store); }

    async getMeta(key, def) {
        return new Promise((resolve) => {
            const req = this._tx('meta').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : def);
            req.onerror = () => resolve(def);
        });
    }
    async setMeta(key, value) {
        return new Promise((resolve, reject) => {
            const req = this._tx('meta', 'readwrite').put({ key, value });
            req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
        });
    }

    async getStats(key) {
        return new Promise((resolve) => {
            const req = this._tx('stats').get(key);
            req.onsuccess = () => resolve(req.result || { key, plays: 0, completes: 0, skips: 0, repeats: 0, liked: false, manualDownload: false });
            req.onerror = () => resolve({ key, plays: 0, completes: 0, skips: 0, repeats: 0, liked: false, manualDownload: false });
        });
    }
    async setStats(obj) {
        return new Promise((resolve, reject) => {
            const req = this._tx('stats', 'readwrite').put(obj);
            req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
        });
    }
    async getAllStats() {
        return new Promise((resolve) => {
            const req = this._tx('stats').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async cacheBlob(key, blob) {
        return new Promise((resolve, reject) => {
            const req = this._tx('cache', 'readwrite').put({ key, blob, cachedAt: Date.now() });
            req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
        });
    }
    async getCachedBlob(key) {
        return new Promise((resolve) => {
            const req = this._tx('cache').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = () => resolve(null);
        });
    }
    async deleteCachedBlob(key) {
        return new Promise((resolve) => {
            const req = this._tx('cache', 'readwrite').delete(key);
            req.onsuccess = () => resolve(); req.onerror = () => resolve();
        });
    }
    async getCacheKeys() {
        return new Promise((resolve) => {
            const req = this._tx('cache').getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }
    // Igual que getCacheKeys() pero incluye cachedAt, para poder decidir cuál
    // entrada liberar primero cuando se llega al tope de descargas (MAX_DOWNLOADS).
    async getCacheEntries() {
        return new Promise((resolve) => {
            const req = this._tx('cache').getAll();
            req.onsuccess = () => resolve((req.result || []).map(r => ({ key: r.key, cachedAt: r.cachedAt || 0 })));
            req.onerror = () => resolve([]);
        });
    }
    async getCacheTotalSize() {
        return new Promise((resolve) => {
            const req = this._tx('cache').getAll();
            req.onsuccess = () => resolve((req.result || []).reduce((a, c) => a + (c.blob ? c.blob.size : 0), 0));
            req.onerror = () => resolve(0);
        });
    }
}