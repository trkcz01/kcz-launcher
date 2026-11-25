// Profil ikonları: renk geçişli yuvarlak kare + beyaz sembol (uygulama ikonu gibi)
(function () {
  const IKONLAR = {
    yildiz:  { ad: 'Yıldız',   r: ['#fbbf24', '#ef4444'], d: '<path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>' },
    simsek:  { ad: 'Şimşek',   r: ['#fde047', '#f97316'], d: '<path d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13z"/>' },
    kalp:    { ad: 'Kalp',     r: ['#fb7185', '#be123c'], d: '<path d="M12 20.5s-7.6-4.5-9.4-9.2C1.3 7.6 3.7 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.3 0 5.7 3.1 4.4 6.8-1.8 4.7-9.4 9.2-9.4 9.2z"/>' },
    alev:    { ad: 'Alev',     r: ['#fb923c', '#dc2626'], d: '<path d="M12 2.5s5.5 4.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.3 1-4.1 2.3-5.4.1 2.2 1.1 3.3 2.3 3.6C10.8 7.8 12 2.5 12 2.5z"/>' },
    kalkan:  { ad: 'Kalkan',   r: ['#60a5fa', '#1e40af'], d: '<path d="M12 2.5l7.5 2.8v5.9c0 4.8-3.2 8.9-7.5 10.3-4.3-1.4-7.5-5.5-7.5-10.3V5.3z"/>' },
    tac:     { ad: 'Taç',      r: ['#fde047', '#b45309'], d: '<path d="M3 7.5l4.6 4.3L12 4.5l4.4 7.3L21 7.5l-1.9 11H4.9z"/>' },
    kristal: { ad: 'Kristal',  r: ['#67e8f9', '#0e7490'], d: '<path d="M6.5 3.5h11L21.5 9 12 21 2.5 9z"/>' },
    roket:   { ad: 'Roket',    r: ['#c4b5fd', '#6d28d9'], d: '<path fill-rule="evenodd" d="M12 2.2c3.6 2.2 5.1 6.1 5 10.3l-2.2 3H9.2L7 12.5c-.1-4.2 1.4-8.1 5-10.3zM12 7.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M9 16.5 7 21.5l3.2-2.2zM15 16.5l2 5-3.2-2.2z"/>' },
    yaprak:  { ad: 'Yaprak',   r: ['#4ade80', '#15803d'], d: '<path d="M20 3.5C9.5 3.5 4 8.6 4 15.7c0 1.5.4 3 1 4.1 1.1-4.2 4.2-7.8 9.3-10.1-4.2 3.1-6.6 6.5-7.6 10.1 1 .4 2.1.6 3.2.6C17.3 20.4 20 13.9 20 3.5z"/>' },
    ay:      { ad: 'Ay',       r: ['#a5b4fc', '#312e81'], d: '<path d="M19.5 14.6A8.3 8.3 0 1 1 9.4 4.5a6.8 6.8 0 0 0 10.1 10.1z"/>' },
    dag:     { ad: 'Dağ',      r: ['#94a3b8', '#1e293b'], d: '<path d="M2 20 9 7.5l4 6.2 2.6-3.7L22 20z"/>' },
    kup:     { ad: 'Küp',      r: ['#d4d4d8', '#3f3f46'], d: '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M12 12l8.5-4.7M12 12 3.5 7.3M12 12v9.5" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.4"/>' },
    kupa:    { ad: 'Kupa',     r: ['#fcd34d', '#b45309'], d: '<path d="M7 3h10v2.5h3V8a4 4 0 0 1-4 4h-.4a5 5 0 0 1-2.6 2.8V17.5h3V21H8v-3.5h3v-2.7A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5.5h3z"/>' },
    kar:     { ad: 'Kar',      r: ['#bae6fd', '#0369a1'], d: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    gezegen: { ad: 'Gezegen',  r: ['#f0abfc', '#7e22ce'], d: '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-22 12 12)" fill="none" stroke="#fff" stroke-width="1.8"/>' },
    kilic:   { ad: 'Kılıç',    r: ['#e5e7eb', '#4b5563'], d: '<path d="M20.5 2.5 21.5 3.5 11 14l-1.5-1.5z"/><path d="M6.5 12.5 11.5 17.5 10 19l-1.2-1.2-2.6 3.2-2.2-2.2 3.2-2.6L6 15z"/>' },
    oyun:    { ad: 'Oyun kolu', r: ['#34d399', '#047857'], d: '<path fill-rule="evenodd" d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3.3a2.5 2.5 0 0 1-4.4 1.1L15 15.2H9l-1.9 2.2a2.5 2.5 0 0 1-4.4-1.1L2.1 13A5 5 0 0 1 7 7zm0 2.8v1.4H5.6v1.6H7v1.4h1.6v-1.4H10v-1.6H8.6V9.8zm9.6.6a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 2.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>' },
    portal:  { ad: 'Portal',   r: ['#c084fc', '#3b0764'], d: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="12" cy="12" r="3"/>' }
  };
  let sayac = 0;
  function svg(id) {
    const ik = IKONLAR[id] || IKONLAR.kup;
    const g = 'ikg' + (++sayac);
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
      + `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ik.r[0]}"/><stop offset="1" stop-color="${ik.r[1]}"/></linearGradient>`
      + `<linearGradient id="${g}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
      + `<rect width="24" height="24" rx="6" fill="url(#${g})"/><rect width="24" height="24" rx="6" fill="url(#${g}p)"/>`
      + `<g transform="translate(4.2 4.2) scale(.65)" fill="#fff">${ik.d}</g></svg>`;
  }
  window.Ikonlar = { liste: Object.keys(IKONLAR), ad: (id) => (IKONLAR[id] || IKONLAR.kup).ad, svg };
})();
