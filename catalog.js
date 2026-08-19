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

// Normaliza texto para búsquedas: quita tildes/diacríticos, pasa a minúsculas y
// elimina símbolos que no aporten (comillas, corchetes, puntuación), para que
// "cancion", "Canción" o "CANCIÓN!" encuentren la misma coincidencia.
function normalizeSearchText(str) {
    return (str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes/diacríticos
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ') // símbolos raros -> espacio
        .replace(/\s+/g, ' ')
        .trim();
}

// ---- Constantes de comportamiento del reproductor ----
const RECALC_THRESHOLD = 40;
const RECALC_INTERVAL = 10;
const FADE_SECONDS = 4.5;
const SKIP_RATIO = 0.30;
const COMPLETE_RATIO = 0.90;

// ---- Backend (Google Apps Script) ----
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbwb-zPpnEEXUi0KS5otL5xtDuhgIErrKciyqGF7uwgnw4mIrrXDA_9UZlTQIgoUm2A1/exec";

// ---- Superficies (fondos/tarjetas/textos) según el modo del tema ----
const SURFACES = {
    light: {
        bottomBg: '#f8f7f7', trackColor: '#C1D9EB', controlBg: '#F1F6FD',
        toggleBg: '#DAE5F7', toggleActiveBg: '#BAC7DB', textOnBottom: '#5A6B85',
        surfaceBg: '#FFFFFF', surfaceText: '#2c1a66', surfaceBorder: '#ddd8f5', pillBg: '#F1F0FB',
    },
    dark: {
        bottomBg: '#c1c1c1', trackColor: '#C1D9EB', controlBg: '#F1F6FD',
        toggleBg: '#DAE5F7', toggleActiveBg: '#BAC7DB', textOnBottom: '#5A6B85',
        surfaceBg: '#FFFFFF', surfaceText: '#2c1a66', surfaceBorder: '#ddd8f5', pillBg: '#F1F0FB',
    },
};

// ---- Temas de color de la app ----
const THEMES = [
    { id: 'violeta', label: 'Violeta', mode: 'light', primary: '#7E5EFF', primaryIcon: '#7E5AFF', primaryDeep: '#6A51DB', primaryChip: '#9978FE', primaryChip2: '#7c5cf0' },
    { id: 'azul',    label: 'Azul',    mode: 'light', primary: '#3E7BFA', primaryIcon: '#3E7BFA', primaryDeep: '#2F5FD1', primaryChip: '#6FA0FF', primaryChip2: '#4d7ef0' },
    { id: 'verde',   label: 'Verde',   mode: 'light', primary: '#22B07D', primaryIcon: '#22B07D', primaryDeep: '#188C63', primaryChip: '#4FD6A6', primaryChip2: '#2fbf8f' },
    { id: 'rosa',    label: 'Rosa',    mode: 'light', primary: '#FF6FA8', primaryIcon: '#FF6FA8', primaryDeep: '#E14F8A', primaryChip: '#FFA8C8', primaryChip2: '#FF8CB8' },
    { id: 'naranja', label: 'Naranja', mode: 'light', primary: '#FF7A3D', primaryIcon: '#FF7A3D', primaryDeep: '#E0611F', primaryChip: '#FFA366', primaryChip2: '#ff8c4d' },
    { id: 'rojo',    label: 'Rojo',    mode: 'light', primary: '#E5484D', primaryIcon: '#E5484D', primaryDeep: '#C13438', primaryChip: '#FF7A7E', primaryChip2: '#F45D62' },
    { id: 'oscuro',  label: 'Oscuro',  mode: 'dark',  primary: '#1b1452', primaryIcon: '#1b1452', primaryDeep: '#261d6c', primaryChip: '#30267f', primaryChip2: '#5245b4' },
];