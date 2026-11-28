// KCZ Launcher arayüz mantığı
const $ = (id) => document.getElementById(id);
const api = window.kcz;
let LINUX = false; // istemci_bilgi gelince ayarlanır

let ayarlar = {};
let girisli = false;
let hesapAdi = '';
let oyunDurumu = 'bosta';   // bosta | acik
let is = null;              // devam eden iş: { tur: 'oyna' | 'yukle', surum, yuzde, metin }
let sunucular = [];         // { ad, adres, ikon, veri? }
let surumVeri = { liste: [], enSon: {} };
let filtre = 'release';
let gosterilen = 80;

const TUR_ADI = { release: 'Sürüm', snapshot: 'Snapshot', old_beta: 'Beta', old_alpha: 'Alpha' };
const YUK_AD = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
const OYNA_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

function yaz(id, metin) { $(id).textContent = metin; }
function el(etiket, sinif, metin) {
  const e = document.createElement(etiket);
  if (sinif) e.className = sinif;
  if (metin != null) e.textContent = metin;
  return e;
}
function tarihYaz(t) {
  try { return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}
function sayiYaz(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' Mn';
  if (n >= 1e3) return Math.round(n / 1e3) + ' B';
  return String(n);
}

/* ---------- Bildirim ---------- */
let bildirimZaman = null;
function bildirim(metin, hata = false) {
  const b = $('bildirim');
  b.hidden = true;
  void b.offsetWidth;
  b.textContent = metin;
  b.classList.toggle('hata', hata);
  b.hidden = false;
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => { b.hidden = true; }, hata ? 6000 : 3000);
}

/* =========================================================
   TEMA, RENK, SAYDAMLIK
   ========================================================= */
const TEMALAR = {
  gri: { ad: 'Gri', alt: 'Sade · Kedi', v: '#a1a1aa', v2: '#e4e4e7' },
  siyah: { ad: 'Siyah', alt: 'Tam karanlık · Yarasa', v: '#fafafa', v2: '#737373' },
  end: { ad: 'End', alt: 'Yıldızlar ve adalar · Enderman', v: '#c084fc', v2: '#fde68a' },
  nether: { ad: 'Nether', alt: 'Lav ve kül · Ghast', v: '#f97316', v2: '#ef4444' },
  dunya: { ad: 'Normal Dünya', alt: 'Gökyüzü ve bulutlar · Creeper', v: '#4ade80', v2: '#38bdf8' },
  performans: { ad: 'Performans', alt: 'Animasyonsuz, en hafif', v: '#22c55e', v2: '#a3e635' },
  sade: { ad: 'Sade', alt: 'Sadece OYNA, en sade', v: '#fafafa', v2: '#a1a1aa' }
};
const RENKLER = [['Gri', '#a1a1aa'], ['Beyaz', '#fafafa'], ['Mor', '#8b5cf6'], ['Mavi', '#3b82f6'], ['Turkuaz', '#06b6d4'],
  ['Yeşil', '#22c55e'], ['Sarı', '#eab308'], ['Turuncu', '#f97316'], ['Kırmızı', '#ef4444'], ['Pembe', '#ec4899']];
const SAYDAMLIK = [
  ['Opak', 'Pencere tamamen kapalı, arkası görünmez.'],
  ['Koyu cam', 'Siyah cam: arkası koyulaşmış görünür, yazılar çok rahat okunur.'],
  ['Saydam', 'Siyah saydam cam: arkadaki masaüstü ve pencereler net görünür.'],
  ['Tamamen saydam', 'Pencerenin zemini yok: arkadaki her şey görünür, sadece paneller ve yazılar kalır.']
];

function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function acikMi(h) { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b > 150; }
function kaydir(h, d) {
  let [r, g, b] = rgb(h).map((x) => x / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hu = 0, sa = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const dd = mx - mn;
    sa = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
    hu = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    hu /= 6;
  }
  hu = (hu + d / 360 + 1) % 1;
  const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return '#' + [f(hu + 1 / 3), f(hu), f(hu - 1 / 3)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/* Oyuncu kafası: skin Mojang'dan alınır (yüz + şapka katmanı). Olmazsa mc-heads yedek. */
function kafaKoy(img, kimlik, boyut = 68) {
  if (!kimlik) return;
  img.style.imageRendering = 'pixelated';
  api.kafaDokusu(String(kimlik)).then((doku) => {
    if (!doku) { img.src = `https://mc-heads.net/avatar/${encodeURIComponent(kimlik)}/${boyut}`; return; }
    const r = new Image();
    r.onload = () => {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(r, 8, 8, 8, 8, 0, 0, 8, 8);
      g.drawImage(r, 40, 8, 8, 8, 0, 0, 8, 8);
      img.src = c.toDataURL();
    };
    r.onerror = () => { img.src = `https://mc-heads.net/avatar/${encodeURIComponent(kimlik)}/${boyut}`; };
    r.src = doku;
  }).catch(() => { img.src = `https://mc-heads.net/avatar/${encodeURIComponent(kimlik)}/${boyut}`; });
}

/* Hafif mod: Performans teması ya da Düşük / Çok düşük ayar seçiliyse launcher'daki tüm
   animasyonlar, bulanık cam ve süsler kapanır; skinler durur (zayıf bilgisayarda kasmasın). */
if (window.__KCZ_DUZ) document.documentElement.classList.add('duz');
function hafifMi() {
  return ayarlar.tema === 'performans' || ['cokdusuk', 'dusuk'].includes(ayarlar.performansSeviye)
    || (!ayarlar.performansSeviye && ayarlar.sistemZayif === true);
}
let hafifOnceki = null;
function hafifUygula() {
  const h = hafifMi();
  document.body.classList.toggle('hafif', h);
  // Pencerenin saydam/düz olması ancak launcher yeniden açılınca değişir
  if (hafifOnceki !== null && h !== hafifOnceki && typeof window.__KCZ_DUZ === 'boolean' && h !== window.__KCZ_DUZ) {
    bildirim(h ? 'Hafif mod açıldı. Pencere launcher yeniden açılınca tamamen hafifler.'
      : 'Hafif mod kapandı. Saydam pencere launcher yeniden açılınca geri gelir.');
  }
  hafifOnceki = h;
  // Tema maskotu (sol üst) ve sahne süsleri: hafif modda ve "Tema maskotu" kapalıyken yok
  if (window.kczMaskot) window.kczMaskot.uygula(ayarlar.tema || 'gri', ayarlar.maskot !== false, h);
  if (h) { try { vitrinGuncelle(); } catch { /* vitrin henüz kurulmadı */ } }
  if (h) document.querySelectorAll('.model3d').forEach((m) => {
    m.classList.remove('takip'); delete m.dataset.emote;
    m.style.setProperty('--bx', '0deg'); m.style.setProperty('--by', '0deg');
  });
}

function temaUygula() {
  const t = TEMALAR[ayarlar.tema] || TEMALAR.gri;
  const v = ayarlar.vurgu || t.v;
  document.body.dataset.tema = ayarlar.tema || 'gri';
  // Performans teması: saydamlık ve efektler kapalı (en az işlemci ve ekran kartı kullanımı)
  document.body.dataset.saydam = ayarlar.tema === 'performans' ? '0' : String(ayarlar.saydamlik ?? 1);
  hafifUygula();
  const kok = document.documentElement.style;
  kok.setProperty('--v', v);
  kok.setProperty('--v2', v.toLowerCase() === t.v ? t.v2 : kaydir(v, 50));
  kok.setProperty('--vy', acikMi(v) ? '#0b0d10' : '#ffffff');
  temaPaneliCiz();
}

let temaKayit = null;
let temaBekleyen = {};
function temaKaydet(degisim) {
  Object.assign(ayarlar, degisim);
  Object.assign(temaBekleyen, degisim);
  temaUygula();
  clearTimeout(temaKayit);
  temaKayit = setTimeout(async () => {
    const giden = temaBekleyen;
    temaBekleyen = {};
    const a = await api.ayarlariKaydet(giden);
    ayarlar = { ...a, ...temaBekleyen };
  }, 200);
}

function temaPaneliCiz() {
  const tk = $('temalar');
  if (!tk.children.length) {
    for (const [id, t] of Object.entries(TEMALAR)) {
      const b = el('button', 'tema');
      b.dataset.tema = id;
      const on = el('span', 'tema-onizleme');
      on.append(el('i'), el('u'));
      const m = window.kczMaskot && window.kczMaskot.onizleme(id);
      if (m) {
        const s = el('span', 'tema-maskot');
        s.innerHTML = m;
        on.append(s);
      }
      b.append(on, el('b', '', t.ad), el('small', '', t.alt));
      b.addEventListener('click', () => {
        if (id === 'sade' && ayarlar.tema !== 'sade') try { localStorage.setItem('sadeOncekiTema', ayarlar.tema || 'gri'); } catch { /* yok */ }
        temaKaydet({ tema: id, vurgu: t.v });
      });
      tk.append(b);
    }
    for (const [ad, h] of RENKLER) {
      const b = el('button', 'renk');
      b.title = ad;
      b.setAttribute('aria-label', ad);
      b.dataset.renk = h;
      b.style.background = h;
      b.addEventListener('click', () => temaKaydet({ vurgu: h }));
      $('renkler').append(b);
    }
    SAYDAMLIK.forEach(([ad], i) => {
      const b = el('button', 'saydam-btn');
      b.dataset.s = i;
      b.append(el('i'), document.createTextNode(ad));
      b.addEventListener('click', () => temaKaydet({ saydamlik: i }));
      $('saydamlar').append(b);
    });
    $('ozelRenk').addEventListener('input', (e) => temaKaydet({ vurgu: e.target.value }));
    $('maskotSec').addEventListener('change', (e) => temaKaydet({ maskot: e.target.checked }));
    // Performans > Sade görünüm: açınca Sade tema, kapatınca önceki tema (bu bilgisayarda hatırlanır)
    $('sadeSec').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (ayarlar.tema !== 'sade') try { localStorage.setItem('sadeOncekiTema', ayarlar.tema || 'gri'); } catch { /* yok */ }
        temaKaydet({ tema: 'sade', vurgu: TEMALAR.sade.v });
      } else {
        let onceki = 'gri';
        try { onceki = localStorage.getItem('sadeOncekiTema') || 'gri'; } catch { /* yok */ }
        if (!TEMALAR[onceki] || onceki === 'sade') onceki = 'gri';
        temaKaydet({ tema: onceki, vurgu: TEMALAR[onceki].v });
      }
    });
  }
  $('maskotSec').checked = ayarlar.maskot !== false;
  $('sadeSec').checked = ayarlar.tema === 'sade';
  document.querySelectorAll('.tema').forEach((b) => b.classList.toggle('aktif', b.dataset.tema === ayarlar.tema));
  document.querySelectorAll('.renk').forEach((b) => b.classList.toggle('secili', b.dataset.renk === ayarlar.vurgu));
  document.querySelectorAll('.saydam-btn').forEach((b) => b.classList.toggle('aktif', Number(b.dataset.s) === ayarlar.saydamlik));
  $('ozelRenk').value = ayarlar.vurgu || '#a1a1aa';
  yaz('renkKodu', ayarlar.vurgu || '');
  yaz('saydamAciklama', (SAYDAMLIK[ayarlar.saydamlik] || SAYDAMLIK[1])[1]);
}

/* =========================================================
   AYARLAR: soldaki kategoriler ve arama
   ========================================================= */
let ayarBolumu = 'gorunum';
function ayarBolumAc(ad) {
  ayarBolumu = ad;
  document.querySelectorAll('.ayar-kategori').forEach((b) => b.classList.toggle('aktif', b.dataset.bolum === ad));
  document.querySelectorAll('.ayar-bolum').forEach((b) => b.classList.toggle('aktif', b.dataset.bolum === ad));
  $('ayarIcerik').scrollTop = 0;
}
// Türkçe harflere duyarsız arama: "kosma" yazınca "Koşmayı" da bulunur
const aramaSade = (s) => String(s || '').toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/\s+/g, ' ');
function ayarAra(metin) {
  const q = aramaSade(metin).trim();
  const ic = $('ayarIcerik');
  ic.classList.toggle('araniyor', !!q);
  $('ayarMenu').classList.toggle('araniyor', !!q);
  let toplam = 0;
  document.querySelectorAll('.ayar-bolum').forEach((bolum) => {
    let say = 0;
    bolum.querySelectorAll('.ayar-kart, [data-ara], details.kayit').forEach((k) => {
      if (k.parentElement.closest('.ayar-kart')) return;
      const uy = !q || q.split(' ').every((p) => aramaSade((k.dataset.ara || '') + ' ' + k.textContent).includes(p));
      k.classList.toggle('ara-gizli', !uy);
      if (uy && !k.hidden) say++;
    });
    bolum.querySelectorAll('.ayar-grup').forEach((g) => {
      g.classList.toggle('ara-gizli', ![...g.children].some((c) => !c.classList.contains('ara-gizli') && !c.hidden));
    });
    bolum.querySelectorAll('.alt-baslik').forEach((h) => {
      const sonraki = h.nextElementSibling;
      h.classList.toggle('ara-gizli', !!q && !(sonraki && !sonraki.classList.contains('ara-gizli')));
    });
    bolum.classList.toggle('ara-gizli', !!q && say === 0);
    const kat = document.querySelector(`.ayar-kategori[data-bolum="${bolum.dataset.bolum}"]`);
    if (kat) kat.classList.toggle('eslesti', !!q && say > 0);
    toplam += say;
  });
  $('ayarBos').hidden = !q || toplam > 0;
  if (!q) ayarBolumAc(ayarBolumu);
  else ic.scrollTop = 0;
}
document.querySelectorAll('.ayar-kategori').forEach((b) => b.addEventListener('click', () => {
  if ($('ayarAra').value) { $('ayarAra').value = ''; ayarAra(''); }
  ayarBolumAc(b.dataset.bolum);
}));
$('ayarAra').addEventListener('input', (e) => ayarAra(e.target.value));
$('ayarAra').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; ayarAra(''); }
});
// Ayarlar açıkken Ctrl+F ya da / aramaya götürür
document.addEventListener('keydown', (e) => {
  if (!$('sayfa-ayarlar').classList.contains('aktif')) return;
  if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) {
    e.preventDefault();
    $('ayarAra').focus();
    $('ayarAra').select();
  }
});

/* =========================================================
   SADE TEMA: OYNA'nın altındaki sunucu yazısına tıklayınca küçük sunucu listesi
   ========================================================= */
$('oynaAlt').addEventListener('click', (e) => {
  if (document.body.dataset.tema !== 'sade') return;
  e.stopPropagation();
  document.body.classList.toggle('sade-liste');
});
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('sade-liste')) return;
  // Sekmeler (Profiller/Sunucular/Arkadaşlar) ve formlar arasında gezinirken açık kalsın
  if (e.target.closest('.yan-baslik, .sunucu-form, #oynaAlt')) return;
  const listede = e.target.closest('.sunucular');
  if (listede && e.target.closest('button, input, .sunucu-ekle, .sk-ekle')) return;
  setTimeout(() => document.body.classList.remove('sade-liste'), listede ? 160 : 0);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('sade-liste')) document.body.classList.remove('sade-liste');
});

/* =========================================================
   SEKMELER
   ========================================================= */
function sayfaAc(ad) {
  document.body.dataset.sayfa = ad;
  document.body.classList.remove('sade-liste');
  document.querySelectorAll('.sekme').forEach((x) => x.classList.toggle('aktif', x.dataset.sayfa === ad));
  document.querySelectorAll('.sayfa').forEach((s) => s.classList.toggle('aktif', s.id === 'sayfa-' + ad));
  if (ad === 'surumler') surumListesiCiz();
  if (ad === 'modlar') modSayfasiAc();
  if (ad === 'yonetim') panelYukle();
  if (ad === 'galeri') galeriYukle(); else if (typeof galeriTemizle === 'function') galeriTemizle();
  if (ad === 'bildir') setTimeout(() => $('bildirMetin').focus(), 50);
  acilirKapat();
}
document.querySelectorAll('.sekme').forEach((b) => b.addEventListener('click', () => sayfaAc(b.dataset.sayfa)));

/* =========================================================
   HESAP
   ========================================================= */
function hesabiGoster(d) {
  const once = girisli;
  girisli = !!(d && d.girisli);
  hesapAdi = girisli ? d.ad || 'Oyuncu' : '';
  if (girisli) {
    yaz('hesapAd', hesapAdi);
    yaz('hesapTur', 'Microsoft hesabı · hesap değiştir');
    setTimeout(() => { kimlikGoster(''); kimlikYukle(); }, 0);
    $('hesapBtn').title = 'Hesaplar';
    yaz('hesapHarf', hesapAdi[0].toUpperCase());
    if (d.uuid) {
      const img = $('hesapAvatar');
      img.onload = () => { img.hidden = false; $('hesapHarf').hidden = true; };
      img.onerror = () => { img.hidden = true; $('hesapHarf').hidden = false; };
      kafaKoy(img, d.uuid);
    }
  } else {
    const kaydedilenAd = localStorage.getItem('kcz_cevrimdisi_ad') || '';
    yaz('hesapAd', kaydedilenAd || 'Giriş yapılmadı');
    yaz('hesapTur', kaydedilenAd ? 'Çevrimdışı Mod · Oyna\'ya bas' : 'Ad gir veya Microsoft ile giriş yap');
    $('hesapBtn').title = 'Giriş yap';
    $('hesapAvatar').hidden = true;
    $('hesapHarf').hidden = false;
    yaz('hesapHarf', kaydedilenAd ? kaydedilenAd[0].toUpperCase() : '?');
    $('cevrimdisiPanel').hidden = false;
    $('cevrimdisiPanel').style.display = 'flex';
    $('cevrimdisiAdInput').value = kaydedilenAd;
  }
  if ($('cevrimdisiPanel') && girisli) { $('cevrimdisiPanel').hidden = true; $('cevrimdisiPanel').style.display = 'none'; }
  if (once !== girisli) skinleriYukle();
  oynaGuncelle();
}

function girisEkrani(adim) {
  $('girisSecim').hidden = adim !== 'secim';
  $('girisKod').hidden = adim !== 'kod';
}
function perdeyiAc() {
  girisEkrani('secim');
  yaz('girisHata', '');
  $('girisPerde').hidden = false;
}
function girisSonucu(d) {
  if (d.girisli) {
    $('girisPerde').hidden = true;
    bildirim(`Giriş yapıldı: ${d.ad}`);
    if (girisli) setTimeout(() => skinleriYukle(), 300); // başka hesap eklendiyse skinleri yenile
  } else {
    girisEkrani('secim');
    if (d.hata) yaz('girisHata', d.hata);
  }
  hesabiGoster(d);
}

let tarayiciAdresi = null;
$('girisTarayiciBtn').addEventListener('click', async () => {
  const btn = $('girisTarayiciBtn');
  btn.disabled = true;
  btn.textContent = 'Hazırlanıyor…';
  yaz('girisHata', '');
  const r = await api.tarayiciGirisBaslat();
  btn.disabled = false;
  btn.textContent = 'Tarayıcıyla giriş yap';
  if (!r.ok) { yaz('girisHata', r.hata); return; }
  tarayiciAdresi = r.adres;
  yaz('kodYazi', r.kod);
  girisEkrani('kod');
});
api.girisSonucuDinle(girisSonucu);
$('kodKopyala').addEventListener('click', async () => {
  await api.panoyaYaz($('kodYazi').textContent);
  yaz('kodKopyala', 'Kopyalandı ✓');
  setTimeout(() => yaz('kodKopyala', 'Kodu kopyala'), 1500);
});
$('tarayiciTekrarBtn').addEventListener('click', () => { if (tarayiciAdresi) api.tarayiciAc(tarayiciAdresi); });
$('kodIptalBtn').addEventListener('click', () => { api.tarayiciGirisIptal(); girisEkrani('secim'); });
$('girisBtn').addEventListener('click', async () => {
  const btn = $('girisBtn');
  btn.disabled = true;
  btn.textContent = 'Giriş penceresi açık…';
  yaz('girisHata', '');
  const d = await api.girisYap();
  btn.disabled = false;
  btn.textContent = 'Bunun yerine launcher penceresinde giriş yap';
  girisSonucu(d);
});
$('gecBtn').addEventListener('click', () => { $('girisPerde').hidden = true; });

/* ---------- Çevrimdışı giriş ---------- */
$('cevrimdisiBtn').addEventListener('click', async () => {
  const ad = $('cevrimdisiAd').value.trim();
  if (!ad) { yaz('girisHata', 'Kullanıcı adı gir.'); return; }
  const btn = $('cevrimdisiBtn');
  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';
  yaz('girisHata', '');
  localStorage.setItem('kcz_cevrimdisi_ad', ad);
  const d = await api.cevrimdisiGiris(ad);
  btn.disabled = false;
  btn.textContent = 'Çevrimdışı Oyna';
  girisSonucu(d);
});
$('cevrimdisiAd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('cevrimdisiBtn').click();
});

// Alt paneldeki çevrimdışı ad kaydetme
$('cevrimdisiKaydetBtn').addEventListener('click', () => {
  const ad = $('cevrimdisiAdInput').value.trim();
  if (!ad) { bildirim('Kullanıcı adı gir.'); return; }
  if (ad.length < 3 || ad.length > 16 || !/^[a-zA-Z0-9_]+$/.test(ad)) {
    bildirim('Ad 3-16 karakter, sadece harf, rakam ve _ olmalı.');
    return;
  }
  localStorage.setItem('kcz_cevrimdisi_ad', ad);
  yaz('hesapAd', ad);
  yaz('hesapHarf', ad[0].toUpperCase());
  yaz('hesapTur', 'Çevrimdışı Mod · Oyna\'ya bas');
  bildirim('Çevrimdışı ad kaydedildi: ' + ad);
  oynaGuncelle();
});
$('cevrimdisiAdInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('cevrimdisiKaydetBtn').click();
});

/* ---------- Birden fazla hesap ---------- */
async function hesapMenusuCiz() {
  const d = await api.hesapListesi();
  const k = $('hesapListe');
  k.textContent = '';
  (d.liste || []).forEach((h) => {
    const aktif = h.uuid === d.aktif && girisli;
    const s = el('div', 'hesap-satir' + (aktif ? ' aktif' : ''));
    const img = el('img', 'avatar');
    kafaKoy(img, h.uuid);
    img.alt = '';
    const ad = el('b', '', h.ad);
    s.append(img, ad, el('small', '', aktif ? 'Açık' : 'Geç'));
    const sil = el('button', 'mini-ikon', '×');
    sil.title = 'Bu hesabı launcher\'dan kaldır';
    sil.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!sil.classList.contains('emin')) { sil.classList.add('emin'); sil.textContent = '?'; sil.title = 'Kaldırmak için tekrar bas'; return; }
      hesabiGoster(await api.hesapUnut(h.uuid));
      bildirim(`${h.ad} launcher'dan kaldırıldı.`);
      hesapMenusuCiz();
    });
    s.append(sil);
    s.addEventListener('click', async () => {
      if (aktif) return;
      s.classList.add('bekliyor');
      const r = await api.hesapGec(h.uuid);
      hesabiGoster(r);
      if (r.girisli) { bildirim(`${r.ad} hesabına geçildi.`); $('hesapMenu').hidden = true; skinleriYukle(); }
      else { bildirim(r.hata || 'Hesaba geçilemedi, tekrar giriş yap.', true); hesapMenusuCiz(); }
    });
    k.append(s);
  });
}
$('hesapBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  const liste = await api.hesapListesi();
  // Hiç kayıtlı hesap yoksa doğrudan giriş
  if (!girisli && !(liste.liste || []).length) { perdeyiAc(); return; }
  const m = $('hesapMenu');
  m.hidden = !m.hidden;
  if (!m.hidden) hesapMenusuCiz();
});
$('hesapMenu').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { $('hesapMenu').hidden = true; });
$('hesapEkle').addEventListener('click', () => { $('hesapMenu').hidden = true; perdeyiAc(); });

