/* =========================================================
   DİL: launcher Türkçe yazılır; "English" seçiliyse ekrandaki yazılar dil-en.js sözlüğüyle çevrilir.
   Sabit yazılar birebir, değişkenli yazılar ("{} sunucusuna bağlan") kalıpla eşleşir. Sonradan
   eklenen/değişen yazıları MutationObserver yakalar. Karşılığı olmayan yazı Türkçe kalır.
   Dil seçimi: localStorage (ilk boyamada titreme olmasın) + ayarlar.dil (oyun içi menü için).
   ========================================================= */
(function () {
  const ANAHTAR = 'kcz-dil';
  function otomatik() {
    // Türkiye saat dilimi ya da Türkçe tarayıcı dili: Türkçe; değilse İngilizce
    try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Istanbul') return 'tr'; } catch { /* yok */ }
    const l = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    return l.some((x) => /^tr\b/i.test(x)) ? 'tr' : 'en';
  }
  let kayitli = null;
  try { kayitli = localStorage.getItem(ANAHTAR); } catch { /* yok */ }
  const aktif = kayitli === 'en' || kayitli === 'tr' ? kayitli : otomatik();

  const DIL = {
    aktif,
    otomatik,
    t: (s) => s,
    /** Ayarlardaki dil: boşsa bu bilgisayar için seçileni kaydeder; farklıysa yeni dille yeniden yükler */
    esitle(ayarDili, kaydet) {
      if (ayarDili !== 'tr' && ayarDili !== 'en') { if (kaydet) kaydet(aktif); return; }
      try { localStorage.setItem(ANAHTAR, ayarDili); } catch { /* yok */ }
      if (ayarDili !== aktif) location.reload();
    },
    degistir(yeni) {
      try { localStorage.setItem(ANAHTAR, yeni); } catch { /* yok */ }
      if (yeni !== aktif) location.reload();
    },
  };
  window.DIL = DIL;
  if (aktif !== 'en') return;

  document.documentElement.lang = 'en';
  const S = window.DIL_EN || { sabit: {}, kalip: {} };
  const sabit = new Map(Object.entries(S.sabit));
  const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const harf = /[A-Za-zÇĞİÖŞÜçğıöşü]/;
  const kaliplar = Object.entries(S.kalip)
    .filter(([k]) => k.replace(/\{\}/g, '').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length >= 2)
    .map(([k, v]) => ({ re: new RegExp('^' + k.split('{}').map(kacis).join('([\\s\\S]*?)') + '$'), v, uzun: k.replace(/\{\}/g, '').length }))
    .sort((a, b) => b.uzun - a.uzun);

  function cevir(metin, derin) {
    if (!metin || !harf.test(metin)) return null;
    const bas = metin.match(/^\s*/)[0];
    const son = metin.slice(bas.length).match(/\s*$/)[0];
    const ic = metin.slice(bas.length, metin.length - son.length);
    if (sabit.has(metin)) return sabit.get(metin);
    const tek = ic.replace(/\s+/g, ' ');
    if (sabit.has(tek)) return bas + sabit.get(tek) + son;
    if ((derin || 0) > 1) return null;
    for (const k of kaliplar) {
      // Önce boşluklarıyla (" · görüş {}"), sonra kırpılmış haliyle
      let m = k.re.exec(metin), b = '', s = '';
      if (!m) { m = k.re.exec(ic); b = bas; s = son; }
      if (!m) continue;
      // Kalıbın içindeki değerler de Türkçe bir yazı olabilir (ör. " · görüş 16")
      return b + k.v.replace(/\{(\d+)\}/g, (_, n) => {
        const d = m[Number(n)] ?? '';
        const c = cevir(d, (derin || 0) + 1);
        return c != null ? c : d;
      }) + s;
    }
    return null;
  }
  DIL.t = (s) => { const c = cevir(String(s)); return c != null ? c : s; };

  const ATLA = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
  const OZNITELIK = ['title', 'placeholder', 'aria-label'];
  function atlanir(el) {
    return !el || ATLA.has(el.nodeName) || (el.closest && el.closest('[translate="no"]'));
  }
  function metinCevir(dugum) {
    if (atlanir(dugum.parentElement)) return;
    const c = cevir(dugum.nodeValue);
    if (c != null && c !== dugum.nodeValue) dugum.nodeValue = c;
  }
  function oznitelikCevir(el, ad) {
    const v = el.getAttribute(ad);
    if (!v) return;
    const c = cevir(v);
    if (c != null && c !== v) el.setAttribute(ad, c);
  }
  function agacCevir(kok) {
    if (kok.nodeType === 3) { metinCevir(kok); return; }
    if (kok.nodeType !== 1 || atlanir(kok)) return;
    // Bağlama göre farklı çevrilen yazılar: HTML'de data-en ile verilir
    const ozeller = kok.matches('[data-en]') ? [kok, ...kok.querySelectorAll('[data-en]')] : kok.querySelectorAll('[data-en]');
    for (const e of ozeller) { if (e.dataset.en) { e.textContent = e.dataset.en; delete e.dataset.en; } }
    const y = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT);
    let d;
    while ((d = y.nextNode())) metinCevir(d);
    for (const ad of OZNITELIK) {
      if (kok.hasAttribute(ad)) oznitelikCevir(kok, ad);
      kok.querySelectorAll('[' + ad + ']').forEach((e) => oznitelikCevir(e, ad));
    }
  }
  function basla() {
    agacCevir(document.body);
    document.title = DIL.t(document.title);
    new MutationObserver((liste) => {
      for (const m of liste) {
        if (m.type === 'characterData') metinCevir(m.target);
        else if (m.type === 'attributes') oznitelikCevir(m.target, m.attributeName);
        else m.addedNodes.forEach(agacCevir);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: OZNITELIK });
  }
  if (document.body) basla();
  else document.addEventListener('DOMContentLoaded', basla);

  // Tarayıcı pencereleri (onay/uyarı)
  const onay = window.confirm.bind(window), uyari = window.alert.bind(window);
  window.confirm = (m) => onay(DIL.t(m));
  window.alert = (m) => uyari(DIL.t(m));
})();
