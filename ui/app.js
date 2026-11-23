// KÇZ Launcher arayüz mantığı
const $ = (id) => document.getElementById(id);
const api = window.kcz;
let LINUX = false; // istemci_bilgi gelince ayarlanır

let ayarlar = {};
let girisli = false;
let hesapAdi = '';
let cevrimdisi = false;   // İnternet yok: son hesapla çevrimdışı oynanıyor
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
  gri: { ad: 'Gri', alt: 'Ana tema', v: '#a1a1aa', v2: '#e4e4e7' },
  siyah: { ad: 'Siyah', alt: 'Tam karanlık', v: '#fafafa', v2: '#737373' },
  end: { ad: 'End', alt: 'Yıldızlar ve boşluk', v: '#c084fc', v2: '#fde68a' },
  nether: { ad: 'Nether', alt: 'Lav ve ateş', v: '#f97316', v2: '#ef4444' },
  dunya: { ad: 'Normal Dünya', alt: 'Çimen ve gökyüzü', v: '#4ade80', v2: '#38bdf8' },
  performans: { ad: 'Performans', alt: 'Animasyonsuz, en hafif', v: '#22c55e', v2: '#a3e635' }
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

function temaUygula() {
  const t = TEMALAR[ayarlar.tema] || TEMALAR.gri;
  const v = ayarlar.vurgu || t.v;
  document.body.dataset.tema = ayarlar.tema || 'gri';
  // Performans teması: saydamlık ve efektler kapalı (en az işlemci ve ekran kartı kullanımı)
  document.body.dataset.saydam = ayarlar.tema === 'performans' ? '0' : String(ayarlar.saydamlik ?? 1);
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
      b.append(on, el('b', '', t.ad), el('small', '', t.alt));
      b.addEventListener('click', () => temaKaydet({ tema: id, vurgu: t.v }));
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
  }
  document.querySelectorAll('.tema').forEach((b) => b.classList.toggle('aktif', b.dataset.tema === ayarlar.tema));
  document.querySelectorAll('.renk').forEach((b) => b.classList.toggle('secili', b.dataset.renk === ayarlar.vurgu));
  document.querySelectorAll('.saydam-btn').forEach((b) => b.classList.toggle('aktif', Number(b.dataset.s) === ayarlar.saydamlik));
  $('ozelRenk').value = ayarlar.vurgu || '#a1a1aa';
  yaz('renkKodu', ayarlar.vurgu || '');
  yaz('saydamAciklama', (SAYDAMLIK[ayarlar.saydamlik] || SAYDAMLIK[1])[1]);
}

/* =========================================================
   SEKMELER
   ========================================================= */
function sayfaAc(ad) {
  document.querySelectorAll('.sekme').forEach((x) => x.classList.toggle('aktif', x.dataset.sayfa === ad));
  document.querySelectorAll('.sayfa').forEach((s) => s.classList.toggle('aktif', s.id === 'sayfa-' + ad));
  if (ad === 'surumler') surumListesiCiz();
  if (ad === 'modlar') modSayfasiAc();
  acilirKapat();
}
document.querySelectorAll('.sekme').forEach((b) => b.addEventListener('click', () => sayfaAc(b.dataset.sayfa)));

/* =========================================================
   HESAP
   ========================================================= */