/* =========================================================
   SUNUCULAR (oyunda eklenenler) ve sol kartlar
   ========================================================= */
// Alttaki OYNA butonu
const oynaRef = { btn: $('oynaBtn'), dolgu: $('oynaDolgu'), yazi: $('oynaYazi'), alt: $('oynaAlt') };

function seciliSunucu() {
  return sunucular.find((s) => s.adres === ayarlar.seciliSunucu) || sunucular[0] || null;
}
function seciliProfil() {
  return (ayarlar.profiller || []).find((p) => p.id === ayarlar.seciliProfil) || null;
}
// OYNA neyi açacak: seçili profil mi, seçili sunucu mu
function profilAktif() {
  return ayarlar.aktifSecim === 'profil' && !!seciliProfil();
}

// Kart: "Sunucu ekle" satırı gibi sade tek satır. Tıklayınca sadece seçilir; oyunu alttaki OYNA açar.
function sunucuKarti(s, sira, secili) {
  const d = s.veri;
  const kart = el('div', 'sk' + (secili ? ' secili' : '') + (d ? (d.durum === 'acik' ? ' acik' : ' kapali') : ''));
  kart.style.setProperty('--sira', sira);
  kart.setAttribute('role', 'button');
  kart.setAttribute('aria-label', `${s.ad} sunucusunu seç`);
  kart.title = d && d.durum === 'acik' && d.motd ? d.motd : s.adres;

  const ikonKap = el('span', 'sk-ikon-kap');
  const ikon = el('img', 'sk-ikon');
  ikon.alt = '';
  ikon.src = (d && d.ikon) || s.ikon || 'logo.svg';
  ikonKap.append(ikon, el('span', 'sk-nokta'));
  const bilgi = el('span', 'sk-bilgi');
  const durumYazi = !d ? 'Bakılıyor…' : d.durum === 'acik' ? `${d.oyuncu}/${d.maks} oyuncu · ${d.gecikme} ms` : 'Kapalı';
  bilgi.append(el('b', '', s.ad), el('small', 'sk-durum', durumYazi));
  kart.append(ikonKap, bilgi);

  const sp = ayarlar.sunucuProfilleri && ayarlar.sunucuProfilleri[s.adres];
  const modSay = sunucuModlari[s.adres] || 0;
  const mod = el('button', 'sk-mod' + (sp ? ' var' : ''));
  mod.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6l-2 2-2-2-6 6 2 2-2 2-6-6 2-2 2 2 6-6-2-2z"/></svg>';
  if (sp && modSay) mod.append(document.createTextNode(String(modSay)));
  mod.title = sp ? `${s.ad} sunucusuna özel modlar (${sp.surum} · ${YUK_AD[sp.yukleyici]})` : `${s.ad} sunucusuna özel mod kur`;
  mod.addEventListener('click', (e) => { e.stopPropagation(); sunucuModlariniAc(s); });
  kart.append(mod);

  // Masaüstü kısayolu: tek tıkla bu sunucuya bağlan
  const kis = el('button', 'sk-kisayol');
  kis.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  kis.title = 'Masaüstüne kısayol: tek tıkla bu sunucuya bağlan';
  kis.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await api.kisayolOlustur(s.adres, s.ad);
    if (r.ok) bildirim(`Masaüstüne "${r.veri}" kısayolu eklendi. Tıklayınca launcher açılmadan ${s.ad} sunucusuna bağlanırsın.`);
    else bildirim(r.hata, true);
  });
  kart.append(kis);

  const sil = el('button', 'sk-sil');
  sil.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  sil.title = 'Listeden kaldır';
  sil.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!sil.classList.contains('emin')) {
      sil.classList.add('emin');
      sil.textContent = 'Sil?';
      setTimeout(() => { sil.classList.remove('emin'); sil.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'; }, 3000);
      return;
    }
    const r = await api.sunucuSil(s.adres);
    if (!r.ok) bildirim(r.hata, true);
    else { bildirim(`${s.ad} listeden kaldırıldı.`); sunuculariYukle(); }
  });
  kart.append(sil);
  if (!secili) kart.addEventListener('click', () => sunucuSec(s.adres));
  return kart;
}

function sunuculariCiz() {
  const kap = $('sunucular');
  const sec = seciliSunucu();
  kap.innerHTML = '';
  sunucular.forEach((s, i) => kap.append(sunucuKarti(s, i, !profilAktif() && s === sec)));
  if (!sunucular.length) kap.append(el('div', 'bos-yazi', 'Henüz sunucu yok. Aşağıdan ekleyebilirsin; OYNA oyunu ana menüde açar.'));
  const ekle = el('button', 'sk-ekle');
  const yazi = el('span');
  yazi.append(document.createTextNode('Sunucu ekle'), el('small', '', 'Adını ve adresini yaz'));
  ekle.append(el('span', 'arti', '+'), yazi);
  ekle.addEventListener('click', (e) => { e.stopPropagation(); sunucuFormuAc(); });
  kap.append(ekle);
  yaz('sunucuSayac', sunucular.length);
  requestAnimationFrame(() => setTimeout(() => kap.classList.add('sakin'), 700));
  $('surumSatir').textContent = `${ayarlar.mcSurum} · ${YUK_AD[ayarlar.yukleyici] || ''} ▾`;
  profilleriCiz();
  oynaGuncelle();
  sahneBilgisi();
  ozetCiz();
}

/* =========================================================
   PROFİLLER (kaydedilmiş sürümler: Vanilla, Fabric, Forge…)
   ========================================================= */
function profilAltYazi(p) {
  const n = sunucuModlari['profil:' + p.id] || 0;
  return `${p.surum} · ${YUK_AD[p.yukleyici]}${p.yukleyici !== 'vanilla' ? ` · ${n} mod` : ''}`;
}

function profilKarti(p, sira, secili) {
  const kart = el('div', 'sk' + (secili ? ' secili' : ''));
  kart.style.setProperty('--sira', sira);
  kart.setAttribute('role', 'button');
  kart.setAttribute('aria-label', `${p.ad} profilini seç`);
  const ikon = el('span', 'pk-ikon');
  ikon.innerHTML = Ikonlar.svg(p.ikon);
  const bilgi = el('span', 'sk-bilgi');
  bilgi.append(el('b', '', p.ad), el('small', 'sk-durum', profilAltYazi(p)));
  kart.append(ikon, bilgi);
  if (p.yukleyici !== 'vanilla') {
    const n = sunucuModlari['profil:' + p.id] || 0;
    const mod = el('button', 'sk-mod var');
    mod.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6l-2 2-2-2-6 6 2 2-2 2-6-6 2-2 2 2 6-6-2-2z"/></svg>';
    if (n) mod.append(document.createTextNode(String(n)));
    mod.title = `${p.ad} profilinin modları`;
    mod.addEventListener('click', (e) => { e.stopPropagation(); profilModlariniAc(p); });
    kart.append(mod);
  }
  const duz = el('button', 'sk-duzenle');
  duz.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>';
  duz.title = 'Düzenle';
  duz.addEventListener('click', (e) => { e.stopPropagation(); profilFormuAc(p); });
  kart.append(duz);
  if (!secili) kart.addEventListener('click', () => profilSec(p.id));
  return kart;
}

function profilleriCiz() {
  const kap = $('profiller');
  kap.innerHTML = '';
  const liste = ayarlar.profiller || [];
  const sec = profilAktif() ? seciliProfil() : null;
  liste.forEach((p, i) => kap.append(profilKarti(p, i, sec && sec.id === p.id)));
  if (!liste.length) kap.append(el('div', 'bos-yazi', 'İstediğin sürümü kaydet: Vanilla, Fabric, Forge… Seçip OYNA\'ya basınca o sürüm açılır.'));
  const ekle = el('button', 'sk-ekle');
  const yazi = el('span');
  yazi.append(document.createTextNode('Profil ekle'), el('small', '', 'Sürüm, yükleyici ve ikon seç'));
  ekle.append(el('span', 'arti', '+'), yazi);
  ekle.addEventListener('click', (e) => { e.stopPropagation(); profilFormuAc(null); });
  kap.append(ekle);
  yaz('profilSayac', liste.length);
  requestAnimationFrame(() => setTimeout(() => kap.classList.add('sakin'), 700));
}

async function profilSec(id) {
  ayarlar.seciliProfil = id;
  ayarlar.aktifSecim = 'profil';
  sunuculariCiz();
  ayarlar = await api.ayarlariKaydet({ seciliProfil: id, aktifSecim: 'profil' });
}

function solSekmeAc(ad, kaydet = true) {
  ayarlar.solSekme = ad;
  document.querySelectorAll('#solSekmeler button').forEach((b) => b.classList.toggle('aktif', b.dataset.sol === ad));
  $('sunucular').hidden = ad !== 'sunucu';
  $('profiller').hidden = ad !== 'profil';
  $('arkadaslar').hidden = ad !== 'arkadas';
  if (ad === 'arkadas') arkadaslariYukle();
  $('yenileBtn').hidden = ad === 'profil';
  if (kaydet) api.ayarlariKaydet({ solSekme: ad });
}
document.querySelectorAll('#solSekmeler button').forEach((b) => b.addEventListener('click', () => solSekmeAc(b.dataset.sol)));

/* ---------- Masaüstü kısayolu ile açılış ---------- */
// Launcher gizli açılır; sunucu listesi ve hesap hazır olunca seçili sunucuya bağlanır.
// Bir sorun olursa (giriş yok, sunucu listede yok, oyun açılamadı) pencere gösterilir.
async function kisayolOyna(adres) {
  for (let i = 0; i < 40 && !sunucular.length; i++) await bekle(250);
  const s = sunucular.find((x) => x.adres === adres) || sunucular.find((x) => x.adres.split(':')[0] === adres.split(':')[0]);
  const goster = (mesaj) => { api.pencereyiGoster(); if (mesaj) bildirim(mesaj, true); };
  if (oyunDurumu === 'acik') { bildirim('Oyun zaten açık.'); return; }
  if (!s) { goster(`Kısayoldaki sunucu (${adres}) listende yok. Önce sunucuyu ekle.`); return; }
  if (!girisli) { goster(); perdeyiAc(); return; }
  await sunucuSec(s.adres);
  $('oynaBtn').click();
  // Oyun açılmazsa pencereyi göster (indirme sürüyorsa bekler)
  const izle = setInterval(() => {
    if (oyunDurumu === 'acik') { clearInterval(izle); return; }
    if (!is) { clearInterval(izle); goster(sonHata || 'Oyun açılamadı.'); }
  }, 3000);
}
api.kisayolDinle((adres) => kisayolOyna(adres));
setTimeout(async () => {
  const a = await api.kisayolBekleyen();
  if (a) kisayolOyna(a);
}, 1500);

/* ---------- Arkadaşlar: kim çevrimiçi, hangi sunucuda ---------- */
function zamanOnce(t) {
  if (!t) return '';
  const dk = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (dk < 60) return `${Math.max(1, dk)} dk önce`;
  const sa = Math.round(dk / 60);
  if (sa < 24) return `${sa} saat önce`;
  return `${Math.round(sa / 24)} gün önce`;
}
/* Arkadaşlar: 6 haneli ID ile istek; kabul edilince iki taraf da birbirini görür.
   Eskiden ada göre eklenenler de altta görünmeye devam eder. */
let benimKod = '';
function kimlikGoster(kod) {
  benimKod = kod || '';
  $('benimIdKutu').hidden = !benimKod;
  yaz('benimId', benimKod);
  if (girisli) yaz('hesapTur', benimKod ? `ID: ${benimKod} · hesap değiştir` : 'Microsoft hesabı · hesap değiştir');
}
async function kimlikYukle() {
  if (!girisli) { kimlikGoster(''); return; }
  try { const r = await api.kimlikKodu(); kimlikGoster(r.ok ? r.veri : ''); } catch { /* sunucu yok */ }
}
$('benimIdKopyala').addEventListener('click', async () => {
  if (!benimKod) return;
  try { await navigator.clipboard.writeText(benimKod); bildirim(`ID kopyalandı: ${benimKod}`); } catch { bildirim(benimKod); }
});

function arkSatir(a, sinif, durum, sag) {
  const s = el('div', 'ark ' + sinif);
  const kap = el('span', 'ark-ikon-kap');
  const img = el('img', 'ark-ikon');
  img.alt = '';
  kafaKoy(img, a.mc_uuid || a.uuid || a.ad);
  kap.append(img, el('i', 'ark-nokta'));
  const bilgi = el('span', 'ark-bilgi');
  bilgi.append(el('b', '', a.ad || 'Oyuncu'), el('small', '', durum));
  s.append(kap, bilgi);
  if (sag) s.append(sag);
  return s;
}
function silDugmesi(baslik, isle, kalici) {
  const sil = el('button', 'mini-ikon' + (kalici ? ' kalici' : ''), '×');
  sil.title = baslik;
  sil.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!sil.classList.contains('emin')) { sil.classList.add('emin'); sil.textContent = '?'; return; }
    sil.disabled = true;
    await isle();
    arkadaslariYukle();
  });
  return sil;
}
function arkDurum(a) {
  return a.oyunda ? (a.sunucu ? `Oyunda · ${a.sunucu}` : 'Oyunda')
    : a.cevrimici ? 'Launcher açık'
    : a.son ? `Çevrimdışı · ${zamanOnce(a.son)}` : 'Çevrimdışı';
}

let arkYukleniyor = false;
let arkIlk = true;
const arkOnceki = { gelen: new Set(), okunmamis: new Map(), oyunda: new Map() };
let arkSon = []; // son arkadaş listesi (sohbet paneli de kullanır)

function sunucuAdi(adres) {
  const s = sunucular.find((x) => x.adres === adres);
  return s ? s.ad : adres;
}

/** Arkadaşın sunucusuna katıl: listede yoksa önce eklenir, sonra oyun o sunucuya bağlanarak açılır */
async function sunucuyaKatil(adres) {
  if (!adres) return;
  if (oyunDurumu === 'acik') { bildirim('Oyun zaten açık.'); return; }
  if (!sunucular.some((x) => x.adres === adres)) {
    const r = await api.sunucuEkle(adres.split(':')[0], adres);
    if (!r.ok && !/zaten/i.test(r.hata || '')) { bildirim(r.hata, true); return; }
    await sunuculariYukle();
  }
  bildirim(`${sunucuAdi(adres)} sunucusuna bağlanılıyor…`);
  kisayolOyna(adres);
}

async function arkadaslariYukle() {
  if (arkYukleniyor) return;
  arkYukleniyor = true;
  try {
    const [yeni, eski] = await Promise.all([
      girisli ? api.arkadasListesi().catch(() => null) : Promise.resolve(null),
      (ayarlar.arkadaslar || []).length ? api.arkadasDurumlari().catch(() => null) : Promise.resolve(null),
    ]);
    if (yeni && yeni.ok) kimlikGoster(yeni.veri.kod);
    const liste = yeni && yeni.ok && Array.isArray(yeni.veri.liste) ? yeni.veri.liste : [];
    const gelen = liste.filter((x) => x.tur === 'gelen');
    const giden = liste.filter((x) => x.tur === 'giden');
    const arkadas = liste.filter((x) => x.tur === 'arkadas')
      .sort((a, b) => (Number(b.okunmamis) - Number(a.okunmamis)) || (b.oyunda - a.oyunda) || (b.cevrimici - a.cevrimici)
        || String(a.ad).localeCompare(String(b.ad)));
    arkSon = arkadas;
    const yeniAdlar = new Set(arkadas.map((x) => String(x.ad).toLowerCase()));
    const eskiler = (eski && eski.ok && Array.isArray(eski.veri) ? eski.veri : [])
      .filter((x) => !yeniAdlar.has(String(x.ad).toLowerCase()));

    // Yeni istek ve mesajları bildir (ilk yüklemede değil)
    if (!arkIlk) {
      gelen.filter((x) => !arkOnceki.gelen.has(x.mc_uuid)).forEach((x) => bildirim(`${x.ad} sana arkadaşlık isteği gönderdi.`));
      arkadas.forEach((x) => {
        const n = Number(x.okunmamis) || 0;
        const acik = sohbetKim && sohbetKim.mc_uuid === x.mc_uuid && !$('sohbet').hidden;
        if (n > (arkOnceki.okunmamis.get(x.mc_uuid) || 0) && !acik) bildirim(`${x.ad} sana mesaj gönderdi.`);
      });
    }
    // Arkadaş oyuna girdi
    if (!arkIlk && (ayarlar.istemci || {}).arkadasBildirim !== false) {
      arkadas.filter((x) => x.oyunda && arkOnceki.oyunda.get(x.mc_uuid) === false).forEach((x) =>
        bildirim(x.sunucu ? `${x.ad} oyuna girdi · ${sunucuAdi(x.sunucu)}` : `${x.ad} oyuna girdi`));
    }
    arkOnceki.oyunda = new Map(arkadas.map((x) => [x.mc_uuid, !!x.oyunda]));
    arkIlk = false;
    arkOnceki.gelen = new Set(gelen.map((x) => x.mc_uuid));
    arkOnceki.okunmamis = new Map(arkadas.map((x) => [x.mc_uuid, Number(x.okunmamis) || 0]));

    const k = $('arkadasListe');
    k.textContent = '';
    if (gelen.length) {
      k.append(el('div', 'ark-baslik', `Gelen istekler · ${gelen.length}`));
      gelen.forEach((a) => {
        const btn = el('span', 'ark-btnler');
        const kabul = el('button', 'ark-onay', '✓');
        const red = el('button', 'ark-red', '✕');
        kabul.title = 'Kabul et'; red.title = 'Reddet';
        const yanitla = async (e, evet) => {
          e.stopPropagation();
          kabul.disabled = red.disabled = true;
          const r = await api.arkadasIstekYanit(a.mc_uuid, evet);
          if (!r.ok) bildirim(r.hata, true); else if (evet) bildirim(`${a.ad} ile artık arkadaşsınız.`);
          arkadaslariYukle();
        };
        kabul.addEventListener('click', (e) => yanitla(e, true));
        red.addEventListener('click', (e) => yanitla(e, false));
        btn.append(kabul, red);
        k.append(arkSatir(a, 'istek', `ID ${a.kod} · seni eklemek istiyor`, btn));
      });
    }
    if (arkadas.length || eskiler.length) {
      const cevrimici = arkadas.filter((x) => x.cevrimici).length;
      k.append(el('div', 'ark-baslik', `Arkadaşlar · ${cevrimici}/${arkadas.length} çevrimiçi`));
    }
    arkadas.forEach((a) => {
      const sag = el('span', 'ark-btnler');
      if (a.oyunda && a.sunucu) {
        const katil = el('button', 'ark-katil', 'Katıl');
        katil.title = `${sunucuAdi(a.sunucu)} sunucusuna katıl`;
        katil.addEventListener('click', (e) => { e.stopPropagation(); sunucuyaKatil(a.sunucu); });
        sag.append(katil);
      }
      const n = Number(a.okunmamis) || 0;
      if (n) sag.append(el('span', 'ark-rozet', n > 9 ? '9+' : String(n)));
      const durum = a.oyunda && a.sunucu ? `Oyunda · ${sunucuAdi(a.sunucu)}` : arkDurum(a);
      const satir = arkSatir(a, (a.oyunda ? 'oyunda' : a.cevrimici ? 'cevrimici' : '')
        + (sohbetKim && sohbetKim.mc_uuid === a.mc_uuid && !$('sohbet').hidden ? ' secili' : ''), durum, sag);
      satir.title = 'Mesaj göndermek için tıkla';
      satir.addEventListener('click', () => sohbetAc(a));
      k.append(satir);
    });
    eskiler.forEach((a) => {
      const durum = a.oyunda || a.cevrimici ? arkDurum(a) : 'Ada göre eklendi · ID ile yeniden ekle';
      k.append(arkSatir(a, a.oyunda ? 'oyunda' : a.cevrimici ? 'cevrimici' : '', durum,
        silDugmesi('Listeden kaldır', () => api.arkadasSil(a.ad))));
    });
    if (giden.length) {
      k.append(el('div', 'ark-baslik', 'Gönderilen istekler'));
      giden.forEach((a) => k.append(arkSatir(a, 'istek', `ID ${a.kod} · kabul etmesi bekleniyor`,
        silDugmesi('İsteği geri al', () => api.arkadasCikar(a.mc_uuid), true))));
    }
    if (!k.childElementCount) {
      const bos = el('div', 'ark-bos');
      bos.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M17 8v6M14 11h6"/></svg>';
      bos.append(el('b', '', !girisli ? 'Giriş yapmadın' : yeni && !yeni.ok ? 'Arkadaşlar yüklenemedi' : 'Henüz arkadaşın yok'),
        el('span', '', !girisli ? 'Arkadaş eklemek için Microsoft hesabınla giriş yap.'
          : yeni && !yeni.ok ? yeni.hata : 'Arkadaşının 6 haneli ID\'sini yukarıya yazıp istek gönder.'));
      k.append(bos);
    }
    const okunmamis = arkadas.reduce((t, x) => t + (Number(x.okunmamis) || 0), 0);
    const cevrimiciSayi = arkadas.filter((x) => x.cevrimici).length + eskiler.filter((x) => x.cevrimici).length;
    const dikkat = gelen.length + okunmamis;
    const sayi = dikkat || cevrimiciSayi;
    yaz('arkadasSayac', String(sayi > 9 ? '9+' : sayi));
    $('arkadasSayac').classList.toggle('canli', sayi > 0);
    $('arkadasSayac').classList.toggle('istek-var', dikkat > 0);
    $('arkadasSayac').title = dikkat ? `${gelen.length} istek, ${okunmamis} okunmamış mesaj` : '';
    if (sohbetKim && !$('sohbet').hidden) sohbetUstGuncelle();
  } finally {
    arkYukleniyor = false;
  }
}


