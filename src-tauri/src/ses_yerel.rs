//! KCZ yakınlık sesli sohbeti: Linux'ta yerel (Rust) uygulama.
//!
//! Linux'taki WebKitGTK, dağıtımların paketlerinde WebRTC'yi kapalı getirdiği için ses orada
//! arayüzde (ses.js) değil burada işlenir: mikrofon ve hoparlör cpal ile, sıkıştırma Opus ile,
//! bağlantı webrtc-rs ile. Eşleştirme mesajları ses.js ile birebir aynı biçimdedir, böylece
//! Linux'taki oyuncu Windows'takilerle konuşabilir.

use crate::ortak::*;
use crate::sunucu::{kimlik, kimlik_hatasi, rpc};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_OPUS};
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_candidate::{RTCIceCandidate, RTCIceCandidateInit};
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::media::Sample;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::policy::ice_transport_policy::RTCIceTransportPolicy;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc::track::track_local::TrackLocal;

const MESAFE: f32 = 48.0; // bu kadar blok uzaktaki duyulmaz
const BAGLAN: f64 = 40.0; // bu mesafeye girince bağlan
const KOP: f64 = 64.0; // bundan uzaklaşınca bağlantıyı kapat
const EN_FAZLA: usize = 8;
const ORAN: u32 = 48_000; // Opus/WebRTC örnekleme hızı
const CERCEVE: usize = 960; // 20 ms

/// Bir eşin çalınacak sesi (48 kHz mono) ve ses düzeyi
#[derive(Default)]
struct Calma {
    tampon: VecDeque<f32>,
    kazanc: f32,
    seviye: f32,
}

struct Es {
    pc: Arc<RTCPeerConnection>,
    ad: String,
    adaylar: Vec<RTCIceCandidateInit>,
}

#[derive(Default)]
struct Durum {
    oda: Option<String>,
    ben: String,
    odadakiler: HashMap<String, (String, bool)>, // uuid -> (ad, arkadaş mı)
    sadece_arkadas: bool,
    esler: HashMap<String, Es>,
    son_katil: Option<Instant>,
    son_sinyal: Option<Instant>,
    son_durum: Option<Instant>,
    hata: String,
}

static DURUM: LazyLock<tokio::sync::Mutex<Durum>> = LazyLock::new(Default::default);
static CALMA: LazyLock<Mutex<HashMap<String, Calma>>> = LazyLock::new(Default::default);
static MIKROFON: LazyLock<Mutex<VecDeque<f32>>> = LazyLock::new(Default::default);
static KONUS: AtomicBool = AtomicBool::new(false);
static SES_ACIK: AtomicBool = AtomicBool::new(false);
static IZ: LazyLock<Mutex<Option<Arc<TrackLocalStaticSample>>>> = LazyLock::new(Default::default);
static ISLENIYOR: AtomicBool = AtomicBool::new(false);
/// Her açılışta artar: eski ses iş parçacığı yenisi açılınca kendini kapatsın
static NESIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn temiz(u: &str) -> String {
    u.replace('-', "").to_lowercase()
}

/* ---------- Ses donanımı (ayrı bir iş parçacığında; cpal akışları taşınamaz) ---------- */

/// Basit doğrusal örnekleme hızı dönüştürücü (sürekli akış için son örneği hatırlar)
struct Donustur {
    adim: f64,
    konum: f64,
    onceki: f32,
}

impl Donustur {
    fn new(giris: u32, cikis: u32) -> Self {
        Self { adim: giris as f64 / cikis as f64, konum: 0.0, onceki: 0.0 }
    }
    fn isle(&mut self, giris: &[f32], cikis: &mut Vec<f32>) {
        if giris.is_empty() {
            return;
        }
        while self.konum < giris.len() as f64 {
            let i = self.konum.floor() as isize;
            let f = (self.konum - i as f64) as f32;
            let a = if i - 1 < 0 { self.onceki } else { giris[(i - 1) as usize] };
            let b = giris[i as usize];
            cikis.push(a + (b - a) * f);
            self.konum += self.adim;
        }
        self.konum -= giris.len() as f64;
        self.onceki = *giris.last().unwrap();
    }
}

