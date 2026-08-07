// ============================================
// EFECTO DE "CANICAS" CAYENDO — reemplaza la animación de luces
// ============================================
const CIRCLE_PALETTE_HOME = [
    { base: '#422d9e', light: '#6b52c9' },
    { base: '#250d93', light: '#4c2fc7' },
    { base: '#533bbf', light: '#7a63d6' },
];
function buildFallingCircles(container, palette, count) {
    if (!container) return;
    container.innerHTML = '';
    const n = count || 16;
    for (let i = 0; i < n; i++) {
        const c = document.createElement('div');
        c.className = 'falling-circle';
        const color = palette[Math.floor(Math.random() * palette.length)];
        const sizeVw = (5 + Math.random() * 15).toFixed(1); // 5% a 20% del ancho
        const left = Math.random() * 96;
        const duration = 7 + Math.random() * 9;
        const delay = -(Math.random() * duration);
        const grows = Math.random() > 0.5;
        c.style.left = left + '%';
        c.style.width = sizeVw + 'vw';
        c.style.height = sizeVw + 'vw';
        c.style.background = `radial-gradient(circle at 32% 30%, ${color.light}, ${color.base} 75%)`;
        c.style.animationDuration = duration + 's';
        c.style.animationDelay = delay + 's';
        c.style.animationName = grows ? 'circleFallGrow' : 'circleFallShrink';
        container.appendChild(c);
    }
}