/* ---------- Profil ---------- */
let profilKim = null; // null: kendi profilim
function sureYazi(dk) {
  dk = Math.max(0, Math.round(Number(dk) || 0));
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  return sa < 100 ? `${sa} sa ${dk % 60} dk` : `${sa.toLocaleString('tr-TR')} sa`;
}
async function profilAc(uuid) {
  if (!girisli) { bildirim('Önce Microsoft hesabınla giriş yap.', true); return; }
  profilKim = uuid || null;
  const ben = !uuid;
  const p = $('profilPerde');
  p.classList.remove('oyunda', 'cevrimici');
  yaz('profilAd', ben ? hesapAdi : (arkSon.find((x) => x.mc_uuid === uuid) || {}).ad || 'Oyuncu');
  yaz('profilId', '——————'); yaz('profilDurum', 'Yükleniyor…'); yaz('profilHakkinda', '');
  ['profilToplam', 'profilHafta', 'profilArkadas', 'profilKatilma'].forEach((x) => yaz(x, '…'));
  $('profilDuzenle').hidden = !ben;
  $('profilHakkinda').hidden = ben;
  $('profilDugmeler').hidden = ben;
  $('profilHakkindaGirdi').value = '';
  $('profilKafa').removeAttribute('src');
  p.hidden = false;
  const r = await api.profilAl(uuid || null);
  if (profilKim !== (uuid || null) || p.hidden) return;
  if (!r.ok) { yaz('profilDurum', r.hata); return; }
  const d = r.veri;
  kafaKoy($('profilKafa'), d.mc_uuid);
  yaz('profilAd', d.ad || 'Oyuncu');
  yaz('profilId', d.kod || '');
  p.classList.toggle('oyunda', !!d.oyunda);
  p.classList.toggle('cevrimici', !d.oyunda && !!d.cevrimici);
  yaz('profilDurum', d.oyunda ? (d.sunucu ? `Oyunda · ${sunucuAdi(d.sunucu)}` : 'Oyunda')
    : d.cevrimici ? 'Launcher açık' : d.son ? `Son görülme: ${zamanOnce(d.son)}` : 'Çevrimdışı');
  if (ben) {
    $('profilHakkindaGirdi').value = d.hakkinda || '';
    yaz('profilSayac', `${(d.hakkinda || '').length}/120`);
  } else {
    yaz('profilHakkinda', d.hakkinda || 'Henüz bir şey yazmamış.');
    $('profilKatil').hidden = !(d.oyunda && d.sunucu);
    profilKim = d.mc_uuid;
    $('profilKatil').dataset.sunucu = d.sunucu || '';
  }
  yaz('profilToplam', sureYazi(d.toplam_dk));
  yaz('profilHafta', sureYazi(d.hafta_dk));
  yaz('profilArkadas', String(d.arkadas_sayisi ?? 0));
  yaz('profilKatilma', d.katilma ? new Date(d.katilma).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
}
function profilKapat() { $('profilPerde').hidden = true; profilKim = null; }
$('profilKapat').addEventListener('click', profilKapat);
$('profilPerde').addEventListener('click', (e) => { if (e.target === $('profilPerde')) profilKapat(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('profilPerde').hidden) profilKapat(); });
$('profilHakkindaGirdi').addEventListener('input', (e) => yaz('profilSayac', `${e.target.value.length}/120`));
$('profilKaydet').addEventListener('click', async () => {
  const b = $('profilKaydet');
  b.disabled = true;
  const r = await api.profilKaydet($('profilHakkindaGirdi').value);
  b.disabled = false;
  bildirim(r.ok ? 'Profilin kaydedildi ✓' : r.hata, !r.ok);
});
$('profilMesaj').addEventListener('click', () => {
  const a = arkSon.find((x) => x.mc_uuid === profilKim);
  profilKapat();
  if (a) { solSekmeAc('arkadas'); sohbetAc(a); }
});
$('profilKatil').addEventListener('click', () => { const s = $('profilKatil').dataset.sunucu; profilKapat(); sunucuyaKatil(s); });
$('profilDavet').addEventListener('click', () => davetEt(profilKim));
$('profilimBtn').addEventListener('click', () => { $('hesapMenu').hidden = true; profilAc(null); });

/* ---------- Sunucuya davet ---------- */
async function davetEt(uuid) {
  if (!uuid) return;
  const sunucu = ayarlar.seciliSunucu;
  if (!sunucu) { bildirim('Önce soldan bir sunucu seç, arkadaşın oraya çağrılır.', true); return; }
  const r = await api.davetGonder(uuid, sunucu);
  const a = arkSon.find((x) => x.mc_uuid === uuid);
  bildirim(r.ok ? `${a ? a.ad : 'Arkadaşın'} ${sunucuAdi(r.veri)} sunucusuna davet edildi.` : r.hata, !r.ok);
}
let davetSira = [];
function davetGoster() {
  const d = davetSira[0];
  if (!d) { $('davetKutu').hidden = true; return; }
  kafaKoy($('davetKafa'), d.gonderen);
  yaz('davetAd', d.ad);
  yaz('davetSunucu', `seni ${sunucuAdi(d.sunucu)} sunucusuna çağırıyor`);
  $('davetKutu').hidden = false;
}
$('davetKatil').addEventListener('click', () => { const d = davetSira.shift(); davetGoster(); if (d) sunucuyaKatil(d.sunucu); });
$('davetKapat').addEventListener('click', () => { davetSira.shift(); davetGoster(); });
async function davetleriKontrol() {
  if (!girisli || oyunDurumu === 'acik') return;
  try {
    const r = await api.davetleriAl();
    if (!r.ok || !Array.isArray(r.veri) || !r.veri.length) return;
    davetSira.push(...r.veri);
    davetGoster();
    try { api.pencereyiGoster(); } catch { /* yok */ }
  } catch { /* sunucu yok */ }
}

/* ---------- Sohbet ---------- */
let sohbetKim = null;
let sohbetSonId = 0;
let sohbetSonGun = '';
let sohbetZaman = null;
let sohbetYukleniyor = false;

function gunAdi(t) {
  const g = new Date(t); const b = new Date();
  const ayni = (x, y) => x.toDateString() === y.toDateString();
  if (ayni(g, b)) return 'Bugün';
  const d = new Date(b); d.setDate(b.getDate() - 1);
  if (ayni(g, d)) return 'Dün';
  return g.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
function sohbetUstGuncelle() {
  const guncel = arkSon.find((x) => x.mc_uuid === sohbetKim.mc_uuid);
  if (guncel) sohbetKim = guncel;
  const a = sohbetKim;
  yaz('sohbetAd', a.ad || 'Oyuncu');
  yaz('sohbetDurum', a.oyunda && a.sunucu ? `Oyunda · ${sunucuAdi(a.sunucu)}` : arkDurum(a));
  $('sohbet').classList.toggle('oyunda', !!a.oyunda);
  $('sohbet').classList.toggle('cevrimici', !a.oyunda && !!a.cevrimici);
  $('sohbetKatil').hidden = !(a.oyunda && a.sunucu);
}
/* ---------- Konumlu anı (fotoğraf) ---------- */
const fotoOnbellek = new Map(); // id -> Promise<{resim, bilgi}>
function fotoIdBul(metin) { const e = /^\[foto:(\d+)\]$/.exec(metin || ''); return e ? Number(e[1]) : 0; }
function fotoGetir(id) {
  if (!fotoOnbellek.has(id)) {
    const p = api.fotoAl(id).then((r) => { if (!r.ok) { fotoOnbellek.delete(id); throw new Error(r.hata); } return r.veri; });
    fotoOnbellek.set(id, p);
  }
  return fotoOnbellek.get(id);
}
function boyutAdi(b) {
  return ({ 'minecraft:overworld': 'Overworld', 'minecraft:the_nether': 'Nether', 'minecraft:the_end': 'End' })[b] || (b || '').replace(/^.*:/, '');
}
function konumYazi(b) {
  if (!b || b.x == null) return '';
  const s = `X ${b.x} · Y ${b.y} · Z ${b.z}` + (b.boyut ? ` · ${boyutAdi(b.boyut)}` : '');
  return s + (b.sunucu ? ` · ${sunucuAdi(b.sunucu)}` : ' · tek oyunculu');
}
let fotoAcik = null;
async function fotoAc(id, kimin) {
  let v;
  try { v = await fotoGetir(id); } catch (e) { bildirim(e.message || 'Fotoğraf açılamadı.', true); return; }
  const b = v.bilgi || {};
  fotoAcik = b;
  $('fotoResim').src = v.resim;
  yaz('fotoBaslik', b.benden ? 'Senin gönderdiğin' : `${kimin || 'Arkadaşının'} anısı`);
  yaz('fotoNot', b.not ? `“${b.not}”` : '');
  yaz('fotoKonum', konumYazi(b) || 'Konum eklenmemiş');
  $('fotoKoordinat').hidden = b.x == null;
  $('fotoKatil').hidden = !b.sunucu;
  $('fotoPerde').hidden = false;
}
$('fotoKapat').addEventListener('click', () => { $('fotoPerde').hidden = true; });
$('fotoPerde').addEventListener('click', (e) => { if (e.target === $('fotoPerde')) $('fotoPerde').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fotoPerde').hidden) { e.stopImmediatePropagation(); $('fotoPerde').hidden = true; } }, true);
$('fotoKatil').addEventListener('click', () => { if (fotoAcik && fotoAcik.sunucu) { $('fotoPerde').hidden = true; sunucuyaKatil(fotoAcik.sunucu); } });
$('fotoKoordinat').addEventListener('click', async () => {
  if (!fotoAcik) return;
  const t = `${fotoAcik.x} ${fotoAcik.y} ${fotoAcik.z}`;
  try { await navigator.clipboard.writeText(t); bildirim(`Koordinat kopyalandı: ${t}`); } catch { bildirim(t); }
});
function fotoBalonu(b, id, benden) {
  b.classList.add('foto');
  const kap = el('button', 'foto-kap');
  kap.type = 'button';
  const img = document.createElement('img');
  img.alt = '';
  kap.append(img);
  const alt = el('span', 'foto-alt', 'Yükleniyor…');
  kap.append(alt);
  b.append(kap);
  kap.addEventListener('click', () => fotoAc(id, sohbetKim && !benden ? sohbetKim.ad : null));
  fotoGetir(id).then((v) => {
    img.src = v.resim;
    const bi = v.bilgi || {};
    alt.textContent = bi.not || (bi.x != null ? `📍 ${konumYazi(bi)}` : 'Fotoğraf');
  }).catch((e) => { kap.classList.add('yok'); alt.textContent = e.message || 'Fotoğraf açılamadı'; });
}
async function fotoGonderBasla(uuid, dosya, not) {
  const r = await api.fotoGonder(uuid, dosya, not || null);
  if (!r.ok) { bildirim(r.hata, true); return false; }
  return true;
}
// Sohbetten: son ekran görüntülerinden seç
$('sohbetFoto').addEventListener('click', async (e) => {
  e.stopPropagation();
  const k = $('fotoSec');
  if (!k.hidden) { k.hidden = true; return; }
  const liste = (await api.ekranGoruntuleri()).slice(0, 12);
  const l = $('fotoSecListe');
  l.textContent = '';
  if (!liste.length) l.append(el('div', 'bos', 'Henüz ekran görüntüsü yok. Oyunda F2\'ye bas.'));
  for (const g of liste) {
    const b = el('button', 'foto-sec-oge');
    b.type = 'button';
    const img = document.createElement('img');
    img.alt = '';
    resimAdresi(g.ad).then((u) => { img.src = u; }).catch(() => {});
    b.append(img);
    b.title = g.ad;
    b.addEventListener('click', async () => {
      if (!sohbetKim) return;
      k.hidden = true;
      const not = $('sohbetGirdi').value.trim();
      $('sohbetGirdi').value = '';
      $('sohbetAkis').querySelectorAll('.sohbet-bos').forEach((x) => x.remove());
      const gecici = el('div', 'balon ben gidiyor', 'Fotoğraf gönderiliyor…');
      $('sohbetAkis').append(gecici);
      $('sohbetAkis').scrollTop = $('sohbetAkis').scrollHeight;
      const ok = await fotoGonderBasla(sohbetKim.mc_uuid, g.ad, not);
      if (!ok) { gecici.remove(); $('sohbetGirdi').value = not; return; }
      sohbetYukle();
    });
    l.append(b);
  }
  k.hidden = false;
});
document.addEventListener('click', (e) => { if (!e.target.closest('#fotoSec, #sohbetFoto')) $('fotoSec').hidden = true; });

function balonEkle(m) {
  const gun = gunAdi(m.zaman);
  if (gun !== sohbetSonGun) { $('sohbetAkis').append(el('div', 'sohbet-gun', gun)); sohbetSonGun = gun; }
  const b = el('div', 'balon ' + (m.benden ? 'ben' : 'o'));
  const fid = fotoIdBul(m.metin);
  if (fid) fotoBalonu(b, fid, m.benden); else b.append(document.createTextNode(m.metin));
  b.append(el('small', '', new Date(m.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
  $('sohbetAkis').append(b);
  return b;
}
async function sohbetYukle() {
  if (!sohbetKim || sohbetYukleniyor) return;
  sohbetYukleniyor = true;
  const kim = sohbetKim.mc_uuid;
  try {
    const r = await api.mesajlariAl(kim, sohbetSonId);
    if (!sohbetKim || sohbetKim.mc_uuid !== kim) return;
    if (!r.ok) { if (!sohbetSonId) { $('sohbetAkis').textContent = ''; $('sohbetAkis').append(el('div', 'sohbet-bos', r.hata)); } return; }
    const yeni = Array.isArray(r.veri) ? r.veri.filter((m) => m.id > sohbetSonId) : [];
    if (!yeni.length) { if (!sohbetSonId && !$('sohbetAkis').querySelector('.balon')) { $('sohbetAkis').textContent = ''; $('sohbetAkis').append(el('div', 'sohbet-bos', `${sohbetKim.ad} ile henüz mesajlaşmadınız. İlk mesajı sen at!`)); } return; }
    const akis = $('sohbetAkis');
    const asagida = akis.scrollHeight - akis.scrollTop - akis.clientHeight < 60;
    akis.querySelectorAll('.sohbet-bos, .balon.gidiyor').forEach((x) => x.remove());
    yeni.forEach(balonEkle);
    sohbetSonId = yeni[yeni.length - 1].id;
    if (asagida || yeni.some((m) => m.benden)) akis.scrollTop = akis.scrollHeight;
    // okundu oldu: rozetleri tazele
    if (yeni.some((m) => !m.benden)) arkadaslariYukle();
  } finally {
    sohbetYukleniyor = false;
  }
}
function sohbetAc(a) {
  sohbetKim = a;
  sohbetSonId = 0;
  sohbetSonGun = '';
  $('sohbetAkis').textContent = '';
  $('sohbetAkis').append(el('div', 'sohbet-bos', 'Yükleniyor…'));
  $('sohbetMenu').hidden = true;
  $('sohbetCikar').classList.remove('emin'); $('sohbetCikar').textContent = 'Arkadaşlıktan çıkar';
  kafaKoy($('sohbetKafa'), a.mc_uuid);
  sohbetUstGuncelle();
  $('sohbet').hidden = false;
  document.querySelectorAll('#arkadasListe .ark').forEach((x) => x.classList.remove('secili'));
  setTimeout(() => $('sohbetGirdi').focus(), 50);
  sohbetYukle();
  clearInterval(sohbetZaman);
  sohbetZaman = setInterval(() => { if (!document.hidden && oyunDurumu !== 'acik') sohbetYukle(); }, 2500);
}
function sohbetKapat() {
  $('sohbet').hidden = true;
  clearInterval(sohbetZaman);
  sohbetKim = null;
  document.querySelectorAll('#arkadasListe .ark.secili').forEach((x) => x.classList.remove('secili'));
}
$('sohbetKapat').addEventListener('click', sohbetKapat);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sohbet').hidden) sohbetKapat(); });
$('sohbetKatil').addEventListener('click', () => { if (sohbetKim) sunucuyaKatil(sohbetKim.sunucu); });
$('sohbetMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('sohbetMenu').hidden = !$('sohbetMenu').hidden; });
$('sohbet').addEventListener('click', (e) => { if (!e.target.closest('#sohbetMenu, #sohbetMenuBtn')) $('sohbetMenu').hidden = true; });
$('sohbetProfil').addEventListener('click', () => { $('sohbetMenu').hidden = true; if (sohbetKim) profilAc(sohbetKim.mc_uuid); });
$('sohbetDavet').addEventListener('click', () => { $('sohbetMenu').hidden = true; if (sohbetKim) davetEt(sohbetKim.mc_uuid); });
document.querySelectorAll('.sohbet-kafa, .sohbet-kim').forEach((x) => x.addEventListener('click', () => { if (sohbetKim) profilAc(sohbetKim.mc_uuid); }));
$('sohbetIdKopyala').addEventListener('click', async () => {
  if (!sohbetKim) return;
  try { await navigator.clipboard.writeText(sohbetKim.kod); bildirim(`ID kopyalandı: ${sohbetKim.kod}`); } catch { bildirim(sohbetKim.kod); }
  $('sohbetMenu').hidden = true;
});
$('sohbetCikar').addEventListener('click', async () => {
  const b = $('sohbetCikar');
  if (!sohbetKim) return;
  if (!b.classList.contains('emin')) { b.classList.add('emin'); b.textContent = 'Emin misin? Tekrar bas'; return; }
  const ad = sohbetKim.ad;
  const r = await api.arkadasCikar(sohbetKim.mc_uuid);
  if (!r.ok) { bildirim(r.hata, true); return; }
  bildirim(`${ad} arkadaşlarından çıkarıldı.`);
  sohbetKapat();
  arkadaslariYukle();
});
$('sohbetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = $('sohbetGirdi');
  const metin = g.value.trim();
  if (!metin || !sohbetKim) return;
  g.value = '';
  $('sohbetAkis').querySelectorAll('.sohbet-bos').forEach((x) => x.remove());
  const gecici = balonEkle({ benden: true, metin, zaman: new Date().toISOString() });
  gecici.classList.add('gidiyor');
  $('sohbetAkis').scrollTop = $('sohbetAkis').scrollHeight;
  const r = await api.mesajGonder(sohbetKim.mc_uuid, metin);
  if (!r.ok) { gecici.remove(); g.value = metin; bildirim(r.hata, true); return; }
  sohbetYukle();
});
$('arkadasAd').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('arkadasEkle').addEventListener('click', async () => {
  const kod = $('arkadasAd').value.trim();
  if (kod.length !== 6) { bildirim('Arkadaşının 6 haneli ID\'sini yaz.', true); return; }
  $('arkadasEkle').disabled = true;
  const r = await api.arkadasIstekGonder(kod);
  $('arkadasEkle').disabled = false;
  if (!r.ok) { bildirim(r.hata, true); return; }
  $('arkadasAd').value = '';
  bildirim(r.veri === 'kabul' ? 'O da seni eklemişti: artık arkadaşsınız!' : 'İstek gönderildi. Kabul edince listende görünecek.');
  arkadaslariYukle();
});
$('arkadasAd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('arkadasEkle').click(); });
// Açıkken dakikada bir tazele (oyun açıkken ya da launcher arkadayken bakılmaz)
// İstek ve mesajlar beklemeden gelsin: launcher görünürken 5 sn'de bir, arkadayken dakikada bir bakılır
// (oyun açıkken hiç bakılmaz). Her bakış tek, çok küçük bir istek.
let arkSonBakis = 0;
setInterval(() => {
  if (oyunDurumu === 'acik' || !girisli) return;
  const aralik = document.hidden ? 60000 : 5000;
  if (Date.now() - arkSonBakis < aralik - 500) return;
  arkSonBakis = Date.now();
  arkadaslariYukle();
  davetleriKontrol();
}, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && girisli && oyunDurumu !== 'acik') { arkSonBakis = Date.now(); arkadaslariYukle(); } });
setTimeout(() => { kimlikYukle(); arkadaslariYukle(); }, 4000);

/* ---------- Profil formu ---------- */
let pfDuzenlenen = null;
let pfIkon = 'kup';
function pfSurumleriDoldur(secili) {
  const sec = $('pfSurum');
  sec.innerHTML = '';
  const snap = $('pfSnapshot').checked;
  const liste = surumVeri.liste.filter((v) => v.tur === 'release' || (snap && v.tur === 'snapshot')).slice(0, 400);
  if (secili && !liste.some((v) => v.id === secili)) liste.unshift({ id: secili, tur: 'release' });
  if (!liste.length) liste.push({ id: ayarlar.mcSurum, tur: 'release' });
  for (const v of liste) {
    const o = el('option', '', v.id + (v.yuklu ? ' ✓' : '') + (v.tur === 'snapshot' ? ' (snapshot)' : ''));
    o.value = v.id;
    sec.append(o);
  }
  sec.value = secili || ayarlar.mcSurum;
}
function pfIkonlariCiz() {
  const kap = $('pfIkonlar');
  kap.innerHTML = '';
  for (const id of Ikonlar.liste) {
    const b = el('button', id === pfIkon ? 'secili' : '');
    b.type = 'button';
    b.title = Ikonlar.ad(id);
    b.innerHTML = Ikonlar.svg(id);
    b.addEventListener('click', () => { pfIkon = id; pfIkonlariCiz(); });
    kap.append(b);
  }
}
function profilFormuAc(p) {
  pfDuzenlenen = p || null;
  pfIkon = p ? p.ikon : Ikonlar.liste[Math.floor(Math.random() * Ikonlar.liste.length)];
  yaz('pfBaslik', p ? 'Profili düzenle' : 'Profil ekle');
  $('pfAd').value = p ? p.ad : '';
  $('pfSnapshot').checked = false;
  pfSurumleriDoldur(p ? p.surum : ayarlar.mcSurum);
  $('pfYukleyici').value = p ? p.yukleyici : 'vanilla';
  $('pfSil').hidden = !p;
  $('pfKodKopyala').hidden = !p;
  $('pfKodAlan').hidden = !!p;
  $('pfKodGir').value = '';
  pfIkonlariCiz();
  $('sunucuForm').hidden = true;
  $('profilForm').hidden = false;
  $('pfAd').focus();
}
$('pfSnapshot').addEventListener('change', () => pfSurumleriDoldur($('pfSurum').value));
$('profilForm').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { $('profilForm').hidden = true; });
$('pfIptal').addEventListener('click', () => { $('profilForm').hidden = true; });
$('pfKaydet').addEventListener('click', async () => {
  const surum = $('pfSurum').value;
  const yukleyici = $('pfYukleyici').value;
  const ad = $('pfAd').value.trim() || `${YUK_AD[yukleyici]} ${surum}`;
  const liste = [...(ayarlar.profiller || [])];
  let id;
  if (pfDuzenlenen) {
    id = pfDuzenlenen.id;
    const i = liste.findIndex((x) => x.id === id);
    if (i >= 0) liste[i] = { id, ad, ikon: pfIkon, surum, yukleyici };
  } else {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    liste.push({ id, ad, ikon: pfIkon, surum, yukleyici });
  }
  ayarlar = await api.ayarlariKaydet({ profiller: liste, seciliProfil: id, aktifSecim: 'profil' });
  $('profilForm').hidden = true;
  bildirim(pfDuzenlenen ? `${ad} güncellendi ✓` : `${ad} kaydedildi ✓ Seçip OYNA'ya basınca açılır.`);
  sunuculariCiz();
});
$('pfSil').addEventListener('click', async () => {
  const b = $('pfSil');
  if (!pfDuzenlenen) return;
  if (!b.classList.contains('emin')) {
    b.classList.add('emin');
    b.textContent = 'Emin misin? Tekrar bas';
    setTimeout(() => { b.classList.remove('emin'); b.textContent = 'Bu profili sil'; }, 3000);
    return;
  }
  const liste = (ayarlar.profiller || []).filter((x) => x.id !== pfDuzenlenen.id);
  const degisim = { profiller: liste };
  if (ayarlar.seciliProfil === pfDuzenlenen.id) { degisim.seciliProfil = ''; degisim.aktifSecim = 'sunucu'; }
  ayarlar = await api.ayarlariKaydet(degisim);
  $('profilForm').hidden = true;
  bildirim(`${pfDuzenlenen.ad} silindi. (İndirilen modları klasöründe duruyor.)`);
  if (modKapsam === 'profil:' + pfDuzenlenen.id) modKapsam = null;
  sunuculariCiz();
});

// Profilin Mod butonu: Modlar sayfasını o profil için aç
function profilModlariniAc(p) {
  modKapsam = 'profil:' + p.id;
  modSekme = 'kesfet';
  sayfaAc('modlar');
}

/* ---------- Sunucu ekleme formu ---------- */
async function sunucuFormuAc() {
  $('profilForm').hidden = true;
  $('sunucuForm').hidden = false;
  $('sfAd').value = '';
  $('sfAdres').value = '';
  $('sfAd').focus();
  const n = await api.disSunucuSayisi();
  const b = $('sfAktar');
  b.hidden = !n;
  b.textContent = `Minecraft'taki ${n} sunucunu içe aktar`;
}
$('sunucuForm').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { $('sunucuForm').hidden = true; });
$('sfIptal').addEventListener('click', () => { $('sunucuForm').hidden = true; });
$('sfEkle').addEventListener('click', async () => {
  const r = await api.sunucuEkle($('sfAd').value, $('sfAdres').value);
  if (!r.ok) { bildirim(r.hata, true); return; }
  $('sunucuForm').hidden = true;
  ayarlar = await api.ayarlariKaydet({ seciliSunucu: r.veri.adres, aktifSecim: 'sunucu' });
  bildirim(`${r.veri.ad} eklendi ✓`);
  sunuculariYukle();
});
$('sfAdres').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sfEkle').click(); });
$('sfAd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sfAdres').focus(); });
$('sfAktar').addEventListener('click', async () => {
  const r = await api.sunuculariIceAktar();
  if (!r.ok) { bildirim(r.hata, true); return; }
  $('sunucuForm').hidden = true;
  bildirim(r.veri ? `${r.veri} sunucu içe aktarıldı ✓` : 'Hepsi zaten listede.');
  sunuculariYukle();
});

// Sunucunun bildirdiği sürüm yazısından (ör. "Paper 1.21.4", "1.8.x-1.21.4") uygun sürümü bul.
// Birden fazla sürüm yazıyorsa listede olan en yenisi seçilir.
function sunucuyaUygunSurum(s) {
  const d = s && s.veri;
  if (!d || d.durum !== 'acik' || !d.surum) return null;
  const adaylar = String(d.surum).match(/\b\d+\.\d+(?:\.\d+)?\b/g) || [];
  const releaseler = surumVeri.liste.filter((v) => v.tur === 'release');
  const sira = (id) => releaseler.findIndex((v) => v.id === id); // liste yeniden eskiye
  let en = null;
  for (const a of adaylar) {
    const i = sira(a);
    if (i >= 0 && (en === null || i < sira(en))) en = a;
  }
  return en;
}

function uygunSurumGoster() {
  const b = $('uygunSurumBtn');
  const s = seciliSunucu();
  const id = sunucuyaUygunSurum(s);
  const ozelProfil = s && ayarlar.sunucuProfilleri && ayarlar.sunucuProfilleri[s.adres];
  if (!id || id === ayarlar.mcSurum || ozelProfil || profilAktif()) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  b.append(document.createTextNode(`${id} ile oyna`));
  b.title = `${s.ad} sunucusu ${s.veri.surum} kullanıyor. Oyunu bu açılış için ${id} ile açar; seçili sürümün değişmez.`;
  b.disabled = !!is || oyunDurumu === 'acik';
  b.dataset.surum = id;
}
$('uygunSurumBtn').addEventListener('click', () => {
  const s = seciliSunucu();
  if (s) oyunuAc(s.adres, s.ad, $('uygunSurumBtn').dataset.surum);
});

$('oynaBtn').addEventListener('click', async () => {
  if (!girisli) {
    const ad = localStorage.getItem('kcz_cevrimdisi_ad') || '';
    if (ad) {
      const d = await api.cevrimdisiGiris(ad);
      girisSonucu(d);
      if (!d.girisli) return;
    } else {
      perdeyiAc();
      return;
    }
  }
  if (profilAktif()) {
    const p = seciliProfil();
    oyunuAc(null, p.ad, p.surum, p.id);
    return;
  }
  const s = seciliSunucu();
  oyunuAc(s ? s.adres : null, s ? s.ad : null);
});
$('surumSatir').addEventListener('click', (e) => { e.stopPropagation(); acilirToggle(); });

async function sunucuSec(adres) {
  ayarlar.seciliSunucu = adres || '';
  ayarlar.aktifSecim = 'sunucu';
  sunuculariCiz();
  ayarlar = await api.ayarlariKaydet({ seciliSunucu: adres || '', aktifSecim: 'sunucu' });
}

async function sunucuyuSorgula(s) {
  s.veri = await api.sunucuSorgula(s.adres);
}

let sunucuYukleniyor = false;
let sunucuModlari = {}; // { adres: açık mod sayısı }
async function sunuculariYukle() {
  if (sunucuYukleniyor) return;
  sunucuYukleniyor = true;
  $('yenileBtn').classList.add('donuyor');
  const eski = new Map(sunucular.map((s) => [s.adres, s.veri]));
  sunucular = (await api.sunucuListesi()).map((s) => ({ ...s, veri: eski.get(s.adres) || null }));
  try { sunucuModlari = await api.sunucuModSayilari(); } catch { sunucuModlari = {}; }
  sunuculariCiz();
  await Promise.all(sunucular.map(sunucuyuSorgula));
  sunuculariCiz();
  $('yenileBtn').classList.remove('donuyor');
  sunucuYukleniyor = false;
}
$('yenileBtn').addEventListener('click', () => { if (ayarlar.solSekme === 'arkadas') arkadaslariYukle(); else sunuculariYukle(); });
api.sunucularDegisti(() => sunuculariYukle());

/* ---------- Sahnenin üstündeki sunucu bilgisi ---------- */
function sahneBilgisi() {
  if (profilAktif()) {
    const p = seciliProfil();
    yaz('secEtiket', 'SEÇİLİ PROFİL');
    yaz('secAd', p.ad);
    yaz('secDurum', profilAltYazi(p) + ' · Oyun ana menüde açılır');
    yaz('devYazi', p.ad.toLocaleUpperCase('tr').slice(0, 12));
    return;
  }
  yaz('secEtiket', 'SEÇİLİ SUNUCU');
  const s = seciliSunucu();
  if (!s) {
    yaz('secAd', 'Minecraft ' + ayarlar.mcSurum);
    yaz('secDurum', 'Henüz sunucu yok. Oyunda ekleyince burada görünür.');
    yaz('devYazi', 'KCZ');
    return;
  }
  const d = s.veri;
  yaz('secAd', s.ad);
  yaz('secDurum', !d ? 'Bakılıyor…' : d.durum === 'acik' ? `Çevrimiçi · ${d.oyuncu}/${d.maks} oyuncu · ${d.gecikme} ms` : 'Kapalı');
  yaz('devYazi', s.ad.toLocaleUpperCase('tr').split(/\s+/).slice(0, 2).join(' ').slice(0, 12));
}

/* =========================================================
   ÖZET KUTULARI
   ========================================================= */
function ozetCiz() {
  if (profilAktif()) {
    const kap = $('cevrimici');
    kap.innerHTML = '';
    yaz('cevrimiciSayi', '');
    kap.append(el('span', 'bos-yazi', 'Profille oyun ana menüde açılır. Oyunda istediğin sunucuya girebilirsin.'));
    return;
  }
  const s = seciliSunucu();
  const d = s && s.veri;
  // Sunucuda kimler var
  const kap = $('cevrimici');
  kap.innerHTML = '';
  const oyuncular = (d && d.durum === 'acik' && d.oyuncular) || [];
  yaz('cevrimiciSayi', d && d.durum === 'acik' ? `${d.oyuncu} OYUNCU` : '');
  if (!oyuncular.length) {
    kap.append(el('span', 'bos-yazi', d && d.durum === 'acik' && d.oyuncu ? `${d.oyuncu} oyuncu var ama sunucu isimleri göstermiyor.` : 'Şu an sunucuda kimse yok. İlk giren sen ol!'));
  }
  oyuncular.slice(0, 3).forEach((ad) => {
    const satir = el('div', 'oyuncu');
    const k = el('img');
    kafaKoy(k, ad, 56);
    k.alt = '';
    const yazi = el('span');
    yazi.append(el('b', '', ad));
    const katil = el('button', '', 'Katıl');
    katil.disabled = !!is || oyunDurumu === 'acik';
    katil.addEventListener('click', () => oyunuAc(s.adres, s.ad));
    satir.append(k, yazi, katil);
    kap.append(satir);
  });
}

async function haftayiCiz() {
  let h;
  try { h = await api.haftalikSure(); } catch { return; }
  const sa = Math.floor(h.toplam / 60), dk = h.toplam % 60;
  const t = $('haftaToplam');
  t.innerHTML = '';
  if (sa) { t.append(document.createTextNode(`${sa} sa `), el('small', '', `${dk} dk`)); }
  else t.append(document.createTextNode(`${dk} dk`));
  let k = 'Oynadıkça burada görünür';
  if (h.onceki > 0) {
    const f = Math.round(((h.toplam - h.onceki) / h.onceki) * 100);
    k = f >= 0 ? `geçen haftadan %${f} fazla` : `geçen haftadan %${-f} az`;
  } else if (h.toplam > 0) k = 'son 7 gün';
  yaz('haftaKarsilastir', k);
  const g = $('grafik');
  g.innerHTML = '';
  const enCok = Math.max(30, ...h.gunler.map((x) => x.dk));
  for (const gun of h.gunler) {
    const kol = el('span', 'gun' + (gun.bugun ? ' bugun' : ''));
    kol.title = `${gun.gun}: ${gun.dk} dk`;
    const kap = el('span', 'cubuk-kap');
    const c = el('span', 'cubuk');
    c.style.height = Math.max(3, (gun.dk / enCok) * 100) + '%';
    kap.append(c);
    kol.append(kap, el('small', '', gun.gun[0]));
    g.append(kol);
  }
}

/* ---------- Öneri kartları (Modrinth) ---------- */
const ONERILER = [
  { tur: 'mod', etiket: 'MOD', proje: 'jei', ad: 'JEI', alt: 'Tüm tarifleri oyunun içinde gör', harf: 'J' },
  { tur: 'mod', etiket: 'MOD', proje: 'appleskin', ad: 'AppleSkin', alt: 'Açlık ve doygunluğu gör', harf: 'A' },
  { tur: 'mod', etiket: 'MOD', proje: 'modmenu', ad: 'Mod Menu', alt: 'Mod ayarlarını oyunun içinden aç', harf: 'M' }
];
let oneriSira = 0;
function oneriCiz() {
  const kap = $('oneri');
  kap.innerHTML = '';
  ONERILER.forEach((o, i) => {
    const k = el('div', 'oneri-kart' + (i === oneriSira ? ' aktif' : ''));
    const b = el('button', '', 'Kur');
    b.addEventListener('click', () => icerikKur(o.proje, o.tur, b));
    const alt = el('span', 'alt', o.alt);
    k.append(el('span', 'oneri-harf', o.harf), el('span', 'oneri-tur', 'ÖNERİ · ' + o.etiket), el('b', '', o.ad), alt, b);
    kap.append(k);
  });
  const n = el('span', 'oneri-noktalar');
  ONERILER.forEach((_, i) => n.append(el('i', i === oneriSira ? 'aktif' : '')));
  kap.append(n);
}
setInterval(() => {
  if (oyunDurumu === 'acik') return; // oyun açıkken launcher boşta beklesin
  if (document.querySelector('.oneri-kart button:hover')) return;
  oneriSira = (oneriSira + 1) % ONERILER.length;
  document.querySelectorAll('.oneri-kart').forEach((k, i) => k.classList.toggle('aktif', i === oneriSira));
  document.querySelectorAll('.oneri-noktalar i').forEach((k, i) => k.classList.toggle('aktif', i === oneriSira));
}, 4200);

/* =========================================================
   SKİN VİTRİNİ (3D, NPC animasyonlu)
   ========================================================= */
let skinler = [];
let skinSecili = 0;
// Vitrin yerleri: [x, y, z, ölçek]. Sahne büyüyünce hepsi orantılı büyür.
const YERLER = { 0: [0, 0, 0, 1.05], '-1': [-235, -4, -300, 0.7], 1: [235, -4, -300, 0.7], '-2': [-390, -10, -650, 0.6], 2: [390, -10, -650, 0.6] };
function vitrinOlcegi() {
  const sahne = $('sahne');
  const h = sahne ? sahne.clientHeight : 470;
  const w = sahne ? sahne.clientWidth : 800;
  // Boyu esas al: pencere daralınca skin küçülmesin, sadece taşacak kadar dar olursa küçülsün
  return Math.max(1, Math.min(2.2, Math.min(h / 470, w / 600)));
}
function yerDonusumu(o) {
  const [x, y, z, olc] = YERLER[o];
  const k = vitrinOlcegi();
  return `translate3d(${x * k}px, ${y * k}px, ${z}px) scale(${olc * k})`;
}
window.addEventListener('resize', () => { if (skinler.length) vitrinGuncelle(); });

async function skinleriYukle(seciliTur) {
  let liste = [];
  try { liste = await api.skinListesi(); } catch { liste = []; }
  const benim = liste.find((x) => x.tur === 'benim');
  aktifPelerin = benim && benim.pelerin ? benim.pelerin : null;
  const bilgiler = await Promise.all(liste.map((s) => Skin3D.dokuBilgi(s.doku)));
  skinler = liste.filter((_, i) => bilgiler[i].ok).map((s, i) => ({ ...s, eski: bilgiler.filter((b) => b.ok)[i].eski }));
  if (seciliTur === 'son') {
    // Yeni eklenen: listedeki son "ekli" skin (sondakiler hazır KCZ skinleri)
    let i = -1;
    skinler.forEach((x, j) => { if (x.tur === 'ekli') i = j; });
    skinSecili = i >= 0 ? i : 0;
  } else skinSecili = 0;
  vitrinKur();
}

function ofset(i) {
  const n = skinler.length;
  let o = i - skinSecili;
  if (o > n / 2) o -= n;
  if (o < -n / 2) o += n;
  return o;
}

/** Hesaptaki takılı pelerin: vitrindeki bütün karakterlerin sırtında görünür */
let aktifPelerin = null;

function modelYap(s, i) {
  const model = Skin3D.karakter(s.doku, s.ince, s.eski, aktifPelerin);
  model.querySelectorAll('.parca').forEach((p) => { p.style.animationDelay = `-${(i * 1.3).toFixed(1)}s`; });
  return model;
}

function vitrinKur() {
  const v = $('vitrin');
  v.innerHTML = '';
  skinler.forEach((s, i) => {
    const yer = el('div', 'skin-yer');
    const suzul = el('div', 'skin-suzul');
    suzul.style.animationDelay = `-${(i * 1.7).toFixed(1)}s`;
    const donus = el('div', 'skin-donus');
    if (s.inceIlk === undefined) s.inceIlk = !!s.ince;
    const model = modelYap(s, i);
    donus.append(model);
    suzul.append(el('div', 'golge3d'), el('div', 'kaide'), donus);
    yer.append(suzul);
    yer.addEventListener('click', () => { if (i !== skinSecili) skinSec(i); });
    s.el = { yer, donus, model };
    v.append(yer);
  });
  const kafalar = $('kafalar');
  kafalar.innerHTML = '';
  skinler.forEach((s, i) => {
    const k = el('button', 'kafa');
    k.title = s.ad;
    k.setAttribute('aria-label', s.ad);
    Skin3D.kafaStili(k, s.doku, 34);
    k.addEventListener('click', () => skinSec(i));
    s.kafa = k;
    kafalar.append(k);
  });
  vitrinGuncelle();
}

function vitrinGuncelle() {
  const n = skinler.length;
  skinler.forEach((s, i) => {
    const o = ofset(i);
    const gorunur = Math.abs(o) <= 2;
    s.el.yer.hidden = !gorunur;
    if (!gorunur) return;
    s.el.yer.classList.toggle('on', o === 0);
    if (o !== 0 && !s.el.duz && document.body.classList.contains('hafif')) {
      s.el.duz = Skin3D.onResim(s.doku, s.ince, s.eski);
      s.el.yer.querySelector('.skin-suzul').append(s.el.duz);
    }
    s.el.yer.style.transform = yerDonusumu(o);
    s.el.yer.style.zIndex = String(10 - Math.abs(o));
    s.el.yer.style.setProperty('--k', [1, 0.55, 0.32][Math.abs(o)]);
    s.el.donus.style.transform = `rotateX(-6deg) rotateY(${o === 0 ? onAci : o < 0 ? 18 : -48}deg)`;
    s.kafa.classList.toggle('secili', i === skinSecili);
    const boyut = i === skinSecili ? 42 : 34;
    Skin3D.kafaStili(s.kafa, s.doku, boyut);
  });
  const s = skinler[skinSecili];
  if (!s) {
    yaz('skinAd', 'Skin yok');
    yaz('skinSira', '');
    yaz('skinAlt', '');
    return;
  }
  yaz('skinAd', s.ad);
  yaz('skinSira', `${skinSecili + 1} / ${n}`);
  yaz('skinAlt', s.alt || '');
  const giy = $('giyBtn');
  const benim = s.tur === 'benim' && !!s.ince === !!s.inceIlk;
  giy.textContent = benim ? 'Giyili ✓' : 'Giy';
  giy.classList.toggle('giyili', benim);
  giy.disabled = benim;
  const ince = $('inceBtn');
  ince.textContent = s.ince ? 'İnce kol' : 'Normal kol';
  ince.classList.toggle('ince', !!s.ince);
  $('skinKaldir').hidden = !(s.tur === 'ekli' || s.anahtar);
  $('skinKaldir').title = s.tur === 'ekli' ? 'Skini sil' : 'Vitrinden kaldır';
  const secKafa = s.kafa;
  if (secKafa) secKafa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function skinSec(i) {
  if (!skinler.length) return;
  const yeni = (i + skinler.length) % skinler.length;
  if (yeni !== skinSecili) onAci = -22;
  skinSecili = yeni;
  emoteBitir();
  vitrinGuncelle();
}

/* ---------- Ortadaki karakteri fareyle döndürme ---------- */
let onAci = -22;
(function dondurme() {
  let x0 = 0, aci0 = 0, aktif = null, oynadi = false;
  $('vitrin').addEventListener('pointerdown', (e) => {
    const yer = e.target.closest('.skin-yer.on');
    if (!yer || e.button !== 0) return;
    aktif = yer; x0 = e.clientX; aci0 = onAci; oynadi = false;
    yer.classList.add('ceviriliyor');
    try { yer.setPointerCapture(e.pointerId); } catch { /* yok */ }
  });
  $('vitrin').addEventListener('pointermove', (e) => {
    if (!aktif) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 3) oynadi = true;
    onAci = aci0 + dx * 0.8;
    const s = skinler[skinSecili];
    if (s) s.el.donus.style.transform = `rotateX(-6deg) rotateY(${onAci}deg)`;
  });
  const bitir = () => { if (aktif) aktif.classList.remove('ceviriliyor'); aktif = null; };
  $('vitrin').addEventListener('pointerup', bitir);
  $('vitrin').addEventListener('pointercancel', bitir);
  // Yandaki skinlere tıklayınca ona geç. 3D dönüşümlü öğelerde tıklama her zaman doğru öğeye
  // düşmediği için ekrandaki kutularına göre bulunur.
  $('vitrin').addEventListener('click', (e) => {
    if (e.target.closest('.skin-yer.on') || !skinler.length) return;
    let en = -1, enUzak = Infinity;
    skinler.forEach((x, i) => {
      if (i === skinSecili || !x.el) return;
      const r = x.el.yer.getBoundingClientRect();
      if (!r.width) return;
      const icinde = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const uzak = Math.abs(e.clientX - (r.left + r.right) / 2) + (icinde ? -1000 : 0);
      if (uzak < enUzak && (icinde || Math.abs(e.clientX - (r.left + r.right) / 2) < r.width)) { enUzak = uzak; en = i; }
    });
    if (en >= 0) skinSec(en);
  });
  $('vitrin').addEventListener('dblclick', (e) => {
    if (!e.target.closest('.skin-yer.on')) return;
    onAci = -22;
    vitrinGuncelle();
  });
})();

/* ---------- Kafa fareyi takip etsin ---------- */
let takipKare = 0, takipOlay = null;
$('sahne').addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('hafif')) return;
  takipOlay = e;
  if (!takipKare) takipKare = requestAnimationFrame(() => { takipKare = 0; kafaTakip(takipOlay); });
});
function kafaTakip(e) {
  const s = skinler[skinSecili];
  if (!s || s.el.yer.classList.contains('ceviriliyor')) return;
  const m = s.el.model;
  const r = m.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.15;
  const bx = Math.max(-40, Math.min(40, ((e.clientX - cx) / 260) * 40));
  const by = Math.max(-25, Math.min(25, (-(e.clientY - cy) / 220) * 25));
  m.classList.add('takip');
  m.style.setProperty('--bx', bx.toFixed(1) + 'deg');
  m.style.setProperty('--by', by.toFixed(1) + 'deg');
}
$('sahne').addEventListener('mouseleave', () => {
  const s = skinler[skinSecili];
  if (!s) return;
  s.el.model.classList.remove('takip');
  s.el.model.style.setProperty('--bx', '0deg');
  s.el.model.style.setProperty('--by', '0deg');
});

