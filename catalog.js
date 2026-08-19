// ============================================
// CATÁLOGO — combina las listas de songs.js con sus categorías
// ============================================
const CATS = {
    cristiana:  { list: CRISTIANS,  label: 'Cristiana',  tag: 'christian',  icon: 'cross', dotVar: '--accent' },
    propia:     { list: MIAS,       label: 'Mías',       tag: 'own',        icon: 'user',  dotVar: '--accent-2' },
    gym:        { list: GYM,        label: 'GYM',        tag: 'gym',        icon: 'flame', dotVar: '--gym' },
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

function getRandomPortada() {
    const seed = Math.floor(Math.random() * 700) + 1;
    return `https://picsum.photos/seed/music${seed}/400/400`;
}

// ---- Constantes de comportamiento del reproductor ----
const RECALC_THRESHOLD = 40;
const RECALC_INTERVAL = 10;
const FADE_SECONDS = 4.5;
const SKIP_RATIO = 0.30;
const COMPLETE_RATIO = 0.90;

// ---- Backend (Google Apps Script) ----
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbwb-zPpnEEXUi0KS5otL5xtDuhgIErrKciyqGF7uwgnw4mIrrXDA_9UZlTQIgoUm2A1/exec";

// ---- Temas de color de la app ----
const THEMES = [
    { id: 'violeta', label: 'Violeta', primary: '#7E5EFF', primaryIcon: '#7E5AFF', primaryDeep: '#6A51DB', primaryChip: '#9978FE', primaryChip2: '#7c5cf0' },
    { id: 'azul',    label: 'Azul',    primary: '#3E7BFA', primaryIcon: '#3E7BFA', primaryDeep: '#2F5FD1', primaryChip: '#6FA0FF', primaryChip2: '#4d7ef0' },
    { id: 'verde',   label: 'Verde',   primary: '#22B07D', primaryIcon: '#22B07D', primaryDeep: '#188C63', primaryChip: '#4FD6A6', primaryChip2: '#2fbf8f' },
    { id: 'rosa',    label: 'Rosa',    primary: '#F73A76', primaryIcon: '#F73A76', primaryDeep: '#D62764', primaryChip: '#FF6FA0', primaryChip2: '#ff4f8a' },
    { id: 'naranja', label: 'Naranja', primary: '#FF7A3D', primaryIcon: '#FF7A3D', primaryDeep: '#E0611F', primaryChip: '#FFA366', primaryChip2: '#ff8c4d' },
];