fn ses_donanimini_baslat() {
    if SES_ACIK.swap(true, Ordering::SeqCst) {
        return;
    }
    let nesil = NESIL.fetch_add(1, Ordering::SeqCst) + 1;
    let canli = move || SES_ACIK.load(Ordering::SeqCst) && NESIL.load(Ordering::SeqCst) == nesil;
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let mut akislar: Vec<cpal::Stream> = vec![];
        // Mikrofon
        match host.default_input_device().and_then(|d| d.default_input_config().ok().map(|c| (d, c))) {
            Some((d, c)) => {
                let kanal = c.channels() as usize;
                let oran = c.sample_rate().0;
                let bicim = c.sample_format();
                let ayar: cpal::StreamConfig = c.into();
                let mut cev = Donustur::new(oran, ORAN);
                let mut ekle = move |veri: Vec<f32>| {
                    let mono: Vec<f32> = veri.chunks(kanal.max(1)).map(|c| c.iter().sum::<f32>() / c.len() as f32).collect();
                    let mut cikis = Vec::with_capacity(mono.len() * 2);
                    cev.isle(&mono, &mut cikis);
                    let mut m = MIKROFON.lock().unwrap();
                    m.extend(cikis);
                    let fazla = m.len().saturating_sub(ORAN as usize / 2);
                    m.drain(..fazla);
                };
                let hata = |e: cpal::StreamError| log(format!("Sesli sohbet: mikrofon hatası: {e}"));
                let akis = match bicim {
                    cpal::SampleFormat::F32 => d.build_input_stream(&ayar, move |v: &[f32], _: &_| ekle(v.to_vec()), hata, None),
                    cpal::SampleFormat::I16 => d.build_input_stream(
                        &ayar,
                        move |v: &[i16], _: &_| ekle(v.iter().map(|x| *x as f32 / 32768.0).collect()),
                        hata,
                        None,
                    ),
                    cpal::SampleFormat::U16 => d.build_input_stream(
                        &ayar,
                        move |v: &[u16], _: &_| ekle(v.iter().map(|x| (*x as f32 - 32768.0) / 32768.0).collect()),
                        hata,
                        None,
                    ),
                    _ => Err(cpal::BuildStreamError::StreamConfigNotSupported),
                };
                match akis {
                    Ok(a) => {
                        let _ = a.play();
                        akislar.push(a);
                    }
                    Err(e) => {
                        log(format!("Sesli sohbet: mikrofon açılamadı: {e}"));
                        hata_yaz("Mikrofon açılamadı");
                    }
                }
            }
            None => hata_yaz("Mikrofon bulunamadı"),
        }
        // Hoparlör: eşlerin sesini karıştırıp çal
        match host.default_output_device().and_then(|d| d.default_output_config().ok().map(|c| (d, c))) {
            Some((d, c)) => {
                let kanal = c.channels() as usize;
                let oran = c.sample_rate().0;
                let bicim = c.sample_format();
                let ayar: cpal::StreamConfig = c.into();
                let mut cev = Donustur::new(ORAN, oran);
                let mut bekleyen: VecDeque<f32> = VecDeque::new();
                let mut doldur = move |cikis_n: usize| -> Vec<f32> {
                    // cikis_n kare için gereken 48 kHz örnek sayısı (biraz fazlası)
                    while bekleyen.len() < cikis_n {
                        let gerek = ((cikis_n - bekleyen.len()) as f64 * ORAN as f64 / oran as f64).ceil() as usize + 2;
                        let mut karisik = vec![0f32; gerek];
                        {
                            let mut c = CALMA.lock().unwrap();
                            for es in c.values_mut() {
                                // Gecikme birikmesin: 300 ms'den fazlasını at
                                let fazla = es.tampon.len().saturating_sub(ORAN as usize * 3 / 10);
                                es.tampon.drain(..fazla);
                                for (i, k) in karisik.iter_mut().enumerate() {
                                    match es.tampon.pop_front() {
                                        Some(s) => *k += s * es.kazanc,
                                        None => {
                                            let _ = i;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        let mut yeni = Vec::with_capacity(cikis_n + 8);
                        cev.isle(&karisik, &mut yeni);
                        bekleyen.extend(yeni);
                    }
                    bekleyen.drain(..cikis_n).map(|s| s.clamp(-1.0, 1.0)).collect()
                };
                let hata = |e: cpal::StreamError| log(format!("Sesli sohbet: hoparlör hatası: {e}"));
                let akis = match bicim {
                    cpal::SampleFormat::F32 => d.build_output_stream(
                        &ayar,
                        move |v: &mut [f32], _: &_| {
                            let m = doldur(v.len() / kanal.max(1));
                            for (c, s) in v.chunks_mut(kanal.max(1)).zip(m) {
                                c.fill(s);
                            }
                        },
                        hata,
                        None,
                    ),
                    cpal::SampleFormat::I16 => d.build_output_stream(
                        &ayar,
                        move |v: &mut [i16], _: &_| {
                            let m = doldur(v.len() / kanal.max(1));
                            for (c, s) in v.chunks_mut(kanal.max(1)).zip(m) {
                                c.fill((s * 32767.0) as i16);
                            }
                        },
                        hata,
                        None,
                    ),
                    cpal::SampleFormat::U16 => d.build_output_stream(
                        &ayar,
                        move |v: &mut [u16], _: &_| {
                            let m = doldur(v.len() / kanal.max(1));
                            for (c, s) in v.chunks_mut(kanal.max(1)).zip(m) {
                                c.fill((s * 32767.0 + 32768.0) as u16);
                            }
                        },
                        hata,
                        None,
                    ),
                    _ => Err(cpal::BuildStreamError::StreamConfigNotSupported),
                };
                match akis {
                    Ok(a) => {
                        let _ = a.play();
                        akislar.push(a);
                    }
                    Err(e) => {
                        log(format!("Sesli sohbet: hoparlör açılamadı: {e}"));
                        hata_yaz("Hoparlör açılamadı");
                    }
                }
            }
            None => hata_yaz("Hoparlör bulunamadı"),
        }
        log("Sesli sohbet: ses donanımı açıldı.");
        while canli() {
            std::thread::sleep(Duration::from_millis(200));
        }
        drop(akislar);
        MIKROFON.lock().unwrap().clear();
        log("Sesli sohbet: ses donanımı kapandı.");
    });

    // Kodlayıcı: 20 ms'de bir mikrofondan 960 örnek al, Opus'a çevir, bütün eşlere gönder.
    // Konuşmuyorken sessizlik gönderilir (zamanlama bozulmasın, Opus'ta birkaç bayt).
    tauri::async_runtime::spawn(async move {
        let mut kodlayici = match opus::Encoder::new(ORAN, opus::Channels::Mono, opus::Application::Voip) {
            Ok(k) => k,
            Err(e) => {
                log(format!("Sesli sohbet: Opus açılamadı: {e}"));
                return;
            }
        };
        let _ = kodlayici.set_bitrate(opus::Bitrate::Bits(32_000));
        let mut aralik = tokio::time::interval(Duration::from_millis(20));
        aralik.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut cikti = vec![0u8; 1500];
        while canli() {
            aralik.tick().await;
            let mut cerceve = vec![0f32; CERCEVE];
            {
                let mut m = MIKROFON.lock().unwrap();
                if m.len() >= CERCEVE {
                    for (i, s) in m.drain(..CERCEVE).enumerate() {
                        cerceve[i] = s;
                    }
                }
            }
            if !KONUS.load(Ordering::SeqCst) {
                cerceve.fill(0.0);
            }
            let Some(iz) = IZ.lock().unwrap().clone() else { continue };
            if let Ok(n) = kodlayici.encode_float(&cerceve, &mut cikti) {
                let _ = iz
                    .write_sample(&Sample {
                        data: bytes::Bytes::copy_from_slice(&cikti[..n]),
                        duration: Duration::from_millis(20),
                        ..Default::default()
                    })
                    .await;
            }
        }
    });
}

fn hata_yaz(h: &str) {
    if let Ok(mut d) = DURUM.try_lock() {
        d.hata = h.to_string();
    }
}

/* ---------- Bağlantılar ---------- */

async fn baglanti_kur(uuid: &str) -> Result<Arc<RTCPeerConnection>, String> {
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(|e| e.to_string())?;
    let mut kayit = Registry::new();
    kayit = register_default_interceptors(kayit, &mut m).map_err(|e| e.to_string())?;
    let api = APIBuilder::new().with_media_engine(m).with_interceptor_registry(kayit).build();
    // Aktarma sunucusu varsa sadece onun üzerinden (kimse IP'yi görmez); yoksa doğrudan
    let ayar = match crate::sunucu::ice_sunuculari().await {
        Ok(liste) => RTCConfiguration {
            ice_servers: liste
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|s| RTCIceServer {
                    urls: match &s["urls"] {
                        Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
                        Value::String(x) => vec![x.clone()],
                        _ => vec![],
                    }
                    .into_iter()
                    // webrtc-rs TLS'li "turns:" desteklemiyor
                    .filter(|u| !u.starts_with("turns:"))
                    .collect(),
                    username: metin(s, "username"),
                    credential: metin(s, "credential"),
                    ..Default::default()
                })
                .collect(),
            ice_transport_policy: RTCIceTransportPolicy::Relay,
            ..Default::default()
        },
        Err(_) => RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_owned(), "stun:stun.cloudflare.com:3478".to_owned()],
                ..Default::default()
            }],
            ..Default::default()
        },
    };
    let pc = Arc::new(api.new_peer_connection(ayar).await.map_err(|e| e.to_string())?);

    // Gönderilen ses: herkese aynı iz
    let iz = {
        let mut g = IZ.lock().unwrap();
        g.get_or_insert_with(|| {
            Arc::new(TrackLocalStaticSample::new(
                RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_OPUS.to_owned(),
                    clock_rate: 48000,
                    channels: 2,
                    sdp_fmtp_line: "minptime=10;useinbandfec=1".to_owned(),
                    rtcp_feedback: vec![],
                },
                "ses".to_owned(),
                "kcz".to_owned(),
            ))
        })
        .clone()
    };
    let gonderici = pc.add_track(iz as Arc<dyn TrackLocal + Send + Sync>).await.map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn(async move {
        let mut b = vec![0u8; 1500];
        while gonderici.read(&mut b).await.is_ok() {}
    });

    // Gelen ses: Opus çöz, çalma tamponuna koy
    let kim = uuid.to_string();
    pc.on_track(Box::new(move |iz, _, _| {
        let kim = kim.clone();
        Box::pin(async move {
            let mut cozucu = match opus::Decoder::new(ORAN, opus::Channels::Mono) {
                Ok(c) => c,
                Err(_) => return,
            };
            let mut cikis = vec![0f32; 5760];
            while let Ok((paket, _)) = iz.read_rtp().await {
                if paket.payload.is_empty() {
                    continue;
                }
                let Ok(n) = cozucu.decode_float(&paket.payload, &mut cikis, false) else { continue };
                let tepe = cikis[..n].iter().fold(0f32, |a, s| a.max(s.abs()));
                let mut c = CALMA.lock().unwrap();
                let e = c.entry(kim.clone()).or_default();
                e.tampon.extend(&cikis[..n]);
                e.seviye = e.seviye * 0.8 + tepe * 0.2;
            }
        })
    }));

    let kime = uuid.to_string();
    pc.on_ice_candidate(Box::new(move |c: Option<RTCIceCandidate>| {
        let kime = kime.clone();
        Box::pin(async move {
            if let Some(c) = c {
                if let Ok(j) = c.to_json() {
                    if let Ok(v) = serde_json::to_string(&j) {
                        // Bekletmeden gönder (bağlantı kurulurken kilit tutuluyor olabilir)
                        tauri::async_runtime::spawn(async move {
                            let _ = sinyal_gonder(&kime, "aday", &v).await;
                        });
                    }
                }
            }
        })
    }));

    let kim = uuid.to_string();
    pc.on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
        let kim = kim.clone();
        Box::pin(async move {
            if s == RTCPeerConnectionState::Failed {
                // Ayrı görevde: kapatma sırasında bu olay gelirse kilit beklemesin
                tauri::async_runtime::spawn(async move {
                    let mut d = DURUM.lock().await;
                    if let Some(e) = d.esler.remove(&kim) {
                        let _ = e.pc.close().await;
                    }
                    CALMA.lock().unwrap().remove(&kim);
                });
            }
        })
    }));
    Ok(pc)
}