/* ---------- Animasyonlar (emote) ---------- */
const EMOTE_SURE = { salla: 3200, yuru: 3600, dans: 4000, zipla: 2000, egil: 3600, don: 1600 };
let emoteZaman = null;
let sonEtkilesim = Date.now();
function emoteBitir() {
  clearTimeout(emoteZaman);
  skinler.forEach((s) => { if (s.el) delete s.el.model.dataset.emote; });
  document.querySelectorAll('#emoteler [data-emote]').forEach((b) => b.classList.remove('aktif'));
}
function emoteOynat(ad) {
  const s = skinler[skinSecili];
  if (!s) return;
  emoteBitir();
  void s.el.model.offsetWidth;
  s.el.model.dataset.emote = ad;
  const b = document.querySelector(`#emoteler [data-emote="${ad}"]`);
  if (b) b.classList.add('aktif');
  emoteZaman = setTimeout(emoteBitir, EMOTE_SURE[ad] || 3000);
}
document.querySelectorAll('#emoteler [data-emote]').forEach((b) => b.addEventListener('click', () => {
  sonEtkilesim = Date.now();
  emoteOynat(b.dataset.emote);
}));
let otoEmote = true;
$('otoEmote').addEventListener('click', () => {
  otoEmote = !otoEmote;
  $('otoEmote').classList.toggle('aktif', otoEmote);
  bildirim(otoEmote ? 'Karakter ara ara kendi kendine hareket edecek.' : 'Kendi kendine hareket kapalı.');
});
setInterval(() => {
  if (oyunDurumu === 'acik') return;
  if (!otoEmote || hafifMi() || !$('sayfa-ana').classList.contains('aktif')) return;
  if (Date.now() - sonEtkilesim < 9000) return;
  const s = skinler[skinSecili];
  if (!s || s.el.model.dataset.emote || s.el.yer.classList.contains('ceviriliyor')) return;
  const liste = Object.keys(EMOTE_SURE);
  emoteOynat(liste[Math.floor(Math.random() * liste.length)]);
}, 7000);
$('sahne').addEventListener('pointerdown', () => { sonEtkilesim = Date.now(); });

/* ---------- Kol tipi (normal / ince) ---------- */
$('inceBtn').addEventListener('click', () => {
  const s = skinler[skinSecili];
  if (!s) return;
  s.ince = !s.ince;
  s.kaynak = { ...s.kaynak, ince: s.ince };
  const yeni = modelYap(s, skinSecili);
  s.el.model.replaceWith(yeni);
  s.el.model = yeni;
  vitrinGuncelle();
  bildirim(s.ince ? 'İnce kol (Alex tipi). Giy\'e basınca hesabına bu şekilde takılır.' : 'Normal kol (Steve tipi).');
});
$('skinSola').addEventListener('click', () => skinSec(skinSecili - 1));
$('skinSaga').addEventListener('click', () => skinSec(skinSecili + 1));

