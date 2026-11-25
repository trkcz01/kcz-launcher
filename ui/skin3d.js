// Minecraft skin dosyasından (64x64 PNG) CSS 3D karakter oluşturur.
// Her parça 6 yüzlü bir kutu; yüzlerin arka planı skin dosyasının ilgili bölgesi.
(function () {
  const P = 10; // 1 skin pikseli = 10 ekran pikseli -> karakter 160x320 px

  // Kutu açılımı (Minecraft UV düzeni): sol üst köşe u0,v0; genişlik w, yükseklik h, derinlik d
  function uv(u0, v0, w, h, d) {
    return {
      ust: [u0 + d, v0, w, d],
      alt: [u0 + d + w, v0, w, d],
      sag: [u0, v0 + d, d, h],          // karakterin sağ yanı
      on: [u0 + d, v0 + d, w, h],
      sol: [u0 + d + w, v0 + d, d, h],  // karakterin sol yanı
      arka: [u0 + 2 * d + w, v0 + d, w, h]
    };
  }

  function parcalar(ince, eski) {
    const kol = ince ? 3 : 4;
    const p = [
      // ad, model içi x,y (piksel), w,h,d, uv kökü, katman kökü, katman büyütme, animasyon sınıfı, dönme merkezi
      { ad: 'bas', x: 4, y: 0, w: 8, h: 8, d: 8, uv: [0, 0], kat: [32, 0], b: 1, sinif: 'npc-bas', merkez: '50% 100%' },
      { ad: 'govde', x: 4, y: 8, w: 8, h: 12, d: 4, uv: [16, 16], kat: eski ? null : [16, 32], b: 0.5, sinif: 'npc-govde', merkez: '50% 100%' },
      { ad: 'kolS', x: 4 - kol, y: 8, w: kol, h: 12, d: 4, uv: [40, 16], kat: eski ? null : [40, 32], b: 0.5, sinif: 'npc-kolS', merkez: '50% 8%' },
      { ad: 'kolD', x: 12, y: 8, w: kol, h: 12, d: 4, uv: eski ? [40, 16] : [32, 48], kat: eski ? null : [48, 48], b: 0.5, sinif: 'npc-kolD', merkez: '50% 8%' },
      { ad: 'bacakS', x: 4, y: 20, w: 4, h: 12, d: 4, uv: [0, 16], kat: eski ? null : [0, 32], b: 0.5, sinif: 'npc-bacakS', merkez: '50% 0' },
      { ad: 'bacakD', x: 8, y: 20, w: 4, h: 12, d: 4, uv: eski ? [0, 16] : [16, 48], kat: eski ? null : [0, 48], b: 0.5, sinif: 'npc-bacakD', merkez: '50% 0' }
    ];
    return p;
  }

  // Kutunun 6 yüzü. Ekranda sağ taraf (+X) karakterin SOL yanıdır.
  function kutu(doku, yukseklik, w, h, d, kok, olcek) {
    const W = w * P * olcek, H = h * P * olcek, D = d * P * olcek;
    const harita = uv(kok[0], kok[1], w, h, d);
    const yuzler = [
      ['on', harita.on, W, H, `translateZ(${D / 2}px)`, 'y-on', 0, 0],
      ['arka', harita.arka, W, H, `rotateY(180deg) translateZ(${D / 2}px)`, 'y-arka', 0, 0],
      ['sagEkran', harita.sol, D, H, `rotateY(90deg) translateZ(${W / 2}px)`, 'y-yan', (W - D) / 2, 0],
      ['solEkran', harita.sag, D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, 'y-yan2', (W - D) / 2, 0],
      ['ust', harita.ust, W, D, `rotateX(90deg) translateZ(${H / 2}px)`, 'y-ust', 0, (H - D) / 2],
      ['alt', harita.alt, W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, 'y-alt', 0, (H - D) / 2]
    ];
    const k = document.createElement('div');
    k.className = 'kutu3d';
    k.style.width = W + 'px';
    k.style.height = H + 'px';
    for (const [, [u, v, rw, rh], fw, fh, tr, sinif, sol, ust] of yuzler) {
      const y = document.createElement('div');
      y.className = 'yuz ' + sinif;
      const sx = fw / rw, sy = fh / rh;
      y.style.width = fw + 'px';
      y.style.height = fh + 'px';
      y.style.left = sol + 'px';
      y.style.top = ust + 'px';
      y.style.transform = tr;
      y.style.backgroundImage = `url("${doku}")`;
      y.style.backgroundSize = `${64 * sx}px ${yukseklik * sy}px`;
      y.style.backgroundPosition = `${-u * sx}px ${-v * sy}px`;
      k.append(y);
    }
    return k;
  }

  // doku: resim adresi, ince: ince kollu (Alex tipi), eski: 64x32 eski skin
  function karakter(doku, ince, eski, pelerin) {
    const yukseklik = eski ? 32 : 64;
    const model = document.createElement('div');
    model.className = 'model3d';

    for (const p of parcalar(ince, eski)) {
      const parca = document.createElement('div');
      parca.className = 'parca ' + p.sinif;
      parca.style.left = p.x * P + 'px';
      parca.style.top = p.y * P + 'px';
      parca.style.width = p.w * P + 'px';
      parca.style.height = p.h * P + 'px';
      parca.style.transformOrigin = p.merkez + ' 0';
      parca.append(kutu(doku, yukseklik, p.w, p.h, p.d, p.uv, 1));
      if (p.kat) {
        // Üst katman (şapka, ceket, kol ve paça katmanı): biraz daha büyük, saydam yerleri boş
        const buyuk = (p.w + p.b) / p.w;
        const K = kutu(doku, yukseklik, p.w, p.h, p.d, p.kat, buyuk);
        K.classList.add('katman');
        K.style.left = (-(p.w * P * (buyuk - 1)) / 2) + 'px';
        K.style.top = (-(p.h * P * (buyuk - 1)) / 2) + 'px';
        parca.append(K);
      }
      model.append(parca);
      if (pelerin && p.ad === 'govde') {
        // Pelerin gövdenin içine konur: eğilme gibi hareketlerde gövdeyle birlikte hareket eder.
        // 10x16x1, omuzlardan sarkar; kutu 180° döndürülür: dış yüzü (dokuda "ön") arkaya bakar.
        const pel = document.createElement('div');
        pel.className = 'parca npc-pelerin';
        pel.style.left = -1 * P + 'px';
        pel.style.top = '0px';
        pel.style.width = 10 * P + 'px';
        pel.style.height = 16 * P + 'px';
        pel.style.transformOrigin = '50% 0 0';
        pel.append(kutu(pelerin, 32, 10, 16, 1, [0, 0], 1));
        parca.append(pel);
      }
    }
    return model;
  }

  // Seçim çubuğundaki küçük kafa (yüz + şapka katmanı)
  function kafaStili(el, doku, boyut) {
    const s = boyut / 8;
    el.style.backgroundImage = `url("${doku}"), url("${doku}")`;
    el.style.backgroundSize = `${64 * s}px auto, ${64 * s}px auto`;
    el.style.backgroundPosition = `${-40 * s}px ${-8 * s}px, ${-8 * s}px ${-8 * s}px`;
  }

  // Resmin boyutunu öğren (eski 64x32 skin mi?)
  function dokuBilgi(doku) {
    return new Promise((coz) => {
      const r = new Image();
      r.onload = () => coz({ ok: true, eski: r.naturalHeight === 32 });
      r.onerror = () => coz({ ok: false, eski: false });
      r.src = doku;
    });
  }

  // Önden düz görünüm (hafif modda yandaki skinler için): 16x32 tuval, CSS ile büyütülür.
  // Tuval dışarıya okunmaz, sadece gösterilir (başka siteden gelen dokularda da çalışır).
  function onResim(doku, ince, eski) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 32;
    c.className = 'duz-skin';
    const r = new Image();
    r.onload = () => {
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (const p of parcalar(ince, eski)) {
        const d = p.d;
        g.drawImage(r, p.uv[0] + d, p.uv[1] + d, p.w, p.h, p.x, p.y, p.w, p.h);
        if (p.kat) g.drawImage(r, p.kat[0] + d, p.kat[1] + d, p.w, p.h, p.x, p.y, p.w, p.h);
      }
    };
    r.src = doku;
    return c;
  }

  window.Skin3D = { karakter, kafaStili, dokuBilgi, onResim, MW: 16 * P, MH: 32 * P };
})();