function hesabiGoster(d) {
  const once = girisli;
  const onceCevrimdisi = cevrimdisi;
  girisli = !!(d && d.girisli);
  cevrimdisi = girisli && !!d.cevrimdisi;
  hesapAdi = girisli ? d.ad || 'Oyuncu' : '';
  if (girisli) {
    yaz('hesapAd', hesapAdi);
    yaz('hesapTur', cevrimdisi ? 'Çevrimdışı · Bağlanmak için tıkla' : 'Microsoft hesabı · Çıkış için tıkla');
    $('hesapBtn').title = cevrimdisi ? 'Tekrar bağlanmayı dene' : 'Çıkış yap';
    yaz('hesapHarf', hesapAdi[0].toUpperCase());
    if (d.uuid) {
      const img = $('hesapAvatar');
      img.onload = () => { img.hidden = false; $('hesapHarf').hidden = true; };
      img.onerror = () => { img.hidden = true; $('hesapHarf').hidden = false; };
      img.src = `https://mc-heads.net/avatar/${d.uuid}/68`;
    }
  } else {
    yaz('hesapAd', 'Giriş yapılmadı');
    yaz('hesapTur', 'Oynamak için giriş yap');
    $('hesapBtn').title = 'Giriş yap';
    $('hesapAvatar').hidden = true;
    $('hesapHarf').hidden = false;
    yaz('hesapHarf', '?');
  }
  if (once !== girisli || onceCevrimdisi !== cevrimdisi) skinleriYukle();
  if (onceCevrimdisi && !cevrimdisi && girisli) bildirim('İnternet geldi, tekrar çevrimiçisin ✓');
  oynaGuncelle();
}

// Çevrimdışıyken internet geldi mi diye arada bir bak
setInterval(async () => {
  if (cevrimdisi && oyunDurumu !== 'acik') hesabiGoster(await api.hesapDurumu());
}, 60000);

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
  btn.textContent = LINUX ? 'Tarayıcıyla giriş yap' : 'Edge ile giriş yap';
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
$('cevrimdisiBtn').addEventListener('click', async () => {
  const ad = $('cevrimdisiAd').value.trim();
  if (!ad) { yaz('girisHata', 'Kullanıcı adı gir.'); return; }
  const btn = $('cevrimdisiBtn');
  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';
  yaz('girisHata', '');
  const d = await api.cevrimdisiGiris(ad);
  btn.disabled = false;
  btn.textContent = 'Çevrimdışı Oyna';
  girisSonucu(d);
});
$('cevrimdisiAd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('cevrimdisiBtn').click();
});
$('hesapBtn').addEventListener('click', async () => {
  if (cevrimdisi) {
    const btn = $('hesapBtn');
    btn.disabled = true;
    yaz('hesapTur', 'Bağlanılıyor…');
    const d = await api.hesapTekrarDene();
    btn.disabled = false;
    hesabiGoster(d);
    if (d.cevrimdisi) bildirim('Hâlâ internet yok, çevrimdışı devam ediliyor.');
    return;
  }
  if (girisli) {
    hesabiGoster(await api.cikisYap());
    bildirim('Çıkış yapıldı.');
  }
  perdeyiAc();
});

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
  $('yenileBtn').hidden = ad !== 'sunucu';
  if (kaydet) api.ayarlariKaydet({ solSekme: ad });
}
document.querySelectorAll('#solSekmeler button').forEach((b) => b.addEventListener('click', () => solSekmeAc(b.dataset.sol)));

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

