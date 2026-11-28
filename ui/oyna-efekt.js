/* =========================================================
   KCZ Launcher — OYNA düğmesi efektleri
   Üstüne gelince düğme biraz büyür; temaya göre süs ve parçacıklar:
     End     portal kıvılcımları, üstüne gelince portal hızlanır, mor halka
     Nether  boşta korlar; üstüne gelince üst kenardan alevler yükselir
     Dünya   üst kenarında sallanan otlar; üstüne gelince çiçekler açar, yapraklar uçar
     Siyah   köşelerde yıldız parıltıları
     Gri     düğmenin üstüne yağmur damlaları sıçrar
     Sade    zarif ışık geçişi ve hafif ışıltı
   Tıklayınca tıklanan yerden patlama. Performans temasında ve hafif modda hiçbiri yok.
   ========================================================= */
(() => {
  const RENK = {
    end: ['#c084fc', '#a78bfa', '#5eead4', '#e9d5ff', '#67e8f9'],
    nether: ['#fde047', '#fb923c', '#f97316', '#fdba74', '#ef4444'],
    dunya: ['#86efac', '#4ade80', '#bbf7d0', '#facc15', '#f472b6'],
    siyah: ['#ffffff', '#e5e7eb', '#f5f5f4'],
    gri: ['#e2e8f0', '#cbd5e1', '#94a3b8'],
  };
  const rast = (a, b) => a + Math.random() * (b - a);
  const sec = (l) => l[Math.floor(Math.random() * l.length)];
  const vurgu = () => getComputedStyle(document.documentElement).getPropertyValue('--v').trim() || '#fafafa';
  const renkler = (t) => RENK[t] || [vurgu(), '#ffffff'];

  let blok = null, btn = null, kap = null, sonTema = null;

  const tema = () => document.body.dataset.tema || 'gri';
  const acik = () => tema() !== 'performans' && !document.body.classList.contains('hafif') && btn && !btn.disabled
    && !btn.classList.contains('yukleniyor') && !btn.classList.contains('acik');

  function izgara(s, p, px) {
    return window.kczTemaSus ? window.kczTemaSus.izgara(s, p, px) : '';
  }

  function yerlestir() {
    if (!kap || !btn) return;
    kap.style.left = btn.offsetLeft + 'px';
    kap.style.top = btn.offsetTop + 'px';
    kap.style.width = btn.offsetWidth + 'px';
    kap.style.height = btn.offsetHeight + 'px';
  }

  /** Parçacık: (x,y) düğmeye göre; yön ve uzaklık rastgele (ya da verilen açı aralığında) */
  function parcacik(x, y, s) {
    const n = s.sayi || 1;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'oyna-p';
      const b = rast(s.boyut?.[0] ?? 2, s.boyut?.[1] ?? 3.5);
      p.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + b + 'px;height:' + (s.uzun ? b * 3 : b) + 'px;background:' + sec(s.renkler)
        + (s.parla ? ';box-shadow:0 0 6px ' + sec(s.renkler) : '') + (s.yuvarlak ? ';border-radius:50%' : '');
      kap.append(p);
      const aci = s.aci ? rast(s.aci[0], s.aci[1]) : rast(0, Math.PI * 2);
      const uz = rast(s.uzak?.[0] ?? 10, s.uzak?.[1] ?? 30);
      const dx = Math.cos(aci) * uz, dy = Math.sin(aci) * uz + (s.yukari || 0);
      p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: s.bas ?? 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + (s.buyu ?? 0.3) + ')', opacity: 0 },
      ], { duration: rast(s.sure?.[0] ?? 500, s.sure?.[1] ?? 900), delay: rast(0, s.gecikme || 0), easing: s.easing || 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' })
        .finished.then(() => p.remove(), () => p.remove());
    }
  }

  /** Düğmenin kenarı üzerinde rastgele bir nokta */
  function kenarNoktasi() {
    const w = btn.offsetWidth, h = btn.offsetHeight, c = w * 2 + h * 2;
    let d = Math.random() * c;
    if (d < w) return [d, 0, -Math.PI / 2];
    d -= w;
    if (d < h) return [w, d, 0];
    d -= h;
    if (d < w) return [w - d, h, Math.PI / 2];
    d -= w;
    return [0, h - d, Math.PI];
  }

  /* ---------- Temaya göre kalıcı süsler (kapın içinde) ---------- */
  const OT = { p: { g: '#4ade80', G: '#16a34a', l: '#86efac' }, s: ['g..l.', 'g.G.G', '.gG.g', '.gGg.'] };
  const CICEK = [
    { p: { r: '#e11d48', y: '#facc15', g: '#16a34a' }, s: ['.r.', 'ryr', '.r.', '.g.'] },
    { p: { y: '#facc15', Y: '#eab308', g: '#16a34a' }, s: ['yY', 'Yy', '.g'] },
    { p: { b: '#60a5fa', y: '#fef08a', g: '#16a34a' }, s: ['.b.', 'byb', '.b.', '.g.'] },
  ];
  const ALEV = [
    { p: { y: '#fde047', o: '#f97316', r: '#dc2626' }, s: ['..y..', '.yo.y', '.oyo.', 'oyyro', 'roror'] },
    { p: { y: '#fde047', o: '#f97316', r: '#dc2626' }, s: ['.y...', '.oy.y', '.oyo.', 'royyo', 'ororo'] },
  ];
  const PARILTI = { p: { w: '#ffffff', W: '#e5e7eb' }, s: ['..w..', '..W..', 'wWwWw', '..W..', '..w..'] };

  function susKur() {
    const t = tema();
    sonTema = t;
    kap.replaceChildren();
    kap.dataset.tema = t;
    if (t === 'nether') {
      let a = '<div class="alev-serit">';
      for (let i = 0; i < 7; i++) a += '<span class="alev" style="animation-delay:' + (-i * 0.11) + 's">' + izgara(ALEV[0].s, ALEV[0].p, 3) + izgara(ALEV[1].s, ALEV[1].p, 3) + '</span>';
      kap.innerHTML = a + '</div>';
    } else if (t === 'siyah') {
      kap.innerHTML = [[-6, -6], [100, -6], [-6, 100], [100, 100]].map(([x, y], i) =>
        '<span class="parilti-yildiz" style="left:' + x + '%;top:' + y + '%;animation-delay:' + (i * 0.35) + 's">' + izgara(PARILTI.s, PARILTI.p, 2) + '</span>').join('');
    }
    yerlestir();
  }

  /* ---------- Boşta küçük efektler ---------- */
  let sayac = 0;
  function bosta() {
    if (!kap || !acik() || document.hidden || document.body.dataset.sayfa && document.body.dataset.sayfa !== 'ana' && tema() === 'sade') return;
    const t = tema();
    if (t !== sonTema) susKur();
    sayac++;
    const w = btn.offsetWidth, h = btn.offsetHeight;
    if (t === 'end') {
      const [x, y, a] = kenarNoktasi();
      parcacik(x, y, { renkler: RENK.end, boyut: [1.5, 2.5], aci: [a - 0.5, a + 0.5], uzak: [6, 16], yukari: -6, sure: [900, 1400], parla: true });
    } else if (t === 'nether') {
      parcacik(rast(8, w - 8), 0, { renkler: RENK.nether, boyut: [1.5, 2.5], aci: [-Math.PI * 0.6, -Math.PI * 0.4], uzak: [14, 30], sure: [900, 1500], parla: true });
    } else if (t === 'gri') {
      const x = rast(10, w - 10);
      parcacik(x, 0, { sayi: 3, renkler: RENK.gri, boyut: [1, 2], aci: [-Math.PI * 0.85, -Math.PI * 0.15], uzak: [4, 9], sure: [300, 450], yuvarlak: true });
    } else if (t === 'dunya' && sayac % 3 === 0) {
      parcacik(rast(10, w - 10), -4, { renkler: ['#86efac', '#4ade80', '#fda4af'], boyut: [2, 3], aci: [-Math.PI * 0.7, -Math.PI * 0.3], uzak: [12, 24], sure: [1200, 1800] });
    } else if (t === 'siyah' && sayac % 2 === 0) {
      const [x, y] = kenarNoktasi();
      parcacik(x, y, { renkler: RENK.siyah, boyut: [1, 2], uzak: [2, 6], sure: [700, 1100], parla: true, yuvarlak: true });
    } else if (t === 'sade' && sayac % 3 === 0) {
      const [x, y, a] = kenarNoktasi();
      parcacik(x, y, { renkler: [vurgu()], boyut: [1, 1.8], aci: [a - 0.3, a + 0.3], uzak: [6, 14], sure: [1000, 1500], bas: 0.6, yuvarlak: true });
    }
    void h;
  }

  /* ---------- Üstüne gelme ve tıklama ---------- */
  function ustune() {
    if (!acik()) return;
    blok.classList.add('ustunde');
    const t = tema(), w = btn.offsetWidth, h = btn.offsetHeight;
    // kenar boyunca halka gibi parçacıklar
    for (let i = 0; i < 18; i++) {
      const [x, y, a] = kenarNoktasi();
      parcacik(x, y, { renkler: renkler(t), boyut: [1.5, 3], aci: [a - 0.6, a + 0.6], uzak: [8, 22], sure: [500, 900], gecikme: 120, parla: t === 'end' || t === 'nether' || t === 'siyah' });
    }
    if (t === 'nether') for (let i = 0; i < 8; i++) parcacik(rast(10, w - 10), 0, { renkler: RENK.nether, boyut: [2, 3.5], aci: [-Math.PI * 0.62, -Math.PI * 0.38], uzak: [20, 40], sure: [700, 1100], gecikme: 300, parla: true });
    if (t === 'dunya') for (let i = 0; i < 6; i++) parcacik(rast(10, w - 10), -2, { renkler: ['#86efac', '#4ade80', '#fda4af', '#fde047'], boyut: [2, 3], aci: [-Math.PI * 0.8, -Math.PI * 0.2], uzak: [16, 30], sure: [900, 1300], gecikme: 200 });
    if (t === 'end') parcacik(w / 2, h / 2, { sayi: 10, renkler: RENK.end, boyut: [1, 2], uzak: [w * 0.4, w * 0.6], sure: [600, 900], uzun: true, parla: true, bas: 0.8 });
  }
  function ayril() {
    blok.classList.remove('ustunde');
  }
  function tikla(e) {
    if (tema() === 'performans' || document.body.classList.contains('hafif')) return;
    const r = btn.getBoundingClientRect();
    const x = e.clientX ? e.clientX - r.left : r.width / 2, y = e.clientY ? e.clientY - r.top : r.height / 2;
    parcacik(x, y, { sayi: 26, renkler: renkler(tema()), boyut: [2, 4], uzak: [18, 46], sure: [500, 900], parla: tema() !== 'gri' });
    const halka = document.createElement('i');
    halka.className = 'oyna-halka';
    halka.style.cssText = 'left:' + x + 'px;top:' + y + 'px;border-color:' + sec(renkler(tema()));
    kap.append(halka);
    halka.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' })
      .finished.then(() => halka.remove(), () => halka.remove());
  }

  function kur() {
    blok = document.querySelector('.oyna-blok');
    btn = document.getElementById('oynaBtn');
    if (!blok || !btn) return;
    kap = document.createElement('div');
    kap.className = 'oyna-efekt';
    kap.setAttribute('aria-hidden', 'true');
    blok.append(kap);
    btn.addEventListener('mouseenter', ustune);
    btn.addEventListener('mouseleave', ayril);
    btn.addEventListener('click', tikla);
    new ResizeObserver(yerlestir).observe(btn);
    new ResizeObserver(yerlestir).observe(blok);
    new MutationObserver(() => { if (tema() !== sonTema) susKur(); requestAnimationFrame(yerlestir); })
      .observe(document.body, { attributes: true, attributeFilter: ['data-tema', 'data-sayfa', 'class'] });
    susKur();
    setInterval(bosta, 650);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();
})();
