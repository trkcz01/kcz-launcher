// Arayüz ile Rust tarafı arasındaki köprü.
// Eski Electron sürümündeki window.kcz fonksiyonlarının hepsi aynı adlarla burada.
(function () {
  const T = window.__TAURI__;
  const cagir = (komut, arg) => T.core.invoke(komut, arg || {});
  const dinle = (olay, f) => T.event.listen(olay, (e) => f(e.payload));
  const pencere = () => T.window.getCurrentWindow();

  // Kenar adlarını Tauri'nin yön adlarına çevir
  const YON = { n: 'North', s: 'South', e: 'East', w: 'West', ne: 'NorthEast', nw: 'NorthWest', se: 'SouthEast', sw: 'SouthWest' };

  window.kcz = {
    ayarlariGetir: () => cagir('ayarlar_getir'),
    ayarlariKaydet: (a) => cagir('ayarlar_kaydet', { yeni: a || {} }),

    hesapDurumu: () => cagir('hesap_durum'),
    hesapTekrarDene: () => cagir('hesap_tekrar_dene'),
    girisYap: () => cagir('hesap_pencere_giris'),
    tarayiciGirisBaslat: () => cagir('hesap_tarayici_baslat'),
    tarayiciAc: (adres) => cagir('edge_ac', { adres: String(adres || '') }),
    tarayiciGirisIptal: () => cagir('hesap_tarayici_iptal'),
    girisSonucuDinle: (f) => dinle('hesap-sonuc', f),
    panoyaYaz: (metin) => navigator.clipboard.writeText(String(metin || '')).catch(() => {}),
    cikisYap: () => cagir('hesap_cikis'),
    cevrimdisiGiris: (ad) => cagir('hesap_cevrimdisi_giris', { ad: String(ad || '') }),

    skinListesi: () => cagir('skin_liste'),
    skinIsimEkle: (isim) => cagir('skin_isim_ekle', { isim: String(isim || '') }),
    skinDosyaEkle: (ince) => cagir('skin_dosya_ekle', { ince: !!ince }),
    skinKaldir: (sira) => cagir('skin_kaldir', { sira: Number(sira) || 0 }),
    skinGiy: (kaynak) => cagir('skin_giy', { kaynak: kaynak || {} }),
    haftalikSure: () => cagir('sure_hafta'),
    disAc: (adres) => cagir('dis_ac', { adres: String(adres || '') }),

    uygulamaSurumu: () => T.app.getVersion(),
    guncellemeDurumu: () => cagir('guncelleme_durum'),
    guncellemeDenetle: () => cagir('guncelleme_denetle'),
    guncellemeIndir: () => cagir('guncelleme_indir'),
    guncellemeKur: () => cagir('guncelleme_kur'),
    guncellemeDinle: (f) => dinle('guncelleme', f),

    modAra: (o) => cagir('mod_ara', { o: o || {} }),
    sunucuModSayilari: () => cagir('mod_sunucu_sayilari'),
    modYukle: (o) => cagir('mod_yukle', { o: o || {} }),
    modListe: (o) => cagir('mod_liste', { o: o || {} }),
    eksikModlariKur: (eksik) => cagir('mod_eksikleri_kur', { eksik: Array.isArray(eksik) ? eksik : [] }),
    sonAcilis: () => cagir('oyun_son_acilis'),
    modAcKapat: (o) => cagir('mod_ac_kapat', { o: o || {} }),
    modSil: (o) => cagir('mod_sil', { o: o || {} }),
    modKlasoru: (o) => cagir('mod_klasor', { o: o || {} }),
    modDurumDinle: (f) => dinle('mod-durum', f),
    configListe: () => cagir('config_liste'),
    configOku: (yol) => cagir('config_oku', { yol: String(yol || '') }),
    configYaz: (yol, metin) => cagir('config_yaz', { yol: String(yol || ''), metin: String(metin || '') }),
    configKlasoru: () => cagir('config_klasor'),

    sistemiTara: () => cagir('sistem_tara'),
    istemciBilgi: () => cagir('istemci_bilgi'),
    profilKodu: (id) => cagir('profil_kodu', { id: String(id || '') }),
    profilKodEkle: (kod) => cagir('profil_kod_ekle', { kod: String(kod || '') }),
    yedekKlasoru: () => cagir('yedek_klasor_ac'),
    tepsiOynaDinle: (f) => dinle('tepsi-oyna', f),
    performansUygula: (seviye) => cagir('performans_uygula', { seviye: String(seviye || '') }),

    sunucuListesi: () => cagir('sunucu_liste'),
    sunucuSorgula: (adres) => cagir('sunucu_sorgula', { adres: String(adres || '') }),
    sunucuEkle: (ad, adres) => cagir('sunucu_ekle', { ad: String(ad || ''), adres: String(adres || '') }),
    sunucuSil: (adres) => cagir('sunucu_sil', { adres: String(adres || '') }),
    disSunucuSayisi: () => cagir('sunucu_dis_sayisi'),
    sunuculariIceAktar: () => cagir('sunucu_ice_aktar'),
    surumListesi: () => cagir('surum_liste'),
    surumYukle: (id) => cagir('surum_yukle', { id: String(id) }),
    surumSil: (id) => cagir('surum_sil', { id: String(id) }),
    oyunuBaslat: (hedefSunucu, surum, profilId) => cagir('oyun_baslat', {
      hedefSunucu: hedefSunucu || null, surum: surum || null, profilId: profilId || null
    }),
    sunucularDegisti: (f) => dinle('sunucular-degisti', () => f()),
    klasoruAc: () => cagir('oyun_klasor_ac'),

    // Pencere: Windows'un kendi sürükleme ve boyutlandırması (saydam pencerede de çalışır)
    pencereyiKucult: () => pencere().minimize(),
    pencereyiKapat: () => pencere().close(),
    surukleBasla: () => pencere().startDragging().catch(() => {}),
    surukle: () => {},
    surukleBitir: () => {},
    boyutBasla: (kenar) => { const y = YON[kenar]; if (y) pencere().startResizeDragging(y).catch(() => {}); },
    boyut: () => {},
    boyutBitir: () => {},

    ilerlemeDinle: (f) => dinle('oyun-ilerleme', f),
    durumDinle: (f) => dinle('oyun-durum', f),
    logDinle: (f) => dinle('oyun-log', f)
  };
})();