async fn sinyal_gonder(kime: &str, tur: &str, veri: &str) -> Sonuc<()> {
    let (u, s, _) = kimlik().await?;
    rpc(
        "ses_sinyal_gonder",
        json!({ "p_uuid": u, "p_sir": s, "p_kime": kime, "p_tur": tur, "p_veri": veri }),
        None,
    )
    .await
    .map_err(kimlik_hatasi)?;
    Ok(())
}

async fn es_kapat(d: &mut Durum, uuid: &str, bildir: bool) {
    if let Some(e) = d.esler.remove(uuid) {
        let _ = e.pc.close().await;
    }
    CALMA.lock().unwrap().remove(uuid);
    if bildir {
        let u = uuid.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = sinyal_gonder(&u, "bitir", "-").await;
        });
    }
}

async fn teklif_ver(d: &mut Durum, uuid: &str) {
    let pc = match baglanti_kur(uuid).await {
        Ok(p) => p,
        Err(e) => {
            log(format!("Sesli sohbet: bağlantı kurulamadı: {e}"));
            return;
        }
    };
    let ad = d.odadakiler.get(uuid).map(|x| x.0.clone()).unwrap_or_else(|| "Oyuncu".into());
    d.esler.insert(uuid.to_string(), Es { pc: pc.clone(), ad, adaylar: vec![] });
    let sonuc = async {
        let t = pc.create_offer(None).await.map_err(|e| e.to_string())?;
        pc.set_local_description(t).await.map_err(|e| e.to_string())?;
        let yerel = pc.local_description().await.ok_or("yerel açıklama yok")?;
        let j = serde_json::to_string(&yerel).map_err(|e| e.to_string())?;
        sinyal_gonder(uuid, "teklif", &j).await
    }
    .await;
    if let Err(e) = sonuc {
        log(format!("Sesli sohbet: teklif gönderilemedi: {e}"));
        es_kapat(d, uuid, false).await;
    }
}

