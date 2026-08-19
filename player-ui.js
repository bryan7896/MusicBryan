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

        this.dom.mixAcceptBtn.onclick = () => {
            const chosen = Array.from(this.dom.mixOptionsList.querySelectorAll('.mix-check.checked')).map(el => el.dataset.cat);
            if (chosen.length === 0) { this.showToast('x', 'Selecciona al menos una categoría'); return; }
            this.mixCategories = chosen;
            this.db.setMeta('mixCategories', chosen);
            this.rebuildPlaylistFromState();
            this.updateCategoryBadge();
            this.closeMixConfig();
            this.startPlayback();
        };
    },
    closeMixConfig() {
        this.dom.mixModalOverlay.classList.remove('show');
        document.body.style.overflow = '';
    },

    // ---------- TARJETAS DE CANCIONES (usadas en list-mode y en Descargadas) ----------
    async renderSongCards(container, songs, { emptyMsg, sourceIsTop }) {
        container.innerHTML = '';
        if (!songs || songs.length === 0) {
            container.innerHTML = `<div class="modal-empty">${icon('folderPlus')}${emptyMsg || 'No hay canciones'}</div>`;
            return;
        }
        const currentSong = this.playlist[this.currentIndex];
        for (const song of songs) {
            const def = CATS[song.category];
            const st = await this.getStatsFor(song.key);
            const cached = await this.db.getCachedBlob(song.key);
            const isActive = currentSong && song.key === currentSong.key && this.isPlaying;
            const card = document.createElement('div');
            card.className = `song-card ${isActive ? 'pressed' : ''}`;
            card.innerHTML = `
                <span class="sc-icon">${icon(def.icon)}</span>
                <span class="sc-title">${song.title}</span>
                ${def.noFavorite ? '' : `<button class="sc-mini-btn sc-like ${st.liked ? 'toggle-pressed' : ''}">${icon('heart', st.liked ? 'icon-filled' : '')}</button>`}
                <button class="sc-mini-btn sc-dl ${cached ? 'toggle-pressed' : ''}">${icon(cached ? 'check' : 'download')}</button>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.sc-mini-btn')) return;
                this.playlist = (sourceIsTop || this.downloadsMode) ? songs.slice() : CATALOG.slice();
                this.currentIndex = this.playlist.findIndex(s => s.key === song.key);
                this.stopCrossfadeState();
                this.loadSong(this.currentIndex, { autoplay: true });
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
                    if (currentSong && song.key === currentSong.key) this.updateFavoriteUI(st.liked);
                })
            }
            const dlBtn = card.querySelector('.sc-dl');
            dlBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (dlBtn.classList.contains('toggle-pressed')) return;
                await this.downloadManually(song, dlBtn);
                if (currentSong && song.key === currentSong.key) this.updateDownloadUI(true);
            });
            container.appendChild(card);
        }
    },

});