$('oynaBtn').addEventListener('click', () => {
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
$('yenileBtn').addEventListener('click', sunuculariYukle);
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
    yaz('devYazi', 'KÇZ');
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
    const p = seciliProfil();
    yaz('duyuruEtiket', `PROFİL · ${p.ad}`);
    yaz('duyuruBaslik', `${p.surum} · ${YUK_AD[p.yukleyici]}`);
    yaz('duyuruMetin', p.yukleyici === 'vanilla'
      ? 'Modsuz, temiz Minecraft. OYNA oyunu ana menüde açar.'
      : 'Bu profilin kendi modları var. Sol taraftaki mod butonundan kurup yönetebilirsin.');
    yaz('duyuruCip', surumBilgi(p.surum).yuklu ? 'Yüklü ✓' : 'İlk açılışta iner');
    const kap = $('cevrimici');
    kap.innerHTML = '';
    yaz('cevrimiciSayi', '');
    kap.append(el('span', 'bos-yazi', 'Profille oyun ana menüde açılır. Oyunda istediğin sunucuya girebilirsin.'));
    return;
  }
  const s = seciliSunucu();
  const d = s && s.veri;
  // Sunucu mesajı (MOTD)
  yaz('duyuruEtiket', `SUNUCU MESAJI · ${s ? s.ad : 'KÇZ'}`);
  if (!s) {
    yaz('duyuruBaslik', 'Hoş geldin!');
    yaz('duyuruMetin', 'Oyunu aç, Çok Oyunculu menüsünden sunucunu ekle. Sunucunun mesajları burada görünür.');
    yaz('duyuruCip', 'İpucu');
  } else if (!d) {
    yaz('duyuruBaslik', s.ad);
    yaz('duyuruMetin', 'Sunucuya bakılıyor…');
    yaz('duyuruCip', '…');
  } else if (d.durum === 'acik') {
    const satirlar = (d.motd || '').split('\n').map((x) => x.trim()).filter(Boolean);
    yaz('duyuruBaslik', satirlar[0] || 'Sunucu açık');
    yaz('duyuruMetin', satirlar.slice(1).join(' ') || `${d.oyuncu}/${d.maks} oyuncu çevrimiçi. Sunucu sürümü: ${d.surum}.`);
    yaz('duyuruCip', `Şimdi · ${d.gecikme} ms`);
  } else {
    yaz('duyuruBaslik', 'Sunucu kapalı');
    yaz('duyuruMetin', 'Şu an ulaşılamıyor. Bakımda olabilir, biraz sonra tekrar dene.');
    yaz('duyuruCip', 'Kapalı');
  }

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
    k.src = `https://mc-heads.net/avatar/${encodeURIComponent(ad)}/56`;
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
  { tur: 'mod', etiket: 'MOD', proje: 'iris', ad: 'Iris', alt: 'Shader\'ları açmak için gerekli', harf: 'I' },
  { tur: 'shader', etiket: 'SHADER', proje: 'complementary-reimagined', ad: 'Complementary', alt: 'Gerçekçi ışık, su ve gölgeler', harf: 'C' },
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
const YERLER = { 0: [0, 0, 0, 0.8], '-1': [-200, -4, -300, 0.68], 1: [200, -4, -300, 0.68], '-2': [-350, -10, -650, 0.58], 2: [350, -10, -650, 0.58] };
function vitrinOlcegi() {
  const sahne = $('sahne');
  const h = sahne ? sahne.clientHeight : 470;
  const w = sahne ? sahne.clientWidth : 800;
  return Math.max(0.85, Math.min(1.9, Math.min(h / 470, w / 790)));
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
  const bilgiler = await Promise.all(liste.map((s) => Skin3D.dokuBilgi(s.doku)));
  skinler = liste.filter((_, i) => bilgiler[i].ok).map((s, i) => ({ ...s, eski: bilgiler.filter((b) => b.ok)[i].eski }));
  if (seciliTur === 'son') skinSecili = skinler.length - 1;
  else skinSecili = 0;
  vitrinKur();
}

function ofset(i) {
  const n = skinler.length;
  let o = i - skinSecili;
  if (o > n / 2) o -= n;
  if (o < -n / 2) o += n;
  return o;
}

function modelYap(s, i) {
  const model = Skin3D.karakter(s.doku, s.ince, s.eski);
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
  $('skinKaldir').hidden = s.tur !== 'ekli';
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
  $('vitrin').addEventListener('dblclick', (e) => {
    if (!e.target.closest('.skin-yer.on')) return;
    onAci = -22;
    vitrinGuncelle();
  });
})();

/* ---------- Kafa fareyi takip etsin ---------- */
$('sahne').addEventListener('mousemove', (e) => {
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
});
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
  if (!otoEmote || !$('sayfa-ana').classList.contains('aktif')) return;
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
  if (!s || s.tur !== 'ekli') return;
  await api.skinKaldir(s.sira);
  await skinleriYukle();
  ayarlar = await api.ayarlariGetir();
});
$('skinEkleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('skinEkle').hidden = !$('skinEkle').hidden;
  if (!$('skinEkle').hidden) $('skinIsim').focus();
});
$('skinEkle').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { $('skinEkle').hidden = true; });

