// ============================================
// CATÁLOGO — combina las listas de songs.js con sus categorías
// ============================================
const CATS = {
    cristiana:  { list: CRISTIANS,  label: 'Cristiana',  tag: 'christian',  icon: 'cross', dotVar: '--accent' },
    propia:     { list: MIAS,       label: 'Mías',       tag: 'own',        icon: 'user',  dotVar: '--accent-2' },
    gym:        { list: GYM,        label: 'GYM',        tag: 'gym',        icon: 'flame', dotVar: '--gym' },
    devocional: { list: DEVOCIONAL, label: 'Devocional', tag: 'devotional', icon: 'book',  dotVar: '--primary', noStats: true, noFavorite: true }
};

const CATALOG = [];
Object.entries(CATS).forEach(([catKey, def]) => {
    def.list.forEach(song => {
        CATALOG.push({ key: catKey + '::' + song.title, title: song.title, url: song.url, category: catKey });
    });
});

function findByKey(key) {
    return CATALOG.find(s => s.key === key);
}

const PORTADAS = [
    'https://picsum.photos/seed/music1/400/400', 'https://picsum.photos/seed/music2/400/400',
    'https://picsum.photos/seed/music3/400/400', 'https://picsum.photos/seed/music4/400/400',
    'https://picsum.photos/seed/music5/400/400', 'https://picsum.photos/seed/music6/400/400',
    'https://picsum.photos/seed/music7/400/400', 'https://picsum.photos/seed/music8/400/400',
    'https://picsum.photos/seed/music9/400/400', 'https://picsum.photos/seed/music10/400/400',
];
function getRandomPortada() { return PORTADAS[Math.floor(Math.random() * PORTADAS.length)]; }

// ---- Constantes de comportamiento del reproductor ----
const RECALC_THRESHOLD = 40;
const RECALC_INTERVAL = 10;
const FADE_SECONDS = 4.5;
const SKIP_RATIO = 0.30;
const COMPLETE_RATIO = 0.90;