// ============================================
// ICONOS SVG — todos los iconos de la app viven aquí
// ============================================
const ICONS = {
    play: '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>',
    prev: '<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line>',
    next: '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line>',
    shuffle: '<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>',
    repeat: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
    folderPlus: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"></path><line x1="12" y1="10.5" x2="12" y2="15.5"></line><line x1="9.5" y1="13" x2="14.5" y2="13"></line>',
    list: '<line x1="9" y1="6" x2="21" y2="6"></line><line x1="9" y1="12" x2="21" y2="12"></line><line x1="9" y1="18" x2="21" y2="18"></line><circle cx="4" cy="6" r="1.3"></circle><circle cx="4" cy="12" r="1.3"></circle><circle cx="4" cy="18" r="1.3"></circle>',
    x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    disc: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="2.5"></circle>',
    cross: '<line x1="12" y1="2.5" x2="12" y2="21.5"></line><line x1="5.5" y1="8" x2="18.5" y2="8"></line>',
    infinity: '<path d="M18.2 8.5a3.5 3.5 0 0 1 0 7c-1.9 0-3.5-1.6-6.2-4.5C9.3 8.1 7.7 6.5 5.8 6.5a3.5 3.5 0 1 0 0 7c1.9 0 3.5-1.6 6.2-4.5 2.7-2.9 4.3-4.5 6.2-4.5z"></path>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="8" r="4.5"></circle>',
    wifiOff: '<line x1="2" y1="2" x2="22" y2="22"></line><path d="M8.5 16.5a5 5 0 0 1 7 0"></path><path d="M5 12.5a10 10 0 0 1 3-2"></path><path d="M12 20h.01"></path><path d="M16.5 12.5a10 10 0 0 1 2.5 1.6"></path><path d="M19 9a14 14 0 0 1 3 2"></path><path d="M2 9a14 14 0 0 1 5.5-3.5"></path><path d="M9.5 5.1A14 14 0 0 1 22 9"></path>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    star: '<polygon points="12 2 15 9 22 9.5 16.5 14 18 21.5 12 17.8 6 21.5 7.5 14 2 9.5 9 9"></polygon>',
    flame: '<path d="M12 2.5c1.2 3-1.6 4.3-1.9 7A3.9 3.9 0 0 0 14 13.5c0-1-.6-1.8-.9-2.7 2 1.1 3.4 3.6 3.4 5.9a4.5 4.5 0 0 1-9 0c0-4 3-6.4 4.5-14.2z"></path><path d="M9 17.2a3 3 0 0 0 6 0c0-1.6-1-2.7-1.6-4-1 1.4-2 2.3-3 3-.9.6-1.4 1.7-1.4 3z"></path>',
    download: '<path d="M12 3v12"></path><polyline points="7 11 12 16 17 11"></polyline><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"></path>',
    trash: '<polyline points="4 7 20 7"></polyline><path d="M6 7V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
    note: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    circleDot: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="1.5"></circle>',
    blob: '<path d="M12 2c4 0 8 2.5 8 7s-2 6-4 8-4 3-8 2-6-4-6-8 2-5 4-7 3-2 6-2z"></path>',
};

function icon(name, extraClass) {
    return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// SVG completo para las figuritas decorativas del fondo (relleno, no lineal)
function decorShape(name) {
    const shapes = {
        note: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13c0 1.7-1.3 3-3 3s-3-1.3-3-3 1.3-3 3-3c.3 0 .7 0 1 .1V7.5l-8 1.3V18c0 1.7-1.3 3-3 3s-3-1.3-3-3 1.3-3 3-3z"/></svg>',
        blobA: '<svg viewBox="0 0 200 200" fill="currentColor"><path d="M42,-58C55,-49,66,-37,71,-23C76,-9,75,7,68,20C61,33,48,44,34,53C20,62,5,69,-11,71C-27,73,-45,70,-56,59C-67,48,-71,29,-73,10C-75,-9,-75,-29,-65,-43C-55,-57,-35,-65,-16,-67C3,-69,29,-67,42,-58Z" transform="translate(100 100)"/></svg>',
        blobB: '<svg viewBox="0 0 200 200" fill="currentColor"><path d="M38,-52C49,-44,57,-32,62,-18C67,-4,69,12,63,25C57,38,44,48,30,55C16,62,1,66,-15,65C-31,64,-48,58,-58,46C-68,34,-72,17,-70,1C-68,-15,-60,-30,-49,-40C-38,-50,-24,-56,-9,-58C6,-60,26,-60,38,-52Z" transform="translate(100 100)"/></svg>',
        ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/></svg>',
    };
    return shapes[name] || shapes.blobA;
}