$('giyBtn').addEventListener('click', async () => {
  const s = skinler[skinSecili];
  if (!s || (s.tur === 'benim' && !!s.ince === !!s.inceIlk)) return;
  if (!girisli) { perdeyiAc(); return; }
  const b = $('giyBtn');
  b.disabled = true;
  b.textContent = 'Giyiliyor…';
  const r = await api.skinGiy(s.kaynak);
  if (r.ok) {
    bildirim(`${s.ad} artık senin skinin. Oyunda ve sunucularda böyle görüneceksin.`);
    setTimeout(() => skinleriYukle(), 1500);
  } else {
    bildirim(r.hata || 'Skin değiştirilemedi.', true);
    vitrinGuncelle();
  }
});
$('skinKaldir').addEventListener('click', async () => {
  const s = skinler[skinSecili];
  if (!s || !(s.tur === 'ekli' || s.anahtar)) return;
  const b = $('skinKaldir');
  if (!b.classList.contains('emin')) {
    b.classList.add('emin'); b.title = 'Silmek için tekrar bas';
    bildirim(`"${s.ad}" silinsin mi? Silmek için çöp kutusuna tekrar bas.`);
    setTimeout(() => { b.classList.remove('emin'); b.title = 'Skini sil'; }, 3000);
    return;
  }
  b.classList.remove('emin');
  if (s.tur === 'ekli') {
    await api.skinKaldir(s.sira);
    bildirim(`"${s.ad}" silindi.`);
  } else {
    await api.skinGizle(s.anahtar);
    bildirim(`"${s.ad}" vitrinden kaldırıldı. Geri getirmek için + menüsündeki "Kaldırılanları geri getir"e bas.`);
  }
  await skinleriYukle();
  ayarlar = await api.ayarlariGetir();
});
$('skinEkleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('pelerinKutu').hidden = true;
  $('skinEkle').hidden = !$('skinEkle').hidden;
  if (!$('skinEkle').hidden) $('skinIsim').focus();
});
$('skinEkle').addEventListener('click', (e) => e.stopPropagation());
$('pelerinKutu').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { $('skinEkle').hidden = true; $('pelerinKutu').hidden = true; });

/* ---------- Pelerinler ---------- */
async function pelerinleriCiz() {
  const k = $('pelerinler');
  k.textContent = '';
  k.append(el('small', 'bos-yazi', 'Yükleniyor…'));
  const r = await api.pelerinListe();
  k.textContent = '';
  if (!r.ok) { k.append(el('small', 'bos-yazi', r.hata || 'Pelerinler alınamadı.')); return; }
  const liste = Array.isArray(r.veri) ? r.veri : [];
  const herhangiAktif = liste.some((p) => p.aktif);
  const oge = (ad, doku, aktif, id) => {
    const b = el('button', 'pelerin' + (aktif ? ' aktif' : ''));
    const res = el('span', 'pelerin-resim' + (doku ? '' : ' yok'));
    if (doku) res.style.backgroundImage = `url("${doku}")`;
    b.append(res, el('span', '', ad));
    b.title = aktif ? `${ad} (takılı)` : `${ad} tak`;
    b.addEventListener('click', async () => {
      if (aktif) return;
      k.querySelectorAll('.pelerin').forEach((x) => { x.disabled = true; });
      const s = await api.pelerinTak(id);
      if (s.ok) bildirim(id ? `${ad} pelerini takıldı.` : 'Pelerin çıkarıldı.'); else bildirim(s.hata, true);
      pelerinleriCiz();
      if (s.ok) { aktifPelerin = doku || null; const secili = skinSecili; vitrinKur(); skinSec(secili); }
    });
    k.append(b);
  };
  oge('Pelerinsiz', null, !herhangiAktif, '');
  liste.forEach((p) => oge(p.ad || 'Pelerin', p.doku, p.aktif, p.id));
  if (!liste.length) k.append(el('small', 'bos-yazi', 'Hesabında pelerin yok. Pelerinler Minecraft etkinliklerinden ve Minecraft Store\'dan kazanılıyor.'));
}
$('pelerinBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('skinEkle').hidden = true;
  if (!girisli) { perdeyiAc(); return; }
  const k = $('pelerinKutu');
  k.hidden = !k.hidden;
  if (!k.hidden) pelerinleriCiz();
});

async function skinEkleSonuc(r) {
  if (r.ok) {
    $('skinEkle').hidden = true;
    $('skinIsim').value = '';
    await skinleriYukle('son');
    // Giriş yapılmışsa eklenen skin hemen Minecraft hesabına takılır
    const yeni = skinler[skinSecili];
    if (girisli && yeni && yeni.tur === 'ekli' && !$('giyBtn').disabled) $('giyBtn').click();
    else bildirim('Skin vitrine eklendi. Hesabına takmak için giriş yapıp "Giy"e bas.');
  } else if (r.hata) bildirim(r.hata, true);
}
$('skinIsimEkle').addEventListener('click', async () => {
  const isim = $('skinIsim').value.trim();
  if (!isim) return;
  $('skinIsimEkle').disabled = true;
  skinEkleSonuc(await api.skinIsimEkle(isim));
  $('skinIsimEkle').disabled = false;
});
$('skinYenileBtn').addEventListener('click', async () => {
  const b = $('skinYenileBtn');
  b.disabled = true; b.textContent = 'Microsoft\'tan alınıyor…';
  try {
    const r = await api.skinYenile();
    await skinleriYukle('benim');
    api.hesapDurumu().then(hesabiGoster).catch(() => {});
    $('skinEkle').hidden = true;
    bildirim(r.ok ? r.mesaj : r.hata, !r.ok);
  } finally {
    b.disabled = false; b.textContent = 'Hesabımdaki skini çek';
  }
});
$('skinGeriGetir').addEventListener('click', async () => {
  await api.skinGizlenenleriGeri();
  $('skinEkle').hidden = true;
  await skinleriYukle();
  ayarlar = await api.ayarlariGetir();
  bildirim('Kaldırılan skinler vitrine geri geldi.');
});
$('skinIsim').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('skinIsimEkle').click(); });
$('skinDosyaKlasik').addEventListener('click', async () => skinEkleSonuc(await api.skinDosyaEkle(false)));
$('skinDosyaInce').addEventListener('click', async () => skinEkleSonuc(await api.skinDosyaEkle(true)));

/* =========================================================
   SÜRÜMLER
   ========================================================= */
function surumBilgi(id) {
  return surumVeri.liste.find((v) => v.id === id) || { id, tur: 'release', yuklu: false };
}

async function surumleriYukle() {
  surumVeri = await api.surumListesi();
  yaz('yukluSayi', surumVeri.liste.filter((v) => v.yuklu).length);
  if ($('sayfa-surumler').classList.contains('aktif')) surumListesiCiz();
  oynaGuncelle();
}

function filtreUygun(v) {
  if (filtre === 'release') return v.tur === 'release';
  if (filtre === 'snapshot') return v.tur === 'snapshot';
  if (filtre === 'eski') return v.tur === 'old_beta' || v.tur === 'old_alpha';
  if (filtre === 'yuklu') return v.yuklu;
  return true;
}

function surumSatiri(v, sira) {
  const secili = v.id === ayarlar.mcSurum;
  const satir = el('div', 'sr' + (secili ? ' secili' : ''));
  satir.dataset.id = v.id;
  satir.style.setProperty('--sira', Math.min(sira, 25));
  const bilgi = el('div', 'sr-bilgi');
  bilgi.append(el('b', '', v.id), el('small', '', `${TUR_ADI[v.tur] || v.tur} · ${tarihYaz(v.tarih)}`));
  const durum = el('div', 'sr-durum');
  const dugmeler = el('div', 'sr-dugmeler');
  const sec = el('button', 'sr-sec' + (secili ? ' secili' : ''), secili ? 'Seçili ✓' : 'Seç');
  sec.addEventListener('click', () => surumSec(v.id));
  dugmeler.append(sec);
  const buYukleniyor = is && is.surum === v.id;
  if (buYukleniyor) durum.textContent = `%${is.yuzde || 0} yükleniyor`;
  else if (v.yuklu) durum.append(el('span', 'rozet-yuklu', '✓ Yüklü'));
  if (v.yuklu) {
    const sil = el('button', 'sr-sil', 'Sil');
    sil.disabled = !!is;
    sil.addEventListener('click', () => surumSil(v.id, sil));
    dugmeler.append(sil);
  } else {
    const yukle = el('button', 'sr-yukle', buYukleniyor ? '…' : 'Yükle');
    yukle.disabled = !!is;
    yukle.addEventListener('click', () => surumYukle(v.id));
    dugmeler.append(yukle);
  }
  const cubuk = el('div', 'sr-ilerleme');
  if (buYukleniyor) cubuk.style.width = (is.yuzde || 0) + '%';
  satir.append(el('span', 'surum-ikon tur-' + v.tur), bilgi, durum, dugmeler, cubuk);
  return satir;
}

function surumListesiCiz() {
  const ara = $('surumAra').value.trim().toLowerCase();
  const liste = surumVeri.liste.filter((v) => filtreUygun(v) && (!ara || v.id.toLowerCase().includes(ara)));
  const kap = $('surumListesi');
  kap.innerHTML = '';
  if (!liste.length) {
    kap.append(el('div', 'bos', !surumVeri.liste.length
      ? 'Sürüm listesi alınamadı. İnternet bağlantını kontrol edip tekrar dene.'
      : filtre === 'yuklu' ? 'Henüz yüklü sürüm yok. Bir sürüm seçip OYNA\'ya bas ya da Yükle\'ye tıkla.' : 'Aramana uyan sürüm yok.'));
  }
  liste.slice(0, gosterilen).forEach((v, i) => kap.append(surumSatiri(v, i)));
  $('dahaBtn').hidden = liste.length <= gosterilen;
}

document.querySelectorAll('#filtreler .filtre').forEach((b) =>
  b.addEventListener('click', () => {
    filtre = b.dataset.filtre;
    gosterilen = 80;
    document.querySelectorAll('#filtreler .filtre').forEach((x) => x.classList.toggle('aktif', x === b));
    surumListesiCiz();
  })
);
$('surumAra').addEventListener('input', () => { gosterilen = 80; surumListesiCiz(); });
$('dahaBtn').addEventListener('click', () => { gosterilen += 120; surumListesiCiz(); });

async function surumSec(id) {
  ayarlar = await api.ayarlariKaydet({ mcSurum: id });
  surumListesiCiz();
  sunuculariCiz();
  acilirKapat();
  modProfiliYaz();
  if ($('sayfa-modlar').classList.contains('aktif')) modSayfasiAc();
  const v = surumBilgi(id);
  bildirim(v.yuklu ? `${id} seçildi. OYNA'ya basınca açılır.` : `${id} seçildi. OYNA'ya basınca önce yüklenir.`);
}

async function yukleyiciSec(y) {
  ayarlar = await api.ayarlariKaydet({ yukleyici: y });
  $('yukleyiciSec').value = y;
  sunuculariCiz();
  modProfiliYaz();
  acilirKapat();
  if ($('sayfa-modlar').classList.contains('aktif')) modSayfasiAc();
  bildirim(y === 'vanilla' ? 'Oyun modsuz açılacak.' : `Oyun ${YUK_AD[y]} ile açılacak. Modlar sayfasından mod kurabilirsin.`);
}

async function surumYukle(id) {
  if (is) return;
  is = { tur: 'yukle', surum: id, yuzde: 0, metin: `${id} hazırlanıyor…` };
  oynaGuncelle();
  surumListesiCiz();
  const r = await api.surumYukle(id);
  is = null;
  if (r.ok) bildirim(`${id} yüklendi ✓`);
  else bildirim(r.hata || 'Yüklenemedi.', true);
  await surumleriYukle();
  oynaGuncelle();
}

async function surumSil(id, btn) {
  if (!btn.classList.contains('emin')) {
    btn.classList.add('emin');
    btn.textContent = 'Emin misin?';
    setTimeout(() => { btn.classList.remove('emin'); btn.textContent = 'Sil'; }, 3000);
    return;
  }
  const r = await api.surumSil(id);
  if (r.ok) bildirim(`${id} silindi. Dünyaların silinmedi.`);
  else bildirim(r.hata, true);
  await surumleriYukle();
}

/* ---------- Sürüm açılır menüsü ---------- */
function acilirOge(v) {
  const b = el('button', 'acilir-oge' + (v.id === ayarlar.mcSurum ? ' secili' : ''));
  b.append(el('span', 'surum-ikon tur-' + v.tur), el('b', '', v.id), el('small', v.yuklu ? 'yuklu' : '', v.yuklu ? 'Yüklü' : TUR_ADI[v.tur]));
  b.addEventListener('click', () => surumSec(v.id));
  return b;
}
function acilirAc() {
  const yukluKap = $('acilirYuklu');
  yukluKap.innerHTML = '';
  const yuklu = surumVeri.liste.filter((v) => v.yuklu);
  if (!yuklu.length) yukluKap.append(el('div', 'acilir-bos', 'Henüz yüklü sürüm yok'));
  yuklu.forEach((v) => yukluKap.append(acilirOge(v)));
  const yeniKap = $('acilirYeni');
  yeniKap.innerHTML = '';
  const { release, snapshot } = surumVeri.enSon || {};
  [release, snapshot].filter(Boolean).forEach((id) => yeniKap.append(acilirOge(surumBilgi(id))));
  if (!yeniKap.children.length) yeniKap.append(el('div', 'acilir-bos', 'Liste alınamadı'));
  const yk = $('acilirYukleyici');
  yk.innerHTML = '';
  for (const [id, ad] of Object.entries(YUK_AD)) {
    const b = el('button', id === ayarlar.yukleyici ? 'aktif' : '', ad);
    b.addEventListener('click', () => yukleyiciSec(id));
    yk.append(b);
  }
  $('surumAcilir').hidden = false;
}
function acilirKapat() { $('surumAcilir').hidden = true; }
function acilirToggle() { if ($('surumAcilir').hidden) acilirAc(); else acilirKapat(); }
$('surumAcilir').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', acilirKapat);
$('tumSurumlerBtn').addEventListener('click', () => { acilirKapat(); sayfaAc('surumler'); });

/* =========================================================
   OYNA
   ========================================================= */
function oynaGuncelle() {
  const mesgul = !!is || oyunDurumu === 'acik';
  $('surumSatir').hidden = profilAktif();
  document.querySelectorAll('.oyuncu button').forEach((b) => { b.disabled = mesgul; });
  const { btn, dolgu, yazi, alt } = oynaRef;
  btn.classList.remove('yukleniyor', 'acik', 'giris');
  const v = surumBilgi(ayarlar.mcSurum);
  const s = seciliSunucu();
  alt.classList.remove('hata');

  if (is) {
    const y = is.yuzde || 0;
    btn.disabled = true;
    btn.classList.add('yukleniyor');
    dolgu.style.width = y + '%';
    yazi.textContent = is.tur === 'oyna' && y >= 100 ? 'BAŞLATILIYOR…' : `YÜKLENİYOR %${y}`;
    alt.textContent = is.metin || '';
  } else if (oyunDurumu === 'acik') {
    btn.disabled = true;
    btn.classList.add('acik');
    dolgu.style.width = '0';
    yazi.textContent = 'OYUN AÇIK';
    alt.textContent = `${v.id} oynanıyor · İyi oyunlar!`;
  } else if (!girisli) {
    const kaydedilenAd = localStorage.getItem('kcz_cevrimdisi_ad') || '';
    btn.disabled = false;
    dolgu.style.width = '0';
    if (kaydedilenAd) {
      yazi.textContent = 'OYNA';
      alt.textContent = 'Çevrimdışı · ' + kaydedilenAd;
    } else {
      btn.classList.add('giris');
      yazi.textContent = 'GİRİŞ YAP';
      alt.textContent = 'Ad gir veya Microsoft ile giriş yap';
    }
  } else {
    btn.disabled = false;
    dolgu.style.width = '0';
    yazi.textContent = 'OYNA';
    const sp = s && ayarlar.sunucuProfilleri && ayarlar.sunucuProfilleri[s.adres];
    if (profilAktif()) {
      const p = seciliProfil();
      const pv = surumBilgi(p.surum);
      alt.textContent = `${p.ad} · ${profilAltYazi(p)}${pv.yuklu ? '' : ' · önce sürüm iner'}`;
    } else if (sp) {
      const n = sunucuModlari[s.adres] || 0;
      alt.textContent = `${s.ad} · ${sp.surum} ${YUK_AD[sp.yukleyici]} · ${n} modla bağlanır`;
    } else {
      alt.textContent = (s ? `${s.ad} sunucusuna bağlanır` : 'Oyun ana menüde açılır') + (v.yuklu ? '' : ' · önce sürüm iner');
    }
  }
  if (sonHata && !is && oyunDurumu !== 'acik') { alt.textContent = sonHata; alt.classList.add('hata'); }
  uygunSurumGoster();
}
let sonHata = '';

// hedefAdres boşsa oyun ana menüye açılır, doluysa direkt o sunucuya girer
async function oyunuAc(hedefAdres, hedefAd, surum, profilId, modsuz) {
  if (!girisli) { perdeyiAc(); return; }
  if (is || oyunDurumu === 'acik') return;
  sonHata = '';
  const id = surum || ayarlar.mcSurum;
  is = { tur: 'oyna', surum: id, yuzde: 0, metin: modsuz ? 'Modsuz deneme: oyun hiçbir mod olmadan açılacak' : hedefAdres ? `${hedefAd} sunucusuna bağlanılacak` : profilId ? `${hedefAd} profili hazırlanıyor…` : 'Hazırlanıyor…' };
  oynaRef.btn.classList.remove('patla');
  void oynaRef.btn.offsetWidth;
  oynaRef.btn.classList.add('patla');
  oynaGuncelle();
  if ($('sayfa-surumler').classList.contains('aktif')) surumListesiCiz();

  const s = await api.oyunuBaslat(hedefAdres || null, surum || null, profilId || null, !!modsuz);
  if (!s.ok) {
    is = null;
    sonHata = s.hata || 'Oyun başlatılamadı.';
    bildirim(sonHata, true);
  } else if (is && oyunDurumu !== 'acik') {
    is.yuzde = 100;
    is.metin = 'Oyun açılıyor…';
  }
  oynaGuncelle();
  surumleriYukle();
}

api.ilerlemeDinle((v) => {
  if (!is) return;
  is.yuzde = typeof v.yuzde === 'number' ? v.yuzde : is.yuzde;
  is.metin = v.metin || is.metin;
  oynaGuncelle();
  const satir = document.querySelector(`.sr[data-id="${CSS.escape(v.surum || '')}"]`);
  if (satir) {
    satir.querySelector('.sr-ilerleme').style.width = is.yuzde + '%';
    satir.querySelector('.sr-durum').textContent = `%${is.yuzde} yükleniyor`;
  }
});

api.durumDinle((d) => {
  if (d.tur === 'acik') {
    is = null;
    oyunDurumu = 'acik';
    document.body.classList.add('oyun-acik');
    if (!d.sessiz) bildirim(`${d.surum} açıldı. İyi oyunlar!`);
  } else if (d.tur === 'kapandi') {
    is = null;
    oyunDurumu = 'bosta';
    document.body.classList.remove('oyun-acik');
    api.ayarlariGetir().then((a) => { ayarlar = a; oyunAyarlariniDoldur(); }).catch(() => {});
    if (d.kod && d.kod !== 0) sonHata = 'Oyun bir hatayla kapandı. Ayrıntılar: Ayarlar > Oyun kaydı.';
    if (d.modHatasi) modHatasiGoster(d.modHatasi);
    else if (d.cokme) cokmeGoster(d.cokme);
    sunuculariYukle();
    haftayiCiz();
  }
  oynaGuncelle();
});

/** Son açılışı aynı şekilde (sunucu, profil, sürüm) tekrar aç; modsuz: hiçbir mod olmadan dene */
async function sonAcilisiTekrarla(modsuz) {
  const a = await api.sonAcilis();
  if (!a) { oyunuAc(null, null, null, null, modsuz); return; }
  const p = a.profilId && (ayarlar.profiller || []).find((x) => x.id === a.profilId);
  const sv = a.hedefSunucu && sunucular.find((x) => x.adres === a.hedefSunucu);
  oyunuAc(a.hedefSunucu, p ? p.ad : sv ? sv.ad : null, p ? p.surum : a.surum, a.profilId, modsuz);
}

/* ---------- Onar: oyun açılmıyor ya da çöküyorsa ---------- */
async function oyunuOnar(dugme) {
  if (is || oyunDurumu === 'acik') { bildirim('Oyun açıkken onarılamaz.', true); return false; }
  const eski = dugme.textContent;
  dugme.disabled = true;
  dugme.textContent = 'Onarılıyor…';
  yaz('onarSonuc', 'Önbellek temizleniyor, oyun dosyaları ve Java kontrol ediliyor…');
  const r = await api.oyunuOnar();
  dugme.disabled = false;
  dugme.textContent = eski;
  if (!r.ok) { yaz('onarSonuc', r.hata); bildirim(r.hata, true); return false; }
  const m = r.veri.join(' · ');
  yaz('onarSonuc', `Onarıldı: ${m}. Şimdi tekrar oynamayı dene; düzelmezse "Modsuz dene".`);
  bildirim(`Onarım bitti: ${m}`);
  return true;
}
$('onarBtn').addEventListener('click', () => oyunuOnar($('onarBtn')));
$('modsuzBtn').addEventListener('click', () => sonAcilisiTekrarla(true));
$('ayarSifirlaBtn').addEventListener('click', async () => {
  const b = $('ayarSifirlaBtn');
  if (!b.classList.contains('emin')) {
    b.classList.add('emin');
    b.textContent = 'Emin misin?';
    setTimeout(() => { b.classList.remove('emin'); b.textContent = 'Oyun ayarlarını sıfırla'; }, 3000);
    return;
  }
  b.classList.remove('emin');
  b.textContent = 'Oyun ayarlarını sıfırla';
  const r = await api.oyunAyarlariniSifirla();
  if (!r.ok) { bildirim(r.hata, true); return; }
  const m = r.veri.startsWith('options.txt.yedek')
    ? `Oyun ayarları sıfırlandı. Eskisi oyun klasöründe ${r.veri} adıyla duruyor.`
    : r.veri;
  yaz('onarSonuc', m);
  bildirim(m);
});
// Çökme penceresinden: onarıp aynı şekilde tekrar aç ya da modsuz dene
$('cokmeOnar').addEventListener('click', async () => {
  if (await oyunuOnar($('cokmeOnar'))) { $('cokmePerde').hidden = true; sonAcilisiTekrarla(false); }
});
$('cokmeModsuz').addEventListener('click', () => { $('cokmePerde').hidden = true; sonAcilisiTekrarla(true); });

/* ---------- Eksik mod hatası: düzelt ve tekrar oyna ---------- */
let modHatasi = null;
function eksikAdi(id) {
  if (/^fabric(-|$)|^fabric_api$/i.test(id)) return 'Fabric API\'nin parçası';
  if (/^(quilt|qsl|quilted)/i.test(id)) return 'Quilted Fabric API\'nin parçası';
  return 'Modrinth\'ten kurulacak';
}
function modHatasiGoster(h) {
  modHatasi = h;
  const kap = $('modHataListe');
  kap.innerHTML = '';
  for (const id of h.eksik) {
    const satir = el('div');
    satir.append(el('code', '', id), el('small', '', eksikAdi(id)));
    kap.append(satir);
  }
  yaz('modHataYazi', '');
  $('modHataDuzelt').disabled = false;
  $('modHataDuzelt').textContent = 'Düzelt ve tekrar oyna';
  $('modHataPerde').hidden = false;
  sonHata = 'Eksik mod yüzünden açılmadı.';
  oynaGuncelle();
}
$('modHataKapat').addEventListener('click', () => { $('modHataPerde').hidden = true; });
$('modHataDuzelt').addEventListener('click', async () => {
  if (!modHatasi) return;
  const b = $('modHataDuzelt');
  b.disabled = true;
  b.textContent = 'Eksik modlar kuruluyor…';
  const r = await api.eksikModlariKur(modHatasi.eksik);
  if (!r.ok) { yaz('modHataYazi', r.hata); b.disabled = false; b.textContent = 'Tekrar dene'; return; }
  bildirim(r.veri.length ? `Kuruldu: ${r.veri.join(', ')}` : 'Modlar zaten güncel.');
  $('modHataPerde').hidden = true;
  sonHata = '';
  try { sunucuModlari = await api.sunucuModSayilari(); } catch { /* yok */ }
  // Aynı şekilde tekrar aç
  const a = await api.sonAcilis();
  if (!a) return;
  const p = a.profilId && (ayarlar.profiller || []).find((x) => x.id === a.profilId);
  const sv = a.hedefSunucu && sunucular.find((x) => x.adres === a.hedefSunucu);
  oyunuAc(a.hedefSunucu, p ? p.ad : sv ? sv.ad : null, p ? p.surum : a.surum, a.profilId);
});