async function skinEkleSonuc(r) {
  if (r.ok) {
    $('skinEkle').hidden = true;
    $('skinIsim').value = '';
    await skinleriYukle('son');
    bildirim('Skin vitrine eklendi. Takmak için "Giy"e bas.');
  } else if (r.hata) bildirim(r.hata, true);
}
$('skinIsimEkle').addEventListener('click', async () => {
  const isim = $('skinIsim').value.trim();
  if (!isim) return;
  $('skinIsimEkle').disabled = true;
  skinEkleSonuc(await api.skinIsimEkle(isim));
  $('skinIsimEkle').disabled = false;
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
    btn.disabled = false;
    btn.classList.add('giris');
    dolgu.style.width = '0';
    yazi.textContent = 'GİRİŞ YAP';
    alt.textContent = 'Oynamak için Microsoft hesabınla giriş yap';
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
    if (cevrimdisi) {
      const yuklu = profilAktif() ? surumBilgi(seciliProfil().surum).yuklu : v.yuklu;
      alt.textContent = 'Çevrimdışı · ' + (!yuklu ? 'bu sürüm yüklü değil, internet gerekir'
        : s && !profilAktif() ? 'internetteki sunuculara bağlanılamaz' : 'tek oyunculu ve LAN');
    }
  }
  if (sonHata && !is && oyunDurumu !== 'acik') { alt.textContent = sonHata; alt.classList.add('hata'); }
  uygunSurumGoster();
}
let sonHata = '';

// hedefAdres boşsa oyun ana menüye açılır, doluysa direkt o sunucuya girer
async function oyunuAc(hedefAdres, hedefAd, surum, profilId) {
  if (!girisli) { perdeyiAc(); return; }
  if (is || oyunDurumu === 'acik') return;
  sonHata = '';
  const id = surum || ayarlar.mcSurum;
  is = { tur: 'oyna', surum: id, yuzde: 0, metin: hedefAdres ? `${hedefAd} sunucusuna bağlanılacak` : profilId ? `${hedefAd} profili hazırlanıyor…` : 'Hazırlanıyor…' };
  oynaRef.btn.classList.remove('patla');
  void oynaRef.btn.offsetWidth;
  oynaRef.btn.classList.add('patla');
  oynaGuncelle();
  if ($('sayfa-surumler').classList.contains('aktif')) surumListesiCiz();

  const s = await api.oyunuBaslat(hedefAdres || null, surum || null, profilId || null);
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
    bildirim(`${d.surum} açıldı. İyi oyunlar!`);
  } else if (d.tur === 'kapandi') {
    is = null;
    oyunDurumu = 'bosta';
    api.ayarlariGetir().then((a) => { ayarlar = a; oyunAyarlariniDoldur(); }).catch(() => {});
    if (d.kod && d.kod !== 0) sonHata = 'Oyun bir hatayla kapandı. Ayrıntılar: Ayarlar > Oyun kaydı.';
    if (d.modHatasi) modHatasiGoster(d.modHatasi);
    sunuculariYukle();
    haftayiCiz();
  }
  oynaGuncelle();
});

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
}
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
  $('gizleSec').checked = !!ayarlar.oyunAcilincaGizle;
  $('yukleyiciSec').value = ayarlar.yukleyici;
  performansDoldur();
  istemciDoldur();
  $('tepsiSec').checked = !!ayarlar.tepsiyeKucult;
  $('yedekSec').checked = !!ayarlar.dunyaYedek;
}
let ramZaman = null;
$('ramSec').addEventListener('input', (e) => {
  yaz('ramDeger', `${e.target.value} GB`);
  clearTimeout(ramZaman);
  ramZaman = setTimeout(async () => { ayarlar = await api.ayarlariKaydet({ ram: e.target.value }); bildirim('Ayarlar kaydedildi ✓'); }, 350);
});
$('gizleSec').addEventListener('change', async (e) => { ayarlar = await api.ayarlariKaydet({ oyunAcilincaGizle: e.target.checked }); bildirim('Ayarlar kaydedildi ✓'); });
$('yukleyiciSec').addEventListener('change', (e) => yukleyiciSec(e.target.value));
$('klasorBtn').addEventListener('click', () => api.klasoruAc());

