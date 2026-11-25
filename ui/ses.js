/* =========================================================
   KCZ yakınlık sesli sohbeti (launcher tarafı)
   - Oyun (KCZ Client) 5 kez/sn "ses-durum" yollar: sunucu, ben, bas-konuş, yakındakiler (mesafe).
   - Aynı sunucudaki KCZ oyuncuları Supabase'teki "odada" buluşur; ses WebRTC ile doğrudan gider.
   - Ses mesafeye göre kısılır: 0 blokta tam, MESAFE'de sıfır. Sadece yakındakilere bağlanılır.
   - Zamanlayıcı yok: her şey Rust'ın gönderdiği olaylarla döner (pencere gizliyken de çalışsın).
   ========================================================= */
(() => {
  const MESAFE = 48; // bu kadar blok uzaktaki duyulmaz
  const BAGLAN = 40; // bu mesafeye girince bağlan
  const KOP = 64; // bundan uzaklaşınca bağlantıyı kapat
  const EN_FAZLA = 8; // aynı anda en fazla bu kadar kişi
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

  let mikrofon = null; // MediaStream
  let mikIzinYok = false;
  let oda = null;
  let ben = null; // kendi Minecraft UUID'm (tiresiz küçük harf)
  let sadeceArkadas = true; // IP adresi yabancılara gitmesin
  // Aktarma sunucusu (TURN): varsa ses hep onun üzerinden gider, kimse kimsenin IP'sini görmez.
  // Yoksa (kurulmadıysa) sadece arkadaşlarla doğrudan bağlanılır.
  let aktarma = null; // RTCIceServer[] ya da null
  let aktarmaZaman = 0;
  async function aktarmaAl() {
    if (aktarma && Date.now() - aktarmaZaman < 5 * 3600 * 1000) return aktarma;
    if (Date.now() - aktarmaZaman < 60 * 1000) return aktarma; // dakikada bir dene
    aktarmaZaman = Date.now();
    try {
      const r = await api.sesIce();
      aktarma = r.ok && Array.isArray(r.veri) ? r.veri : null;
    } catch { aktarma = null; }
    return aktarma;
  }
  let odadakiler = new Map(); // uuid -> {ad, arkadas}
  const esler = new Map(); // uuid -> {pc, ses, analiz, kazanc, ad, durum}
  let sonKatil = 0;
  let sonSinyal = 0;
  let sonDurumYaz = 0;
  let sinyalBekliyor = false;
  let katilBekliyor = false;
  let hata = '';
  let actx = null;

  const temiz = (u) => String(u || '').replace(/-/g, '').toLowerCase();

  // Mikrofon isteği: cevap gelmezse (izin sorusu görünmüyorsa) ses döngüsü takılmasın diye 4 sn'de bırak
  let mikIstek = null;
  async function mikrofonAl() {
    if (mikrofon || mikIzinYok) return mikrofon;
    if (!mikIstek) {
      mikIstek = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      }).then((m) => {
        mikrofon = m;
        mikrofon.getAudioTracks().forEach((t) => { t.enabled = false; });
        hata = '';
        return m;
      }).catch((e) => {
        mikIzinYok = true;
        hata = 'Mikrofon açılamadı';
        console.warn('KCZ ses: mikrofon', e);
        return null;
      });
    }
    await Promise.race([mikIstek, new Promise((r) => setTimeout(r, 4000))]);
    if (!mikrofon && !mikIzinYok) hata = 'Mikrofon izni bekleniyor (launcher penceresine bak)';
    return mikrofon;
  }

  function sesBaglami() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function esKapat(uuid, bildir) {
    const e = esler.get(uuid);
    if (!e) return;
    esler.delete(uuid);
    try { e.pc.close(); } catch { /* yok */ }
    try { e.ses.srcObject = null; e.ses.remove(); } catch { /* yok */ }
    if (bildir) api.sesSinyalGonder(uuid, 'bitir', '-').catch(() => {});
  }

  function hepsiniKapat() {
    for (const u of [...esler.keys()]) esKapat(u, true);
  }

  function esOlustur(uuid) {
    // Aktarma varsa sadece onun üzerinden (IP gizli); yoksa doğrudan (sadece arkadaşlarla)
    const pc = new RTCPeerConnection(aktarma ? { iceServers: aktarma, iceTransportPolicy: 'relay' } : { iceServers: STUN });
    const ses = new Audio();
    ses.autoplay = true;
    ses.volume = 0;
    document.body.appendChild(ses);
    const e = { pc, ses, analiz: null, ad: (odadakiler.get(uuid) || {}).ad || 'Oyuncu', mesafe: MESAFE, adaylar: [], uzak: false };
    if (mikrofon) mikrofon.getAudioTracks().forEach((t) => pc.addTrack(t, mikrofon));
    pc.onicecandidate = (ev) => {
      if (ev.candidate) api.sesSinyalGonder(uuid, 'aday', JSON.stringify(ev.candidate)).catch(() => {});
    };
    pc.ontrack = (ev) => {
      const akis = ev.streams[0] || new MediaStream([ev.track]);
      ses.srcObject = akis;
      ses.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) esKapat(uuid, false);
    };
    esler.set(uuid, e);
    return e;
  }

  async function teklifVer(uuid) {
    const e = esOlustur(uuid);
    try {
      const t = await e.pc.createOffer({ offerToReceiveAudio: true });
      await e.pc.setLocalDescription(t);
      await api.sesSinyalGonder(uuid, 'teklif', JSON.stringify(e.pc.localDescription));
    } catch (x) {
      console.warn('KCZ ses: teklif', x);
      esKapat(uuid, false);
    }
  }

  async function sinyalIsle(s) {
    const uuid = temiz(s.gonderen);
    let veri = null;
    try { veri = s.veri && s.veri !== '-' ? JSON.parse(s.veri) : null; } catch { veri = null; }
    if (s.tur === 'bitir') { esKapat(uuid, false); return; }
    if (s.tur === 'teklif' && veri) {
      // Sadece arkadaşlar açıksa yabancıdan gelen bağlantı isteği yok sayılır (IP'imiz ona gitmez)
      if (sadeceArkadas && !(odadakiler.get(uuid) || {}).arkadas) return;
      if (esler.has(uuid)) esKapat(uuid, false);
      const e = esOlustur(uuid);
      try {
        await e.pc.setRemoteDescription(veri);
        for (const a of e.adaylar) await e.pc.addIceCandidate(a).catch(() => {});
        e.adaylar = [];
        const c = await e.pc.createAnswer();
        await e.pc.setLocalDescription(c);
        await api.sesSinyalGonder(uuid, 'cevap', JSON.stringify(e.pc.localDescription));
      } catch (x) {
        console.warn('KCZ ses: cevap', x);
        esKapat(uuid, false);
      }
      return;
    }
    const e = esler.get(uuid);
    if (!e || !veri) return;
    if (s.tur === 'cevap') {
      try {
        await e.pc.setRemoteDescription(veri);
        for (const a of e.adaylar) await e.pc.addIceCandidate(a).catch(() => {});
        e.adaylar = [];
      } catch (x) { console.warn('KCZ ses: uzak cevap', x); }
    } else if (s.tur === 'aday') {
      if (e.pc.remoteDescription) await e.pc.addIceCandidate(veri).catch(() => {});
      else e.adaylar.push(veri);
    }
  }

  function odadanCik() {
    hepsiniKapat();
    if (oda) api.sesAyril().catch(() => {});
    oda = null;
    odadakiler = new Map();
    if (mikrofon) mikrofon.getAudioTracks().forEach((t) => { t.enabled = false; });
  }

  async function guncelle(d) {
    if (!d || !d.aktif || !d.sunucu || !d.ben) {
      if (oda) odadanCik();
      // Oyun açık ama sunucuda değil: yine de "bağlıyım" de ki oyun yanlış uyarı göstermesin
      if (d && d.aktif && Date.now() - sonDurumYaz > 900) {
        sonDurumYaz = Date.now();
        api.sesDurumYaz(0, [], d.sunucu ? '' : 'Sesli sohbet sunucularda çalışır').catch(() => {});
      }
      return;
    }
    const simdi = Date.now();
    if (oda && oda !== d.sunucu) odadanCik();
    oda = d.sunucu;
    ben = temiz(d.ben);
    sadeceArkadas = d.sadeceArkadas !== false;
    await mikrofonAl();
    await aktarmaAl();
    // Aktarma yoksa yabancılarla hiç bağlanma (IP gitmesin)
    if (!aktarma) sadeceArkadas = true;
    if (mikrofon) mikrofon.getAudioTracks().forEach((t) => { t.enabled = !!d.konus; });

    // Odaya katıl / odadakileri tazele (5 sn'de bir)
    if (simdi - sonKatil > 5000 && !katilBekliyor) {
      katilBekliyor = true;
      sonKatil = simdi;
      api.sesKatil(oda).then((r) => {
        if (r.ok && Array.isArray(r.veri.liste)) {
          odadakiler = new Map(r.veri.liste.map((x) => [temiz(x.mc_uuid), { ad: x.ad, arkadas: !!x.arkadas }]));
          if (!mikIzinYok) hata = '';
        } else if (!r.ok) {
          hata = /henüz güncellenmedi|Could not find/i.test(r.hata || '') ? 'Sunucu güncellenmedi' : 'Sesli sohbete bağlanılamadı';
        }
      }).catch(() => { hata = 'Sesli sohbete bağlanılamadı'; }).finally(() => { katilBekliyor = false; });
    }

    // Gelen bağlantı mesajları (saniyede bir)
    if (simdi - sonSinyal > 900 && !sinyalBekliyor) {
      sinyalBekliyor = true;
      sonSinyal = simdi;
      api.sesSinyalleriAl().then(async (r) => {
        if (r.ok && Array.isArray(r.veri)) for (const s of r.veri) await sinyalIsle(s);
      }).catch(() => {}).finally(() => { sinyalBekliyor = false; });
    }

    // Yakındakiler: mesafe, kime bağlanılacak
    const yakin = new Map((d.yakinlar || []).map((y) => [temiz(y.uuid), Number(y.mesafe) || 0]));
    const adaylar = [...yakin.entries()]
      .filter(([u, m]) => m <= BAGLAN && odadakiler.has(u) && (!sadeceArkadas || odadakiler.get(u).arkadas))
      .sort((a, b) => a[1] - b[1])
      .slice(0, EN_FAZLA)
      .map(([u]) => u);
    for (const u of adaylar) {
      // Kim teklif verecek: UUID'si küçük olan (ikisi aynı anda vermesin)
      if (!esler.has(u) && ben < u) teklifVer(u);
    }
    for (const [u, e] of esler) {
      const m = yakin.has(u) ? yakin.get(u) : Infinity;
      const yabanci = sadeceArkadas && odadakiler.has(u) && !odadakiler.get(u).arkadas;
      if (m > KOP || yabanci || (!odadakiler.has(u) && simdi - sonKatil < 1000)) { esKapat(u, true); continue; }
      e.mesafe = m;
      // Mesafeye göre ses: yakında tam, MESAFE'de sıfır (kulağa doğal gelsin diye eğri)
      const k = Math.max(0, 1 - m / MESAFE);
      e.ses.volume = Math.min(1, k * k * 1.15);
    }

    // Kim konuşuyor → oyuna (yarım saniyede bir). Seviye bağlantının kendi istatistiğinden okunur.
    if (simdi - sonDurumYaz > 450) {
      sonDurumYaz = simdi;
      const konusanlar = [];
      for (const [, e] of esler) {
        if (e.ses.volume <= 0.01 || e.pc.connectionState !== 'connected') continue;
        try {
          const st = await e.pc.getStats();
          let seviye = 0;
          st.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') seviye = Math.max(seviye, r.audioLevel); });
          if (seviye > 0.02) konusanlar.push(e.ad);
        } catch { /* yok */ }
      }
      const bagli = [...esler.values()].filter((e) => e.pc.connectionState === 'connected').length;
      api.sesDurumYaz(bagli, konusanlar, hata).catch(() => {});
    }
  }

  let isleniyor = false;
  let isBasladi = 0;
  api.sesDurumDinle(async (d) => {
    if (isleniyor) {
      // Bir adım uzun sürüyorsa (ağ, izin) oyuna yine de haber ver
      if (d && d.aktif && Date.now() - sonDurumYaz > 1500) {
        sonDurumYaz = Date.now();
        const bagli = [...esler.values()].filter((e) => e.pc.connectionState === 'connected').length;
        api.sesDurumYaz(bagli, [], hata || (Date.now() - isBasladi > 6000 ? 'Bağlanıyor…' : '')).catch(() => {});
      }
      return;
    }
    isBasladi = Date.now();
    isleniyor = true;
    try { await guncelle(d); } catch (x) { console.warn('KCZ ses', x); } finally { isleniyor = false; }
  });
  window.addEventListener('beforeunload', () => { try { odadanCik(); } catch { /* yok */ } });
})();