/* =========================================================
   MODLAR
   ========================================================= */
let modSekme = 'kesfet';
let modTur = 'mod';
let yukluTur = 'mod';
let modSayfa = 0;
let modAramaZaman = null;
let modIstek = 0;

let modKapsam = null; // null = genel modlar, yoksa sunucu adresi

function kapsamProfili() {
  if (modKapsam && modKapsam.startsWith('profil:')) {
    const pr = (ayarlar.profiller || []).find((x) => 'profil:' + x.id === modKapsam);
    if (pr) return { surum: pr.surum, yukleyici: pr.yukleyici };
  }
  const sp = modKapsam && ayarlar.sunucuProfilleri && ayarlar.sunucuProfilleri[modKapsam];
  return sp ? { surum: sp.surum, yukleyici: sp.yukleyici } : { surum: ayarlar.mcSurum, yukleyici: ayarlar.yukleyici };
}

function modProfiliYaz() {
  const p = kapsamProfili();
  $('modProfil').textContent = `${p.surum} · ${YUK_AD[p.yukleyici] || ''}${modKapsam ? '' : ' ▾'}`;
  $('modProfil').disabled = !!modKapsam;
  // Kapsam seçici: Genel + sunucu profilleri
  const k = $('modKapsam');
  k.innerHTML = '';
  const genel = el('button', 's2' + (modKapsam ? '' : ' aktif'), 'Genel modlar');
  genel.addEventListener('click', () => { modKapsam = null; modSayfasiAc(); });
  k.append(genel);
  for (const pr of (ayarlar.profiller || []).filter((x) => x.yukleyici !== 'vanilla')) {
    const anahtar = 'profil:' + pr.id;
    const b = el('button', 's2' + (modKapsam === anahtar ? ' aktif' : ''));
    const ik = el('span', 'pk-ikon kucuk-pk');
    ik.innerHTML = Ikonlar.svg(pr.ikon);
    b.append(ik, document.createTextNode(pr.ad));
    b.title = `${pr.ad} profilinin modları`;
    b.addEventListener('click', () => { modKapsam = anahtar; modSayfasiAc(); });
    k.append(b);
  }
  for (const adres of Object.keys(ayarlar.sunucuProfilleri || {})) {
    const sv = sunucular.find((x) => x.adres === adres);
    const b = el('button', 's2' + (modKapsam === adres ? ' aktif' : ''));
    const ikon = el('img', 'sk-mini-ikon');
    ikon.alt = '';
    ikon.src = (sv && ((sv.veri && sv.veri.ikon) || sv.ikon)) || 'logo.svg';
    b.append(ikon, document.createTextNode(sv ? sv.ad : adres));
    b.title = `${adres} sunucusuna özel modlar`;
    b.addEventListener('click', () => { modKapsam = adres; modSayfasiAc(); });
    k.append(b);
  }
  // Sunucu profili ayarları
  $('spSatir').hidden = !modKapsam;
  $('spSil').hidden = !!(modKapsam && modKapsam.startsWith('profil:'));
  if (modKapsam) {
    const sec = $('spSurum');
    sec.innerHTML = '';
    const releaseler = surumVeri.liste.filter((v) => v.tur === 'release').slice(0, 120);
    if (!releaseler.some((v) => v.id === p.surum)) releaseler.unshift({ id: p.surum });
    releaseler.forEach((v) => { const o = el('option', '', v.id); o.value = v.id; sec.append(o); });
    sec.value = p.surum;
    $('spYukleyici').value = p.yukleyici;
  }
}

async function sunucuProfiliKaydet(adres, deger) {
  if (adres && adres.startsWith('profil:')) {
    const liste = (ayarlar.profiller || []).map((x) => ('profil:' + x.id === adres && deger ? { ...x, surum: deger.surum, yukleyici: deger.yukleyici } : x));
    ayarlar = await api.ayarlariKaydet({ profiller: liste });
    return;
  }
  const profiller = { ...(ayarlar.sunucuProfilleri || {}) };
  if (deger) profiller[adres] = deger; else delete profiller[adres];
  ayarlar = await api.ayarlariKaydet({ sunucuProfilleri: profiller });
}

// Sunucu kartındaki Mod butonu: o sunucuya özel profil yoksa oluştur, Modlar sayfasını o sunucu için aç
async function sunucuModlariniAc(s) {
  if (!ayarlar.sunucuProfilleri || !ayarlar.sunucuProfilleri[s.adres]) {
    const surum = sunucuyaUygunSurum(s) || ayarlar.mcSurum;
    const yukleyici = ayarlar.yukleyici !== 'vanilla' ? ayarlar.yukleyici : 'fabric';
    await sunucuProfiliKaydet(s.adres, { surum, yukleyici });
    bildirim(`${s.ad} için mod profili açıldı: ${surum} · ${YUK_AD[yukleyici]}. Buraya kurduğun modlar sadece bu sunucuda kullanılır.`);
  }
  modKapsam = s.adres;
  modSekme = 'kesfet';
  sayfaAc('modlar');
  sunuculariCiz();
}

$('spSurum').addEventListener('change', async (e) => {
  const p = kapsamProfili();
  await sunucuProfiliKaydet(modKapsam, { surum: e.target.value, yukleyici: p.yukleyici });
  modSayfasiAc();
  sunuculariYukle();
});
$('spYukleyici').addEventListener('change', async (e) => {
  const p = kapsamProfili();
  await sunucuProfiliKaydet(modKapsam, { surum: p.surum, yukleyici: e.target.value });
  modSayfasiAc();
  sunuculariYukle();
});
$('spSil').addEventListener('click', async () => {
  const b = $('spSil');
  if (!b.classList.contains('emin')) {
    b.classList.add('emin');
    b.textContent = 'Emin misin?';
    setTimeout(() => { b.classList.remove('emin'); b.textContent = 'Profili kaldır'; }, 3000);
    return;
  }
  await sunucuProfiliKaydet(modKapsam, null);
  bildirim('Sunucu profili kaldırıldı. Bu sunucuya artık genel ayarlarla girilir. (İndirilen modlar klasöründe duruyor.)');
  modKapsam = null;
  modSayfasiAc();
  sunuculariYukle();
});
$('modProfil').addEventListener('click', (e) => { e.stopPropagation(); acilirAc(); });

function modSayfasiAc() {
  modProfiliYaz();
  modSekmeAc(modSekme);
}

function modSekmeAc(ad) {
  modSekme = ad;
  document.querySelectorAll('#modSekmeler .s2').forEach((b) => b.classList.toggle('aktif', b.dataset.modSekme === ad));
  $('mod-kesfet').hidden = ad !== 'kesfet';
  $('mod-yuklu').hidden = ad !== 'yuklu';
  $('mod-ayar').hidden = ad !== 'ayar';
  if (ad === 'kesfet') { modSayfa = 0; modAra(); }
  if (ad === 'yuklu') yukluCiz();
  if (ad === 'ayar') configCiz();
  yukluSayisiniGuncelle();
}
document.querySelectorAll('#modSekmeler .s2').forEach((b) => b.addEventListener('click', () => modSekmeAc(b.dataset.modSekme)));

async function yukluSayisiniGuncelle() {
  const r = await api.modListe({ tur: 'mod', sunucu: modKapsam });
  yaz('yukluModSayi', r.ok ? r.veri.length : 0);
}

function modUyarisi() {
  const u = $('modUyari');
  u.innerHTML = '';
  if (modTur === 'mod' && kapsamProfili().yukleyici === 'vanilla') {
    u.append(el('span', '', 'Mod kurmak için bir mod yükleyici seçmelisin. Çoğu mod Fabric ile çalışır.'));
    const b = el('button', 'birincil kucuk', 'Fabric kullan');
    b.addEventListener('click', () => yukleyiciSec('fabric'));
    u.append(b);
    u.hidden = false;
  } else if (modTur === 'shader') {
    u.append(el('span', '', 'Shader\'lar için Iris (Fabric/Quilt) ya da Oculus (Forge) modu gerekir.'));
    u.hidden = false;
  } else u.hidden = true;
}

function harfIkon(ad) {
  const s = el('span', 'mk-ikon', (ad || '?')[0].toUpperCase());
  return s;
}

function modKarti(m, sira) {
  const k = el('div', 'mk');
  k.style.setProperty('--sira', sira);
  let ikon;
  if (m.ikon) {
    ikon = el('img', 'mk-ikon');
    ikon.alt = '';
    ikon.src = m.ikon;
    ikon.onerror = () => ikon.replaceWith(harfIkon(m.ad));
  } else ikon = harfIkon(m.ad);
  const bilgi = el('div', 'mk-bilgi');
  bilgi.append(el('b', '', m.ad), el('small', '', `${m.yazar} · ${sayiYaz(m.indirme)} indirme`), el('p', '', m.aciklama));
  const sag = el('div', 'mk-sag');
  const b = el('button', 'mk-yukle' + (m.yuklu ? ' yuklu' : ''), m.yuklu ? 'Yüklü ✓' : 'Yükle');
  b.addEventListener('click', async () => {
    const ok = await icerikKur(m.id, modTur, b);
    if (ok) { m.yuklu = true; b.classList.add('yuklu'); b.textContent = 'Yüklü ✓'; }
  });
  const sayfa = el('button', 'mk-bag', 'Sayfası ↗');
  const yol = { mod: 'mod', shader: 'shader', paket: 'resourcepack' }[modTur];
  sayfa.addEventListener('click', () => api.disAc(`https://modrinth.com/${yol}/${m.slug}`));
  sag.append(b, sayfa);
  k.append(ikon, bilgi, sag);
  return k;
}

async function modAra(ekle = false) {
  modUyarisi();
  if (!ekle) hazirPaketleriCiz();
  const no = ++modIstek;
  const kap = $('modSonuclar');
  if (!ekle) { kap.innerHTML = ''; kap.append(el('div', 'bos', 'Modrinth\'te aranıyor…')); }
  const r = await api.modAra({ sorgu: $('modAra').value, tur: modTur, sira: $('modSira').value, sayfa: modSayfa, sunucu: modKapsam });
  if (no !== modIstek) return;
  if (!ekle) kap.innerHTML = '';
  if (!r.ok) {
    kap.append(el('div', 'bos', `Modrinth'e ulaşılamadı: ${r.hata}`));
    $('modDaha').hidden = true;
    return;
  }
  const { sonuclar, toplam } = r.veri;
  if (!sonuclar.length && !ekle) kap.append(el('div', 'bos', `${kapsamProfili().surum} için uygun sonuç yok. Başka bir arama ya da sürüm dene.`));
  sonuclar.forEach((m, i) => kap.append(modKarti(m, i)));
  $('modDaha').hidden = (modSayfa + 1) * 20 >= toplam;
}
$('modAra').addEventListener('input', () => { clearTimeout(modAramaZaman); modAramaZaman = setTimeout(() => { modSayfa = 0; modAra(); }, 350); });
$('modSira').addEventListener('change', () => { modSayfa = 0; modAra(); });
$('modDaha').addEventListener('click', () => { modSayfa++; modAra(true); });
document.querySelectorAll('#modTurler .filtre').forEach((b) => b.addEventListener('click', () => {
  modTur = b.dataset.tur;
  document.querySelectorAll('#modTurler .filtre').forEach((x) => x.classList.toggle('aktif', x === b));
  modSayfa = 0;
  modAra();
}));

/* ---------- Hazır mod paketleri: tek tıkla birkaç mod ---------- */
const HAZIR_PAKETLER = [
  { id: 'pvp', ad: '⚔️ PvP', aciklama: 'Açlık ve doygunluk göstergesi, hızlı envanter, mod ayarları.', modlar: ['appleskin', 'mouse-tweaks', 'shulkerboxtooltip', 'modmenu'] },
  { id: 'survival', ad: '🌲 Survival+', aciklama: 'Tarifler, baktığın bloğun bilgisi, mini harita ve dünya haritası, envanter düzenleme.', modlar: ['jei', 'jade', 'appleskin', 'xaeros-minimap', 'xaeros-world-map', 'mouse-tweaks', 'modmenu'] },
  { id: 'gorsel', ad: '✨ Görsel', aciklama: 'Elindeki meşale etrafı aydınlatır, birleşik camlar, 3D skin katmanları, düşen yapraklar ve daha canlı animasyonlar.', modlar: ['lambdynamiclights', 'continuity', '3dskinlayers', 'falling-leaves', 'eating-animation', 'not-enough-animations'] }
];
function hazirPaketleriCiz() {
  const k = $('hazirPaketler');
  k.textContent = '';
  // Sadece mod sekmesinde ve aramadayken gösterilir
  if (modTur !== 'mod' || $('modAra').value.trim() || kapsamProfili().yukleyici === 'vanilla') return;
  HAZIR_PAKETLER.forEach((p) => {
    const kart = el('div', 'hp ' + p.id);
    const b = el('button', 'birincil kucuk', 'Paketi kur');
    kart.append(el('b', '', p.ad), el('p', '', p.aciklama), el('small', '', `${p.modlar.length} mod · ${kapsamProfili().surum}`), b);
    b.addEventListener('click', async () => {
      if (oyunDurumu === 'acik') { bildirim('Oyun açıkken mod kurulamaz. Önce oyunu kapat.', true); return; }
      b.disabled = true;
      let tamam = 0;
      const olmayan = [];
      for (let i = 0; i < p.modlar.length; i++) {
        b.textContent = `Kuruluyor ${i + 1}/${p.modlar.length}…`;
        const r = await api.modYukle({ proje: p.modlar[i], tur: 'mod', sunucu: modKapsam });
        if (r.ok) tamam++; else olmayan.push(p.modlar[i]);
      }
      b.disabled = false;
      b.textContent = olmayan.length ? 'Tekrar dene' : 'Kuruldu ✓';
      bildirim(olmayan.length
        ? `${p.ad}: ${tamam} mod kuruldu. ${olmayan.length} mod bu sürüm için henüz yok (${olmayan.join(', ')}).`
        : `${p.ad} paketi kuruldu ✓ Oyunu açınca hazır.`, !!olmayan.length && !tamam);
      yukluSayisiniGuncelle();
      if (modKapsam) { sunucuModlari = await api.sunucuModSayilari(); sunuculariCiz(); }
    });
    k.append(kart);
  });
}

// Mod / shader / kaynak paketi kur (gerekli yan modlarla birlikte)
async function icerikKur(proje, tur, btn) {
  if (oyunDurumu === 'acik') { bildirim('Oyun açıkken mod kurulamaz. Önce oyunu kapat.', true); return false; }
  const eski = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Kuruluyor…'; }
  const r = await api.modYukle({ proje, tur, sunucu: modKapsam });
  if (btn) btn.disabled = false;
  if (!r.ok) {
    if (btn) btn.textContent = eski;
    bildirim(r.hata, true);
    return false;
  }
  if (btn) btn.textContent = 'Yüklü ✓';
  const kurulan = r.veri || [];
  bildirim(kurulan.length > 1 ? `${kurulan[0]} kuruldu (+${kurulan.length - 1} gerekli yan mod).` : `${kurulan[0] || 'İçerik'} kuruldu ✓`);
  yukluSayisiniGuncelle();
  if (modKapsam) { sunucuModlari = await api.sunucuModSayilari(); sunuculariCiz(); }
  return true;
}
api.modDurumDinle((m) => bildirim(m));

/* ---------- Yüklü içerik ---------- */
async function yukluCiz() {
  const kap = $('yukluListe');
  kap.innerHTML = '';
  const r = await api.modListe({ tur: yukluTur, sunucu: modKapsam });
  if (!r.ok) { kap.append(el('div', 'bos', r.hata)); return; }
  if (!r.veri.length) {
    kap.append(el('div', 'bos', yukluTur === 'mod'
      ? `${modKapsam ? 'Bu sunucu' : YUK_AD[ayarlar.yukleyici] + ' ' + ayarlar.mcSurum} için yüklü mod yok. Keşfet sekmesinden kurabilirsin.`
      : 'Henüz yüklü bir şey yok.'));
    return;
  }
  for (const m of r.veri) {
    const s = el('div', 'ym' + (m.acik ? '' : ' kapali'));
    s.dataset.dosya = m.dosya;
    let ikon;
    if (m.ikon) { ikon = el('img', 'mk-ikon'); ikon.alt = ''; ikon.src = m.ikon; ikon.onerror = () => ikon.replaceWith(harfIkon(m.ad)); }
    else ikon = harfIkon(m.ad);
    const bilgi = el('div', 'ym-bilgi');
    bilgi.append(el('b', '', m.ad), el('small', '', [m.surum, m.yan ? 'gerekli yan mod' : '', m.dosya].filter(Boolean).join(' · ')));
    const d = el('div', 'ym-dugmeler');
    if (yukluTur === 'mod') {
      const ayar = el('button', '', 'Ayarlar');
      ayar.addEventListener('click', () => { $('configAra').value = m.slug || m.ad.split(/\s+/)[0]; modSekmeAc('ayar'); });
      d.append(ayar);
    }
    const sil = el('button', 'sil', 'Sil');
    sil.addEventListener('click', async () => {
      if (!sil.classList.contains('emin')) {
        sil.classList.add('emin');
        sil.textContent = 'Emin misin?';
        setTimeout(() => { sil.classList.remove('emin'); sil.textContent = 'Sil'; }, 3000);
        return;
      }
      const x = await api.modSil({ tur: yukluTur, dosya: m.dosya, sunucu: modKapsam });
      if (!x.ok) bildirim(x.hata, true);
      yukluCiz();
      yukluSayisiniGuncelle();
    });
    const anahtar = el('input', 'anahtar');
    anahtar.type = 'checkbox';
    anahtar.checked = m.acik;
    anahtar.title = m.acik ? 'Açık (kapatmak için tıkla)' : 'Kapalı (açmak için tıkla)';
    anahtar.addEventListener('change', async () => {
      const x = await api.modAcKapat({ tur: yukluTur, dosya: m.dosya, acik: anahtar.checked, sunucu: modKapsam });
      if (!x.ok) bildirim(x.hata, true);
      s.classList.toggle('kapali', !anahtar.checked);
    });
    d.append(sil, anahtar);
    s.append(ikon, bilgi, d);
    kap.append(s);
  }
  if (yukluTur === 'mod') modGuncellemeleriGoster(kap);
}

/* ---------- Mod güncellemeleri ---------- */
let modGuncellemeIsi = false;
async function modGuncellemeleriGoster(kap) {
  const kapsam = modKapsam;
  const r = await api.modGuncellemeler({ tur: 'mod', sunucu: kapsam });
  // Bu arada sekme ya da kapsam değiştiyse eski listeye ekleme
  if (!r.ok || !r.veri.length || yukluTur !== 'mod' || kapsam !== modKapsam || !kap.isConnected) return;
  const liste = r.veri;
  for (const u of liste) {
    const satir = kap.querySelector(`.ym[data-dosya="${CSS.escape(u.dosya)}"]`);
    if (!satir) continue;
    const kucuk = satir.querySelector('.ym-bilgi small');
    if (kucuk) kucuk.prepend(el('span', 'yeni-surum', `Yeni: ${u.yeni} · `));
    const b = el('button', 'guncelle', 'Güncelle');
    b.addEventListener('click', () => { b.disabled = true; b.textContent = 'Güncelleniyor…'; modGuncelleCalistir([u]); });
    satir.querySelector('.ym-dugmeler').prepend(b);
  }
  const serit = el('div', 'guncelleme-serit');
  const p = el('p');
  p.append(el('b', '', `${liste.length} modun`), document.createTextNode(' güncellemesi var.'));
  const hepsi = el('button', 'birincil kucuk', 'Hepsini güncelle');
  hepsi.addEventListener('click', () => { hepsi.disabled = true; hepsi.textContent = 'Güncelleniyor…'; modGuncelleCalistir(liste); });
  serit.append(p, hepsi);
  kap.prepend(serit);
}
async function modGuncelleCalistir(liste) {
  if (modGuncellemeIsi) return;
  modGuncellemeIsi = true;
  let tamam = 0;
  const hatalar = [];
  for (const u of liste) {
    const r = await api.modGuncelle({ tur: 'mod', proje: u.proje, sunucu: modKapsam });
    if (r.ok) tamam++; else hatalar.push(`${u.ad}: ${r.hata}`);
  }
  modGuncellemeIsi = false;
  if (tamam) bildirim(`${tamam} mod güncellendi.`);
  if (hatalar.length) bildirim(hatalar[0] + (hatalar.length > 1 ? ` (+${hatalar.length - 1} hata daha)` : ''), true);
  yukluCiz();
  if (typeof yukluSayisiniGuncelle === 'function') yukluSayisiniGuncelle();
}
// Açılıştan kısa süre sonra bir kez: seçili sunucunun ya da genel profilin modlarında güncelleme varsa haber ver
setTimeout(async () => {
  try {
    const s = typeof seciliSunucu === 'function' ? seciliSunucu() : null;
    const kapsam = s && ayarlar.sunucuProfilleri && ayarlar.sunucuProfilleri[s.adres] ? s.adres : null;
    const r = await api.modGuncellemeler({ tur: 'mod', sunucu: kapsam });
    if (r.ok && r.veri.length) bildirim(`${r.veri.length} modun güncellemesi var. Modlar > Yüklü'den güncelleyebilirsin.`);
  } catch { /* sessiz */ }
}, 12000);
document.querySelectorAll('#yukluTurler .filtre').forEach((b) => b.addEventListener('click', () => {
  yukluTur = b.dataset.tur;
  document.querySelectorAll('#yukluTurler .filtre').forEach((x) => x.classList.toggle('aktif', x === b));
  yukluCiz();
}));
$('modKlasorBtn').addEventListener('click', () => api.modKlasoru({ tur: yukluTur, sunucu: modKapsam }));

/* ---------- Mod ayar dosyaları ---------- */
let configler = [];
let acikConfig = null;
async function configCiz(yenile = true) {
  if (yenile) {
    const r = await api.configListe();
    configler = r.ok ? r.veri : [];
  }
  const ara = $('configAra').value.trim().toLowerCase();
  const kap = $('configListe');
  kap.innerHTML = '';
  const liste = configler.filter((c) => !ara || c.yol.toLowerCase().includes(ara));
  if (!liste.length) {
    kap.append(el('div', 'bos', configler.length ? 'Aramana uyan ayar dosyası yok.' : 'Henüz mod ayar dosyası yok. Modlar ayarlarını oyun bir kez açılınca oluşturur.'));
    return;
  }
  liste.slice(0, 200).forEach((c) => {
    const b = el('button', 'cfg');
    b.append(el('span', '', c.yol), el('small', '', c.boyut < 1024 ? `${c.boyut} B` : `${Math.round(c.boyut / 1024)} KB`));
    b.addEventListener('click', () => configAc(c.yol));
    kap.append(b);
  });
}
$('configAra').addEventListener('input', () => configCiz(false));
$('configKlasorBtn').addEventListener('click', () => api.configKlasoru());
async function configAc(yol) {
  const r = await api.configOku(yol);
  if (!r.ok) { bildirim(r.hata, true); return; }
  acikConfig = yol;
  yaz('configAd', yol);
  $('configMetin').value = r.veri;
  $('configPerde').hidden = false;
  $('configMetin').focus();
}
$('configKaydet').addEventListener('click', async () => {
  if (!acikConfig) return;
  const r = await api.configYaz(acikConfig, $('configMetin').value);
  if (r.ok) { bildirim('Ayar kaydedildi ✓ (eski hali yedeklendi)'); $('configPerde').hidden = true; }
  else bildirim(r.hata, true);
});
$('configKapat').addEventListener('click', () => { $('configPerde').hidden = true; });
$('configMetin').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const t = e.target, b = t.selectionStart;
    t.value = t.value.slice(0, b) + '  ' + t.value.slice(t.selectionEnd);
    t.selectionStart = t.selectionEnd = b + 2;
  }
  if (e.key === 's' && e.ctrlKey) { e.preventDefault(); $('configKaydet').click(); }
});

