// ============================================
// REPRODUCTOR — núcleo: audio, crossfade, estadísticas, categorías
// (el renderizado de modales/UI vive en player-ui.js)
// ============================================
class MusicPlayer {
    constructor() {
        this.db = new MusicDB();
        this.audioA = new Audio(); this.audioB = new Audio();
        this.audioA.preload = 'auto'; this.audioB.preload = 'auto';
        this.active = this.audioA; this.inactive = this.audioB;
        this.crossfading = false;
        this.playlist = [];
        this.currentIndex = 0;
        this.mixCategories = [];
        this.isPlaying = false;
        this.isShuffle = true; // por defecto activo (se confirma/ajusta con lo guardado en initApp)
        this.isRepeat = false;
        this._loadSeq = 0; // token para invalidar reproducciones "play()" que quedaron obsoletas por un salto rápido
        this._consecutiveLoadFailures = 0; // corta la cadena de "saltar a la siguiente" si fallan varias seguidas
        this._fadeToken = 0;          // invalida play()/promesas pendientes de un crossfade cancelado
        this._preload = null;         // { idx, key, audio, failed, starting } de la siguiente canción precargada
        this._nextIdx = null;         // "siguiente canción" ya decidida (la misma para precarga y para nextSong)
        this.recentKeys = [];         // últimas canciones sonadas (para que el aleatorio no las repita enseguida)
        this._badUntil = new Map();   // key -> timestamp hasta el que se evita una canción que falló
        this._stallTimer = null;
        this._resumeOnReconnect = false;
        this._ignorePauseUntil = 0;
        this._reportedErrors = new Map();
        this._reportCount = 0;
        this.isDragging = false;
        this.isListMode = false;
        this.activeListTab = 'all';
        // Índice en memoria de canciones descargadas (key -> Blob). Existe para que
        // resolveSource() pueda responder sin "await": si loadSong() espera una
        // lectura async de IndexedDB antes de llamar audio.play(), el navegador
        // pierde el "gesto del usuario" (el click) y bloquea la reproducción.
        this.cachedBlobMap = new Map();
        this.downloadsMode = false;
        this.downloadedCatalog = null;
        this.shuffleHistory = [];
        this.totalPlays = 0;
        this.topScored = [];
        this.statsCache = new Map();
        this.portadaActual = getRandomPortada();
        this.renderStaticIcons();
        this.initDOM();
        this.initEventListeners();
        this.initApp();
        buildFallingCircles(document.getElementById('fallingCircles'), CIRCLE_PALETTE_HOME, 16);
    }

    renderStaticIcons() {
        document.getElementById('offlineBadge').innerHTML = icon('wifiOff') + ' Sin conexión — usando lo guardado';
        document.getElementById('openPlaylistBtn').innerHTML = icon('list');
        document.getElementById('openSettingsBtn').innerHTML = icon('settings');
        document.getElementById('prevBtn').innerHTML = icon('prev');
        document.getElementById('nextBtn').innerHTML = icon('next');
        document.getElementById('playBtn').innerHTML = icon('play');
        document.getElementById('shuffleBtn').innerHTML = icon('shuffle');
        document.getElementById('repeatBtn').innerHTML = icon('repeat');
        document.getElementById('favoriteBtn').innerHTML = icon('heart');
        document.getElementById('quickDownloadBtn').innerHTML = icon('download');
        document.getElementById('cbSelectIcon').innerHTML = icon('selector');
        document.getElementById('albumImage').src = this.portadaActual;

        document.getElementById('settingsBackBtn').innerHTML = icon('arrowLeft');
        document.getElementById('settingsCloseBtn').innerHTML = icon('x');
        document.getElementById('mixCloseBtn').innerHTML = icon('x');
        document.querySelector('#settingsGoThemes .smr-icon').innerHTML = icon('disc');
        document.querySelector('#settingsGoThemes .smr-arrow').innerHTML = icon('arrowLeft');
        document.querySelector('#settingsGoDownloads .smr-icon').innerHTML = icon('download');
        document.querySelector('#settingsGoDownloads .smr-arrow').innerHTML = icon('arrowLeft');
        document.querySelector('#settingsGoAdd .smr-icon').innerHTML = icon('folderPlus');
        document.querySelector('#settingsGoAdd .smr-arrow').innerHTML = icon('arrowLeft');
    }