async fn sinyal_isle(d: &mut Durum, s: &Value) {
    let uuid = temiz(&metin(s, "gonderen"));
    let tur = metin(s, "tur");
    let veri = metin(s, "veri");
    if tur == "bitir" {
        es_kapat(d, &uuid, false).await;
        return;
    }
    if tur == "teklif" {
        // Sadece arkadaşlar açıksa yabancının bağlantı isteği yok sayılır (IP'imiz ona gitmez)
        if d.sadece_arkadas && !d.odadakiler.get(&uuid).is_some_and(|x| x.1) {
            return;
        }
        es_kapat(d, &uuid, false).await;
        let Ok(aciklama) = serde_json::from_str::<RTCSessionDescription>(&veri) else { return };
        let pc = match baglanti_kur(&uuid).await {
            Ok(p) => p,
            Err(_) => return,
        };
        let ad = d.odadakiler.get(&uuid).map(|x| x.0.clone()).unwrap_or_else(|| "Oyuncu".into());
        d.esler.insert(uuid.clone(), Es { pc: pc.clone(), ad, adaylar: vec![] });
        let sonuc = async {
            pc.set_remote_description(aciklama).await.map_err(|e| e.to_string())?;
            let c = pc.create_answer(None).await.map_err(|e| e.to_string())?;
            pc.set_local_description(c).await.map_err(|e| e.to_string())?;
            let yerel = pc.local_description().await.ok_or("yerel açıklama yok")?;
            let j = serde_json::to_string(&yerel).map_err(|e| e.to_string())?;
            sinyal_gonder(&uuid, "cevap", &j).await
        }
        .await;
        match sonuc {
            Ok(()) => {
                if let Some(e) = d.esler.get_mut(&uuid) {
                    for a in std::mem::take(&mut e.adaylar) {
                        let _ = e.pc.add_ice_candidate(a).await;
                    }
                }
            }
            Err(e) => {
                log(format!("Sesli sohbet: cevap verilemedi: {e}"));
                es_kapat(d, &uuid, false).await;
            }
        }
        return;
    }
    let Some(e) = d.esler.get_mut(&uuid) else { return };
    if tur == "cevap" {
        if let Ok(aciklama) = serde_json::from_str::<RTCSessionDescription>(&veri) {
            if e.pc.set_remote_description(aciklama).await.is_ok() {
                for a in std::mem::take(&mut e.adaylar) {
                    let _ = e.pc.add_ice_candidate(a).await;
                }
            }
        }
    } else if tur == "aday" {
        if let Ok(a) = serde_json::from_str::<RTCIceCandidateInit>(&veri) {
            if e.pc.remote_description().await.is_some() {
                let _ = e.pc.add_ice_candidate(a).await;
            } else {
                e.adaylar.push(a);
            }
        }
    }
}

