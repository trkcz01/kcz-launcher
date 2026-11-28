/* =========================================================
   KCZ Launcher — tema maskotları ve sahne süsleri
   Her temanın sol üstte, logo satırında duran küçük piksel bir yaratığı var. Boşta kendi
   halinde kıpırdar; üstüne gelince (ya da tıklayınca) kendine özgü bir şey yapıp satırın
   öbür ucuna geçer:
     End      Enderman  mor parçacıklarla ışınlanır
     Nether   Ghast     kızıp ateş topu atar, sonra öbür tarafa süzülür
     Dünya    Creeper   tıslar, şişip "puf" olur, öbür tarafta yeniden düşer
     Siyah    Yarasa    tavanda uyur; uyanıp kanat çırparak öbür tarafa uçar
     Gri      Kedi      çömelip öbür tarafa zıplar
   Performans temasında, hafif modda ve Ayarlar'da kapatılınca maskot yok.
   Çizimler aşağıdaki piksel ızgaralarından SVG olarak üretilir (aynı ızgaralar oyun içi
   KCZ menüsünde de kullanılıyor: istemci-mod/.../Maskot.java).
   ========================================================= */
(() => {
  /* ---------- Piksel çizimler ----------
     Her parça ya satır dizisi ya da { x, y, s: [satırlar] } (ızgarada x,y'den başlar). '.' boş. */
  const SPRITE = {
    enderman: {
      w: 10, h: 27, olcek: 1.6,
      palet: { k: '#0b0a10', d: '#211c2b', s: '#15121c', a: '#17131e', p: '#9d2fc0', e: '#e57cf6', E: '#fde7ff', q: '#4a1660' },
      parcalar: {
        govde: [
          '.ddddddds.', '.dkkkkkks.', '.kkkkkkks.', '.kkkkkkks.', '.kkkkkkks.', '.kkkkkkks.', '.kkkkkkks.', '.kkkkkkks.',
          '..dkkkks..', '..kkkkks..', '..kkkkks..', '..kkkkks..', '..kkkkks..', '..kkkkks..', '..kkkkks..',
          '..kk..kk..', '..kk..kk..', '..kk..kk..', '..kk..kk..', '..kk..kk..', '..kk..kk..',
          '..kk..kk..', '..kk..kk..', '..kk..kk..', '..kk..kk..', '..kk..kk..', '..dk..kd..',
        ],
        kolS: { x: 0, y: 8, s: ['aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'da'] },
        kolD: { x: 8, y: 8, s: ['aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'aa', 'ad'] },
        gozler: { x: 1, y: 4, s: ['peE..Eep'] },
        gozAlt: { x: 1, y: 5, s: ['qpq..qpq'] },
      },
    },
    creeper: {
      w: 8, h: 19, olcek: 1.9,
      palet: { g: '#5fb34d', G: '#418c35', l: '#93d575', s: '#2f6a27', k: '#101010' },
      parcalar: {
        kafa: ['glgGglGg', 'GglggGgl', 'gkkggkkg', 'lkkGlkkg', 'gGgkkgGg', 'Ggkkkkgl', 'glkkkkGg', 'ggkGgkgG'],
        govde: { x: 1, y: 8, s: ['gGgglG', 'lggGgg', 'GgsgGl', 'gglgGg', 'gGggsg', 'sgGlgg', 'ggGgsG'] },
        bacaklar: { x: 0, y: 15, s: ['gGg..gGg', 'ggs..sgg', 'Gsg..gsG', 'sss..sss'] },
      },
    },
    ghast: {
      w: 12, h: 18, olcek: 1.75,
      palet: { w: '#f4f4f5', W: '#d4d4d8', o: '#a1a1aa', f: '#3f3f46', r: '#b91c1c', R: '#f87171' },
      parcalar: {
        govde: ['.wwwwwwwwww.', 'wwwwwwwwwwwW', 'wwwwwwwwwwwW', 'wwwwwwwwwwwW', 'wwwwwwwwwwwW', 'wwwwwwwwwwwW',
          'wwwwwwwwwwwW', 'wwwwwwwwwwwW', 'WwwwwwwwwwWW', 'WWwwwwwwwWWW', '.WWWWWWWWWW.'],
        yuzS: { x: 1, y: 3, s: ['ff.....ff.', 'o......o..', 'o......o..', '...ffff...'] },
        yuzK: { x: 1, y: 2, s: ['fff....fff', 'fff....fff', 'rRr....rRr', '..........', '..ffffff..', '..frrrrf..', '..ffffff..'] },
        t0: { x: 1, y: 11, s: ['W', 'W', 'W', 'W', 'o'] },
        t1: { x: 3, y: 11, s: ['W', 'W', 'W', 'W', 'W', 'W', 'o'] },
        t2: { x: 5, y: 11, s: ['W', 'W', 'W', 'W', 'W', 'o'] },
        t3: { x: 7, y: 11, s: ['W', 'W', 'W', 'W', 'W', 'W', 'o'] },
        t4: { x: 10, y: 11, s: ['W', 'W', 'W', 'W', 'o'] },
      },
    },
    yarasa: {
      w: 8, h: 10, olcek: 2,
      palet: { b: '#8a6a52', B: '#4f3b2d', k: '#1f1712' },
      parcalar: {
        asili: ['...kk...', '..BbbB..', '.BBbbBB.', 'BBBbbBBB', 'BBBbbBBB', '.BBbbBB.', '..BbbB..', '..bbbb..', '.bkbbkb.', '.b....b.'],
      },
    },
    yarasaUcan: {
      w: 15, h: 7, olcek: 2,
      palet: { b: '#8a6a52', B: '#5c4535', e: '#fca5a5' },
      parcalar: {
        kanatA: ['B.....b.b.....B', 'BB....bbb....BB', 'BBB..bebeb..BBB', '.BBBBbbbbbBBBB.', '..BBBbbbbbBBB..', '......bbb......', '.......b.......'],
        kanatB: ['......b.b......', '......bbb......', '.....bebeb.....', '.BBBBbbbbbBBBB.', 'BBB..bbbbb..BBB', 'BB....bbb....BB', 'B......b......B'],
      },
    },
    kedi: {
      w: 11, h: 13, olcek: 2,
      palet: { g: '#a1a1aa', G: '#6b7280', w: '#f4f4f5', p: '#f9a8d4', e: '#86efac', k: '#18181b' },
      parcalar: {
        kuyruk: { x: 7, y: 5, s: ['...G', '..gg', '..g.', '.gg.', '.g..', 'gg..', 'g...'] },
        govde: ['G.....G....', 'gp...pg....', 'ggGgGgg....', 'ggggggg....', 'ggwpwgg....', '.gwwwg.....', '.gGgGg.....',
          'gggwggg....', 'gGgwgGg....', 'ggwwwgg....', 'gGgwgGg....', 'gggwggg....', '.ww.ww.....'],
        gozAcik: { x: 1, y: 3, s: ['ek.ke'] },
        gozKapali: { x: 1, y: 3, s: ['GG.GG'] },
      },
    },
    adaBuyuk: {
      w: 26, h: 22, olcek: 3,
      palet: { E: '#e8e4a9', e: '#cfca8e', d: '#b3ad74', D: '#7f7a4f', o: '#1b1426', O: '#2e2342', c: '#a855f7', C: '#d8b4fe', x: '#f5d0fe', X: '#ffffff' },
      parcalar: {
        sutun: { x: 18, y: 6, s: ['oOo', 'ooO', 'oOo', 'ooo', 'Ooo', 'oOo'] },
        ada: { x: 0, y: 12, s: [
          '...EEEEEEEEEEEEEEEEEEE....', '.EEEEeEEEEEEEEEEEeEEEEEE..', 'EEEEEEEEEEEeEEEEEEEEEEEEE.', '.dEEdEEEEEEEEEEdEEEEEEdEd.',
          '..ddddEdddddddddddddEddd..', '...dDdddddddDddddddDdd....', '.....DDdDDDDDDDDDdDD......', '......DDDDDDDDDDDD........',
          '........DDDDDDDD..........', '..........DDDD............'] },
        kristal: { x: 17, y: 0, s: ['.cCc.', 'cCxCc', 'CxXxC', 'cCxCc', '.cCc.'] },
      },
    },
    adaKucuk: {
      w: 14, h: 7, olcek: 3,
      palet: { E: '#e8e4a9', e: '#cfca8e', d: '#b3ad74', D: '#7f7a4f' },
      parcalar: { ada: ['..EEEEEEEEEE..', 'EEEEeEEEEEEEE.', '.dEEEEEEEEdEd.', '..dddDdddddd..', '...DDDDDDDD...', '.....DDDD.....', '......DD......'] },
    },
    ates: {
      w: 5, h: 5, olcek: 1.8,
      palet: { y: '#fde047', Y: '#fffbe0', o: '#f97316', r: '#c2410c' },
      parcalar: { top: ['.oro.', 'oyYyo', 'ryYyr', 'oyyyo', '.ror.'] },
    },
  };

  const TEMA_MASKOT = { end: 'enderman', nether: 'ghast', dunya: 'creeper', siyah: 'yarasa', gri: 'kedi' };
  const MASKOT_AD = { enderman: 'Enderman', ghast: 'Ghast', creeper: 'Creeper', yarasa: 'Yarasa', kedi: 'Kedi' };

  /** Izgarayı SVG'ye çevirir. Aynı renkteki yan yana pikseller tek dikdörtgen olur.
   *  beyaz: tüm şeklin beyaz bir kopyasını da ekler (Creeper'ın yanıp sönmesi için). */
  function svgYap(ad, olcek, beyaz) {
    const sp = SPRITE[ad];
    const o = olcek || sp.olcek;
    let ic = '', golge = '';
    for (const [parca, tanim] of Object.entries(sp.parcalar)) {
      const { x = 0, y = 0, s } = Array.isArray(tanim) ? { s: tanim } : tanim;
      let r = '';
      s.forEach((satir, j) => {
        for (let i = 0; i < satir.length;) {
          const c = satir[i];
          if (c === '.') { i++; continue; }
          let n = 1;
          while (satir[i + n] === c) n++;
          r += `<rect x="${x + i}" y="${y + j}" width="${n}" height="1" fill="${sp.palet[c]}"/>`;
          if (beyaz) golge += `<rect x="${x + i}" y="${y + j}" width="${n}" height="1"/>`;
          i += n;
        }
      });
      ic += `<g class="p-${parca}">${r}</g>`;
    }
    if (beyaz) ic += `<g class="p-beyaz" fill="#fff">${golge}</g>`;
    const W = +(sp.w * o).toFixed(2), H = +(sp.h * o).toFixed(2);
    // Genel "svg { width: 16px; stroke: ... }" kuralı bozmasın diye boyut satır içi, kenarlık yok
    return `<svg viewBox="0 0 ${sp.w} ${sp.h}" style="width:${W}px;height:${H}px;stroke:none" shape-rendering="crispEdges" aria-hidden="true">${ic}</svg>`;
  }
  const boyut = (ad) => ({ w: SPRITE[ad].w * SPRITE[ad].olcek, h: SPRITE[ad].h * SPRITE[ad].olcek });

  /* ---------- Parçacıklar ---------- */
  const rast = (a, b) => a + Math.random() * (b - a);
  const sec = (l) => l[Math.floor(Math.random() * l.length)];
  function parcacik(alan, x, y, s) {
    const n = s.sayi || 12;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'maskot-p';
      const b = rast(s.boyut?.[0] ?? 1.5, s.boyut?.[1] ?? 3);
      const px = x + rast(-(s.yayX || 0), s.yayX || 0), py = y + rast(-(s.yayY || 0), s.yayY || 0);
      p.style.cssText = `left:${px}px;top:${py}px;width:${b}px;height:${b}px;background:${sec(s.renkler)}`;
      alan.append(p);
      const aci = rast(0, Math.PI * 2), uz = rast(s.uzak?.[0] ?? 6, s.uzak?.[1] ?? 18);
      const dx = Math.cos(aci) * uz, dy = Math.sin(aci) * uz + (s.yukari || 0);
      const sure = rast(s.sure?.[0] ?? 450, s.sure?.[1] ?? 800);
      p.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(${s.buyu || 0.4})`, opacity: 0 },
      ], { duration: sure, delay: rast(0, s.gecikme || 0), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' })
        .finished.then(() => p.remove(), () => p.remove());
    }
  }

  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  const oynat = (el, kareler, ayar) => el.animate(kareler, ayar).finished.catch(() => {});

  /* ---------- Maskot ---------- */
  let alan = null, maskot = null, govde = null, tur = null, taraf = 'sol', mesgul = false, bosZaman = null;

  function yerler() {
    const yan = document.querySelector('.yan');
    if (!yan || !alan) return null;
    const r = yan.getBoundingClientRect();
    const yazi = document.getElementById('logoYazi').getBoundingClientRect();
    const g = document.getElementById('guncelleBtn');
    const gr = g && !g.hidden ? g.getBoundingClientRect() : null;
    const menu = document.getElementById('menu').getBoundingClientRect();
    const ust = document.querySelector('.yan-ust').getBoundingClientRect();
    return {
      sol: Math.max(yazi.right, gr ? gr.right : 0) - r.left + 12,
      sag: ust.right - r.left - 6,
      zemin: menu.top - r.top,
    };
  }

  /** Maskotun o taraftaki sol-üst köşesi */
  function konum(t) {
    const y = yerler();
    if (!y) return { x: 0, y: 0 };
    const b = boyut(tur === 'yarasa' ? 'yarasa' : tur);
    // Yarasa tavanda: sağda panelin yuvarlak köşesine denk gelmesin
    let x = t === 'sol' ? y.sol : y.sag - b.w - (tur === 'yarasa' ? 16 : 0);
    if (y.sag - y.sol < b.w * 2 + 16) x = y.sol; // yer yoksa tek yerde kalır
    const serit = document.body.dataset.serit && document.body.dataset.serit !== 'siyah' ? 8 : 0;
    let top = y.zemin - serit - b.h; // ayakta duranlar menü çubuğunun (varsa tema şeridinin) üstünde
    if (tur === 'ghast') top = y.zemin - serit - b.h - 5;
    if (tur === 'yarasa') top = 3; // panelin tavanına asılı (kenar çizgisinin hemen altı)
    return { x: Math.round(x), y: Math.round(top) };
  }

  function yerlestir() {
    if (window.kczTemaSus && !mesgul) window.kczTemaSus.seritYenile();
    if (!maskot || mesgul) return;
    const k = konum(taraf);
    maskot.style.left = k.x + 'px';
    maskot.style.top = k.y + 'px';
  }

  function kur(yeniTur) {
    if (!alan) {
      const yan = document.querySelector('.yan');
      if (!yan) return;
      alan = document.createElement('div');
      alan.className = 'maskot-alan';
      alan.setAttribute('aria-hidden', 'true');
      yan.prepend(alan);
      new ResizeObserver(() => yerlestir()).observe(document.querySelector('.yan-ust'));
      const g = document.getElementById('guncelleBtn');
      if (g) new MutationObserver(() => yerlestir()).observe(g, { attributes: true, attributeFilter: ['hidden'] });
    }
    alan.replaceChildren();
    clearInterval(bosZaman);
    tur = yeniTur;
    taraf = 'sol';
    mesgul = false;
    maskot = null;
    if (!tur) return;
    maskot = document.createElement('div');
    maskot.className = 'maskot';
    maskot.dataset.tur = tur;
    maskot.title = MASKOT_AD[tur];
    govde = document.createElement('div');
    govde.className = 'maskot-govde';
    govde.innerHTML = tur === 'yarasa' ? svgYap('yarasa') + `<span class="ucan">${svgYap('yarasaUcan')}</span>` : svgYap(tur, null, tur === 'creeper');
    maskot.append(govde);
    alan.append(maskot);
    maskot.addEventListener('mouseenter', hareket);
    maskot.addEventListener('click', hareket);
    requestAnimationFrame(yerlestir);
    // Enderman'ın etrafında arada bir mor parçacık (portal tozu)
    if (tur === 'enderman') bosZaman = setInterval(() => {
      if (mesgul || document.hidden || !maskot.isConnected) return;
      const k = konum(taraf), b = boyut('enderman');
      parcacik(alan, k.x + rast(-3, b.w + 3), k.y + rast(4, b.h - 4), {
        sayi: 1, renkler: ['#c084fc', '#e9d5ff', '#a855f7'], boyut: [1.5, 2.5], uzak: [3, 8], yukari: -10, sure: [1400, 2000], buyu: 0.2,
      });
    }, 900);
  }

  async function hareket() {
    if (mesgul || !maskot) return;
    mesgul = true;
    const hedef = taraf === 'sol' ? 'sag' : 'sol';
    try {
      if (tur === 'enderman') await isinlan(hedef);
      else if (tur === 'creeper') await patla(hedef);
      else if (tur === 'ghast') await atesEt(hedef);
      else if (tur === 'yarasa') await uc(hedef);
      else if (tur === 'kedi') await zipla(hedef);
      taraf = hedef;
    } finally {
      mesgul = false;
      yerlestir();
    }
  }

  function tasi(t) {
    const k = konum(t);
    maskot.style.left = k.x + 'px';
    maskot.style.top = k.y + 'px';
    return k;
  }
  const merkez = (k, b) => ({ x: k.x + b.w / 2, y: k.y + b.h / 2 });

  /* Enderman: irkilir, mor parçacıklar içinde kaybolur, öbür tarafta belirir */
  async function isinlan(hedef) {
    const b = boyut('enderman');
    const MOR = ['#c084fc', '#a855f7', '#e9d5ff', '#7e22ce', '#f0abfc'];
    maskot.classList.add('kizgin');
    await bekle(260);
    const k1 = konum(taraf);
    parcacik(alan, k1.x + b.w / 2, k1.y + b.h / 2, { sayi: 22, renkler: MOR, yayX: b.w / 2, yayY: b.h / 2, uzak: [4, 16], sure: [500, 900], gecikme: 120 });
    await oynat(govde, [{ transform: 'scale(1,1)', opacity: 1 }, { transform: 'scale(.15,1.25)', opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    const k2 = tasi(hedef);
    parcacik(alan, k2.x + b.w / 2, k2.y + b.h / 2, { sayi: 22, renkler: MOR, yayX: b.w / 2, yayY: b.h / 2, uzak: [4, 16], sure: [500, 900], gecikme: 80 });
    await bekle(90);
    await oynat(govde, [{ transform: 'scale(.15,1.25)', opacity: 0 }, { transform: 'scale(1,1)', opacity: 1 }], { duration: 170, easing: 'ease-out', fill: 'forwards' });
    govde.getAnimations().forEach((a) => a.cancel());
    await bekle(250);
    maskot.classList.remove('kizgin');
  }

  /* Creeper: tıslar (beyaz yanıp söner, şişer), puf olur, öbür tarafa yukarıdan düşer */
  async function patla(hedef) {
    const b = boyut('creeper');
    maskot.classList.add('tisliyor');
    await bekle(1150);
    const k1 = konum(taraf);
    maskot.classList.remove('tisliyor');
    govde.style.opacity = '0';
    const DUMAN = ['#f9fafb', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280'];
    parcacik(alan, k1.x + b.w / 2, k1.y + b.h / 2, { sayi: 26, renkler: DUMAN, boyut: [2.5, 5], yayX: 4, yayY: 4, uzak: [8, 22], sure: [500, 900], buyu: 1.6 });
    parcacik(alan, k1.x + b.w / 2, k1.y + b.h / 2, { sayi: 8, renkler: ['#fde68a', '#fff'], boyut: [2, 3], uzak: [4, 12], sure: [200, 380] });
    await bekle(750);
    tasi(hedef);
    govde.style.opacity = '';
    await oynat(govde, [
      { transform: 'translateY(-34px)', opacity: 0 }, { transform: 'translateY(-30px)', opacity: 1, offset: 0.1 },
      { transform: 'translateY(0) scale(1.08,.9)', offset: 0.7 }, { transform: 'translateY(-4px) scale(.97,1.04)', offset: 0.85 }, { transform: 'none' },
    ], { duration: 560, easing: 'ease-in' });
    const k2 = konum(hedef);
    parcacik(alan, k2.x + b.w / 2, k2.y + b.h, { sayi: 6, renkler: ['#9ca3af', '#d1d5db'], boyut: [1.5, 2.5], yayX: b.w / 2, uzak: [3, 7], yukari: -3, sure: [300, 500] });
  }

  /* Ghast: kızar, ateş topu atar (öbür tarafta patlar), sonra oraya süzülür */
  async function atesEt(hedef) {
    const b = boyut('ghast');
    maskot.classList.add('kizgin');
    await bekle(320);
    const k1 = konum(taraf), k2 = konum(hedef);
    const top = document.createElement('div');
    top.className = 'maskot-ates';
    top.innerHTML = svgYap('ates');
    const tb = boyut('ates');
    const ax = k1.x + b.w / 2 - tb.w / 2, ay = k1.y + b.h * 0.42;
    top.style.cssText = `left:${ax}px;top:${ay}px`;
    alan.append(top);
    const dx = k2.x + b.w / 2 - tb.w / 2 - ax, dy = k2.y + b.h * 0.42 - ay;
    const yol = top.animate([
      { transform: 'translate(0,0) scale(.6) rotate(0)' },
      { transform: `translate(${dx / 2}px,${dy / 2 - 10}px) scale(1) rotate(180deg)` },
      { transform: `translate(${dx}px,${dy}px) scale(1) rotate(360deg)` },
    ], { duration: Math.max(450, Math.abs(dx) * 4.5), easing: 'cubic-bezier(.3,.1,.6,1)' });
    // ateş topunun arkasında küçük kıvılcımlar
    const iz = setInterval(() => {
      const r = top.getBoundingClientRect(), a = alan.getBoundingClientRect();
      parcacik(alan, r.left - a.left + tb.w / 2, r.top - a.top + tb.h / 2, { sayi: 1, renkler: ['#fde047', '#fb923c'], boyut: [1, 2], uzak: [1, 4], sure: [250, 400] });
    }, 45);
    await yol.finished.catch(() => {});
    clearInterval(iz);
    top.remove();
    const vx = k2.x + b.w / 2, vy = k2.y + b.h * 0.42 + tb.h / 2;
    parcacik(alan, vx, vy, { sayi: 22, renkler: ['#fde047', '#f97316', '#ef4444', '#fb923c', '#fffbe0'], boyut: [1.5, 3.5], uzak: [5, 16], sure: [350, 700] });
    parcacik(alan, vx, vy, { sayi: 8, renkler: ['#52525b', '#71717a'], boyut: [2.5, 4], uzak: [3, 9], yukari: -8, sure: [600, 900], buyu: 1.5 });
    maskot.classList.remove('kizgin');
    await bekle(250);
    maskot.style.transition = 'left 1.5s cubic-bezier(.45,0,.35,1), top 1.5s cubic-bezier(.45,0,.35,1)';
    tasi(hedef);
    await bekle(1550);
    maskot.style.transition = '';
  }

  /* Yarasa: uyanır, kanat çırparak dalgalı bir yolla öbür tarafa uçar, yine asılır */
  async function uc(hedef) {
    const k1 = konum(taraf), k2 = konum(hedef);
    const ba = boyut('yarasa'), bu = boyut('yarasaUcan');
    maskot.classList.add('ucuyor');
    const ox = (bu.w - ba.w) / 2;
    const dx = k2.x - k1.x;
    const kareler = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = Math.sin(t * Math.PI) * 22 + Math.sin(t * Math.PI * 4) * 4;
      kareler.push({ transform: `translate(${dx * t - ox}px, ${y}px)` });
    }
    await oynat(maskot, kareler, { duration: 1300, easing: 'ease-in-out' });
    tasi(hedef);
    maskot.classList.remove('ucuyor');
    await oynat(govde, [{ transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'none' }], { duration: 500, easing: 'ease-out' });
  }

  /* Kedi: çömelir, kavisle zıplar, yere konunca biraz ezilir */
  async function zipla(hedef) {
    const k1 = konum(taraf), k2 = konum(hedef), b = boyut('kedi');
    await oynat(govde, [{ transform: 'none' }, { transform: 'scale(1.08,.82)' }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    const dx = k2.x - k1.x;
    const kareler = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      kareler.push({ transform: `translate(${dx * t}px, ${-4 * 26 * t * (1 - t)}px)` });
    }
    govde.getAnimations().forEach((a) => a.cancel());
    maskot.classList.add('havada');
    await oynat(maskot, kareler, { duration: 620, easing: 'linear' });
    tasi(hedef);
    maskot.classList.remove('havada');
    parcacik(alan, k2.x + b.w / 2, k2.y + b.h, { sayi: 5, renkler: ['#a1a1aa', '#d4d4d8'], boyut: [1, 2], yayX: b.w / 3, uzak: [2, 6], yukari: -2, sure: [250, 400] });
    await oynat(govde, [{ transform: 'scale(1.12,.85)' }, { transform: 'scale(.96,1.05)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  }

  /* ---------- Sahne süsleri (ana sayfadaki büyük alan) ---------- */
  function bulutSvg() {
    return '<svg viewBox="0 0 16 5" style="width:96px;height:30px;stroke:none;fill:#fff" shape-rendering="crispEdges">'
      + '<rect x="3" y="0" width="6" height="1"/><rect x="1" y="1" width="12" height="2"/><rect x="0" y="3" width="16" height="2"/></svg>';
  }
  function sahneSus(tema) {
    const d = document.querySelector('.sahne-dekor');
    if (!d) return;
    d.querySelectorAll('.tema-sus').forEach((x) => x.remove());
    const ekle = (html, sinif, stil) => {
      const e = document.createElement('div');
      e.className = 'tema-sus ' + sinif;
      e.innerHTML = html;
      if (stil) e.style.cssText = stil;
      d.append(e);
    };
    if (tema === 'end') {
      ekle(svgYap('adaBuyuk'), 'ada', 'left:6%;top:24%;--gecikme:0s');
      ekle(svgYap('adaKucuk'), 'ada', 'right:10%;top:20%;--gecikme:-3s;opacity:.3');
      ekle(svgYap('adaKucuk', 2), 'ada', 'right:25%;top:47%;--gecikme:-5s;opacity:.2');
      for (let i = 0; i < 7; i++) ekle('', 'yildiz', `left:${rast(4, 96)}%;top:${rast(4, 60)}%;--gecikme:${-rast(0, 4)}s;--sure:${rast(2.5, 5)}s`);
    } else if (tema === 'dunya') {
      ekle(bulutSvg(), 'bulut', 'top:9%;--sure:95s;--gecikme:-20s');
      ekle(bulutSvg(), 'bulut', 'top:20%;--sure:120s;--gecikme:-75s;transform:scale(.7)');
      ekle(bulutSvg(), 'bulut', 'top:5%;--sure:140s;--gecikme:-110s;transform:scale(.55)');
      ekle('', 'gunes');
    } else if (tema === 'nether') {
      for (let i = 0; i < 9; i++) ekle('', 'kul', `left:${rast(3, 97)}%;--gecikme:${-rast(0, 12)}s;--sure:${rast(9, 15)}s`);
    }
  }

  window.kczMaskot = {
    yerler: () => yerler(),
    /** Temaya göre maskotu kur/kaldır. acik: Ayarlar'daki "Tema maskotu", hafif: hafif mod */
    uygula(tema, acik, hafif) {
      const yeni = acik && !hafif ? TEMA_MASKOT[tema] || null : null;
      if (yeni !== tur || !alan) kur(yeni);
      sahneSus(hafif ? null : tema);
      if (window.kczTemaSus) window.kczTemaSus.uygula(tema, hafif);
      requestAnimationFrame(yerlestir);
    },
    /** Tema kartı önizlemesi için duran küçük çizim (yoksa boş) */
    onizleme(tema) {
      const ad = TEMA_MASKOT[tema];
      return ad ? svgYap(ad, ad === 'ghast' ? 1.25 : ad === 'enderman' ? 1.3 : 1.5) : '';
    },
    adi: (tema) => MASKOT_AD[TEMA_MASKOT[tema]] || null,
    SPRITE,
  };
})();