/* =========================================================
   PERFORMANS
   ========================================================= */
const SEVIYE_AD = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
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
  } catch (e) {
    bildirim('Sistem taranamadı.', true);
  } finally {
    b.disabled = false; b.textContent = 'Tekrar tara';
  }
});

async function seviyeUygula(seviye) {
  const butonlar = document.querySelectorAll('#seviyeler .seviye');
  butonlar.forEach((b) => { b.disabled = true; });
  try {
    const r = await api.performansUygula(seviye);
    if (!r || !r.ok) { bildirim((r && r.hata) || 'Ayar uygulanamadı.', true); return; }
    ayarlar = r.ayarlar;
    oyunAyarlariniDoldur();
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
   KÇZ CLIENT (oyun içi menü) ve eklentiler
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
  $('istKonum').value = i.konum === 'sag-ust' ? 'sag-ust' : 'sol-ust';
  $('istAyarlar').classList.toggle('kapali', !i.acik);
  const destek = istemciSurumleri.length
    ? `Minecraft ${istemciSurumleri.join(', ')} ve Fabric/Quilt (Vanilla dahil) ile çalışır.`
    : 'Bu derlemede oyun içi menü yok (derleme kaydına bak).';
  $('istemciAciklama').textContent = `Oyunda Esc menüsündeki KÇZ Menü düğmesiyle açılır; buradaki ayarların aynısı orada da var ve launcher temasıyla aynı görünür. ${destek}`;
  const zayif = tarama && tarama.seviye === 'dusuk';
  $('shaderAciklama').textContent = zayif
    ? '⚠ Sistem taraması bilgisayarını zayıf buldu: shader FPS\'i çok düşürebilir.'
    : 'Iris ve Complementary shader paketini kurup açar. Güçlü bir ekran kartı ister.';
}

async function istemciKaydet(degisim) {
  const yeni = { ...(ayarlar.istemci || {}), ...degisim };
  ayarlar = await api.ayarlariKaydet({ istemci: yeni });
  istemciDoldur();
  bildirim('Ayarlar kaydedildi ✓');
}
$('istAcikSec').addEventListener('change', (e) => istemciKaydet({ acik: e.target.checked }));
document.querySelectorAll('[data-ist]').forEach((x) => {
  x.addEventListener('change', (e) => {
    if (x.dataset.ist === 'shader' && e.target.checked && tarama && tarama.seviye === 'dusuk') {
      bildirim('Uyarı: bilgisayarın shader için zayıf görünüyor, FPS düşebilir.', true);
    }
    istemciKaydet({ [x.dataset.ist]: e.target.checked });
  });
});
$('istZoomKat').addEventListener('change', (e) => istemciKaydet({ zoomKat: Number(e.target.value) }));
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
    aktif = true;
    document.body.classList.add('surukleniyor');
    try { t.setPointerCapture(e.pointerId); } catch { /* yok */ }
    api.surukleBasla();
    e.preventDefault();
  });
  document.addEventListener('pointermove', () => {
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
  window.addEventListener('blur', bitir);
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
  if (e.key === 'Escape') { $('configPerde').hidden = true; $('skinEkle').hidden = true; $('sunucuForm').hidden = true; $('profilForm').hidden = true; acilirKapat(); }
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
  if (d.cevrimdisi) bildirim(`İnternet yok: ${d.ad} olarak çevrimdışı oynayabilirsin.`);

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