async fn odadan_cik(d: &mut Durum) {
    let hepsi: Vec<String> = d.esler.keys().cloned().collect();
    for u in hepsi {
        es_kapat(d, &u, true).await;
    }
    if d.oda.take().is_some() {
        tauri::async_runtime::spawn(async {
            if let Ok((u, s, _)) = kimlik().await {
                let _ = rpc("ses_ayril", json!({ "p_uuid": u, "p_sir": s }), None).await;
            }
        });
    }
    d.odadakiler.clear();
    SES_ACIK.store(false, Ordering::SeqCst);
    NESIL.fetch_add(1, Ordering::SeqCst);
    *IZ.lock().unwrap() = None;
    KONUS.store(false, Ordering::SeqCst);
}

/// Oyunun yazdığı ses durumu (kcz-ses.json) her geldiğinde çağrılır (5 kez/sn)
pub fn guncelle(v: Value) {
    if ISLENIYOR.swap(true, Ordering::SeqCst) {
        // Önceki tur bitmedi: sadece bas-konuş durumunu güncel tut
        KONUS.store(v["konus"].as_bool().unwrap_or(false), Ordering::SeqCst);
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut d = DURUM.lock().await;
        tur(&mut d, &v).await;
        drop(d);
        ISLENIYOR.store(false, Ordering::SeqCst);
    });
}

