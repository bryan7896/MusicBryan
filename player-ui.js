// ============================================
// REPRODUCTOR — UI: mini-modal Mix, tarjetas de canciones, página Descargadas
// (extiende el prototipo de MusicPlayer definido en player-core.js)
// ============================================

Object.assign(MusicPlayer.prototype, {

    // ---------- MINI MODAL: SELECTOR DE MIX ----------
    openMixConfig() {
        const selected = new Set(this.mixCategories);
        this.dom.mixOptionsList.innerHTML = '';
        Object.entries(CATS).forEach(([key, def]) => {
            const row = document.createElement('div');
            row.className = 'mix-check' + (selected.has(key) ? ' checked' : '');
            row.dataset.cat = key;
            row.innerHTML = `
                <span class="mix-check-icon">${icon(def.icon)}</span>
                <span class="name">${def.label}</span>
                <span class="check-circle">${icon('check')}</span>
            `;
            row.addEventListener('click', () => row.classList.toggle('checked'));
            this.dom.mixOptionsList.appendChild(row);
        });
        this.dom.mixModalOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
        this.pushOverlayState('mix');

        this.dom.mixAcceptBtn.onclick = () => {
            const chosen = Array.from(this.dom.mixOptionsList.querySelectorAll('.mix-check.checked')).map(el => el.dataset.cat);
            if (chosen.length === 0) { this.showToast('x', 'Selecciona al menos una categoría'); return; }
            this.mixCategories = chosen;
            this.db.setMeta('mixCategories', chosen);
            // setQueue cancela el crossfade/precarga y el historial de la selección anterior;
            // sin eso, una canción de la sección vieja seguía "colándose" al terminar la actual.
            this.setQueue(this.getActivePool(), null, { shuffleStart: true });
            this.updateCategoryBadge();
            this.closeMixConfig();
            if (this.playlist.length > 0) {
                this.startPlayback();
            } else {
                // La nueva selección no tiene canciones: no dejar sonando la de la anterior.
                this.isPlaying = false;
                this.active.pause();
                this.setPlayButtonState(false);
                this.dom.currentTitle.textContent = this.downloadsMode ? 'No tienes canciones descargadas en este mix' : 'No hay canciones disponibles';
            }
            this.switchListTab(this.activeListTab);
        };
    },
    closeMixConfig() {
        if (!this.dom.mixModalOverlay.classList.contains('show')) return;
        this.dom.mixModalOverlay.classList.remove('show');
        document.body.style.overflow = '';
        this.popOverlayState();
    },

    // ---------- TARJETAS DE CANCIONES (usadas en list-mode y en Descargadas) ----------
    // scope: 'pool' (pestaña Todas), 'top' (pestaña TOP) o 'downloads' (Configuración).
    // Define de dónde sale la cola al tocar una tarjeta.
    async renderSongCards(container, songs, { emptyMsg, scope = 'pool' }) {
        // Token de carrera: si se llama de nuevo antes de que termine este render
        // (p. ej. dos cambios de pool casi simultáneos), el render viejo se aborta
        // en vez de seguir agregando tarjetas y duplicar el listado.
        this._listRenderTokens = this._listRenderTokens || new WeakMap();
        const token = Symbol();
        this._listRenderTokens.set(container, token);

        container.innerHTML = '';
        if (!songs || songs.length === 0) {
            container.innerHTML = `<div class="modal-empty">${icon('folderPlus')}${emptyMsg || 'No hay canciones'}</div>`;
            return;
        }
        const currentSong = this.playlist[this.currentIndex];
        // Lecturas en paralelo y UNA sola consulta de llaves en caché. Antes eran dos
        // awaits por canción, y getCachedBlob traía el MP3 completo desde IndexedDB
        // solo para saber si estaba descargado.
        const [statsList, cachedKeys] = await Promise.all([
            Promise.all(songs.map(s => this.getStatsFor(s.key))),
            this.db.getCacheKeys(),
        ]);
        if (this._listRenderTokens.get(container) !== token) return; // un render más nuevo tomó el control
        const cachedSet = new Set(cachedKeys);
        const frag = document.createDocumentFragment();
        for (let i = 0; i < songs.length; i++) {
            const song = songs[i];
            const def = CATS[song.category];
            const st = statsList[i];
            const cached = cachedSet.has(song.key);
            const isActive = currentSong && song.key === currentSong.key && this.isPlaying;
            const card = document.createElement('div');
            card.className = `song-card ${isActive ? 'pressed' : ''}`;
            card.dataset.key = song.key; // permite resaltar la actual sin reconstruir la lista
            card.innerHTML = `
                <span class="sc-icon">${icon(def.icon)}</span>
                <span class="sc-title">${song.title}</span>
                ${def.noFavorite ? '' : `<button class="sc-mini-btn sc-like ${st.liked ? 'toggle-pressed' : ''}">${icon('heart', st.liked ? 'icon-filled' : '')}</button>`}
                <button class="sc-mini-btn sc-dl ${cached ? 'toggle-pressed' : ''}">${icon(cached ? 'check' : 'download')}</button>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.sc-mini-btn')) return;
                this.playFromList(song, songs, scope);
                // Al elegir una canción, siempre volvemos a la pantalla de reproducción.
                if (this.isListMode) this.toggleListMode(false);
                if (this.dom.settingsModalOverlay && this.dom.settingsModalOverlay.classList.contains('show')) this.closeSettings();
            });
            const likeBtn = card.querySelector('.sc-like');
            if (likeBtn) {
                likeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    st.liked = !st.liked;
                    await this.saveStats(st);
                    likeBtn.classList.toggle('toggle-pressed', st.liked);
                    likeBtn.innerHTML = icon('heart', st.liked ? 'icon-filled' : '');
                    this.showToast('heart', st.liked ? 'Agregado a tu TOP' : 'Eliminado de favoritos');
                    if (st.liked && navigator.onLine) await this.ensureCached(song);
                    const nowSong = this.playlist[this.currentIndex]; // la actual AL MOMENTO del click, no al pintar la lista
                    if (nowSong && song.key === nowSong.key) this.updateFavoriteUI(st.liked);
                })
            }
            const dlBtn = card.querySelector('.sc-dl');
            dlBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (dlBtn.classList.contains('toggle-pressed')) return;
                await this.downloadManually(song, dlBtn);
                const nowSong = this.playlist[this.currentIndex];
                if (nowSong && song.key === nowSong.key) this.updateDownloadUI(true);
            });
            frag.appendChild(card);
        }
        container.appendChild(frag);
    },

    // Arma la cola al tocar una tarjeta. La cola respeta SIEMPRE el Mix elegido:
    //  - 'pool': todo el pool activo (no solo lo que deja visible el buscador).
    //  - 'top': la lista TOP vigente.
    //  - 'downloads': descargadas del Mix; si la tocada no es del Mix, solo su categoría.
    playFromList(song, listedSongs, scope) {
        let queue;
        if (scope === 'top') {
            queue = (this._currentTabSongs && this._currentTabSongs.some(s => s.key === song.key)) ? this._currentTabSongs : listedSongs;
        } else if (scope === 'downloads') {
            queue = listedSongs.filter(s => this.mixCategories.includes(s.category));
            if (!queue.some(s => s.key === song.key)) queue = listedSongs.filter(s => s.category === song.category);
        } else {
            const pool = this.getActivePool();
            queue = pool.some(s => s.key === song.key) ? pool : listedSongs;
        }
        this._consecutiveLoadFailures = 0;
        const idx = this.setQueue(queue, song.key);
        this.loadSong(idx, { autoplay: true });
    },

});