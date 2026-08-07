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
        this.currentMode = 'mix';
        this.mixCategories = [];
        this.isPlaying = false;
        this.isShuffle = false;
        this.isRepeat = false;
        this.isDragging = false;
        this.shuffleHistory = [];
        this.totalPlays = 0;
        this.topScored = [];
        this.statsCache = new Map();
        this.portadaActual = getRandomPortada();
        this.modalView = 'library';
        this.renderStaticIcons();
        this.initDOM();
        this.initEventListeners();
        this.initApp();
    }

    renderStaticIcons() {
        document.getElementById('offlineBadge').innerHTML = icon('wifiOff') + ' Sin conexión — usando lo guardado';
        document.getElementById('logoIcon').innerHTML = icon('music');
        document.getElementById('closeModalBtn').innerHTML = icon('x');
        document.getElementById('prevBtn').innerHTML = icon('prev');
        document.getElementById('nextBtn').innerHTML = icon('next');
        document.getElementById('shuffleBtn').innerHTML = icon('shuffle');
        document.getElementById('openPlaylistBtn').innerHTML = icon('list') + '<span>Biblioteca</span><span class="badge" id="playlistBadge">0</span>';
        document.getElementById('openDownloadsBtn').innerHTML = icon('download') + '<span>Descargadas</span>';
        document.getElementById('modeMixBtn').innerHTML = icon('infinity') + '<span>Mix</span>';
        document.getElementById('modeChristianBtn').innerHTML = icon('cross') + '<span>Cristiana</span>';
        document.getElementById('modeOwnBtn').innerHTML = icon('user') + '<span>Mías</span>';
        document.getElementById('modeGymBtn').innerHTML = icon('flame') + '<span>GYM</span>';
        document.getElementById('repeatBtn').innerHTML = icon('repeat');
        document.getElementById('topBtn').innerHTML = icon('star');
        document.getElementById('playBtn').innerHTML = icon('play');
        document.getElementById('downloadsBackBtn').innerHTML = icon('arrowLeft');
        document.getElementById('albumImage').src = this.portadaActual;
        this.renderFloaties();
    }

    renderFloaties() {
        const el = document.getElementById('floaties');
        if (!el) return;
        el.innerHTML = decorShape('note') + decorShape('ring') + decorShape('blobA') + decorShape('ring') + decorShape('note') + decorShape('blobB');
    }

    initDOM() {
        this.dom = {
            playBtn: document.getElementById('playBtn'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            progressFill: document.getElementById('progressFill'),
            progressBar: document.getElementById('progressBar'),
            currentTime: document.getElementById('currentTime'),
            totalTime: document.getElementById('totalTime'),
            currentTitle: document.getElementById('currentSongTitle'),
            currentArtist: document.getElementById('currentSongArtist'),
            favoriteBtn: document.getElementById('favoriteBtn'),
            likeBtn: document.getElementById('likeBtn'),
            shuffleBtn: document.getElementById('shuffleBtn'),
            repeatBtn: document.getElementById('repeatBtn'),
            topBtn: document.getElementById('topBtn'),
            albumArt: document.getElementById('albumArt'),
            albumImage: document.getElementById('albumImage'),
            waves: document.querySelectorAll('.wave'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalPlaylist: document.getElementById('modalPlaylist'),
            modalTitle: document.getElementById('modalTitleIcon'),
            openPlaylistBtn: document.getElementById('openPlaylistBtn'),
            openDownloadsBtn: document.getElementById('openDownloadsBtn'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            storageInfo: document.getElementById('storageInfo'),
            toast: document.getElementById('toast'),
            offlineBadge: document.getElementById('offlineBadge'),
            modeSwitch: document.getElementById('modeSwitch'),
            modeIndicator: document.getElementById('modeIndicator'),
            modeBtns: document.querySelectorAll('.mode-btn'),
            downloadsPage: document.getElementById('downloadsPage'),
            downloadsBody: document.getElementById('downloadsBody'),
            downloadsBackBtn: document.getElementById('downloadsBackBtn'),
        };
    }

    initEventListeners() {
        this.dom.playBtn.addEventListener('click', () => this.togglePlay());
        this.dom.prevBtn.addEventListener('click', () => this.prevSong());
        this.dom.nextBtn.addEventListener('click', () => this.nextSong());
        this.dom.favoriteBtn.addEventListener('click', () => this.toggleFavorite());
        this.dom.likeBtn.addEventListener('click', () => this.toggleFavorite());
        this.dom.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.dom.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        this.dom.topBtn.addEventListener('click', () => this.openTopModal());
        [this.audioA, this.audioB].forEach(a => {
            a.addEventListener('timeupdate', () => this.onTimeUpdate(a));
            a.addEventListener('ended', () => this.onEnded(a));
            a.addEventListener('error', () => this.onAudioError(a));
        });
        this.dom.progressBar.addEventListener('mousedown', (e) => this.startDrag(e));
        this.dom.progressBar.addEventListener('touchstart', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('touchmove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());
        document.addEventListener('touchend', () => this.endDrag());
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.dom.openPlaylistBtn.addEventListener('click', () => this.openLibraryModal());
        this.dom.openDownloadsBtn.addEventListener('click', () => this.openDownloadsPage());
        this.dom.downloadsBackBtn.addEventListener('click', () => this.closeDownloadsPage());
        this.dom.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.dom.modalOverlay.addEventListener('click', (e) => { if (e.target === this.dom.modalOverlay) this.closeModal(); });
        this.dom.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode === 'mix') this.openMixConfig();
                else this.playCategory(mode);
            });
        });
        window.addEventListener('online', () => this.updateOfflineStatus());
        window.addEventListener('offline', () => this.updateOfflineStatus());
        this.updateOfflineStatus();
    }

    async initApp() {
        try {
            await this.db.init();
            this.totalPlays = await this.db.getMeta('totalPlays', 0);
            this.topScored = await this.db.getMeta('topScored', []);
            this.mixCategories = await this.db.getMeta('mixCategories', []);
            const allStats = await this.db.getAllStats();
            allStats.forEach(s => this.statsCache.set(s.key, s));
            this.updateTopBadge();

            if (this.mixCategories.length > 0) {
                this.buildPlaylistFromCategories(this.mixCategories);
                this.currentMode = 'mix';
            } else {
                this.playlist = CATALOG.slice();
                this.currentMode = 'library';
            }
            this.highlightMode(this.currentMode === 'mix' ? 'mix' : null);
            if (this.playlist.length > 0) {
                this.currentIndex = 0;
                await this.loadSong(this.currentIndex, { autoplay: false });
            } else {
                this.dom.currentTitle.textContent = 'Sin canciones disponibles';
            }
            this.setupMediaSession();
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

    // ---------- MODO / CATEGORÍAS ----------
    buildPlaylistFromCategories(cats) {
        this.playlist = CATALOG.filter(s => cats.includes(s.category));
    }
    playCategory(cat) {
        this.playlist = CATALOG.filter(s => s.category === cat);
        this.currentMode = cat;
        this.currentIndex = 0;
        this.highlightMode(cat);
        if (this.playlist.length === 0) {
            this.showToast('x', `No hay canciones en ${CATS[cat].label} todavía`);
            return;
        }
        this.startPlayback();
    }
    highlightMode(mode) {
        const order = ['mix', 'cristiana', 'propia', 'gym'];
        const idx = order.indexOf(mode);
        this.dom.modeIndicator.style.opacity = idx < 0 ? '0' : '1';
        if (idx >= 0) this.dom.modeIndicator.style.transform = `translateX(${idx * 100}%)`;
        this.dom.modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    }

    startPlayback() {
        if (this.playlist.length === 0) return;
        this.loadSong(this.currentIndex, { autoplay: true });
    }

    // ---------- CARGA Y REPRODUCCIÓN ----------
    async resolveSource(song) {
        const blob = await this.db.getCachedBlob(song.key);
        if (blob) return { url: URL.createObjectURL(blob), offline: true };
        return { url: song.url, offline: false };
    }

    async loadSong(index, opts = {}) {
        const song = this.playlist[index];
        if (!song) return;
        const autoplay = opts.autoplay !== undefined ? opts.autoplay : this.isPlaying;
        const src = await this.resolveSource(song);
        const audio = opts.targetAudio || this.active;
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
                audio.play().catch(() => {
                    this.showToast('x', src.offline ? 'Error al reproducir' : 'No se pudo transmitir (sin conexión)');
                    this.isPlaying = false;
                    this.setPlayButtonState(false);
                });
                this.setPlayButtonState(true);
            } else {
                this.setPlayButtonState(false);
            }
            this.updatePlaylistUI();
        }
        return audio;
    }

    updateSongUI(song, offline) {
        this.dom.currentTitle.textContent = song.title;
        const def = CATS[song.category];
        const posInfo = `${this.currentIndex + 1} de ${this.playlist.length}`;
        const catTag = `<span class="tag ${def.tag}">${icon(def.icon)} ${def.label}</span>`;
        const statusTag = offline ? `<span class="tag status">${icon('check')} Offline</span>` : '';
        this.dom.currentArtist.innerHTML = `${posInfo} ${catTag} ${statusTag}`;
        this.portadaActual = getRandomPortada();
        this.dom.albumImage.src = this.portadaActual;
        this.getStatsFor(song.key).then(st => this.updateFavoriteUI(st.liked));
        this.updateMediaSessionMeta(song);
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
            this.active.pause();
            if (this.crossfading) this.inactive.pause();
            this.isPlaying = false;
            this.setPlayButtonState(false);
        } else {
            this.active.play().catch(() => this.showToast('x', 'No se puede reproducir'));
            this.isPlaying = true;
            this.setPlayButtonState(true);
        }
    }

    recordSwitchStats(audio, { skippedManually = false } = {}) {
        if (!audio || !audio._songKey || !audio.duration || audio._playCounted === false) return;
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
            this.getStatsFor(audio._songKey).then(st => { st.repeats = (st.repeats || 0) + 1; this.saveStats(st); });
            audio.currentTime = 0;
            audio.play().catch(() => {});
            this.showToast('repeat', 'Repitiendo canción');
            return;
        }
        this.recordSwitchStats(audio, { skippedManually: false });
        this.nextSong(false);
    }

    onAudioError(audio) {
        if (audio !== this.active) return;
        this.showToast('x', audio._offline ? 'Error al reproducir' : 'No se pudo transmitir esta canción');
        if (!navigator.onLine) {
            this.tryPlayNextCached();
        } else {
            setTimeout(() => this.nextSong(false), 400);
        }
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
        if (!this.isDragging && audio.duration) {
            const p = (audio.currentTime / audio.duration) * 100;
            this.dom.progressFill.style.width = `${p}%`;
            this.dom.currentTime.textContent = this.formatTime(audio.currentTime);
            this.dom.totalTime.textContent = this.formatTime(audio.duration);

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
        const src = await this.resolveSource(nextSong);
        target.src = src.url;
        target._songKey = nextSong.key;
        target._offline = src.offline;
        target._skipCounted = false; target._completeCounted = false; target._playCounted = false;
        target.volume = 0;
        target.load();
        target.play().catch(() => {});
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
        this.getStatsFor(oldAudio._songKey).then(st => {
            if (!st.completes) st.completes = 0;
            if (!oldAudio._completeCounted) { st.completes += 1; oldAudio._completeCounted = true; this.saveStats(st); }
        });
        oldAudio.pause();
        oldAudio.volume = 1;
        newAudio.volume = 1;
        this.active = newAudio;
        this.inactive = oldAudio;
        this.currentIndex = this._crossfadeNextIndex;
        const song = this.playlist[this.currentIndex];
        this.updateSongUI(song, newAudio._offline);
        this.updatePlaylistUI();
    }

    toggleFavorite() {
        if (!this.playlist.length || !this.playlist[this.currentIndex]) return;
        const song = this.playlist[this.currentIndex];
        this.getStatsFor(song.key).then(async st => {
            st.liked = !st.liked;
            await this.saveStats(st);
            this.updateFavoriteUI(st.liked);
            this.showToast('heart', st.liked ? 'Agregado a tu TOP' : 'Eliminado de favoritos');
            if (st.liked) {
                if (navigator.onLine) await this.ensureCached(song);
            } else {
                const stillTop = this.topScored.includes(song.key);
                if (!stillTop && !st.manualDownload) await this.db.deleteCachedBlob(song.key);
            }
            this.updateTopBadge();
        });
    }
    updateFavoriteUI(liked) {
        const cls = liked ? 'icon-filled' : '';
        this.dom.favoriteBtn.innerHTML = icon('heart', cls);
        this.dom.favoriteBtn.classList.toggle('liked', liked);
        this.dom.likeBtn.innerHTML = icon('heart', cls);
        this.dom.likeBtn.classList.toggle('is-active', liked);
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.dom.shuffleBtn.classList.toggle('is-active', this.isShuffle);
        this.showToast('shuffle', this.isShuffle ? 'Aleatorio activado' : 'Aleatorio desactivado');
        if (this.isShuffle) this.shuffleHistory = [];
    }
    toggleRepeat() {
        this.isRepeat = !this.isRepeat;
        this.dom.repeatBtn.classList.toggle('active', this.isRepeat);
        this.showToast('repeat', this.isRepeat ? 'Repetir activado' : 'Repetir desactivado');
        if (this.isRepeat && this.active._songKey) {
            this.getStatsFor(this.active._songKey).then(st => { st.repeats = (st.repeats || 0) + 1; this.saveStats(st); });
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
            if (!likedKeys.has(key) && !manualKeys.has(key) && !scored.includes(key)) await this.db.deleteCachedBlob(key);
        }
        this.updateTopBadge();
        this.showToast('star', 'Tu TOP se actualizó con tus gustos');
    }

    async ensureCached(song) {
        const existing = await this.db.getCachedBlob(song.key);
        if (existing) return true;
        if (!navigator.onLine) return false;
        try {
            const resp = await fetch(song.url);
            if (!resp.ok) return false;
            const blob = await resp.blob();
            await this.db.cacheBlob(song.key, blob);
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
        const ok = await this.ensureCached(song);
        if (ok) {
            const st = await this.getStatsFor(song.key);
            st.manualDownload = true;
            await this.saveStats(st);
            this.showToast('check', `"${song.title}" descargada`);
            if (btnEl) { btnEl.classList.remove('downloading'); btnEl.classList.add('downloaded'); btnEl.innerHTML = icon('check'); }
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
        if (!stillNeeded) await this.db.deleteCachedBlob(song.key);
        this.showToast('trash', `"${song.title}" ya no está descargada`);
    }

    async getTopList() {
        const allStats = await this.db.getAllStats();
        const likedKeys = allStats.filter(s => s.liked).map(s => s.key);
        const combined = Array.from(new Set([...likedKeys, ...this.topScored]));
        return combined.map(k => findByKey(k)).filter(Boolean);
    }

    async updateTopBadge() {
        const list = await this.getTopList();
        const btn = this.dom.topBtn;
        let badge = btn.querySelector('.mini-badge');
        if (list.length > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'mini-badge'; btn.appendChild(badge); }
            badge.textContent = list.length;
        } else if (badge) { badge.remove(); }
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
        if (e.key === 'Escape') { this.closeModal(); this.closeDownloadsPage(); }
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
        } catch (e) {}
    }
}