    initDOM() {
        this.dom = {
            appShell: document.getElementById('appShell'),
            playBtn: document.getElementById('playBtn'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            progressFill: document.getElementById('progressFill'),
            progressBar: document.getElementById('progressBar'),
            currentTime: document.getElementById('currentTime'),
            totalTime: document.getElementById('totalTime'),
            currentTitle: document.getElementById('currentSongTitle'),
            favoriteBtn: document.getElementById('favoriteBtn'),
            quickDownloadBtn: document.getElementById('quickDownloadBtn'),
            shuffleBtn: document.getElementById('shuffleBtn'),
            repeatBtn: document.getElementById('repeatBtn'),
            albumArt: document.getElementById('albumArt'),
            albumImage: document.getElementById('albumImage'),
            waves: document.querySelectorAll('.wave'),
            openPlaylistBtn: document.getElementById('openPlaylistBtn'),
            openSettingsBtn: document.getElementById('openSettingsBtn'),
            headerLabel: document.getElementById('headerLabel'),
            toast: document.getElementById('toast'),
            offlineBadge: document.getElementById('offlineBadge'),
            categoryBadgeBtn: document.getElementById('categoryBadgeBtn'),
            categoryBadgeLabel: document.getElementById('categoryBadgeLabel'),
            categoryBadgeIcon: document.getElementById('categoryBadgeIcon'),
            mixModalOverlay: document.getElementById('mixModalOverlay'),
            mixOptionsList: document.getElementById('mixOptionsList'),
            mixAcceptBtn: document.getElementById('mixAcceptBtn'),
            mixCloseBtn: document.getElementById('mixCloseBtn'),
            songListView: document.getElementById('songListView'),
            songListScroll: document.getElementById('songListScroll'),
            listSearchInput: document.getElementById('listSearchInput'),
            tabAll: document.getElementById('tabAll'),
            tabTop: document.getElementById('tabTop'),
            settingsModalOverlay: document.getElementById('settingsModalOverlay'),
            settingsModalTitle: document.getElementById('settingsModalTitle'),
            settingsBackBtn: document.getElementById('settingsBackBtn'),
            settingsCloseBtn: document.getElementById('settingsCloseBtn'),
            settingsViewMenu: document.getElementById('settingsViewMenu'),
            settingsViewThemes: document.getElementById('settingsViewThemes'),
            settingsViewDownloads: document.getElementById('settingsViewDownloads'),
            settingsViewAdd: document.getElementById('settingsViewAdd'),
            settingsGoThemes: document.getElementById('settingsGoThemes'),
            settingsGoDownloads: document.getElementById('settingsGoDownloads'),
            settingsGoAdd: document.getElementById('settingsGoAdd'),
            themeSwatchList: document.getElementById('themeSwatchList'),
            settingsDownloadsList: document.getElementById('settingsDownloadsList'),
            addSuggestionInput: document.getElementById('addSuggestionInput'),
            addSuggestionSubmit: document.getElementById('addSuggestionSubmit'),
        };
    }

    initEventListeners() {
        this.dom.playBtn.addEventListener('click', () => this.togglePlay());
        this.dom.prevBtn.addEventListener('click', () => this.prevSong());
        this.dom.nextBtn.addEventListener('click', () => this.nextSong());
        this.dom.favoriteBtn.addEventListener('click', () => this.toggleFavorite());
        this.dom.quickDownloadBtn.addEventListener('click', () => this.downloadCurrentSong());
        this.dom.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.dom.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        [this.audioA, this.audioB].forEach(a => {
            a.addEventListener('timeupdate', () => this.onTimeUpdate(a));
            a.addEventListener('ended', () => this.onEnded(a));
            a.addEventListener('error', () => this.onAudioError(a));
            // "waiting"/"playing" nos permiten detectar cuando la canción se queda
            // atascada esperando datos (típico en datos móviles) y reaccionar en
            // vez de dejarla congelada indefinidamente.
            a.addEventListener('waiting', () => this.onAudioWaiting(a));
            a.addEventListener('playing', () => this.onAudioPlaying(a));
            // Pausas/reanudaciones hechas por el sistema (llamadas, auriculares, notificación).
            a.addEventListener('pause', () => this.onAudioPause(a));
            a.addEventListener('play', () => this.onAudioPlay(a));
        });
        this.dom.progressBar.addEventListener('mousedown', (e) => this.startDrag(e));
        this.dom.progressBar.addEventListener('touchstart', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('touchmove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());
        document.addEventListener('touchend', () => this.endDrag());
        // Si el navegador cancela el toque (por ejemplo, lo interpreta como scroll),
        // "touchend" nunca llega y el arrastre quedaba atascado, congelando la barra.
        document.addEventListener('touchcancel', () => this.endDrag());
        window.addEventListener('blur', () => this.endDrag());
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        this.dom.openPlaylistBtn.addEventListener('click', () => {
            if (this._awaitingUnlockListTap) {
                this._awaitingUnlockListTap = false;
                clearTimeout(this._unlockWindowTimer);
                this.unlockMixSelector();
            }
            this.toggleListMode(!this.isListMode);
        });
        this.dom.albumArt.addEventListener('click', () => {
            if (this.isListMode) { this.toggleListMode(false); return; }
            this.registerAlbumTap();
        });

        this.dom.openSettingsBtn.addEventListener('click', () => this.openSettings());
        this.dom.settingsCloseBtn.addEventListener('click', () => this.closeSettings());
        this.dom.settingsBackBtn.addEventListener('click', () => this.showSettingsView('menu'));
        this.dom.settingsGoThemes.addEventListener('click', () => this.showSettingsView('themes'));
        this.dom.settingsGoDownloads.addEventListener('click', () => this.showSettingsView('downloads'));
        this.dom.settingsGoAdd.addEventListener('click', () => this.showSettingsView('add'));
        this.dom.addSuggestionSubmit.addEventListener('click', () => this.submitSuggestion());

        this.dom.listSearchInput.addEventListener('input', (e) => {
            this.listSearchTerm = e.target.value;
            this.renderFilteredList();
        });

        this.dom.categoryBadgeBtn.addEventListener('click', () => this.openMixConfig());
        this.dom.mixCloseBtn.addEventListener('click', () => this.closeMixConfig());
        this.dom.tabAll.addEventListener('click', () => this.switchListTab('all'));
        this.dom.tabTop.addEventListener('click', () => this.switchListTab('top'));

        window.addEventListener('online', () => {
            this.updateOfflineStatus();
            if (this.downloadsMode) this.exitDownloadsMode();
            this.resumeAfterReconnect();
        });
        window.addEventListener('offline', () => this.updateOfflineStatus());
        window.addEventListener('popstate', () => this.handleBackButton());
        // Guardamos la posición al ocultar/cerrar la app. "visibilitychange" +
        // "pagehide" cubren tanto minimizar/cambiar de app como cerrar la pestaña,
        // y son más confiables en móvil que "beforeunload".
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.savePlaybackPosition();
        });
        window.addEventListener('pagehide', () => this.savePlaybackPosition());
        this.updateOfflineStatus();

        // Punto 4: mandar TODOS los errores al backend, no solo los de reproducción.
        window.addEventListener('error', (e) => {
            this.reportPlaybackError(null, `Error JS: ${e.message} (${e.filename || ''}:${e.lineno || ''})`);
        });
        window.addEventListener('unhandledrejection', (e) => {
            const reason = e && e.reason ? (e.reason.message || String(e.reason)) : 'desconocida';
            this.reportPlaybackError(null, `Promesa rechazada sin capturar: ${reason}`);
        });
    }

    // ---------- HISTORIAL: que el botón "Atrás" cierre overlays en vez de salir de la app ----------
    // Cada vez que se abre la lista, el selector de Mix o Configuración, se agrega
    // una entrada al historial. Al presionar "Atrás", en vez de salir de la app,
    // se consume esa entrada y cerramos lo que esté abierto.
    pushOverlayState(name) {
        this._overlayStack = this._overlayStack || [];
        this._overlayStack.push(name);
        history.pushState({ appOverlay: name }, '');
    }
    popOverlayState() {
        this._overlayStack = this._overlayStack || [];
        if (!this._overlayStack.length) return;
        this._overlayStack.pop();
        // Si el cierre vino del propio botón "Atrás", el historial ya retrocedió solo.
        if (!this._closingFromPopstate) {
            history.back();
        }
    }
    handleBackButton() {
        this._closingFromPopstate = true;
        if (this.isListMode) {
            this.toggleListMode(false);
        } else if (this.dom.settingsModalOverlay.classList.contains('show')) {
            this.closeSettings();
        } else if (this.dom.mixModalOverlay.classList.contains('show')) {
            this.closeMixConfig();
        }
        this._closingFromPopstate = false;
    }

    // ---------- COMBO SECRETO: 10 taps en la portada + tocar el ícono de lista ----------
    registerAlbumTap() {
        clearTimeout(this._tapResetTimer);
        this._tapCount = (this._tapCount || 0) + 1;
        this._tapResetTimer = setTimeout(() => { this._tapCount = 0; }, 2500);
        if (this._tapCount >= 10) {
            this._tapCount = 0;
            this._awaitingUnlockListTap = true;
            this.showToast('star', 'Ahora toca el ícono de lista');
            clearTimeout(this._unlockWindowTimer);
            this._unlockWindowTimer = setTimeout(() => { this._awaitingUnlockListTap = false; }, 4000);
        }
    }
    async unlockMixSelector() {
        if (this.mixSelectorUnlocked) { this.showToast('check', 'El selector de categorías ya estaba activo'); return; }
        this.mixSelectorUnlocked = true;
        this.dom.appShell.classList.add('mix-unlocked');
        await this.db.setMeta('mixSelectorUnlocked', true);
        this.showToast('check', 'Selector de categorías desbloqueado');
    }

    // ---------- RECORDAR POSICIÓN DE REPRODUCCIÓN ----------
    // Usamos localStorage (no IndexedDB) a propósito: la escritura es síncrona,
    // así que se alcanza a guardar aunque el navegador cierre la pestaña/app justo
    // después del evento (con IndexedDB, una transacción async podría no completarse a tiempo).
    savePlaybackPosition() {
        if (!this.active || !this.active._songKey) return;
        try {
            localStorage.setItem('mm_lastPlayback', JSON.stringify({
                songKey: this.active._songKey,
                currentTime: this.active.currentTime || 0,
            }));
        } catch (e) { /* almacenamiento no disponible (modo privado, etc.): no es crítico */ }
    }
    loadSavedPlaybackState() {
        try {
            const raw = localStorage.getItem('mm_lastPlayback');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    // Busca en la playlist actual la canción guardada y, si la encuentra, devuelve
    // su índice; si no, 0 (primera canción) como respaldo.
    resolveStartIndex(savedPlayback) {
        if (savedPlayback && savedPlayback.songKey) {
            const idx = this.playlist.findIndex(s => s.key === savedPlayback.songKey);
            if (idx !== -1) return idx;
        }
        return 0;
    }
    // Se llama justo después de loadSong() en el arranque: si la canción cargada
    // coincide con la guardada, salta al segundo exacto donde se había quedado.
    resumeSavedPosition(savedPlayback) {
        if (!savedPlayback || !savedPlayback.songKey) return;
        if (!this.active || this.active._songKey !== savedPlayback.songKey) return;
        if (!savedPlayback.currentTime || savedPlayback.currentTime < 3) return; // no vale la pena si apenas había empezado
        const apply = () => {
            if (this.active._songKey !== savedPlayback.songKey) return; // pudo cambiar mientras esperábamos metadata
            const dur = this.active.duration;
            if (isFinite(dur) && savedPlayback.currentTime < dur - 2) {
                this.active.currentTime = savedPlayback.currentTime;
                this.dom.currentTime.textContent = this.formatTime(this.active.currentTime);
                const p = Math.max(0, Math.min(100, (savedPlayback.currentTime / dur) * 100));
                this.dom.progressFill.style.width = `${p}%`;
            }
        };
        if (this.active.readyState >= 1) apply();
        else this.active.addEventListener('loadedmetadata', apply, { once: true });
    }

    async initApp() {
        try {
            await this.db.init();
            this.totalPlays = await this.db.getMeta('totalPlays', 0);
            this.topScored = await this.db.getMeta('topScored', []);
            // Se descartan categorías que ya no existan (un valor viejo rompía el selector).
            this.mixCategories = (await this.db.getMeta('mixCategories', [])).filter(k => CATS[k]);

            // Por defecto siempre inicia en "Cristiana"; el selector de categorías
            // permanece oculto hasta que se desbloquee con el combo secreto.
            if (this.mixCategories.length === 0) {
                this.mixCategories = ['cristiana'];
                await this.db.setMeta('mixCategories', this.mixCategories);
            }

            this.mixSelectorUnlocked = await this.db.getMeta('mixSelectorUnlocked', false);
            if (this.mixSelectorUnlocked) this.dom.appShell.classList.add('mix-unlocked');

            // Punto 5: aleatorio activo por defecto (si el usuario ya lo había
            // guardado antes -encendido o apagado-, respetamos esa preferencia).
            this.isShuffle = await this.db.getMeta('isShuffle', true);
            this.dom.shuffleBtn.classList.toggle('toggle-pressed', this.isShuffle);

            const savedThemeId = await this.db.getMeta('theme', 'violeta');
            this.applyTheme(savedThemeId, { silent: true });

            const allStats = await this.db.getAllStats();
            allStats.forEach(s => this.statsCache.set(s.key, s));

            // Necesario ANTES de cargar la primera canción: así resolveSource()
            // puede resolver de forma síncrona si hay una versión descargada.
            await this.refreshCachedBlobIndex();

            this.updateCategoryBadge();

            // Recordar por dónde iba: buscamos la última canción/segundo guardado
            // para retomar ahí en vez de mandar siempre a la primera canción.
            const savedPlayback = this.loadSavedPlaybackState();

            // Validar conexión al abrir: online -> catálogo normal, offline -> modo Descargas en rojo.
            if (!navigator.onLine) {
                await this.enterDownloadsMode(savedPlayback);
            } else {
                this.rebuildPlaylistFromState();
                if (this.playlist.length > 0) {
                    this.currentIndex = this.resolveStartIndex(savedPlayback);
                    await this.loadSong(this.currentIndex, { autoplay: false });
                    this.resumeSavedPosition(savedPlayback);
                } else {
                    this.dom.currentTitle.textContent = 'No hay canciones disponibles';
                }
            }
            this.setupMediaSession();
            // Poblamos la lista desde el arranque: en web la biblioteca siempre
            // está visible (no hay botón para "abrirla"), así que no puede depender
            // de que el usuario la abra manualmente para tener contenido.
            this.switchListTab(this.activeListTab);
        } catch (e) {
            console.error(e);
            this.showToast('x', 'Error al iniciar la app');
        }
    }

    songKey(song) { return song.key; }

    async getStatsFor(key) {
        if (this.statsCache.has(key)) return this.statsCache.get(key);
        const s = await this.db.getStats(key);
        this.statsCache.set(key, s);
        return s;
    }
    async saveStats(stat) {
        this.statsCache.set(stat.key, stat);
        await this.db.setStats(stat);
    }

    // ---------- CATEGORÍAS / MIX ----------
    buildPlaylistFromCategories(cats) {
        this.playlist = CATALOG.filter(s => cats.includes(s.category));
    }

    // Reconstruye la cola según el pool activo (catálogo completo o solo descargadas
    // si downloadsMode está activo) y la selección de Mix vigente.
    rebuildPlaylistFromState() {
        this.setQueue(this.getActivePool());
    }

    // Devuelve las canciones disponibles según el Mix elegido (nunca "todo" por defecto).
    getActivePool() {
        const base = this.downloadsMode ? (this.downloadedCatalog || []) : CATALOG;
        return this.mixCategories.length > 0
            ? base.filter(s => this.mixCategories.includes(s.category))
            : [];
    }

    // ---------- MODO DESCARGAS ----------
    // Se activa automáticamente al abrir la app sin conexión (tema rojo + solo
    // canciones descargadas) y se puede volver al modo normal al recuperar conexión.
    async enterDownloadsMode(savedPlayback) {
        this.downloadsMode = true;
        document.body.classList.add('theme-downloads');
        buildFallingCircles(document.getElementById('fallingCircles'), CIRCLE_PALETTE_DOWNLOADS, 16);
        this.dom.headerLabel.classList.add('show');

        const keys = await this.db.getCacheKeys();
        this.downloadedCatalog = keys.map(k => findByKey(k)).filter(Boolean);
        this.rebuildPlaylistFromState();

        if (this.playlist.length > 0) {
            this.currentIndex = this.resolveStartIndex(savedPlayback);
            await this.loadSong(this.currentIndex, { autoplay: false });
            this.resumeSavedPosition(savedPlayback);
        } else {
            this.dom.currentTitle.textContent = 'No tienes canciones descargadas';
            this.showToast('download', 'Sin conexión y sin canciones descargadas');
        }
        this.switchListTab(this.activeListTab); // siempre poblada: en web la lista no tiene botón para abrirse
    }
    async exitDownloadsMode() {
        if (!this.downloadsMode) return;
        this.downloadsMode = false;
        this.downloadedCatalog = null;
        document.body.classList.remove('theme-downloads');
        buildFallingCircles(document.getElementById('fallingCircles'), this.getHomeCirclePalette(), 16);
        this.dom.headerLabel.classList.remove('show');
        // Antes se recargaba la canción 0 con autoplay:false aunque algo estuviera sonando:
        // cortaba la música y dejaba isPlaying=true con el audio detenido. Ahora, si la
        // canción actual sigue en la cola nueva, se deja sonar sin tocarla.
        const wasPlaying = this.isPlaying;
        const currentKey = this.active._songKey;
        this.setQueue(this.getActivePool(), currentKey);
        const stillThere = !!currentKey && this.playlist[this.currentIndex] && this.playlist[this.currentIndex].key === currentKey;
        if (this.playlist.length > 0 && !stillThere) {
            await this.loadSong(this.currentIndex, { autoplay: wasPlaying });
        }
        this.switchListTab(this.activeListTab); // siempre poblada: en web la lista no tiene botón para abrirse
        this.showToast('check', 'Conexión recuperada');
    }

    // ---------- CONFIGURACIÓN (Temas / Descargas / Agregar) ----------
    openSettings() {
        this.showSettingsView('menu');
        this.dom.settingsModalOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
        this.pushOverlayState('settings');
    }
    closeSettings() {
        if (!this.dom.settingsModalOverlay.classList.contains('show')) return;
        this.dom.settingsModalOverlay.classList.remove('show');
        document.body.style.overflow = '';
        this.popOverlayState();
    }
    showSettingsView(view) {
        const views = {
            menu: this.dom.settingsViewMenu,
            themes: this.dom.settingsViewThemes,
            downloads: this.dom.settingsViewDownloads,
            add: this.dom.settingsViewAdd,
        };
        Object.entries(views).forEach(([key, el]) => { if (el) el.style.display = key === view ? 'block' : 'none'; });
        const titles = { menu: 'Configuración', themes: 'Temas', downloads: 'Descargadas', add: 'Agregar canción' };
        this.dom.settingsModalTitle.textContent = titles[view] || 'Configuración';
        this.dom.settingsBackBtn.style.visibility = view === 'menu' ? 'hidden' : 'visible';
        if (view === 'themes') this.renderThemeSwatches();
        if (view === 'downloads') this.renderSettingsDownloads();
    }

    applyTheme(themeId, opts = {}) {
        const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
        this.currentTheme = theme.id;
        const surf = SURFACES[theme.mode] || SURFACES.light;
        let tag = document.getElementById('dynamicThemeVars');
        if (!tag) {
            tag = document.createElement('style');
            tag.id = 'dynamicThemeVars';
            document.head.appendChild(tag);
        }
        tag.textContent = `:root{` +
            `--primary:${theme.primary};` +
            `--primary-icon:${theme.primaryIcon};` +
            `--primary-deep:${theme.primaryDeep};` +
            `--primary-chip:${theme.primaryChip};` +
            `--primary-chip-2:${theme.primaryChip2};` +
            `--bottom-bg:${surf.bottomBg};` +
            `--track-color:${surf.trackColor};` +
            `--control-bg:${surf.controlBg};` +
            `--toggle-bg:${surf.toggleBg};` +
            `--toggle-active-bg:${surf.toggleActiveBg};` +
            `--text-on-bottom:${surf.textOnBottom};` +
            `--surface-bg:${surf.surfaceBg};` +
            `--surface-text:${surf.surfaceText};` +
            `--surface-border:${surf.surfaceBorder};` +
            `--pill-bg:${surf.pillBg};` +
        `}`;
        document.body.classList.toggle('theme-dark', theme.mode === 'dark');
        this.db.setMeta('theme', theme.id);
        this.renderThemeSwatches();
        // Las bolitas que caen también deben reflejar el tema elegido (excepto en
        // modo Descargas, que siempre se ve en rojo).
        if (!this.downloadsMode) {
            buildFallingCircles(document.getElementById('fallingCircles'), this.getHomeCirclePalette(), 16);
        }
        if (!opts.silent) this.showToast('check', `Tema ${theme.label} aplicado`);
    }
    getHomeCirclePalette() {
        const theme = THEMES.find(t => t.id === this.currentTheme) || THEMES[0];
        return [
            { base: theme.primaryDeep, light: theme.primaryChip },
            { base: theme.primary,     light: theme.primaryChip2 },
            { base: theme.primaryDeep, light: theme.primary },
        ];
    }
    renderThemeSwatches() {
        if (!this.dom.themeSwatchList) return;
        this.dom.themeSwatchList.innerHTML = '';
        THEMES.forEach(t => {
            const item = document.createElement('div');
            item.className = 'theme-swatch-item';
            const el = document.createElement('button');
            el.className = 'theme-swatch' + (this.currentTheme === t.id ? ' active' : '');
            el.style.background = `linear-gradient(150deg, ${t.primaryChip}, ${t.primaryChip2})`;
            el.title = t.label;
            el.innerHTML = `<span class="ts-check">${icon('check')}</span>`;
            el.addEventListener('click', () => this.applyTheme(t.id));
            const label = document.createElement('div');
            label.className = 'theme-swatch-label';
            label.textContent = t.label;
            item.appendChild(el);
            item.appendChild(label);
            this.dom.themeSwatchList.appendChild(item);
        });
    }

    async renderSettingsDownloads() {
        const keys = await this.db.getCacheKeys();
        const songs = keys.map(k => findByKey(k)).filter(Boolean);
        await this.renderSongCards(this.dom.settingsDownloadsList, songs, {
            emptyMsg: 'Aún no tienes canciones descargadas',
            scope: 'downloads'
        });
    }

    async submitSuggestion() {
        const text = (this.dom.addSuggestionInput.value || '').trim();
        if (!text) { this.showToast('x', 'Escribe algo antes de enviar'); return; }
        if (!navigator.onLine) { this.showToast('wifiOff', 'Sin conexión: no se puede enviar ahora'); return; }
        const btn = this.dom.addSuggestionSubmit;
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.textContent = 'Enviando...';
        try {
            await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ sheet: 'descargar', action: 'add', general: text })
            });
            this.dom.addSuggestionInput.value = '';
            this.closeSettings();
            this.showToast('check', '¡Sugerencia enviada!');
        } catch (e) {
            this.showToast('x', 'No se pudo enviar la sugerencia');
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            btn.textContent = originalLabel;
        }
    }

    // Reporta al backend sin inundarlo: el mismo error de la misma canción se envía
    // una vez cada ERROR_REPORT_COOLDOWN_MS, hay un tope por sesión y sin red no se
    // intenta. (Antes un solo atasco generaba hasta 7 reportes idénticos seguidos.)
    async reportPlaybackError(song, errorText) {
        try {
            if (!navigator.onLine) return;
            const target = song ? song.url : 'canción desconocida';
            const dedupeKey = `${String(errorText).split(/ [\(\[]/)[0]}|${target}`;
            const now = Date.now();
            const last = this._reportedErrors.get(dedupeKey);
            if (last && now - last < ERROR_REPORT_COOLDOWN_MS) return;
            if (this._reportCount >= MAX_ERROR_REPORTS_PER_SESSION) return;
            this._reportedErrors.set(dedupeKey, now);
            this._reportCount++;
            await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ sheet: 'errores', action: 'add', url: `${errorText} — ${target}` })
            });
        } catch (e) { /* no interrumpir la reproducción por un fallo al reportar */ }
    }

    updateCategoryBadge() {
        const label = this.dom.categoryBadgeLabel;
        const iconEl = this.dom.categoryBadgeIcon;
        if (this.mixCategories.length === 0) {
            label.textContent = 'Elige tu mix';
            iconEl.innerHTML = icon('music');
        } else if (this.mixCategories.length === 1) {
            const def = CATS[this.mixCategories[0]];
            label.textContent = def.label;
            iconEl.innerHTML = icon(def.icon);
        } else {
            label.textContent = 'Mezcla';
            iconEl.innerHTML = icon('infinity');
        }
    }

    startPlayback() {
        if (this.playlist.length === 0) return;
        this._consecutiveLoadFailures = 0;
        this.loadSong(this.currentIndex, { autoplay: true });
    }

    // ---------- LIST MODE (biblioteca inline) ----------
    toggleListMode(open) {
        const wasOpen = this.isListMode;
        if (open === wasOpen) return; // evita entradas de historial duplicadas
        this.isListMode = open;
        this.dom.appShell.classList.toggle('list-mode', open);
        // El filtro de búsqueda se limpia siempre al abrir y al cerrar el listado.
        this.listSearchTerm = '';
        if (this.dom.listSearchInput) this.dom.listSearchInput.value = '';
        if (open) {
            this.switchListTab(this.activeListTab);
            this.pushOverlayState('list');
        } else {
            this.popOverlayState();
        }
    }
    async switchListTab(tab) {
        this.activeListTab = tab;
        this.dom.tabAll.classList.toggle('active', tab === 'all');
        this.dom.tabTop.classList.toggle('active', tab === 'top');
        let songs;
        if (tab === 'top') {
            songs = await this.getTopList();
        } else {
            songs = this.getActivePool();
        }
        this._currentTabSongs = songs;
        this.renderFilteredList();
    }
    // Vuelve a pintar la lista actual aplicando el término de búsqueda, sin volver
    // a consultar la base de datos.
    renderFilteredList() {
        const term = normalizeSearchText(this.listSearchTerm || '');
        const source = this._currentTabSongs || [];
        const songs = term ? source.filter(s => normalizeSearchText(s.title).includes(term)) : source;
        this.renderSongCards(this.dom.songListScroll, songs, {
            emptyMsg: term
                ? 'No se encontraron canciones'
                : (this.activeListTab === 'top'
                    ? 'Aún no tienes canciones en tu TOP'
                    : (this.downloadsMode ? 'Aún no tienes canciones descargadas' : 'No hay canciones disponibles')),
            scope: this.activeListTab === 'top' ? 'top' : 'pool'
        });
    }

    // ---------- COLA DE REPRODUCCIÓN ----------
    // ÚNICO punto por donde se reemplaza this.playlist. Antes cada sitio (tarjetas,
    // selector de Mix, modo Descargas...) hacía su propio "this.playlist = ..." y
    // dejaba vivos el crossfade, la canción precargada y el historial del shuffle de
    // la lista ANTERIOR: de ahí que, con una sola sección elegida, terminaran
    // colándose canciones de otras secciones.
    // Devuelve el índice de arranque dentro de la nueva cola.
    setQueue(songs, startKey = null, { shuffleStart = false } = {}) {
        this.cancelCrossfade();
        this.playlist = (songs || []).slice();
        this.shuffleHistory = [];
        this.recentKeys = [];
        this._nextIdx = null;
        let idx = startKey ? this.playlist.findIndex(s => s.key === startKey) : -1;
        if (idx === -1) {
            idx = (shuffleStart && this.isShuffle && this.playlist.length > 0)
                ? Math.floor(Math.random() * this.playlist.length)
                : 0;
        }
        this.currentIndex = idx;
        return idx;
    }

    // La "siguiente canción" se decide UNA vez y se recuerda (_nextIdx): así lo que
    // se precarga para el crossfade es exactamente lo que sonará después.
    getNextIndex() {
        const n = this.playlist.length;
        if (n === 0) return 0;
        if (this._nextIdx == null || this._nextIdx >= n) this._nextIdx = this.pickNextIndex();
        return this._nextIdx;
    }
    pickNextIndex() {
        const n = this.playlist.length;
        if (n <= 1) return 0;
        const now = Date.now();
        const isBad = (s) => (this._badUntil.get(s.key) || 0) > now; // falló hace poco: se evita
        if (!this.isShuffle) {
            for (let step = 1; step < n; step++) {
                const i = (this.currentIndex + step) % n;
                if (!isBad(this.playlist[i])) return i;
            }
            return (this.currentIndex + 1) % n;
        }
        // Aleatorio sin repetir las últimas canciones escuchadas (antes era random puro
        // y a veces volvía a sonar una que acababa de pasar).
        const recent = new Set(this.recentKeys.slice(-Math.min(30, Math.floor(n / 2))));
        const pick = (accept) => {
            const out = [];
            for (let i = 0; i < n; i++) if (i !== this.currentIndex && accept(this.playlist[i])) out.push(i);
            return out;
        };
        let candidates = pick(s => !recent.has(s.key) && !isBad(s));
        if (!candidates.length) candidates = pick(s => !isBad(s));
        if (!candidates.length) candidates = pick(() => true);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Una canción pasa a ser "la actual".
    commitCurrent(song) {
        this._nextIdx = null;
        this.recentKeys.push(song.key);
        if (this.recentKeys.length > 100) this.recentKeys.shift();
    }
    markBad(key) {
        if (!key) return;
        this._badUntil.set(key, Date.now() + 5 * 60 * 1000);
        this._nextIdx = null;
    }

    // ---------- CARGA Y REPRODUCCIÓN ----------
    // SIN "await" antes de audio.play() a propósito: si esto esperara una lectura de
    // IndexedDB, el tiempo entre el click del usuario y el play() rompería el "gesto
    // del usuario" y el navegador bloquearía la reproducción.
    resolveSource(song) {
        const blob = this.cachedBlobMap.get(song.key);
        if (blob) return { url: URL.createObjectURL(blob), offline: true };
        return { url: song.url, offline: false };
    }
    async refreshCachedBlobIndex() {
        this.cachedBlobMap.clear();
        const keys = await this.db.getCacheKeys();
        for (const key of keys) {
            const blob = await this.db.getCachedBlob(key);
            if (blob) this.cachedBlobMap.set(key, blob);
        }
    }

    // Asigna una canción a un <audio> y reinicia todo su estado por-canción.
    _setSource(audio, song) {
        this._revokeSrc(audio);
        const src = this.resolveSource(song);
        audio._objUrl = src.offline ? src.url : null;
        audio.src = src.url; // asignar src ya dispara la carga; un audio.load() extra la reiniciaba por duplicado
        audio._songKey = song.key;
        audio._offline = src.offline;
        audio._skipCounted = false;
        audio._completeCounted = false;
        audio._playCounted = false;
        audio._preloadTried = false;
        audio._stallRetries = 0;
        audio._errorRetries = 0;
        audio._lastT = 0;
        return src;
    }
    // Las URLs blob: de canciones descargadas nunca se liberaban (fuga de memoria).
    _revokeSrc(audio) {
        if (audio._objUrl) { try { URL.revokeObjectURL(audio._objUrl); } catch (e) { } audio._objUrl = null; }
    }
    // Deja un <audio> vacío y sin descargar nada.
    _detach(audio) {
        if (!audio.getAttribute('src') && !audio._songKey) return;
        try { audio.pause(); } catch (e) { }
        this._revokeSrc(audio);
        audio.removeAttribute('src');
        audio._songKey = null;
        try { audio.load(); } catch (e) { }
    }

    async loadSong(index, opts = {}) {
        const song = this.playlist[index];
        if (!song) return;
        const autoplay = opts.autoplay !== undefined ? opts.autoplay : this.isPlaying;
        const audio = this.active;
        // Token de carrera: si el usuario salta rápido de canción, cada loadSong()
        // invalida al anterior y los rechazos obsoletos de play() se ignoran.
        const loadId = (this._loadSeq = (this._loadSeq || 0) + 1);
        this.cancelCrossfade();
        this.clearStall();
        this._resumeOnReconnect = false;
        this._ignorePauseUntil = Date.now() + 250; // margen mínimo por si algún navegador emite "pause" al cambiar src (Chrome no lo hace)
        const src = this._setSource(audio, song);
        audio.volume = 1;
        audio.loop = this.isRepeat;

        this.currentIndex = index;
        this.commitCurrent(song);
        this.updateSongUI(song, src.offline);
        // Antes isPlaying podía quedar en true con el audio detenido (autoplay:false).
        this.isPlaying = !!autoplay;
        if (autoplay) {
            audio.play().catch((err) => this.onPlayRejected(err, audio, song, loadId));
            this.setPlayButtonState(true);
        } else {
            this.setPlayButtonState(false);
        }
        return audio;
    }

    onPlayRejected(err, audio, song, loadId) {
        if (this._loadSeq !== loadId || audio !== this.active) return; // una carga más nueva ya la reemplazó
        if (!err) return;
        // AbortError: la interrumpimos nosotros (salto rápido). NotSupportedError: el
        // evento 'error' del <audio> ya lo gestiona; atenderlo aquí también hacía saltar
        // DOS canciones por cada fallo y duplicaba el reporte.
        if (err.name === 'AbortError' || err.name === 'NotSupportedError') return;
        this.isPlaying = false;
        this.setPlayButtonState(false);
        if (err.name === 'NotAllowedError') {
            // El navegador exige un toque del usuario. Antes aquí se saltaba a la siguiente,
            // que también era bloqueada, y se recorría la lista entera sin sonar nada.
            this.showToast('x', 'Toca play para reproducir');
            return;
        }
        this.showToast('x', 'No se pudo reproducir');
        this.reportPlaybackError(song, `No se pudo iniciar la reproducción (${err.name || 'error'})`);
    }

    updateSongUI(song, offline) {
        this.dom.currentTitle.textContent = song.title;
        this.dom.favoriteBtn.style.visibility = CATS[song.category].noFavorite ? 'hidden' : 'visible';
        this.portadaActual = getRandomPortada();
        this.dom.albumImage.src = this.portadaActual;
        this.getStatsFor(song.key).then(st => this.updateFavoriteUI(st.liked));
        this.updateDownloadUI(this.cachedBlobMap.has(song.key)); // antes leía el blob completo desde IndexedDB solo para saber si existía
        this.updateMediaSessionMeta(song);
        // Reiniciamos la barra: si no, se queda mostrando el avance de la canción anterior.
        this.dom.progressFill.style.width = '0%';
        this.dom.currentTime.textContent = '0:00';
        this.dom.totalTime.textContent = '0:00';
    }

    // Marca en la lista la canción actual SIN reconstruirla. Antes cada cambio de
    // canción volvía a pintar toda la lista (cientos de lecturas a IndexedDB).
    refreshActiveCard() {
        const cur = this.playlist[this.currentIndex];
        const key = cur ? cur.key : null;
        document.querySelectorAll('.song-card[data-key]').forEach(el => {
            el.classList.toggle('pressed', !!key && el.dataset.key === key && this.isPlaying);
        });
    }

    setPlayButtonState(playing) {
        this.dom.playBtn.innerHTML = icon(playing ? 'pause' : 'play');
        this.dom.playBtn.classList.toggle('is-playing', playing);
        this.updateWaves(playing);
        this.dom.albumArt.classList.toggle('spinning', playing);
        this.refreshActiveCard();
        if ('mediaSession' in navigator) {
            try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) { }
        }
    }

    togglePlay() {
        if (!this.playlist.length) { this.showToast('x', 'No hay canciones'); return; }
        this._consecutiveLoadFailures = 0;
        // Sin fuente o en estado de error (p. ej. falló al abrir la app): recargar de cero.
        if (!this.active.src || this.active.error) { this.loadSong(this.currentIndex, { autoplay: true }); return; }
        if (this.isPlaying) {
            this.clearStall();
            this._resumeOnReconnect = false;
            this.isPlaying = false;
            // Si se pausaba en pleno crossfade, la canción entrante quedaba pausada y al
            // terminar la actual se cambiaba a un audio detenido: silencio para siempre.
            this.cancelCrossfade();
            this.active.pause();
            this.setPlayButtonState(false);
            this.savePlaybackPosition();
        } else {
            this.isPlaying = true;
            this.setPlayButtonState(true);
            this.active.play().catch((err) => {
                if (err && err.name === 'AbortError') return; // interrupción propia (toques rápidos)
                this.isPlaying = false;
                this.setPlayButtonState(false);
                if (err && err.name === 'NotSupportedError') return; // lo atiende el evento 'error'
                this.showToast('x', 'No se puede reproducir');
                const reason = err && err.name ? `No se pudo reanudar la reproducción (${err.name})` : 'No se pudo reanudar la reproducción';
                this.reportPlaybackError(findByKey(this.active._songKey), reason);
            });
        }
    }

    // El sistema (llamada, auriculares, notificación del móvil) puede pausar/reanudar el
    // <audio> por su cuenta; sin esto la interfaz seguía mostrando el estado equivocado.
    onAudioPause(audio) {
        if (audio !== this.active || audio.ended || !this.isPlaying) return;
        if (Date.now() < (this._ignorePauseUntil || 0)) return;
        this.clearStall();
        this.isPlaying = false;
        this.setPlayButtonState(false);
        this.savePlaybackPosition();
    }
    onAudioPlay(audio) {
        if (audio !== this.active || this.isPlaying) return;
        this.isPlaying = true;
        this.setPlayButtonState(true);
    }

    recordSwitchStats(audio, { skippedManually = false } = {}) {
        if (!audio || !audio._songKey || !audio.duration || audio._playCounted === false) return;
        const song = findByKey(audio._songKey);
        if (song && CATS[song.category].noStats) return;
        const key = audio._songKey;
        const ratio = audio.duration ? (audio.currentTime / audio.duration) : 0;
        this.getStatsFor(key).then(st => {
            let changed = false;
            if (skippedManually && ratio < SKIP_RATIO && !audio._skipCounted) {
                st.skips = (st.skips || 0) + 1; audio._skipCounted = true; changed = true;
            } else if (ratio >= COMPLETE_RATIO && !audio._completeCounted) {
                st.completes = (st.completes || 0) + 1; audio._completeCounted = true; changed = true;
            }
            if (changed) this.saveStats(st);
        });
    }

    async registerPlayStart(song) {
        if (CATS[song.category].noStats) return;
        const st = await this.getStatsFor(song.key);
        st.plays = (st.plays || 0) + 1;
        await this.saveStats(st);
        this.totalPlays += 1;
        await this.db.setMeta('totalPlays', this.totalPlays);
        if (this.totalPlays === RECALC_THRESHOLD || (this.totalPlays > RECALC_THRESHOLD && (this.totalPlays - RECALC_THRESHOLD) % RECALC_INTERVAL === 0)) {
            this.recomputeTop();
        }
    }

    prevSong() {
        if (!this.playlist.length) return;
        this._consecutiveLoadFailures = 0;
        // Como en cualquier reproductor: pasados unos segundos, "anterior" reinicia la canción.
        if (this.active._songKey && !this.active.error && this.active.currentTime > 3) {
            this.cancelCrossfade();
            this.active.currentTime = 0;
            return;
        }
        this.recordSwitchStats(this.active, { skippedManually: true });
        let idx = -1;
        if (this.isShuffle) {
            // El historial guarda CLAVES, no índices: los índices dejaban de valer en
            // cuanto la lista cambiaba (Mix distinto, otra pestaña...) y "anterior"
            // saltaba a una canción cualquiera, de otra sección incluso.
            while (this.shuffleHistory.length && idx === -1) {
                const key = this.shuffleHistory.pop();
                idx = this.playlist.findIndex(s => s.key === key);
            }
        }
        if (idx === -1) idx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadSong(idx, { autoplay: this.isPlaying });
    }

    nextSong(manual = true) {
        if (!this.playlist.length) return;
        if (manual) {
            this._consecutiveLoadFailures = 0;
            this.recordSwitchStats(this.active, { skippedManually: true });
        }
        const cur = this.playlist[this.currentIndex];
        const next = this.getNextIndex();
        if (this.isShuffle && cur) {
            this.shuffleHistory.push(cur.key);
            if (this.shuffleHistory.length > 100) this.shuffleHistory.shift();
        }
        this.loadSong(next, { autoplay: this.isPlaying });
    }

    onEnded(audio) {
        if (audio !== this.active) return;
        // Si la canción terminó en pleno crossfade (en segundo plano "timeupdate" llega
        // espaciado y puede no alcanzar el umbral final), antes se ignoraba aquí y la
        // app quedaba congelada con el audio siguiente sonando "fuera" de control.
        if (this.crossfading) { this.finishCrossfade(); return; }
        if (this.isRepeat) {
            // Red de seguridad: con audio.loop=true 'ended' no debería llegar nunca.
            audio.currentTime = 0;
            audio.play().catch(() => { });
            return;
        }
        this.recordSwitchStats(audio, { skippedManually: false });
        this.nextSong(false);
    }

    // ---------- ERRORES ----------
    onAudioError(audio) {
        if (!audio._songKey) return; // elemento ya liberado
        const song = findByKey(audio._songKey);
        const errCode = audio.error ? audio.error.code : null;
        const errMap = { 1: 'Reproducción abortada', 2: 'Error de red', 3: 'Error al decodificar el audio', 4: 'Formato/fuente no soportada' };
        const errorText = errMap[errCode] || 'Error desconocido de reproducción';

        // Falló la canción que se estaba precargando para el crossfade: se cancela el
        // fundido y la canción actual sigue normal; la próxima será otra distinta.
        if (this._preload && audio === this._preload.audio) {
            const failedKey = this._preload.key;
            this._fadeToken++;
            if (this.crossfading) { this.crossfading = false; this.active.volume = 1; }
            this._preload = null;
            this.markBad(failedKey);
            this.reportPlaybackError(song, `Falló precarga de crossfade: ${errorText}`);
            this._detach(audio);
            return;
        }

        if (audio !== this.active) return;
        this.clearStall();
        this.reportPlaybackError(song, `${errorText} [${this.netInfo()}]`);

        // Carga "en reposo" (p. ej. al abrir la app): no hay nada que saltar. Si el
        // usuario pulsa play, togglePlay detecta el error y reintenta desde cero.
        if (!this.isPlaying) return;

        if (audio._offline) {
            // La copia descargada está dañada: se descarta y se vuelve a transmitir.
            this.db.deleteCachedBlob(audio._songKey);
            this.cachedBlobMap.delete(audio._songKey);
            this.showToast('x', 'Copia descargada dañada: se transmitirá en línea');
            if (navigator.onLine) { this.loadSong(this.currentIndex, { autoplay: true }); return; }
        }
        if (!navigator.onLine) { this.tryPlayNextCached(); return; }

        const loadId = this._loadSeq;
        // En Chrome, perder la conexión a mitad de la carga se reporta como "Formato no
        // soportado". Se reintenta UNA vez la misma canción antes de darla por mala.
        if (!audio._errorRetries) {
            audio._errorRetries = 1;
            this.showToast('wifiOff', 'Conexión inestable, reintentando…');
            const pos = audio.currentTime || 0;
            setTimeout(() => {
                if (this._loadSeq === loadId && this.isPlaying) this.reloadActiveAt(audio, pos);
            }, 1500);
            return;
        }
        this.markBad(audio._songKey);
        this.skipAfterFailure(loadId);
    }

    // Pasa a la siguiente tras un fallo, con tope. Antes el tope era el tamaño de la
    // lista (hasta ~350 fallos seguidos): sin conexión se recorría toda la lista,
    // saturando la red y el reporte de errores, y la música no volvía a arrancar.
    skipAfterFailure(loadId) {
        this._consecutiveLoadFailures = (this._consecutiveLoadFailures || 0) + 1;
        if (this._consecutiveLoadFailures <= MAX_CONSECUTIVE_FAILURES) {
            setTimeout(() => {
                if (this._loadSeq === loadId && this.isPlaying) this.nextSong(false);
            }, 400);
        } else {
            this.isPlaying = false;
            this.setPlayButtonState(false);
            this._resumeOnReconnect = false;
            this.showToast('wifiOff', 'Varias canciones fallaron: revisa tu conexión y toca play');
        }
    }

    netInfo() {
        const c = navigator.connection;
        return `online=${navigator.onLine}${c && c.effectiveType ? `, red=${c.effectiveType}` : ''}`;
    }

    // Recarga la fuente del audio activo y retoma en el segundo indicado.
    reloadActiveAt(audio, pos) {
        if (audio !== this.active || !audio._songKey) return;
        const key = audio._songKey;
        this._ignorePauseUntil = Date.now() + 250;
        const restore = () => {
            if (audio._songKey === key && pos > 0) { try { audio.currentTime = pos; } catch (e) { } }
        };
        audio.addEventListener('loadedmetadata', restore, { once: true });
        audio.load();
        if (this.isPlaying) audio.play().catch(() => { });
    }

    // ---------- ATASCOS DE BUFFERING ----------
    // En datos móviles la canción a veces se queda "esperando" datos. Antes, a los 3s
    // se recargaba la fuente: eso DESCARTABA lo ya descargado y volvía a empezar, así
    // que con una red lenta se entraba en un bucle de recargas sin avanzar nunca.
    // Ahora: 1) esperar más, 2) empujar el play, 3) recargar (máx. 2 veces) y
    // 4) si sigue sin avanzar, pasar a la siguiente.
    onAudioWaiting(audio) {
        if (audio !== this.active || !this.isPlaying || this._stallTimer) return;
        this._stallTimer = setTimeout(() => this.handleStall(audio), STALL_TIMEOUT_MS);
    }
    onAudioPlaying(audio) {
        if (audio !== this.active) return;
        this.clearStall();
        this._consecutiveLoadFailures = 0;
        this._resumeOnReconnect = false;
        audio._stallRetries = 0;
    }
    clearStall() {
        clearTimeout(this._stallTimer);
        this._stallTimer = null;
    }
    handleStall(audio) {
        this._stallTimer = null;
        if (audio !== this.active || !this.isPlaying || audio.paused || audio.ended) return;
        if (audio.readyState >= 3) return; // ya se recuperó
        if (!audio._offline && !navigator.onLine) {
            // Sin red no tiene sentido recargar: se espera a que vuelva (evento 'online').
            this._resumeOnReconnect = true;
            this.showToast('wifiOff', 'Sin conexión: se reanudará al volver');
            return;
        }
        const song = findByKey(audio._songKey);
        const loadId = this._loadSeq;
        audio._stallRetries = (audio._stallRetries || 0) + 1;
        const n = audio._stallRetries;
        if (n === 1) {
            audio.play().catch(() => { }); // empujón suave: conserva lo ya descargado
        } else if (n <= 1 + STALL_MAX_RELOADS) {
            this.reportPlaybackError(song, `Buffering atascado: recargando fuente (intento ${n - 1}) [${this.netInfo()}]`);
            this.reloadActiveAt(audio, audio.currentTime);
        } else {
            this.reportPlaybackError(song, `Buffering atascado: se omite la canción [${this.netInfo()}]`);
            this.markBad(audio._songKey);
            this.showToast('wifiOff', 'Conexión lenta: pasando a la siguiente');
            this.skipAfterFailure(loadId);
            return;
        }
        this._stallTimer = setTimeout(() => this.handleStall(audio), STALL_TIMEOUT_MS);
    }
    // Al volver la red, retomar justo donde se quedó.
    resumeAfterReconnect() {
        if (!this._resumeOnReconnect) return;
        this._resumeOnReconnect = false;
        if (!this.isPlaying || !this.active._songKey) return;
        this.reloadActiveAt(this.active, this.active.currentTime);
    }

    async tryPlayNextCached() {
        this._consecutiveLoadFailures = (this._consecutiveLoadFailures || 0) + 1;
        const n = this.playlist.length;
        if (this._consecutiveLoadFailures <= n) {
            for (let i = 1; i < n; i++) {
                const idx = (this.currentIndex + i) % n;
                const song = this.playlist[idx];
                if (this.cachedBlobMap.has(song.key)) { this.loadSong(idx, { autoplay: this.isPlaying }); return; }
            }
        }
        this.showToast('wifiOff', 'Sin conexión: no hay más canciones guardadas');
        this.isPlaying = false; this.setPlayButtonState(false);
    }

    onTimeUpdate(audio) {
        if (audio !== this.active) return;
        const dur = audio.duration;
        if (!dur || !isFinite(dur)) return;
        if (this._stallTimer && audio.readyState >= 3) this.clearStall(); // volvió a avanzar

        if (!this.isDragging) {
            const p = Math.max(0, Math.min(100, (audio.currentTime / dur) * 100));
            this.dom.progressFill.style.width = `${p}%`;
            this.dom.currentTime.textContent = this.formatTime(audio.currentTime);
            this.dom.totalTime.textContent = this.formatTime(dur);
        }

        // Repetición nativa (audio.loop): detectamos la vuelta al inicio para contarla.
        if (audio.loop && (audio._lastT || 0) > dur - 1.5 && audio.currentTime < 1.5) {
            const song = findByKey(audio._songKey);
            if (!(song && CATS[song.category].noStats)) {
                this.getStatsFor(audio._songKey).then(st => { st.repeats = (st.repeats || 0) + 1; this.saveStats(st); });
            }
        }
        audio._lastT = audio.currentTime;

        // Guardamos la posición cada ~5s para retomar cerca de donde iban si cierran la app.
        if (!this._lastPosSaveAt || Date.now() - this._lastPosSaveAt > 5000) {
            this._lastPosSaveAt = Date.now();
            this.savePlaybackPosition();
        }

        if (!audio._playCounted && audio.currentTime > 0.3) {
            audio._playCounted = true;
            const song = findByKey(audio._songKey);
            if (song) this.registerPlayStart(song);
        }

        if (dur > FADE_SECONDS * 2.2) {
            const remaining = dur - audio.currentTime;
            if (this.crossfading) {
                this.stepCrossfade(remaining);
            } else {
                this.maybePreloadNext(audio, remaining);
                this.maybeStartCrossfade(audio, remaining);
            }
        }
    }

    // ---------- PRECARGA Y CROSSFADE ----------
    // Flujo: faltando PRELOAD_SECONDS se empieza a DESCARGAR la siguiente (en pausa y
    // sin sonar). Faltando FADE_SECONDS se da play y, solo cuando realmente está
    // sonando, comienza el fundido. Si algo falla (fuente rota, play bloqueado) no hay
    // fundido y la canción actual termina normal, avanzando con 'ended'. Antes se
    // cambiaba de elemento a ciegas aunque el siguiente no estuviera sonando.
    canCrossfade() {
        return VOLUME_CONTROL && !this.isRepeat && this.isPlaying && this.playlist.length > 1;
    }
    maybePreloadNext(audio, remaining) {
        if (audio._preloadTried || this._preload || !this.canCrossfade()) return;
        if (!(remaining <= PRELOAD_SECONDS)) return;
        audio._preloadTried = true;
        const idx = this.getNextIndex();
        const next = this.playlist[idx];
        if (!next || idx === this.currentIndex) return;
        const target = this.inactive;
        this._setSource(target, next);
        target.volume = 0;
        target.loop = false;
        this._preload = { idx, key: next.key, audio: target, failed: false, starting: false };
    }
    maybeStartCrossfade(audio, remaining) {
        const p = this._preload;
        if (!p || p.failed || p.starting || remaining > FADE_SECONDS || !this.canCrossfade()) return;
        p.starting = true;
        const token = this._fadeToken;
        p.audio.volume = 0;
        p.audio.play().then(() => {
            if (token !== this._fadeToken || this._preload !== p) return; // cancelado mientras arrancaba
            this.crossfading = true;
        }).catch((err) => {
            if (token !== this._fadeToken || this._preload !== p) return;
            p.failed = true;
            p.starting = false;
            try { p.audio.pause(); } catch (e) { }
            if (!(err && (err.name === 'AbortError' || err.name === 'NotSupportedError'))) {
                this.reportPlaybackError(findByKey(p.key), `Falló crossfade: ${err && err.name ? err.name : 'error'}`);
            }
        });
    }
    stepCrossfade(remaining) {
        // Si el usuario retrocedió la barra en pleno fundido, se cancela (si no, la
        // canción entrante seguía avanzando en silencio y luego entraba a mitad).
        if (remaining > FADE_SECONDS + 1) { this.cancelCrossfade(); return; }
        const t = Math.max(0, Math.min(1, 1 - (remaining / FADE_SECONDS)));
        this.active.volume = Math.cos(t * Math.PI / 2);   // potencia constante: sin "hueco" de volumen a mitad
        this.inactive.volume = Math.sin(t * Math.PI / 2);
        if (remaining <= 0.15) this.finishCrossfade();
    }
    finishCrossfade() {
        const p = this._preload;
        if (!this.crossfading || !p) return;
        this.crossfading = false;
        this._preload = null;
        this._fadeToken++;
        const oldAudio = this.active;
        const newAudio = p.audio;
        this.recordSwitchStats(oldAudio, { skippedManually: false });
        oldAudio.loop = false;
        this._detach(oldAudio);
        newAudio.volume = 1;
        newAudio.loop = this.isRepeat;
        if (newAudio.paused) newAudio.play().catch(() => { });
        this.active = newAudio;
        this.inactive = oldAudio;
        this.currentIndex = p.idx;
        const song = this.playlist[this.currentIndex];
        this.commitCurrent(song);
        this.updateSongUI(song, newAudio._offline);
        this.refreshActiveCard();
    }
    // Cancela fundido y precarga pendientes (cambio de canción, de cola, pausa, repetir...).
    cancelCrossfade() {
        this._fadeToken++;
        this.crossfading = false;
        this._preload = null;
        if (this.inactive) this._detach(this.inactive);
        this.active.volume = 1;
        this.active._preloadTried = false; // si hace falta, se vuelve a precargar con la cola vigente
    }

    toggleFavorite() {
        if (!this.playlist.length || !this.playlist[this.currentIndex]) return;
        const song = this.playlist[this.currentIndex];
        if (CATS[song.category].noFavorite) return;
        this.getStatsFor(song.key).then(async st => {
            st.liked = !st.liked;
            await this.saveStats(st);
            this.updateFavoriteUI(st.liked);
            this.showToast('heart', st.liked ? 'Agregado a tu TOP' : 'Eliminado de favoritos');
            if (st.liked) {
                if (navigator.onLine) { await this.ensureCached(song); this.updateDownloadUI(true); }
            } else {
                const stillTop = this.topScored.includes(song.key);
                if (!stillTop && !st.manualDownload) { await this.db.deleteCachedBlob(song.key); this.cachedBlobMap.delete(song.key); this.updateDownloadUI(false); }
            }
        });
    }
    updateFavoriteUI(liked) {
        const cls = liked ? 'icon-filled' : '';
        this.dom.favoriteBtn.innerHTML = icon('heart', cls);
        this.dom.favoriteBtn.classList.toggle('toggle-pressed', liked);
    }
    updateDownloadUI(downloaded) {
        this.dom.quickDownloadBtn.innerHTML = icon(downloaded ? 'check' : 'download');
        this.dom.quickDownloadBtn.classList.toggle('toggle-pressed', downloaded);
    }

    async downloadCurrentSong() {
        if (!this.playlist.length) return;
        const song = this.playlist[this.currentIndex];
        const already = await this.db.getCachedBlob(song.key);
        if (already) return;
        await this.downloadManually(song, this.dom.quickDownloadBtn);
        this.updateDownloadUI(true);
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.dom.shuffleBtn.classList.toggle('toggle-pressed', this.isShuffle);
        this.showToast('shuffle', this.isShuffle ? 'Aleatorio activado' : 'Aleatorio desactivado');
        this.db.setMeta('isShuffle', this.isShuffle);
        if (this.isShuffle) this.shuffleHistory = [];
        // El orden de "lo que sigue" cambió: se descarta la siguiente ya decidida/precargada.
        this._nextIdx = null;
        this.cancelCrossfade();
    }
    toggleRepeat() {
        this.isRepeat = !this.isRepeat;
        this.dom.repeatBtn.classList.toggle('toggle-pressed', this.isRepeat);
        this.showToast('repeat', this.isRepeat ? 'Repetir activado' : 'Repetir desactivado');
        // Repetición NATIVA con audio.loop: el elemento nunca llega a 'ended', así que no hay
        // hueco ni dependemos de poder volver a llamar play() desde un evento (en móvil, en
        // segundo plano, ese play() podía ser bloqueado y la música no volvía a sonar).
        this.active.loop = this.isRepeat;
        if (this.isRepeat) this.cancelCrossfade(); // ya no habrá "siguiente": se descarta lo precargado
        if (this.isRepeat && this.active._songKey) {
            const song = findByKey(this.active._songKey);
            if (!(song && CATS[song.category].noStats)) {
                this.getStatsFor(this.active._songKey).then(st => { st.repeats = (st.repeats || 0) + 1; this.saveStats(st); });
            }
        }
    }

    // ---------- TOP INTELIGENTE ----------
    async recomputeTop() {
        const allStats = await this.db.getAllStats();
        const scored = allStats
            .filter(s => !s.liked)
            .map(s => ({ key: s.key, score: (s.plays || 0) + (s.completes || 0) * 2 + (s.repeats || 0) * 3 - (s.skips || 0) * 1.5 }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(s => s.key);
        this.topScored = scored;
        await this.db.setMeta('topScored', scored);

        if (navigator.onLine) {
            for (const key of scored) {
                const song = findByKey(key);
                if (song) await this.ensureCached(song);
            }
        }
        const likedKeys = new Set(allStats.filter(s => s.liked).map(s => s.key));
        const manualKeys = new Set(allStats.filter(s => s.manualDownload).map(s => s.key));
        const cacheKeys = await this.db.getCacheKeys();
        for (const key of cacheKeys) {
            if (!likedKeys.has(key) && !manualKeys.has(key) && !scored.includes(key)) { await this.db.deleteCachedBlob(key); this.cachedBlobMap.delete(key); }
        }
        this.showToast('star', 'Tu TOP se actualizó con tus gustos');
    }

    // Punto 6: máximo MAX_DOWNLOADS (30) canciones guardadas en caché. Si ya se
    // llegó al tope, liberamos la más antigua que NO esté marcada como favorita
    // ni descargada manualmente (esas se respetan siempre). Si no hay ninguna
    // liberable (todo es favorito/manual), devolvemos false: no hay espacio.
    async enforceDownloadCap() {
        const keys = await this.db.getCacheKeys();
        if (keys.length < MAX_DOWNLOADS) return true;
        const [allStats, entries] = await Promise.all([this.db.getAllStats(), this.db.getCacheEntries()]);
        const statsByKey = new Map(allStats.map(s => [s.key, s]));
        const evictable = entries
            .filter(e => {
                const st = statsByKey.get(e.key);
                return !(st && (st.liked || st.manualDownload));
            })
            .sort((a, b) => a.cachedAt - b.cachedAt);
        if (evictable.length === 0) return false;
        const toEvict = evictable[0];
        await this.db.deleteCachedBlob(toEvict.key);
        this.cachedBlobMap.delete(toEvict.key);
        return true;
    }

    async ensureCached(song) {
        const existing = this.cachedBlobMap.get(song.key) || await this.db.getCachedBlob(song.key);
        if (existing) { this.cachedBlobMap.set(song.key, existing); return true; }
        if (!navigator.onLine) return false;
        const hasRoom = await this.enforceDownloadCap();
        if (!hasRoom) return false; // tope alcanzado y todo lo guardado es prioritario
        try {
            const resp = await fetch(song.url);
            if (!resp.ok) return false;
            const blob = await resp.blob();
            await this.db.cacheBlob(song.key, blob);
            this.cachedBlobMap.set(song.key, blob);
            return true;
        } catch (e) { return false; }
    }

    async downloadManually(song, btnEl) {
        if (btnEl) { btnEl.classList.add('downloading'); btnEl.innerHTML = icon('download'); }
        if (!navigator.onLine) {
            this.showToast('wifiOff', 'Sin conexión: no se puede descargar ahora');
            if (btnEl) btnEl.classList.remove('downloading');
            return;
        }
        const already = this.cachedBlobMap.get(song.key) || await this.db.getCachedBlob(song.key);
        if (!already) {
            const hasRoom = await this.enforceDownloadCap();
            if (!hasRoom) {
                this.showToast('x', `Límite de ${MAX_DOWNLOADS} descargas alcanzado`);
                if (btnEl) btnEl.classList.remove('downloading');
                return;
            }
        }
        const ok = await this.ensureCached(song);
        if (ok) {
            const st = await this.getStatsFor(song.key);
            st.manualDownload = true;
            await this.saveStats(st);
            this.showToast('check', `"${song.title}" descargada`);
            if (btnEl) { btnEl.classList.remove('downloading'); btnEl.classList.add('downloaded', 'toggle-pressed'); btnEl.innerHTML = icon('check'); }
        } else {
            this.showToast('x', 'No se pudo descargar');
            if (btnEl) btnEl.classList.remove('downloading');
        }
    }

    async removeManualDownload(song) {
        const st = await this.getStatsFor(song.key);
        st.manualDownload = false;
        await this.saveStats(st);
        const stillNeeded = st.liked || this.topScored.includes(song.key);
        if (!stillNeeded) { await this.db.deleteCachedBlob(song.key); this.cachedBlobMap.delete(song.key); }
        this.showToast('trash', `"${song.title}" ya no está descargada`);
    }

    async getTopList() {
        const allStats = await this.db.getAllStats();
        const likedKeys = allStats.filter(s => s.liked).map(s => s.key);
        const combined = Array.from(new Set([...likedKeys, ...this.topScored]));
        let songs = combined.map(k => findByKey(k)).filter(Boolean);
        // Punto 1: "Tu TOP" debe respetar el Mix elegido (antes mostraba favoritos/top
        // de TODAS las categorías aunque el usuario solo tuviera GYM seleccionado).
        if (this.mixCategories.length > 0) {
            songs = songs.filter(s => this.mixCategories.includes(s.category));
        }
        // En modo Descargas (sin conexión) solo tiene sentido mostrar lo que
        // realmente está guardado; si no, tocar una tarjeta del TOP intentaría
        // transmitir sin conexión y rompería la reproducción.
        if (this.downloadsMode) {
            const availableKeys = new Set((this.downloadedCatalog || []).map(s => s.key));
            songs = songs.filter(s => availableKeys.has(s.key));
        }
        return songs;
    }

    // ---------- ARRASTRE DE PROGRESO ----------
    startDrag(e) {
        if (!this.active.duration) return;
        this.isDragging = true;
        const rect = this.dom.progressBar.getBoundingClientRect();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.active.currentTime = x * this.active.duration;
        this.dom.progressFill.style.width = `${x * 100}%`;
    }
    drag(e) {
        if (!this.isDragging || !this.active.duration) return;
        const rect = this.dom.progressBar.getBoundingClientRect();
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        let x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.active.currentTime = x * this.active.duration;
        this.dom.progressFill.style.width = `${x * 100}%`;
        this.dom.currentTime.textContent = this.formatTime(this.active.currentTime);
    }
    endDrag() { this.isDragging = false; }

    updateWaves(active) { this.dom.waves.forEach(w => w.classList.toggle('active', active)); }

    // ---------- UTILIDADES ----------
    formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(1)} GB`;
    }
    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    showToast(iconName, msg) {
        this.dom.toast.innerHTML = `${icon(iconName || 'check')}<span>${msg}</span>`;
        this.dom.toast.classList.add('show');
        clearTimeout(this.dom.toast._timeout);
        this.dom.toast._timeout = setTimeout(() => { this.dom.toast.classList.remove('show'); }, 3000);
    }
    updateOfflineStatus() {
        if (!navigator.onLine) this.dom.offlineBadge.classList.add('show');
        else this.dom.offlineBadge.classList.remove('show');
    }
    onKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); this.togglePlay(); }
        if (e.key === 'ArrowRight') this.nextSong();
        if (e.key === 'ArrowLeft') this.prevSong();
        if (e.key === 'Escape') { this.closeMixConfig(); this.closeSettings(); this.toggleListMode(false); }
    }

    setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.prevSong());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.nextSong());
    }
    updateMediaSessionMeta(song) {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: 'Mi Música',
                album: CATS[song.category].label,
                artwork: [{ src: this.portadaActual, sizes: '400x400', type: 'image/jpeg' }]
            });
        } catch (e) { }
    }
}