async fn tur(d: &mut Durum, v: &Value) {
    let aktif = v["aktif"].as_bool().unwrap_or(false);
    let sunucu = metin(v, "sunucu");
    let ben = temiz(&metin(v, "ben"));
    if !aktif || sunucu.is_empty() || ben.is_empty() {
        if d.oda.is_some() || SES_ACIK.load(Ordering::SeqCst) {
            odadan_cik(d).await;
        }
        return;
    }
    if d.oda.as_deref().is_some_and(|o| o != sunucu) {
        odadan_cik(d).await;
    }
    d.oda = Some(sunucu.clone());
    d.ben = ben.clone();
    // Aktarma sunucusu yoksa yabancılarla hiç bağlanma (IP gitmesin)
    let aktarma_var = crate::sunucu::ice_sunuculari().await.is_ok();
    d.sadece_arkadas = v["sadeceArkadas"].as_bool().unwrap_or(true) || !aktarma_var;
    ses_donanimini_baslat();
    KONUS.store(v["konus"].as_bool().unwrap_or(false), Ordering::SeqCst);
    let simdi = Instant::now();

    // Odaya katıl / odadakileri tazele (5 sn'de bir)
    if d.son_katil.is_none_or(|t| simdi - t > Duration::from_secs(5)) {
        d.son_katil = Some(simdi);
        let sonuc = async {
            let (u, s, _) = kimlik().await?;
            rpc("ses_katil", json!({ "p_uuid": u, "p_sir": s, "p_oda": sunucu }), None)
                .await
                .map_err(kimlik_hatasi)
        }
        .await;
        match sonuc {
            Ok(l) => {
                d.odadakiler = l
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .map(|x| (temiz(&metin(x, "mc_uuid")), (metin(x, "ad"), x["arkadas"].as_bool().unwrap_or(false))))
                            .collect()
                    })
                    .unwrap_or_default();
                if d.hata.contains("bağlanılamadı") || d.hata.contains("güncellenmedi") {
                    d.hata.clear();
                }
            }
            Err(e) => {
                d.hata = if e.contains("güncellenmedi") { "Sunucu güncellenmedi".into() } else { "Sesli sohbete bağlanılamadı".into() };
            }
        }
    }

    // Gelen bağlantı mesajları (saniyede bir)
    if d.son_sinyal.is_none_or(|t| simdi - t > Duration::from_millis(900)) {
        d.son_sinyal = Some(simdi);
        let sonuc = async {
            let (u, s, _) = kimlik().await?;
            rpc("ses_sinyalleri_al", json!({ "p_uuid": u, "p_sir": s }), None)
                .await
                .map_err(kimlik_hatasi)
        }
        .await;
        if let Ok(l) = sonuc {
            for s in l.as_array().cloned().unwrap_or_default() {
                sinyal_isle(d, &s).await;
            }
        }
    }

    // Yakındakiler: kime bağlanılacak, ses ne kadar açık
    let yakin: HashMap<String, f64> = v["yakinlar"]
        .as_array()
        .map(|a| a.iter().map(|y| (temiz(&metin(y, "uuid")), y["mesafe"].as_f64().unwrap_or(0.0))).collect())
        .unwrap_or_default();
    let mut adaylar: Vec<(&String, &f64)> =
        yakin
            .iter()
            .filter(|(u, m)| {
                **m <= BAGLAN && d.odadakiler.get(*u).is_some_and(|x| !d.sadece_arkadas || x.1)
            })
            .collect();
    adaylar.sort_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal));
    let adaylar: Vec<String> = adaylar.into_iter().take(EN_FAZLA).map(|(u, _)| u.clone()).collect();
    for u in adaylar {
        // Teklifi UUID'si küçük olan verir (ses.js ile aynı kural)
        if !d.esler.contains_key(&u) && d.ben < u {
            teklif_ver(d, &u).await;
        }
    }
    let kapat: Vec<String> = d
        .esler
        .keys()
        .filter(|u| {
            let yabanci = d.sadece_arkadas && d.odadakiler.get(*u).is_some_and(|x| !x.1);
            yakin.get(*u).copied().unwrap_or(f64::INFINITY) > KOP || yabanci
        })
        .cloned()
        .collect();
    for u in kapat {
        es_kapat(d, &u, true).await;
    }
    {
        let mut c = CALMA.lock().unwrap();
        for (u, e) in c.iter_mut() {
            let m = yakin.get(u).copied().unwrap_or(f64::INFINITY) as f32;
            let k = (1.0 - m / MESAFE).max(0.0);
            e.kazanc = (k * k * 1.15).min(1.0);
        }
    }

    // Kim konuşuyor → oyuna (yarım saniyede bir)
    if d.son_durum.is_none_or(|t| simdi - t > Duration::from_millis(450)) {
        d.son_durum = Some(simdi);
        let mut konusanlar = vec![];
        let mut bagli = 0u32;
        let seviyeler: HashMap<String, (f32, f32)> =
            CALMA.lock().unwrap().iter().map(|(u, e)| (u.clone(), (e.seviye, e.kazanc))).collect();
        for (u, e) in &d.esler {
            if e.pc.connection_state() == RTCPeerConnectionState::Connected {
                bagli += 1;
            }
            if let Some((s, k)) = seviyeler.get(u) {
                if *s > 0.03 && *k > 0.01 {
                    konusanlar.push(e.ad.clone());
                }
            }
        }
        let hata = Some(d.hata.clone()).filter(|h| !h.is_empty());
        crate::sunucu::ses_durum_yaz(bagli, konusanlar, hata);
    }
}

/// Oyun kapanınca
pub fn kapat() {
    tauri::async_runtime::spawn(async {
        let mut d = DURUM.lock().await;
        odadan_cik(&mut d).await;
        d.hata.clear();
    });
}