/* =========================================================
   AYARLAR (oyun)
   ========================================================= */
function oyunAyarlariniDoldur() {
  $('ramSec').value = ayarlar.ram;
  yaz('ramDeger', `${ayarlar.ram} GB`);
  oyunAcilincaDoldur();
  $('yukleyiciSec').value = ayarlar.yukleyici;
  performansDoldur();
  istemciDoldur();
  $('tepsiSec').checked = !!ayarlar.tepsiyeKucult;
  $('istatistikSec').checked = ayarlar.istatistikGonder !== false;
  $('discordSec').checked = ayarlar.discordDurum !== false;
  $('durumPaylasSec').checked = ayarlar.durumPaylas !== false;
  $('yedekSec').checked = !!ayarlar.dunyaYedek;
}
let ramZaman = null;
$('ramSec').addEventListener('input', (e) => {
  yaz('ramDeger', `${e.target.value} GB`);
  clearTimeout(ramZaman);
  ramZaman = setTimeout(async () => { ayarlar = await api.ayarlariKaydet({ ram: e.target.value }); bildirim('Ayarlar kaydedildi ✓'); }, 350);
});
/* Oyun açılınca launcher: açık kalsın / küçülsün / kapansın (uyku: oyun kapanınca kendiliğinden açılır) */
const OYUN_ACILINCA_YAZI = {
  acik: 'Launcher görünür kalır: güncellemeler, arkadaşlar ve sohbet oyundayken de çalışır. Güçlü bilgisayarlar için.',
  kucult: 'Görev çubuğuna küçülür, oyun kapanınca geri gelir.',
  kapat: 'Tamamen kapanır, belleği oyuna kalır (en çok FPS). Oyun kapanınca kendiliğinden açılır.',
};
function oyunAcilincaDeger() { return ayarlar.launcherUyusun ? 'kapat' : ayarlar.oyunAcilincaGizle ? 'kucult' : 'acik'; }
function oyunAcilincaDoldur() {
  const v = oyunAcilincaDeger();
  $('oyunAcilincaSec').value = v;
  yaz('oyunAcilincaAciklama', OYUN_ACILINCA_YAZI[v]);
}
$('oyunAcilincaSec').addEventListener('change', async (e) => {
  const v = e.target.value;
  ayarlar = await api.ayarlariKaydet({ launcherUyusun: v === 'kapat', oyunAcilincaGizle: v === 'kucult' });
  oyunAcilincaDoldur();
  bildirim('Ayarlar kaydedildi ✓');
});
$('yukleyiciSec').addEventListener('change', (e) => yukleyiciSec(e.target.value));
$('klasorBtn').addEventListener('click', () => api.klasoruAc());

/* =========================================================
   PERFORMANS
   ========================================================= */
const SEVIYE_AD = { cokdusuk: 'Çok düşük', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const PERFORMANS_ANAHTARLARI = [
  ['hafifSec', 'hafifMod'], ['ekranKartiSec', 'ekranKarti'], ['javaSec', 'javaAyar'],
  ['oncelikSec', 'oncelik'], ['gucSec', 'gucPlani'],
];
let tarama = null;

function performansDoldur() {
  for (const [id, k] of PERFORMANS_ANAHTARLARI) $(id).checked = !!ayarlar[k];
  istemciDoldur();
  document.querySelectorAll('#seviyeler .seviye').forEach((b) => {
    b.classList.toggle('aktif', b.dataset.seviye === ayarlar.performansSeviye);
    b.classList.toggle('onerilen', !!tarama && b.dataset.seviye === tarama.seviye);
  });
}

for (const [id, k] of PERFORMANS_ANAHTARLARI) {
  $(id).addEventListener('change', async (e) => {
    ayarlar = await api.ayarlariKaydet({ [k]: e.target.checked });
    bildirim('Ayarlar kaydedildi ✓');
  });
}

function taramaGoster(t) {
  const kap = $('taramaSonuc');
  kap.replaceChildren();
  for (const p of t.parcalar || []) {
    const satir = el('div', `tsatir ${p.durum}`);
    satir.append(el('i', 'nokta'), el('b', '', p.ad), el('span', '', p.deger));
    satir.title = p.deger;
    kap.append(satir);
  }
  const oneri = el('div', 'tarama-oneri');
  const yazi = el('div');
  yazi.append('Önerilen: ', el('b', '', `${SEVIYE_AD[t.seviye] || t.seviye} ayar`), ` · ${t.ram} GB RAM`);
  const btn = el('button', 'birincil kucuk', 'Uygula');
  btn.type = 'button';
  btn.addEventListener('click', () => seviyeUygula(t.seviye));
  oneri.append(yazi, btn);
  kap.append(oneri);
  for (const n of t.notlar || []) kap.append(el('div', 'tarama-not', `• ${n}`));
  kap.hidden = false;
}

$('taraBtn').addEventListener('click', async () => {
  const b = $('taraBtn');
  b.disabled = true; b.textContent = 'Taranıyor…';
  try {
    const t = await api.sistemiTara();
    if (!t || !t.ok) { bildirim((t && t.hata) || 'Sistem taranamadı.', true); return; }
    tarama = t;
    taramaGoster(t);
    performansDoldur();
    ayarlar = await api.ayarlariKaydet({ sistemZayif: t.seviye === 'dusuk' || t.seviye === 'cokdusuk' });
    hafifUygula();
  } catch (e) {
    bildirim('Sistem taranamadı.', true);
  } finally {
    b.disabled = false; b.textContent = 'Tekrar tara';
  }
});

// İlk açılış: hiç ayar seçilmemişse bilgisayarı bir kere tara; zayıfsa launcher kendiliğinden hafiflesin
setTimeout(async () => {
  if (ayarlar.performansSeviye || ayarlar.sistemZayif != null || oyunDurumu === 'acik') return;
  try {
    const t = await api.sistemiTara();
    if (!t || !t.ok) return;
    tarama = t;
    const zayif = t.seviye === 'dusuk' || t.seviye === 'cokdusuk';
    ayarlar = await api.ayarlariKaydet({ sistemZayif: zayif });
    hafifUygula();
    if (zayif) bildirim('Bilgisayarın zayıf görünüyor: launcher hafif moda geçti, bir sonraki açılışta tamamen hafifler. Ayarlar > Performans\'tan değiştirebilirsin.');
  } catch { /* tarama olmadı, sonra tekrar denenir */ }
}, 6000);

async function seviyeUygula(seviye) {
  const butonlar = document.querySelectorAll('#seviyeler .seviye');
  butonlar.forEach((b) => { b.disabled = true; });
  try {
    const r = await api.performansUygula(seviye);
    if (!r || !r.ok) { bildirim((r && r.hata) || 'Ayar uygulanamadı.', true); return; }
    ayarlar = r.ayarlar;
    oyunAyarlariniDoldur();
    hafifUygula();
    bildirim(`${SEVIYE_AD[seviye]} ayar uygulandı ✓`);
  } catch (e) {
    bildirim('Ayar uygulanamadı.', true);
  } finally {
    butonlar.forEach((b) => { b.disabled = false; });
  }
}
document.querySelectorAll('#seviyeler .seviye').forEach((b) => {
  b.addEventListener('click', () => seviyeUygula(b.dataset.seviye));
});

/* =========================================================
   KCZ CLIENT (oyun içi menü) ve eklentiler
   ========================================================= */
let istemciSurumleri = [];
api.istemciBilgi().then((b) => {
  istemciSurumleri = (b && b.surumler) || [];
  if (b && b.isletim === 'linux') linuxIcinDuzenle();
  istemciDoldur();
}).catch(() => {});

/* Linux: Edge/Windows'a özel yazılar ve ayarlar */
function linuxIcinDuzenle() {
  LINUX = true;
  document.body.dataset.isletim = 'linux';
  const g = $('girisTarayiciBtn');
  if (g) g.textContent = 'Tarayıcıyla giriş yap';
  document.querySelectorAll('.kucuk-not, .soluk').forEach((n) => {
    if (/Edge|Windows/.test(n.textContent)) {
      n.innerHTML = n.innerHTML
        .replace(/Windows'taki Microsoft hesabın Edge'de açıksa/g, 'Microsoft hesabın tarayıcında açıksa')
        .replace(/<b>Edge<\/b>'de/g, 'tarayıcında')
        .replace(/Edge'de/g, 'tarayıcıda')
        .replace(/, Windows Hello/g, '');
    }
  });
  const oncelik = $('oncelikSec');
  if (oncelik) oncelik.closest('.ayar-kart').hidden = true;
  const guc = $('gucSec');
  if (guc) guc.closest('.ayar-kart').querySelector('small').textContent = 'Oyun açıkken güç profilini "performance" yapar (powerprofilesctl), oyun kapanınca eski haline döner.';
}

function istemciDoldur() {
  const i = ayarlar.istemci || {};
  $('istAcikSec').checked = !!i.acik;
  document.querySelectorAll('[data-ist]').forEach((x) => { x.checked = !!i[x.dataset.ist]; });
  $('istZoomKat').value = String(Math.round(i.zoomKat || 4));
  $('istZoomBas').value = String(i.zoomBaslangic || 3);
  $('istKonum').value = i.konum === 'sag-ust' ? 'sag-ust' : 'sol-ust';
  $('istAyarlar').classList.toggle('kapali', !i.acik);
  const destek = istemciSurumleri.length
    ? `Minecraft ${istemciSurumleri.join(', ')} · Fabric/Quilt (Vanilla dahil).`
    : 'Bu derlemede oyun içi menü yok (derleme kaydına bak).';
  $('istemciAciklama').textContent = `Oyunda Esc > KCZ Menü. Buradaki ayarlar orada da aynı, tema da. ${destek}`;
}

async function istemciKaydet(degisim) {
  const yeni = { ...(ayarlar.istemci || {}), ...degisim };
  ayarlar = await api.ayarlariKaydet({ istemci: yeni });
  istemciDoldur();
  bildirim('Ayarlar kaydedildi ✓');
}
$('istAcikSec').addEventListener('change', (e) => istemciKaydet({ acik: e.target.checked }));
// Düşük sistem ve Güçlü sistem aynı anda açık olmaz
async function sistemSec(ad, acik) {
  const degisim = { [ad]: acik };
  if (acik) degisim[ad === 'dusukSistem' ? 'gucluSistem' : 'dusukSistem'] = false;
  await istemciKaydet(degisim);
}
document.querySelectorAll('[data-ist]').forEach((x) => {
  x.addEventListener('change', (e) => {
    if (x.dataset.ist === 'shader' && e.target.checked && tarama && (tarama.seviye === 'dusuk' || tarama.seviye === 'cokdusuk')) {
      bildirim('Uyarı: bilgisayarın shader için zayıf görünüyor, FPS düşebilir.', true);
    }
    if (x.dataset.ist === 'dusukSistem' || x.dataset.ist === 'gucluSistem') { sistemSec(x.dataset.ist, e.target.checked); return; }
    istemciKaydet({ [x.dataset.ist]: e.target.checked });
  });
});
$('istZoomKat').addEventListener('change', (e) => istemciKaydet({ zoomKat: Number(e.target.value) }));
$('istZoomBas').addEventListener('change', (e) => istemciKaydet({ zoomBaslangic: Number(e.target.value) }));
$('istKonum').addEventListener('change', (e) => istemciKaydet({ konum: e.target.value }));

/* ---------- Tepsi ve yedek ---------- */
$('tepsiSec').addEventListener('change', async (e) => {
  ayarlar = await api.ayarlariKaydet({ tepsiyeKucult: e.target.checked });
  bildirim(e.target.checked ? 'Kapatınca saatin yanındaki simgeye küçülecek ✓' : 'Kapatınca tamamen kapanacak ✓');
});
$('yedekSec').addEventListener('change', async (e) => {
  ayarlar = await api.ayarlariKaydet({ dunyaYedek: e.target.checked });
  bildirim('Ayarlar kaydedildi ✓');
});
$('yedekBtn').addEventListener('click', () => api.yedekKlasoru());

/* ---------- Profil paylaşma kodu ---------- */
$('pfKodKopyala').addEventListener('click', async () => {
  if (!pfDuzenlenen) return;
  const r = await api.profilKodu(pfDuzenlenen.id);
  if (!r || !r.ok) { bildirim((r && r.hata) || 'Kod oluşturulamadı.', true); return; }
  await api.panoyaYaz(r.kod);
  bildirim('Paylaşma kodu kopyalandı ✓ Arkadaşın Profil ekle > Kodla ekle\'ye yapıştırsın.');
});
$('pfKodEkle').addEventListener('click', async () => {
  const kod = $('pfKodGir').value.trim();
  if (!kod) { $('pfKodGir').focus(); return; }
  const r = await api.profilKodEkle(kod);
  if (!r || !r.ok) { bildirim((r && r.hata) || 'Kod eklenemedi.', true); return; }
  ayarlar = await api.ayarlariGetir();
  $('profilForm').hidden = true;
  sunuculariCiz();
  bildirim(r.modSayisi ? `${r.ad} eklendi ✓ ${r.modSayisi} mod arka planda kuruluyor…` : `${r.ad} eklendi ✓`);
});
$('pfKodGir').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pfKodEkle').click(); });

/* ---------- Kayıt (log) ---------- */
const logSatirlari = [];
api.logDinle((m) => {
  if (!m) return;
  logSatirlari.push(m);
  if (logSatirlari.length > 500) logSatirlari.splice(0, logSatirlari.length - 500);
  const pre = $('log');
  pre.textContent = logSatirlari.join('\n');
  pre.scrollTop = pre.scrollHeight;
});

/* =========================================================
   GÜNCELLEME (sol üstteki buton)
   ========================================================= */
let guncelleme = { tur: 'bilinmiyor' };
function guncellemeGoster(d) {
  guncelleme = d || guncelleme;
  const b = $('guncelleBtn');
  const goster = ['var', 'iniyor', 'hazir'].includes(guncelleme.tur);
  b.hidden = !goster;
  $('logoYazi').hidden = goster;
  $('logoResim').hidden = goster;
  b.classList.toggle('iniyor', guncelleme.tur === 'iniyor');
  let dolum = b.querySelector('.dolum');
  if (guncelleme.tur === 'iniyor') {
    if (!dolum) { dolum = el('i', 'dolum'); b.prepend(dolum); }
    dolum.style.width = (guncelleme.yuzde || 0) + '%';
    yaz('guncelleYazi', `%${guncelleme.yuzde || 0}`);
    b.disabled = true;
  } else {
    if (dolum) dolum.remove();
    b.disabled = false;
    yaz('guncelleYazi', guncelleme.tur === 'hazir' ? 'Kur' : 'Güncelle');
  }
  b.title = guncelleme.tur === 'hazir' ? `${guncelleme.surum} indi. Kurmak için tıkla, launcher yeniden açılır.` : `Yeni sürüm: ${guncelleme.surum || ''}`;
  const yazi = {
    bilinmiyor: 'Güncellemeler otomatik denetlenir.',
    bakiliyor: 'Yeni sürüm var mı diye bakılıyor…',
    yok: 'En son sürümü kullanıyorsun ✓',
    var: `Yeni sürüm var: ${guncelleme.surum}. Sol üstteki Güncelle'ye bas.`,
    iniyor: `Yeni sürüm iniyor… %${guncelleme.yuzde || 0}`,
    hazir: `${guncelleme.surum} indi. Sol üstteki "Kur"a bas, launcher yeniden açılır.`,
    hata: `Güncelleme denetlenemedi: ${guncelleme.hata || ''}`,
    gelistirme: 'Güncelleme sadece kurulu launcher\'da çalışır (şu an deneme modundasın).'
  }[guncelleme.tur] || '';
  yaz('guncelleDurum', yazi);
}
api.guncellemeDinle((d) => {
  const once = guncelleme.tur;
  guncellemeGoster(d);
  if (d.tur === 'var' && once !== 'var') bildirim(`Yeni sürüm var: ${d.surum}. Sol üstteki Güncelle'ye bas.`);
  if (d.tur === 'hazir' && once !== 'hazir') bildirim(`${d.surum} indi. Sol üstteki "Kur"a bas, launcher yeniden açılır.`);
});
$('guncelleBtn').addEventListener('click', async () => {
  if (guncelleme.tur === 'var') {
    const r = await api.guncellemeIndir();
    if (!r.ok) bildirim(r.hata, true);
  } else if (guncelleme.tur === 'hazir') {
    const r = await api.guncellemeKur();
    if (!r.ok) bildirim(r.hata, true);
  }
});
$('denetleBtn').addEventListener('click', () => api.guncellemeDenetle());

/* =========================================================
   ÖNERİ / HATA BİLDİR
   ========================================================= */
let bildirTur = 'oneri';
const BILDIR_IPUCU = { oneri: 'Ne eklenmesini istersin?', hata: 'Ne oldu? Ne yapıyordun, ne olmasını bekliyordun?' };
document.querySelectorAll('#bildirTur .filtre').forEach((b) => b.addEventListener('click', () => {
  bildirTur = b.dataset.tur;
  document.querySelectorAll('#bildirTur .filtre').forEach((x) => x.classList.toggle('aktif', x === b));
  $('bildirMetin').placeholder = BILDIR_IPUCU[bildirTur];
}));
$('bildirMetin').addEventListener('input', () => yaz('bildirSayac', `${$('bildirMetin').value.length} / 2000`));
$('bildirGonder').addEventListener('click', async () => {
  const metin = $('bildirMetin').value.trim();
  if (metin.length < 3) { bildirim('Biraz daha yaz.', true); return; }
  const b = $('bildirGonder');
  b.disabled = true; b.textContent = 'Gönderiliyor…';
  const r = await api.oneriGonder(bildirTur, metin, $('bildirIletisim').value);
  b.disabled = false; b.textContent = 'Gönder';
  if (!r.ok) { bildirim(r.hata, true); return; }
  $('bildirMetin').value = ''; yaz('bildirSayac', '0 / 2000');
  bildirim(bildirTur === 'hata' ? 'Teşekkürler! Hatayı aldık, bakacağız.' : 'Teşekkürler! Önerin bize ulaştı.');
});

/* ---------- Yönetici girişi ---------- */
let yonetici = null;
function yoneticiGoster(d) {
  yonetici = d && d.eposta !== undefined ? d : null;
  $('yonetimSekme').hidden = !yonetici;
  $('yoneticiGirisAc').textContent = yonetici ? 'Yönetim paneline git' : 'Yönetici girişi';
  if (!yonetici && document.querySelector('#sayfa-yonetim.aktif')) sayfaAc('bildir');
}
$('yoneticiGirisAc').addEventListener('click', () => {
  if (yonetici) { sayfaAc('yonetim'); return; }
  $('yoneticiGiris').hidden = !$('yoneticiGiris').hidden;
  if (!$('yoneticiGiris').hidden) $('ygEposta').focus();
});
function ygAdim(n) { $('ygAdim1').hidden = n !== 1; $('ygAdim2').hidden = n !== 2; if (n === 2) $('ygKod').focus(); }
$('ygKodIste').addEventListener('click', async () => {
  const e = $('ygEposta').value.trim();
  if (!e.includes('@')) { yaz('ygDurum', 'E-posta adresini yaz.'); return; }
  $('ygKodIste').disabled = true; yaz('ygDurum', 'Kod gönderiliyor…');
  const r = await api.yoneticiKodIste(e);
  $('ygKodIste').disabled = false;
  if (!r.ok) { yaz('ygDurum', r.hata); return; }
  yaz('ygDurum', `${e} adresine giriş linki gönderildi. Maili bu bilgisayarda aç ve linke tıkla; launcher girişi kendisi alır. Gelmediyse spam klasörüne bak.`);
});
api.yoneticiGirisDinle((r) => {
  if (!r.ok) { yaz('ygDurum', r.hata); bildirim(r.hata, true); return; }
  yaz('ygDurum', ''); $('yoneticiGiris').hidden = true;
  yoneticiGoster(r.veri);
  bildirim('Yönetim paneline giriş yapıldı.');
  sayfaAc('yonetim');
});
$('ygGiris').addEventListener('click', async () => {
  $('ygGiris').disabled = true; yaz('ygDurum', 'Kontrol ediliyor…');
  const r = await api.yoneticiKodDogrula($('ygEposta').value, $('ygKod').value);
  $('ygGiris').disabled = false;
  if (!r.ok) { yaz('ygDurum', r.hata); return; }
  yaz('ygDurum', ''); $('ygKod').value = ''; ygAdim(1); $('yoneticiGiris').hidden = true;
  yoneticiGoster(r.veri);
  sayfaAc('yonetim');
});
$('ygKod').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ygGiris').click(); });
$('ygEposta').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ygKodIste').click(); });
$('ygGeri').addEventListener('click', () => { ygAdim(1); yaz('ygDurum', ''); });

/* ---------- Yönetim paneli ---------- */
let ypOneriler = [];
let ypFiltre = 'yeni';
let ypZamanlayici = null;
const ypSayi = (n) => (n == null ? "–" : Number(n).toLocaleString("tr-TR"));

function panelHata(r) {
  if (r.hata === 'OTURUM' || /Yetkin yok/.test(r.hata || '')) {
    api.yoneticiCikis(); yoneticiGoster(null);
    bildirim('Yönetici oturumu kapandı, tekrar giriş yap.', true);
    return true;
  }
  bildirim(r.hata, true);
  return false;
}

async function panelYukle() {
  if (!yonetici) return;
  yaz('ypHesap', yonetici.eposta ? `${yonetici.eposta} olarak giriş yaptın` : '');
  const [ist, on, yon] = await Promise.all([api.yoneticiIstatistik(), api.yoneticiOneriler(), api.yoneticiListesi()]);
  if (!ist.ok) { panelHata(ist); return; }
  istatistikCiz(ist.veri || {});
  if (on.ok) { ypOneriler = Array.isArray(on.veri) ? on.veri : []; onerileriCiz(); }
  if (yon.ok) yoneticileriCiz(Array.isArray(yon.veri) ? yon.veri : []);
  panelDuyurulariYukle();
  // Panel açıkken aktif sayısı 30 sn'de bir tazelenir; sayfadan çıkınca durur
  clearInterval(ypZamanlayici);
  ypZamanlayici = setInterval(async () => {
    if (!document.querySelector('#sayfa-yonetim.aktif') || document.hidden) { clearInterval(ypZamanlayici); return; }
    const r = await api.yoneticiIstatistik();
    if (r.ok) istatistikCiz(r.veri || {});
  }, 30000);
}

function istatistikCiz(d) {
  yaz('ypAktif', ypSayi(d.aktif));
  yaz('ypIndirme', ypSayi(d.indirme));
  yaz('ypToplam', ypSayi(d.toplam));
  yaz('ypGun', ypSayi(d.gun));
  yaz('ypHafta', ypSayi(d.hafta));
  yaz('ypYeni', ypSayi(d.yeni_hafta));
  yaz('ypYeniSayi', String(d.yeni_oneri || 0));
  $('yonetimNokta').hidden = !(d.yeni_oneri > 0);

  const g = $('ypGrafik'); g.textContent = '';
  const gunler = Array.isArray(d.gunluk) ? d.gunluk : [];
  const enCok = Math.max(1, ...gunler.map((x) => x.n || 0));
  gunler.forEach((x) => {
    const c = el('div', 'yp-cubuk');
    c.title = `${tarihYaz(x.gun)}: ${x.n} kişi`;
    c.append(el('em', '', String(x.n || 0)));
    const i = el('i'); i.style.height = `${Math.round(((x.n || 0) / enCok) * 100)}%`;
    c.append(i, el('span', '', String(new Date(x.gun).getDate())));
    g.append(c);
  });

  const dg = $('ypDagilim'); dg.textContent = '';
  const ekle = (onEk, nesne) => Object.entries(nesne || {}).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    const s = el('span', '', `${onEk}${k} `); s.append(el('b', '', String(n))); dg.append(s);
  });
  ekle('', d.sistemler);
  ekle('v', d.surumler);
}

function onerileriCiz() {
  const l = $('ypListe'); l.textContent = '';
  const liste = ypOneriler.filter((o) => ({
    yeni: o.durum === 'yeni', hepsi: true, hata: o.tur === 'hata', oneri: o.tur === 'oneri', cozuldu: o.durum === 'cozuldu',
  })[ypFiltre]);
  if (!liste.length) { l.append(el('div', 'bos', ypFiltre === 'yeni' ? 'Yeni bildirim yok.' : 'Burada bir şey yok.')); return; }
  liste.forEach((o) => {
    const k = el('div', `yp-oneri ${o.durum}`);
    const ust = el('div', 'yp-oneri-ust');
    ust.append(el('span', `etiket ${o.tur}`, o.tur === 'hata' ? 'Hata' : 'Öneri'));
    const z = new Date(o.zaman);
    ust.append(el('span', '', `${z.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${z.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`));
    ust.append(el('span', '', [o.surum && `v${o.surum}`, o.os].filter(Boolean).join(' · ')));
    k.append(ust, el('p', '', o.metin));
    const alt = el('div', 'yp-oneri-alt');
    alt.append(el('span', 'iletisim', o.iletisim ? `İletişim: ${o.iletisim}` : ''));
    const dugme = (yazi, durum, sinif = 'ikincil') => {
      const b = el('button', sinif, yazi);
      b.addEventListener('click', async () => {
        if (durum === 'sil' && !b.classList.contains('emin')) { b.classList.add('emin'); b.textContent = 'Emin misin?'; return; }
        b.disabled = true;
        const r = await api.yoneticiOneriDurum(o.id, durum);
        if (!r.ok) { b.disabled = false; panelHata(r); return; }
        if (durum === 'sil') ypOneriler = ypOneriler.filter((x) => x.id !== o.id); else o.durum = durum;
        yaz('ypYeniSayi', String(ypOneriler.filter((x) => x.durum === 'yeni').length));
        $('yonetimNokta').hidden = !ypOneriler.some((x) => x.durum === 'yeni');
        onerileriCiz();
      });
      alt.append(b);
    };
    if (o.kayit) {
      const kb = el('button', 'ikincil', 'Kaydı gör');
      kb.addEventListener('click', async () => {
        kb.disabled = true;
        const r = await api.yoneticiOneriKaydi(o.id);
        kb.disabled = false;
        if (!r.ok) { panelHata(r); return; }
        $('kayitMetin').textContent = r.veri || '(kayıt boş)';
        $('kayitPerde').hidden = false;
      });
      alt.append(kb);
    }
    if (o.durum === 'yeni') dugme('Okundu', 'okundu');
    if (o.durum !== 'cozuldu') dugme('Çözüldü', 'cozuldu', 'birincil');
    else dugme('Geri aç', 'okundu');
    dugme('Sil', 'sil');
    k.append(alt);
    l.append(k);
  });
}
document.querySelectorAll('#ypFiltre .filtre').forEach((b) => b.addEventListener('click', () => {
  ypFiltre = b.dataset.f;
  document.querySelectorAll('#ypFiltre .filtre').forEach((x) => x.classList.toggle('aktif', x === b));
  onerileriCiz();
}));

function yoneticileriCiz(liste) {
  const k = $('ypYoneticiler'); k.textContent = '';
  liste.forEach((y) => {
    const s = el('div', 'yp-yonetici');
    const sol = el('div'); sol.append(el('div', '', y.eposta));
    if (y.ekleyen && y.ekleyen !== 'kurulum') sol.append(el('small', '', `${y.ekleyen} ekledi`));
    s.append(sol);
    if (yonetici && y.eposta !== String(yonetici.eposta || '').toLowerCase()) {
      const b = el('button', 'bag', 'Kaldır');
      b.addEventListener('click', async () => {
        if (!b.classList.contains('emin')) { b.classList.add('emin'); b.textContent = 'Emin misin?'; return; }
        const r = await api.yoneticiKaldir(y.eposta);
        if (!r.ok) { panelHata(r); return; }
        const l = await api.yoneticiListesi(); if (l.ok) yoneticileriCiz(l.veri || []);
      });
      s.append(b);
    } else s.append(el('small', '', 'sen'));
    k.append(s);
  });
}
$('ypDavet').addEventListener('click', async () => {
  const e = $('ypDavetEposta').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { bildirim('Geçerli bir e-posta adresi yaz.', true); return; }
  $('ypDavet').disabled = true;
  const r = await api.yoneticiDavet(e);
  $('ypDavet').disabled = false;
  if (!r.ok) { panelHata(r); return; }
  $('ypDavetEposta').value = '';
  bildirim(`${e} yöneticilere eklendi. Launcher'da Öneri sayfasındaki "Yönetici girişi"nden girebilir.`);
  const l = await api.yoneticiListesi(); if (l.ok) yoneticileriCiz(l.veri || []);
});
$('ypYenile').addEventListener('click', panelYukle);
$('ypCikis').addEventListener('click', async () => { await api.yoneticiCikis(); yoneticiGoster(null); sayfaAc('bildir'); });

$('durumPaylasSec').addEventListener('change', async (e) => {
  ayarlar = await api.ayarlariKaydet({ durumPaylas: e.target.checked });
});
$('discordSec').addEventListener('change', async (e) => {
  ayarlar = await api.ayarlariKaydet({ discordDurum: e.target.checked });
});
$('istatistikSec').addEventListener('change', async (e) => {
  ayarlar = await api.ayarlariKaydet({ istatistikGonder: e.target.checked });
});

// Sunucu bağlı değilse öneri sayfası bunu söyler; kayıtlı yönetici oturumu varsa sekme açılır
api.sunucuBagli().then((b) => {
  if (!b) {
    $('bildirGonder').disabled = true;
    $('bildirGonder').title = 'Sunucu henüz bağlanmadı';
    $('yoneticiGirisAc').hidden = true;
    return;
  }
  api.yoneticiDurum().then(yoneticiGoster);
});

/* =========================================================
   ÇÖKME YAKALAYICI
   ========================================================= */
let sonCokme = null;
function cokmeGoster(c) {
  sonCokme = c;
  yaz('cokmeBaslik', c.baslik || 'Oyun çöktü');
  yaz('cokmeAciklama', c.aciklama || '');
  yaz('cokmeOneri', c.oneri || '');
  $('cokmeNot').value = '';
  $('cokmeBildir').disabled = false; $('cokmeBildir').textContent = 'Hatayı bildir';
  $('cokmeOnar').disabled = false; $('cokmeOnar').textContent = 'Onar ve tekrar dene';
  $('cokmeRapor').hidden = !c.rapor;
  $('cokmePerde').hidden = false;
  sonHata = '';
}
$('cokmeBildir').addEventListener('click', async () => {
  const b = $('cokmeBildir');
  b.disabled = true; b.textContent = 'Gönderiliyor…';
  const r = await api.cokmeBildir($('cokmeNot').value, sonCokme ? sonCokme.baslik : '');
  if (!r.ok) { b.disabled = false; b.textContent = 'Hatayı bildir'; bildirim(r.hata, true); return; }
  b.textContent = 'Gönderildi ✓';
  bildirim('Teşekkürler! Çökme kaydı bize ulaştı.');
  setTimeout(() => { $('cokmePerde').hidden = true; }, 900);
});
$('cokmeRapor').addEventListener('click', () => api.cokmeRaporuAc());
$('cokmeKapat').addEventListener('click', () => { $('cokmePerde').hidden = true; });
$('kayitKapat').addEventListener('click', () => { $('kayitPerde').hidden = true; });
$('kayitKopyala').addEventListener('click', () => { api.panoyaYaz($('kayitMetin').textContent); bildirim('Kayıt kopyalandı.'); });

/* =========================================================
   DUYURULAR
   ========================================================= */
function kapatilanDuyurular() {
  try { return JSON.parse(localStorage.getItem('kapatilanDuyurular') || '[]'); } catch { return []; }
}
async function duyurulariYukle() {
  let liste = [];
  try { liste = await api.duyurular(); } catch {}
  const kapali = kapatilanDuyurular();
  const d = (Array.isArray(liste) ? liste : []).find((x) => !kapali.includes(x.id));
  $('ustDuyuru').hidden = !d;
  if (!d) return;
  yaz('ustDuyuruMetin', d.metin);
  $('ustDuyuru').dataset.id = d.id;
}
$('ustDuyuruKapat').addEventListener('click', () => {
  const id = Number($('ustDuyuru').dataset.id);
  const k = kapatilanDuyurular(); k.push(id);
  try { localStorage.setItem('kapatilanDuyurular', JSON.stringify(k.slice(-50))); } catch {}
  duyurulariYukle();
});
// Açılışta ve 15 dakikada bir (oyun açıkken bakılmaz)
setTimeout(duyurulariYukle, 3000);
setInterval(() => { if (oyunDurumu !== 'acik' && !document.hidden) duyurulariYukle(); }, 15 * 60 * 1000);

async function panelDuyurulariYukle() {
  const r = await api.yoneticiDuyurular();
  const k = $('ypDuyurular'); k.textContent = '';
  if (!r.ok) { if (!/oneri_|duyuru_|function/.test(r.hata || '')) panelHata(r); else k.append(el('small', 'bos-yazi', 'Duyurular için veritabanı güncellemesi (guncelleme-2.sql) gerekiyor.')); return; }
  const liste = Array.isArray(r.veri) ? r.veri : [];
  if (!liste.length) { k.append(el('small', 'bos-yazi', 'Henüz duyuru yok.')); return; }
  liste.forEach((d) => {
    const s = el('div', 'yp-yonetici yp-duyuru');
    const sol = el('div');
    sol.append(el('p', '', d.metin));
    const bitti = d.bitis && new Date(d.bitis) < new Date();
    sol.append(el('small', '', `${tarihYaz(d.zaman)} · ${d.bitis ? (bitti ? 'süresi doldu' : 'bitiş ' + tarihYaz(d.bitis)) : 'süresiz'}`));
    const b = el('button', 'bag', 'Sil');
    b.addEventListener('click', async () => {
      if (!b.classList.contains('emin')) { b.classList.add('emin'); b.textContent = 'Emin misin?'; return; }
      const x = await api.yoneticiDuyuruSil(d.id);
      if (!x.ok) { panelHata(x); return; }
      panelDuyurulariYukle(); duyurulariYukle();
    });
    s.append(sol, b);
    k.append(s);
  });
}
$('ypDuyuruEkle').addEventListener('click', async () => {
  const m = $('ypDuyuruMetin').value.trim();
  if (m.length < 2) { bildirim('Duyuru metnini yaz.', true); return; }
  $('ypDuyuruEkle').disabled = true;
  const r = await api.yoneticiDuyuruEkle(m, $('ypDuyuruGun').value);
  $('ypDuyuruEkle').disabled = false;
  if (!r.ok) { panelHata(r); return; }
  $('ypDuyuruMetin').value = '';
  bildirim('Duyuru yayınlandı.');
  panelDuyurulariYukle(); duyurulariYukle();
});

/* =========================================================
   YENİ NELER VAR (güncellemeden sonra bir kez)
   ========================================================= */
(async function yenilikler() {
  try {
    const v = await api.uygulamaSurumu();
    let once = null;
    try { once = localStorage.getItem('sonGorulenSurum'); localStorage.setItem('sonGorulenSurum', v); } catch {}
    // İlk kurulumda gösterme; sadece sürüm değiştiyse
    if (!once || once === v) return;
    const r = await api.surumNotlari(v, once);
    if (!r.ok || !Array.isArray(r.veri) || !r.veri.length) return;
    const l = $('yeniListe'); l.textContent = '';
    r.veri.forEach((m) => l.append(el('li', '', m)));
    yaz('yeniSurum', 'v' + v);
    setTimeout(() => { $('yeniPerde').hidden = false; }, 1800);
  } catch {}
})();
$('yeniTamam').addEventListener('click', () => { $('yeniPerde').hidden = true; });

/* =========================================================
   EKRAN GÖRÜNTÜLERİ
   ========================================================= */
let galeriListe = [];
let galeriGosterilen = 0;
let galeriSecili = null;
const galeriUrl = new Map(); // ad -> blob adresi (bellekte tekrar okunmasın)
let galeriGozcu = null;

async function resimAdresi(ad) {
  if (galeriUrl.has(ad)) return galeriUrl.get(ad);
  const veri = await api.ekranGoruntusuOku(ad);
  const url = URL.createObjectURL(new Blob([veri], { type: 'image/png' }));
  galeriUrl.set(ad, url);
  return url;
}
function galeriTemizle() {
  galeriUrl.forEach((u) => URL.revokeObjectURL(u));
  galeriUrl.clear();
}
async function galeriYukle() {
  galeriListe = await api.ekranGoruntuleri();
  galeriGosterilen = 0;
  $('galeri').textContent = '';
  if (!galeriListe.length) {
    $('galeri').append(el('div', 'bos', 'Henüz ekran görüntüsü yok. Oyunda F2\'ye bas.'));
    $('galeriDaha').hidden = true;
    return;
  }
  if (galeriGozcu) galeriGozcu.disconnect();
  // Resimler ekrana gelince okunur
  galeriGozcu = new IntersectionObserver((girdiler) => {
    girdiler.forEach(async (g) => {
      if (!g.isIntersecting) return;
      galeriGozcu.unobserve(g.target);
      const img = g.target.querySelector('img');
      try { img.src = await resimAdresi(g.target.dataset.ad); } catch {}
    });
  }, { root: $('sayfa-galeri'), rootMargin: '200px' });
  galeriDahaGoster();
}
function galeriDahaGoster() {
  const son = Math.min(galeriListe.length, galeriGosterilen + 40);
  for (let i = galeriGosterilen; i < son; i++) {
    const g = galeriListe[i];
    const b = el('button', 'galeri-oge');
    b.dataset.ad = g.ad;
    const img = el('img'); img.alt = g.ad; img.decoding = 'async';
    img.addEventListener('load', () => img.classList.add('yuklendi'));
    const t = new Date(g.zaman);
    b.append(img, el('span', '', `${t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`));
    b.addEventListener('click', () => galeriAc(g.ad));
    $('galeri').append(b);
    galeriGozcu.observe(b);
  }
  galeriGosterilen = son;
  $('galeriDaha').hidden = galeriGosterilen >= galeriListe.length;
}
async function galeriAc(ad) {
  galeriSecili = ad;
  yaz('galeriAd', ad);
  $('galeriSil').classList.remove('emin'); $('galeriSil').textContent = 'Sil';
  $('galeriResim').src = await resimAdresi(ad);
  $('galeriPerde').hidden = false;
}
$('galeriDaha').addEventListener('click', galeriDahaGoster);
// Galeriden arkadaşa gönder
$('galeriGonder').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = $('galeriGonderMenu');
  if (!m.hidden) { m.hidden = true; return; }
  m.textContent = '';
  const ark = (arkSon || []).filter((x) => x.tur === 'arkadas');
  if (!ark.length) m.append(el('div', 'bos', 'Henüz arkadaşın yok.'));
  for (const a of ark) {
    const b = el('button', '', a.ad);
    b.addEventListener('click', async () => {
      m.hidden = true;
      const dosya = galeriSecili;
      if (await fotoGonderBasla(a.mc_uuid, dosya, null)) bildirim(`Fotoğraf ${a.ad} adlı arkadaşına gönderildi.`);
    });
    m.append(b);
  }
  m.hidden = false;
});
document.addEventListener('click', (e) => { if (!e.target.closest('#galeriGonderMenu, #galeriGonder')) $('galeriGonderMenu').hidden = true; });
$('galeriKlasor').addEventListener('click', () => api.ekranGoruntusuKlasor());
$('galeriKapat').addEventListener('click', () => { $('galeriPerde').hidden = true; });
$('galeriPerde').addEventListener('click', (e) => { if (e.target === $('galeriPerde')) $('galeriPerde').hidden = true; });
// Discord'a gönder: resim panoya kopyalanır, Discord uygulaması açılır, kullanıcı Ctrl+V ile yapıştırır
$('galeriDiscord').addEventListener('click', async () => {
  const r = await api.ekranGoruntusuKopyala(galeriSecili);
  if (!r.ok) { bildirim(r.hata, true); return; }
  api.disAc('discord://-/channels/@me');
  bildirim('Resim kopyalandı. Discord açılınca istediğin sohbete Ctrl+V ile yapıştır.');
});
$('galeriKopyala').addEventListener('click', async () => {
  const r = await api.ekranGoruntusuKopyala(galeriSecili);
  if (r.ok) bildirim('Panoya kopyalandı. Discord\'a Ctrl+V ile yapıştırabilirsin.'); else bildirim(r.hata, true);
});
$('galeriSil').addEventListener('click', async () => {
  const b = $('galeriSil');
  if (!b.classList.contains('emin')) { b.classList.add('emin'); b.textContent = 'Emin misin?'; return; }
  const r = await api.ekranGoruntusuSil(galeriSecili);
  if (!r.ok) { bildirim(r.hata, true); return; }
  const u = galeriUrl.get(galeriSecili); if (u) { URL.revokeObjectURL(u); galeriUrl.delete(galeriSecili); }
  $('galeriPerde').hidden = true;
  galeriYukle();
});

