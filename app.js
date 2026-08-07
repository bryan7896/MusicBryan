// ============================================
// ARRANQUE DE LA APP
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error:', err));
    });
}

const player = new MusicPlayer();