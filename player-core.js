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
        this._consecutiveLoadFailures = 0; // corta la cadena de "saltar a la siguiente" si TODAS fallan
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
            this.mixCategories = await this.db.getMeta('mixCategories', []);

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

    // Reconstruye this.playlist según el pool activo (catálogo completo o solo
    // descargadas si downloadsMode está activo) y la selección de Mix vigente.
    // Reconstruye this.playlist según el pool activo (catálogo completo o solo
    // descargadas si downloadsMode está activo) y la selección de Mix vigente.
    rebuildPlaylistFromState() {
        this.playlist = this.getActivePool();
        this.currentIndex = 0;
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
        this.rebuildPlaylistFromState();
        if (this.playlist.length > 0) {
            this.currentIndex = 0;
            await this.loadSong(this.currentIndex, { autoplay: false });
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
            sourceIsTop: true
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

    async reportPlaybackError(song, errorText) {
        try {
            await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ sheet: 'errores', action: 'add', url: `${errorText} — ${song ? song.url : 'canción desconocida'}` })
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
            sourceIsTop: this.activeListTab === 'top'
        });
    }

    // ---------- CARGA Y REPRODUCCIÓN ----------
    // SIN "async/await" a propósito: si esto esperara una lectura de IndexedDB,
    // el tiempo transcurrido entre el click del usuario y el audio.play() rompería
    // el "gesto del usuario" y el navegador bloquearía la reproducción.
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

    async loadSong(index, opts = {}) {
        const song = this.playlist[index];
        if (!song) return;
        const autoplay = opts.autoplay !== undefined ? opts.autoplay : this.isPlaying;
        const src = this.resolveSource(song);
        const audio = opts.targetAudio || this.active;
        // Token de carrera: si el usuario salta de canción rápido (varios toques
        // seguidos a "siguiente"), cada loadSong() invalida al anterior. Así, si el
        // play() de una carga vieja rechaza (típicamente con AbortError porque la
        // reemplazamos), lo ignoramos en vez de tratarlo como un error real.
        const loadId = (this._loadSeq = (this._loadSeq || 0) + 1);
        clearTimeout(this._stallTimer);
        audio.src = src.url;
        audio.volume = 1;
        audio.load();
        audio._songKey = song.key;
        audio._offline = src.offline;
        audio._skipCounted = false;
        audio._completeCounted = false;
        audio._playCounted = false;

        if (!opts.isCrossfadeTarget) {
            this.currentIndex = index;
            this.updateSongUI(song, src.offline);
            if (autoplay) {
                this.isPlaying = true;
                audio.play().catch((err) => {
                    // Una carga más nueva ya reemplazó a esta: el rechazo es obsoleto, se ignora.
                    if (this._loadSeq !== loadId) return;
                    // AbortError casi siempre significa que nosotros mismos interrumpimos
                    // el play() (por un salto rápido), no que la canción esté rota.
                    if (err && err.name === 'AbortError') return;
                    this.showToast('x', src.offline ? 'Error al reproducir' : 'No se pudo transmitir (sin conexión)');
                    const reason = err && err.name ? `No se pudo iniciar la reproducción (${err.name})` : 'No se pudo iniciar la reproducción';
                    this.reportPlaybackError(song, reason);
                    this.isPlaying = false;
                    this.setPlayButtonState(false);
                    // No dejamos la app congelada: probamos con la siguiente canción,
                    // con un límite para no entrar en bucle si TODAS fallan.
                    this._consecutiveLoadFailures = (this._consecutiveLoadFailures || 0) + 1;
                    if (this._consecutiveLoadFailures <= Math.max(5, this.playlist.length)) {
                        setTimeout(() => this.nextSong(false), 400);
                    } else {
                        this.showToast('x', 'Varias canciones seguidas fallaron al reproducir');
                    }
                });
                this.setPlayButtonState(true);
            } else {
                this.setPlayButtonState(false);
            }
            this.switchListTab(this.activeListTab); // siempre poblada: en web la lista no tiene botón para abrirse
        }
        return audio;
    }

    updateSongUI(song, offline) {
        this.dom.currentTitle.textContent = song.title;
        this.dom.favoriteBtn.style.visibility = CATS[song.category].noFavorite ? 'hidden' : 'visible';
        this.portadaActual = getRandomPortada();
        this.dom.albumImage.src = this.portadaActual;
        this.getStatsFor(song.key).then(st => this.updateFavoriteUI(st.liked));
        this.db.getCachedBlob(song.key).then(blob => this.updateDownloadUI(!!blob));
        this.updateMediaSessionMeta(song);
        // Reiniciamos la barra de progreso: si no la reseteamos aquí, se queda mostrando
        // el avance de la canción anterior hasta que llegue el primer "timeupdate" de la nueva.
        this.dom.progressFill.style.width = '0%';
        this.dom.currentTime.textContent = '0:00';
        this.dom.totalTime.textContent = '0:00';
    }

    setPlayButtonState(playing) {
        this.dom.playBtn.innerHTML = icon(playing ? 'pause' : 'play');
        this.dom.playBtn.classList.toggle('is-playing', playing);
        this.updateWaves(playing);
        this.dom.albumArt.classList.toggle('spinning', playing);
    }

    togglePlay() {
        if (!this.playlist.length) { this.showToast('x', 'No hay canciones'); return; }
        if (!this.active.src) { this.loadSong(this.currentIndex, { autoplay: true }); return; }
        if (this.isPlaying) {
            clearTimeout(this._stallTimer);
            this.active.pause();
            if (this.crossfading) this.inactive.pause();
            this.isPlaying = false;
            this.setPlayButtonState(false);
            this.savePlaybackPosition();
        } else {
            this.active.play().catch((err) => {
                if (err && err.name === 'AbortError') return; // interrupción propia (toques rápidos), no un error real
                this.showToast('x', 'No se puede reproducir');
                const reason = err && err.name ? `No se pudo reanudar la reproducción (${err.name})` : 'No se pudo reanudar la reproducción';
                this.reportPlaybackError(findByKey(this.active._songKey), reason);
                this.isPlaying = false;
                this.setPlayButtonState(false);
            });
            this.isPlaying = true;
            this.setPlayButtonState(true);
        }
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
        this.recordSwitchStats(this.active, { skippedManually: true });
        if (this.isShuffle && this.shuffleHistory.length > 0) {
            this.currentIndex = this.shuffleHistory.pop() || 0;
        } else {
            this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        }
        this.stopCrossfadeState();
        this.loadSong(this.currentIndex, { autoplay: this.isPlaying });
    }

    nextSong(manual = true) {
        if (!this.playlist.length) return;
        if (manual) this.recordSwitchStats(this.active, { skippedManually: true });
        let next;
        if (this.isShuffle) {
            do { next = Math.floor(Math.random() * this.playlist.length); } while (next === this.currentIndex && this.playlist.length > 1);
            this.shuffleHistory.push(this.currentIndex);
        } else {
            next = (this.currentIndex + 1) % this.playlist.length;
        }
        this.currentIndex = next;
        this.stopCrossfadeState();
        this.loadSong(this.currentIndex, { autoplay: this.isPlaying });
    }

    stopCrossfadeState() {
        this.crossfading = false;
        this.inactive.pause();
        this.inactive.volume = 1;
    }

    onEnded(audio) {
        if (audio !== this.active) return;
        if (this.crossfading) return;
        if (this.isRepeat) {
            const song = findByKey(audio._songKey);
            if (!(song && CATS[song.category].noStats)) {
                this.getStatsFor(audio._songKey).then(st => { st.repeats = (st.repeats || 0) + 1; this.saveStats(st); });
            }
            audio.currentTime = 0;
            audio.play().catch((err) => {
                if (err && err.name === 'AbortError') return; // interrupción propia, no un error real
                const reason = err && err.name ? `No se pudo repetir la canción (${err.name})` : 'No se pudo repetir la canción';
                this.reportPlaybackError(song, reason);
                // Antes esto quedaba en silencio y la reproducción se congelaba.
                // Ahora avanzamos para no dejar la app trabada.
                this.nextSong(false);
            });
            this.showToast('repeat', 'Repitiendo canción');
            return;
        }
        this.recordSwitchStats(audio, { skippedManually: false });
        this.nextSong(false);
    }

    onAudioError(audio) {
        const song = findByKey(audio._songKey);
        const errCode = audio.error ? audio.error.code : null;
        const errMap = { 1: 'Reproducción abortada', 2: 'Error de red', 3: 'Error al decodificar el audio', 4: 'Formato/fuente no soportada' };
        const errorText = errMap[errCode] || 'Error desconocido de reproducción';

        // Punto 2: si lo que falló es la pista que se estaba precargando para el
        // crossfade (this.inactive mientras this.crossfading), antes esto se
        // ignoraba por completo y el crossfade igual terminaba cambiando a un
        // audio roto/sin fuente, congelando la reproducción. Ahora cancelamos
        // el crossfade y dejamos que la canción activa siga sonando normal
        // hasta que termine (onEnded se encargará de avanzar).
        if (this.crossfading && audio === this.inactive) {
            this.crossfading = false;
            this.reportPlaybackError(song, `Falló precarga de crossfade: ${errorText}`);
            this.active.volume = 1;
            audio.pause();
            audio.volume = 1;
            return;
        }

        if (audio !== this.active) return;
        this.reportPlaybackError(song, errorText);
        this.showToast('x', audio._offline ? 'Error al reproducir' : 'No se pudo transmitir esta canción');
        if (!navigator.onLine) {
            this.tryPlayNextCached();
        } else {
            this._consecutiveLoadFailures = (this._consecutiveLoadFailures || 0) + 1;
            if (this._consecutiveLoadFailures <= Math.max(5, this.playlist.length)) {
                setTimeout(() => this.nextSong(false), 400);
            } else {
                this.showToast('x', 'Varias canciones seguidas fallaron al reproducir');
            }
        }
    }

    // Punto 7: en datos móviles la canción a veces se queda "esperando" (buffering)
    // y nunca retoma sola. Si el audio activo lleva demasiado tiempo en ese estado,
    // reintentamos recargar la fuente desde el mismo punto en vez de dejarla pausada
    // indefinidamente.
    onAudioWaiting(audio) {
        if (audio !== this.active) return;
        clearTimeout(this._stallTimer);
        this._stallTimer = setTimeout(() => {
            if (this.active !== audio || audio.paused || !this.isPlaying) return;
            const song = findByKey(audio._songKey);
            this.reportPlaybackError(song, 'Buffering atascado: recargando fuente');
            const resumeAt = audio.currentTime;
            audio.load();
            audio.currentTime = resumeAt;
            audio.play().catch(() => { });
        }, STALL_TIMEOUT_MS);
    }
    onAudioPlaying(audio) {
        if (audio !== this.active) return;
        clearTimeout(this._stallTimer);
        this._consecutiveLoadFailures = 0;
    }

    async tryPlayNextCached() {
        for (let i = 1; i <= this.playlist.length; i++) {
            const idx = (this.currentIndex + i) % this.playlist.length;
            const song = this.playlist[idx];
            const blob = await this.db.getCachedBlob(song.key);
            if (blob) { this.currentIndex = idx; this.loadSong(idx, { autoplay: this.isPlaying }); return; }
        }
        this.showToast('wifiOff', 'Sin conexión: no hay más canciones guardadas');
        this.isPlaying = false; this.setPlayButtonState(false);
    }

    onTimeUpdate(audio) {
        if (audio !== this.active) return;
        if (!this.isDragging && audio.duration && isFinite(audio.duration)) {
            const p = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
            this.dom.progressFill.style.width = `${p}%`;
            this.dom.currentTime.textContent = this.formatTime(audio.currentTime);
            this.dom.totalTime.textContent = this.formatTime(audio.duration);

            // Guardamos la posición cada ~5s (no en cada "timeupdate") para no saturar
            // el almacenamiento; así, si cierran la app, retoman cerca de donde iban.
            if (!this._lastPosSaveAt || Date.now() - this._lastPosSaveAt > 5000) {
                this._lastPosSaveAt = Date.now();
                this.savePlaybackPosition();
            }

            if (!audio._playCounted && audio.currentTime > 0.3) {
                audio._playCounted = true;
                const song = findByKey(audio._songKey);
                if (song) this.registerPlayStart(song);
            }

            const remaining = audio.duration - audio.currentTime;
            if (!this.crossfading && !this.isRepeat && remaining <= FADE_SECONDS && audio.duration > FADE_SECONDS * 2.2 && this.playlist.length > 1) {
                this.beginCrossfade();
            }
            if (this.crossfading) this.stepCrossfade(remaining);
        }
    }

    async beginCrossfade() {
        this.crossfading = true;
        let nextIdx;
        if (this.isShuffle) {
            do { nextIdx = Math.floor(Math.random() * this.playlist.length); } while (nextIdx === this.currentIndex && this.playlist.length > 1);
        } else {
            nextIdx = (this.currentIndex + 1) % this.playlist.length;
        }
        this._crossfadeNextIndex = nextIdx;
        const nextSong = this.playlist[nextIdx];
        const target = this.inactive;
        const src = this.resolveSource(nextSong);
        target.src = src.url;
        target._songKey = nextSong.key;
        target._offline = src.offline;
        target._skipCounted = false; target._completeCounted = false; target._playCounted = false;
        target.volume = 0;
        target.load();
        target.play().catch(() => { });
    }

    stepCrossfade(remaining) {
        const t = Math.max(0, Math.min(1, 1 - (remaining / FADE_SECONDS)));
        this.active.volume = Math.max(0, 1 - t);
        this.inactive.volume = Math.min(1, t);
        if (remaining <= 0.15) this.finishCrossfade();
    }

    finishCrossfade() {
        if (!this.crossfading) return;
        this.crossfading = false;
        const oldAudio = this.active;
        const newAudio = this.inactive;
        this.recordSwitchStats(oldAudio, { skippedManually: false });
        const oldSong = findByKey(oldAudio._songKey);
        if (!(oldSong && CATS[oldSong.category].noStats)) {
            this.getStatsFor(oldAudio._songKey).then(st => {
                if (!st.completes) st.completes = 0;
                if (!oldAudio._completeCounted) { st.completes += 1; oldAudio._completeCounted = true; this.saveStats(st); }
            });
        }
        oldAudio.pause();
        oldAudio.volume = 1;
        newAudio.volume = 1;
        this.active = newAudio;
        this.inactive = oldAudio;
        this.currentIndex = this._crossfadeNextIndex;
        const song = this.playlist[this.currentIndex];
        this.updateSongUI(song, newAudio._offline);
        this.switchListTab(this.activeListTab); // siempre poblada: en web la lista no tiene botón para abrirse
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
    }
    toggleRepeat() {
        this.isRepeat = !this.isRepeat;
        this.dom.repeatBtn.classList.toggle('toggle-pressed', this.isRepeat);
        this.showToast('repeat', this.isRepeat ? 'Repetir activado' : 'Repetir desactivado');
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