/* ---------- Pencereyi sürükleme ---------- */
(function surukleme() {
  let aktif = false;
  let bekliyor = false;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (t.closest('button, input, select, textarea, a, label, .sk, .skin-yer, .kafa, .skin-ekle, .surum-acilir')) return;
    // Tutulabilen yerler: üst şerit, başlıklar, logo alanı, pencere kenarları ve vitrinin boş yerleri
    const bos = t === $('pencere') || t.matches('.yan, .vitrin, .sahne, .ozet, .sayfa-baslik');
    if (!t.closest('.surukle') && !bos) return;
    // Sürüklemeyi Windows/Linux kendisi yapar; bırakınca "pointerup" arayüze hiç gelmeyebilir.
    // Bu yüzden fareyi yakalamıyoruz ve sürükleme durumunu ilk fırsatta kendimiz bitiriyoruz.
    aktif = true;
    document.body.classList.add('surukleniyor');
    api.surukleBasla();
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (aktif && e.buttons === 0) { bitir(); return; } // tuş bırakılmış: sürükleme bitti
    if (!aktif || bekliyor) return;
    bekliyor = true;
    requestAnimationFrame(() => { bekliyor = false; if (aktif) api.surukle(); });
  });
  const bitir = () => {
    if (!aktif) return;
    aktif = false;
    document.body.classList.remove('surukleniyor');
    api.surukleBitir();
  };
  document.addEventListener('pointerup', bitir);
  document.addEventListener('pointercancel', bitir);
  document.addEventListener('pointerdown', (e) => { if (aktif && e.isTrusted) bitir(); }, true);
  document.addEventListener('mouseenter', bitir);
  window.addEventListener('blur', bitir);
  window.addEventListener('focus', bitir);
  // Pencere taşındıktan sonra da bitir (bazı sistemlerde hiçbir fare olayı gelmiyor)
  api.pencereTasindi?.(() => setTimeout(bitir, 150));
})();

/* ---------- Kenardan büyütme / küçültme ---------- */
document.querySelectorAll('.kenar').forEach((k) => {
  let aktif = false, bekliyor = false;
  k.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    aktif = true;
    document.body.classList.add('boyutlaniyor');
    k.setPointerCapture(e.pointerId);
    api.boyutBasla(k.dataset.kenar);
    e.preventDefault();
    e.stopPropagation();
  });
  k.addEventListener('pointermove', () => {
    if (!aktif || bekliyor) return;
    bekliyor = true;
    requestAnimationFrame(() => { bekliyor = false; if (aktif) api.boyut(); });
  });
  const bitir = () => {
    if (!aktif) return;
    aktif = false;
    document.body.classList.remove('boyutlaniyor');
    api.boyutBitir();
  };
  k.addEventListener('pointerup', bitir);
  k.addEventListener('pointercancel', bitir);
});

/* ---------- Pencere butonları ---------- */
$('kucultBtn').addEventListener('click', () => api.pencereyiKucult());
$('kapatBtn').addEventListener('click', () => api.pencereyiKapat());
/* ---------- Klavye kısayolları ---------- */
const SAYFA_SIRASI = ['ana', 'modlar', 'surumler', 'ayarlar'];
function yaziAlaniMi(x) {
  return !!x && (x.tagName === 'INPUT' || x.tagName === 'TEXTAREA' || x.tagName === 'SELECT' || x.isContentEditable);
}
function acikPencereVar() {
  return ['configPerde', 'skinEkle', 'sunucuForm', 'profilForm'].some((id) => $(id) && !$(id).hidden);
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); sayfaAc(SAYFA_SIRASI[Number(e.key) - 1]); return; }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); sayfaAc('ayarlar'); return; }
  if (e.key === 'F5') { e.preventDefault(); $('yenileBtn').click(); return; }
  if (e.key === 'Enter' && !e.repeat && !yaziAlaniMi(document.activeElement) && !acikPencereVar()
      && (document.activeElement === document.body || document.activeElement === $('oynaBtn'))) {
    e.preventDefault();
    if (!$('oynaBtn').disabled) $('oynaBtn').click();
    return;
  }
});
api.tepsiOynaDinle(() => { if (!$('oynaBtn').disabled) $('oynaBtn').click(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('configPerde').hidden = true; $('skinEkle').hidden = true; $('pelerinKutu').hidden = true; $('sunucuForm').hidden = true; $('profilForm').hidden = true; acilirKapat(); }
  if ($('sayfa-ana').classList.contains('aktif') && document.activeElement === document.body) {
    if (e.key === 'ArrowLeft') skinSec(skinSecili - 1);
    if (e.key === 'ArrowRight') skinSec(skinSecili + 1);
  }
});

/* =========================================================
   BAŞLANGIÇ
   ========================================================= */
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async function basla() {
  const enAz = bekle(1200);
  yaz('acilisDurum', 'Ayarlar yükleniyor…');
  ayarlar = await api.ayarlariGetir();
  temaUygula();
  solSekmeAc(ayarlar.solSekme || 'sunucu', false);
  oyunAyarlariniDoldur();
  modProfiliYaz();
  oneriCiz();
  haftayiCiz();
  api.uygulamaSurumu().then((v) => yaz('uygSurum', v));
  api.guncellemeDurumu().then(guncellemeGoster);

  yaz('acilisDurum', 'Sürümler yükleniyor…');
  const surum = surumleriYukle();
  yaz('acilisDurum', 'Sunucular yükleniyor…');
  const liste = sunuculariYukle();
  setInterval(() => { if (oyunDurumu !== 'acik') sunuculariYukle(); }, 30000);

  yaz('acilisDurum', 'Hesap kontrol ediliyor…');
  const d = await api.hesapDurumu();
  girisli = !d.girisli; // ilk çağrıda skinlerin yüklenmesi için
  hesabiGoster(d);

  await Promise.race([Promise.all([liste, surum]), bekle(3500)]);
  await enAz;
  yaz('acilisDurum', 'Hazır!');
  $('acilis').classList.add('bitti');
  setTimeout(() => { $('acilis').hidden = true; }, 600);
  if (!d.girisli) {
    perdeyiAc();
    if (d.hata) yaz('girisHata', d.hata);
  }
})();
