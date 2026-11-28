/* =========================================================
   KCZ Launcher — tema dünyaları
   Temalar sadece renk değiştirmesin: her temanın kendi sahnesi, maskotun durduğu
   küçük bir köşesi ve dokuları var. (Maskotlar: maskot.js)
     End     End adası, kristalli obsidyen sütunlar, uçan Ejderha; maskot şeridi End taşı + End çubuğu
     Nether  lav denizi, kayalıklar, lav şelalesi, parıltıtaşı; şerit netherrack + ateş + kızıl mantar
     Dünya   tepeler, meşe ağaçları, çiçekler; şerit çimen bloğu + çiçekler + otlar
     Siyah   gece: kare ay, yıldızlar, uzak dağlar; tavanda sarkıtlar
     Gri     hafif yağmur; şerit taş tuğla + fener
   Hepsi hafif modda kapalı (body.hafif). Çizimler piksel ızgaradan SVG.
   ========================================================= */
(() => {
  /* ---------- Yardımcılar ---------- */
  function rastgele(tohum) {
    let a = tohum >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Satır dizisinden SVG (aynı renkli yan yana pikseller tek dikdörtgen). px: piksel boyu */
  function izgara(satirlar, palet, px, ek = '') {
    const w = Math.max(...satirlar.map((s) => s.length)), h = satirlar.length;
    let r = '';
    satirlar.forEach((s, j) => {
      for (let i = 0; i < s.length;) {
        const c = s[i];
        if (c === '.' || c === ' ' || !palet[c]) { i++; continue; }
        let n = 1;
        while (s[i + n] === c) n++;
        r += `<rect x="${i}" y="${j}" width="${n}" height="1" fill="${palet[c]}"/>`;
        i += n;
      }
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:${w * px}px;height:${h * px}px;stroke:none" shape-rendering="crispEdges" aria-hidden="true" ${ek}>${r}</svg>`;
  }
  /** Sol yarıyı aynalayıp simetrik çizim yapar (orta sütun dahil) */
  const ayna = (yarim) => yarim.map((s) => s + s.slice(0, -1).split('').reverse().join(''));

  /** Pikselli arazi: her sütunun yüksekliği yumuşak rastgele yürüyüş. katlar: üst, alt-üst, gövde, benek */
  function arazi(w, h, tohum, { en = 0.35, boy = 0.9, ust = 'u', ikinci = 'y', govde = 'a', benek = 'b', benekOran = 0.08, egim = 0 } = {}) {
    const r = rastgele(tohum);
    const yuk = [];
    let y = h * (en + (boy - en) * r());
    for (let x = 0; x < w; x++) {
      if (x % 3 === 0) y += (r() - 0.5) * h * 0.35;
      y = Math.max(h * en, Math.min(h * boy, y));
      yuk.push(Math.round(y * (1 - egim * x / w)));
    }
    const satir = [];
    for (let j = 0; j < h; j++) {
      let s = '';
      for (let x = 0; x < w; x++) {
        const tepe = h - yuk[x];
        if (j < tepe) s += '.';
        else if (j === tepe) s += ust;
        else if (j === tepe + 1) s += ikinci;
        else s += r() < benekOran ? benek : govde;
      }
      satir.push(s);
    }
    return satir;
  }

  /* ---------- Hazır çizimler ---------- */
  const CIZIM = {
    // Meşe ağacı
    agac: {
      p: { L: '#3f8f3a', l: '#57a84a', D: '#2f6e2c', T: '#6b4a2b', t: '#54391f' },
      s: ['...lLLl...', '.LLLlLLLL.', 'LLlLLLLDLL', 'LDLLLlLLLL', 'LLLLDLLlLL', '.LLlLLLLD.', '..LLLDLL..', '....Tt....', '....Tt....', '....tT....'],
    },
    agacKucuk: {
      p: { L: '#3f8f3a', l: '#57a84a', D: '#2f6e2c', T: '#6b4a2b' },
      s: ['..lLL..', '.LLlLD.', 'LDLLLLl', '.LLDLL.', '...T...', '...T...'],
    },
    gelincik: { p: { r: '#e11d48', R: '#9f1239', g: '#16a34a', y: '#facc15' }, s: ['.r.', 'ryr', '.R.', '.g.', 'gg.'] },
    karahindiba: { p: { y: '#facc15', Y: '#eab308', g: '#16a34a' }, s: ['yY', 'Yy', '.g', 'g.'] },
    ot: { p: { g: '#4ade80', G: '#22c55e' }, s: ['g...G', 'g.G.G', '.gG.g', '.gGg.'] },
    endCubugu: { p: { w: '#fdf8ff', W: '#e9d5ff', p: '#7e22ce' }, s: ['w', 'W', 'w', 'W', 'w', 'W', 'w', 'p'] },
    chorus: { p: { c: '#8b5cf6', C: '#6d28d9', f: '#e9d5ff' }, s: ['f...f', 'c...c', 'cC.Cc', '.cCc.', '..C..', '..c..'] },
    ates1: { p: { y: '#fde047', o: '#f97316', r: '#dc2626' }, s: ['..y..', '.yo.y', '.oyo.', 'oyyro', 'roror'] },
    ates2: { p: { y: '#fde047', o: '#f97316', r: '#dc2626' }, s: ['.y...', '.oy.y', '.oyo.', 'royyo', 'ororo'] },
    mantar: { p: { r: '#b91c1c', R: '#ef4444', y: '#fbbf24', s: '#7f1d1d' }, s: ['.rRr.', 'rRyRr', '..s..', '..s..'] },
    fener: { p: { k: '#27272a', K: '#3f3f46', y: '#fde68a', o: '#f59e0b' }, s: ['.kk.', 'kKKk', 'kyok', 'koyk', 'kKKk'] },
    ay: {
      p: { m: '#f5f5f4', M: '#d6d3d1', c: '#a8a29e' },
      s: ['mmmmmmmm', 'mMmmmmcm', 'mmmcmmmm', 'mmmmmMmm', 'mcmmmmmm', 'mmmmcmmm', 'mMmmmmmM', 'mmmmmmmm'],
    },
    kristal: { p: { c: '#a855f7', C: '#d8b4fe', x: '#f5d0fe', X: '#ffffff' }, s: ['.cCc.', 'cCxCc', 'CxXxC', 'cCxCc', '.cCc.'] },
    // End Ejderhası (önden, kanatlar yukarıda / aşağıda), aynalanır
    ejderA: {
      p: { D: '#120a1c', E: '#d946ef' },
      s: ayna(['D...............', '.DD.............', '..DDD..........D', '...DDDD.......DE', '....DDDDD....DDD', '......DDDDDDDDDD',
        '............DDDD', '.............DDD', '..............DD', '...............D', '...............D']),
    },
    ejderB: {
      p: { D: '#120a1c', E: '#d946ef' },
      s: ayna(['...............D', '..............DE', '.............DDD', '......DDDDDDDDDD', '...DDDDDDD...DDD', '.DDDDD........DD',
        'DDD...........DD', 'D..............D', '...............D', '...............D', '................']),
    },
  };
  const ciz = (ad, px, ek) => izgara(CIZIM[ad].s, CIZIM[ad].p, px, ek);

  /* ---------- Sol üstteki şerit (maskotun durduğu yer) ----------
     Şerit maskot.js'in yerleşimini kullanır: sol/sag/zemin. Yükseklik ŞERİT px. */
  const SERIT = 8;
  const SERIT_TEMA = {
    end: { p: { u: '#e8e4a9', y: '#cfca8e', a: '#a8a36f', b: '#8f8a5c' } },
    nether: { p: { u: '#b91c1c', y: '#7f1d1d', a: '#5b1414', b: '#3f0d0d' } },
    dunya: { p: { u: '#5fbf4a', y: '#3e8e35', a: '#8b5a2b', b: '#6b4423' } },
    gri: { p: { u: '#8a8a92', y: '#6b6b73', a: '#5a5a62', b: '#46464d' } },
  };
  function seritSatirlari(w, tema) {
    // 3 satır: üst, ikinci, gövde (+ benek); taş tuğlada harç çizgisi
    const r = rastgele(7 + w);
    const satir = ['', '', '', ''];
    for (let x = 0; x < w; x++) {
      satir[0] += tema === 'dunya' && r() < 0.18 ? 'y' : 'u';
      satir[1] += tema === 'gri' && x % 6 === 0 ? 'b' : tema === 'dunya' && r() < 0.35 ? 'y' : r() < 0.15 ? 'a' : 'y';
      satir[2] += tema === 'gri' && (x + 3) % 6 === 0 ? 'b' : r() < 0.2 ? 'b' : 'a';
      satir[3] += tema === 'gri' ? (x + 3) % 6 === 0 ? 'b' : 'a' : r() < 0.25 ? 'b' : 'a';
    }
    return satir;
  }

  let seritKap = null;
  function seritKur(tema) {
    const alan = document.querySelector('.maskot-alan');
    if (seritKap) { seritKap.remove(); seritKap = null; }
    document.body.dataset.serit = '';
    if (!alan || document.body.classList.contains('hafif')) return;
    const y = window.kczMaskot && window.kczMaskot.yerler && window.kczMaskot.yerler();
    if (!y) return;
    seritKap = document.createElement('div');
    seritKap.className = 'serit-kap';
    seritKap.dataset.tema = tema;
    const sol = Math.round(y.sol - 10), sag = Math.round(y.sag + 4), gen = sag - sol;
    if (tema === 'siyah') {
      // Tavandan sarkan sarkıtlar (yarasa bunlara asılı)
      const r = rastgele(3);
      let html = '';
      for (let i = 0; i < 7; i++) {
        const boy = 3 + Math.floor(r() * 5);
        const s = [];
        for (let j = 0; j < boy; j++) s.push(j < boy - 2 ? 'dD' : j < boy - 1 ? 'd.' : 'k.');
        html += `<span class="sarkit" style="left:${sol + 8 + i * (gen / 7)}px">${izgara(s, { d: '#57534e', D: '#44403c', k: '#78716c' }, 2)}</span>`;
      }
      html += '<span class="liken" style="left:' + (sol + gen * 0.38) + 'px"></span><span class="liken" style="left:' + (sol + gen * 0.71) + 'px;animation-delay:-1.2s"></span>';
      seritKap.innerHTML = html;
      seritKap.style.cssText = 'left:0;top:0;';
      alan.prepend(seritKap);
      document.body.dataset.serit = tema;
      return;
    }
    const t = SERIT_TEMA[tema];
    if (!t) return;
    const blok = Math.ceil(gen / 2);
    const serit = `<span class="serit" style="left:${sol}px;top:${y.zemin - SERIT}px;width:${gen}px">${izgara(seritSatirlari(blok, tema), t.p, 2)}</span>`;
    // Süsler şeridin orta kısmına (maskotun durduğu iki ucun arasına)
    const at = (oran) => Math.round(sol + gen * oran);
    let susler = '';
    const ust = (svg, oran, yuk, sinif = '') => {
      susler += `<span class="sus ${sinif}" style="left:${at(oran)}px;top:${y.zemin - SERIT - yuk}px">${svg}</span>`;
    };
    if (tema === 'end') {
      ust(ciz('endCubugu', 2), 0.36, 16, 'end-cubugu');
      ust(ciz('chorus', 2), 0.6, 12, 'chorus');
    } else if (tema === 'nether') {
      ust(`<span class="ates">${ciz('ates1', 2)}${ciz('ates2', 2)}</span>`, 0.34, 10, 'ates-kap');
      ust(ciz('mantar', 2), 0.62, 8);
      ust(`<span class="ates">${ciz('ates2', 2)}${ciz('ates1', 2)}</span>`, 0.72, 10, 'ates-kap kucuk');
    } else if (tema === 'dunya') {
      ust(ciz('gelincik', 2), 0.33, 10, 'cicek');
      ust(ciz('ot', 2), 0.45, 8, 'ot');
      ust(ciz('karahindiba', 2), 0.58, 8, 'cicek');
      ust(ciz('ot', 2), 0.7, 8, 'ot');
    } else if (tema === 'gri') {
      ust(ciz('fener', 2), 0.5, 10, 'fener');
    }
    seritKap.innerHTML = serit + susler;
    alan.prepend(seritKap);
    document.body.dataset.serit = tema;
  }

  /* ---------- Ana sahne ---------- */
  function sahneKur(tema) {
    const d = document.querySelector('.sahne-dekor');
    if (!d) return;
    d.querySelectorAll('.dunya-sus').forEach((x) => x.remove());
    const ekle = (html, sinif, stil) => {
      const e = document.createElement('div');
      e.className = 'dunya-sus ' + sinif;
      e.innerHTML = html;
      if (stil) e.style.cssText = stil;
      d.append(e);
      return e;
    };
    if (tema === 'end') {
      // End adası zemini, kristalli obsidyen sütunlar, uçan Ejderha
      ekle(izgara(arazi(140, 16, 11, { en: 0.25, boy: 0.75 }), { u: '#e8e4a9', y: '#cfca8e', a: '#a8a36f', b: '#8f8a5c' }, 6), 'arazi end-ada');
      const sutun = (boy) => {
        const s = [];
        for (let j = 0; j < boy; j++) s.push(j % 7 === 3 ? 'oOoO' : j % 5 === 1 ? 'OooO' : 'oooO');
        return izgara(s, { o: '#160f22', O: '#2a1f3d' }, 5);
      };
      ekle(`<span class="kristal-kap">${ciz('kristal', 5)}</span>${sutun(26)}`, 'sutun', 'left:9%;');
      ekle(`<span class="kristal-kap">${ciz('kristal', 5)}</span>${sutun(18)}`, 'sutun', 'right:11%;');
      ekle(`<span class="kanat a">${ciz('ejderA', 3)}</span><span class="kanat b">${ciz('ejderB', 3)}</span>`, 'ejder');
    } else if (tema === 'nether') {
      // Lav denizi, iki yanda kayalık, akan lav, parıltıtaşı
      ekle('', 'lav');
      ekle(izgara(arazi(34, 40, 5, { en: 0.55, boy: 1, ust: 'u', ikinci: 'a', benekOran: 0.12, egim: 0.75 }), { u: '#7f1d1d', a: '#4c1010', b: '#2e0909' }, 6), 'kayalik sol');
      ekle(izgara(arazi(30, 34, 9, { en: 0.55, boy: 1, ust: 'u', ikinci: 'a', benekOran: 0.12, egim: 0.75 }), { u: '#7f1d1d', a: '#4c1010', b: '#2e0909' }, 6), 'kayalik sag');
      ekle('', 'lav-selale');
      const parilti = (tohum) => {
        const r = rastgele(tohum), s = [];
        for (let j = 0; j < 6; j++) {
          let t = '';
          for (let i = 0; i < 9; i++) t += Math.abs(i - 4) + j * 0.9 < 5.2 && r() < 0.88 ? (r() < 0.3 ? 'Y' : r() < 0.5 ? 'o' : 'y') : '.';
          s.push(t);
        }
        return izgara(s, { y: '#fde68a', Y: '#fffbeb', o: '#d97706' }, 5);
      };
      ekle(parilti(2), 'parilti', 'left:18%;');
      ekle(parilti(8), 'parilti', 'right:26%;transform:scale(.75);transform-origin:top');
    } else if (tema === 'dunya') {
      // Katmanlı tepeler, ağaçlar, çiçekler
      ekle(izgara(arazi(120, 22, 21, { en: 0.4, boy: 0.95, ust: 'u', ikinci: 'u', benekOran: 0 }), { u: '#1f5b4a', a: '#1f5b4a', b: '#1f5b4a' }, 7), 'arazi tepe-arka');
      ekle(izgara(arazi(150, 14, 4, { en: 0.3, boy: 0.8 }), { u: '#5fbf4a', y: '#3e8e35', a: '#8b5a2b', b: '#6b4423' }, 6), 'arazi tepe-on');
      ekle(ciz('agac', 6), 'agac', 'left:7%;');
      ekle(ciz('agacKucuk', 6), 'agac', 'left:20%;transform:scale(.8);transform-origin:bottom');
      ekle(ciz('agac', 6), 'agac', 'right:8%;transform:scale(.9);transform-origin:bottom');
      ['33%', '41%', '58%', '66%', '74%'].forEach((l, i) => ekle(ciz(i % 2 ? 'karahindiba' : 'gelincik', 4), 'cicek-sahne', `left:${l}`));
    } else if (tema === 'siyah') {
      ekle(`<span class="ay-isik"></span>${ciz('ay', 5)}`, 'ay');
      ekle(izgara(arazi(130, 18, 31, { en: 0.25, boy: 0.9, ust: 'u', ikinci: 'a', benekOran: 0 }), { u: '#1c1c1f', a: '#121214' }, 7), 'arazi dag');
      const r = rastgele(17);
      for (let i = 0; i < 14; i++) ekle('', 'yildiz-gece', `left:${r() * 96 + 2}%;top:${r() * 55 + 3}%;--gecikme:${-r() * 4}s;--sure:${2.5 + r() * 3}s`);
    } else if (tema === 'gri') {
      const r = rastgele(23);
      for (let i = 0; i < 34; i++) ekle('', 'yagmur', `left:${r() * 100}%;--gecikme:${-r() * 2}s;--sure:${0.9 + r() * 0.7}s;height:${10 + r() * 14}px`);
    }
  }

  let sonTema = null;
  window.kczTemaSus = {
    uygula(tema, hafif) {
      const t = hafif ? null : tema;
      document.body.dataset.dunya = t || '';
      if (t !== sonTema) {
        sonTema = t;
        sahneKur(t);
      }
      requestAnimationFrame(() => seritKur(t));
    },
    /** Maskot alanı yeniden kurulunca ya da yerleşim değişince şeridi yeniden çiz */
    seritYenile() {
      seritKur(sonTema);
    },
    izgara,
  };
})();
