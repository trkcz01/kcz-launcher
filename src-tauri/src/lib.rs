// KCZ Launcher (Tauri) - ana kısım: arayüzün çağırdığı komutlar, pencere, güncelleme.
mod ayarlar;
mod cokme;
mod discord;
mod foto;
mod goruntu;
mod cevrimdisi;
mod hesap;
mod istemci;
mod java;
mod kisayol;
mod modlar;
mod onar;
mod ortak;
mod oyun;
mod performans;
mod ping;
mod profil;
mod skin;
mod sunucu;
#[cfg(target_os = "linux")]
mod ses_yerel;
mod sunucular;
mod sure;
mod surumler;
mod yedek;
mod yukleyici;

use ortak::*;
use regex::Regex;
use serde_json::{json, Value};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

/* =========================================================
Oyun durumu (açıldı / kapandı) - pencere, süre, eksik mod
========================================================= */
static SON_ACILIS: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));

fn ana_pencere() -> Option<tauri::WebviewWindow> {
    UYGULAMA.get().and_then(|a| a.get_webview_window("main"))
}

/// Launcher uyuyor mu? (Oyun açıkken arayüz kapatıldı, sadece tepsi simgesi var.)
static UYUYOR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Uyanınca yeni açılan arayüze gönderilecek son oyun durumu
static SON_DURUM: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));

/// Oyun açıkken arayüzü (WebView2) tamamen kapatır: yüzlerce MB bellek oyuna
/// kalır, arka planda hiçbir şey çizilmez. Oyun ve tepsi simgesi çalışmaya devam eder.
fn uyut() {
    if !TEPSI_VAR.load(std::sync::atomic::Ordering::SeqCst) {
        // Tepsi yoksa geri açacak bir yer kalmaz: sadece küçült
        if let Some(w) = ana_pencere() {
            let _ = w.minimize();
        }
        return;
    }
    if let Some(w) = ana_pencere() {
        pencere_boyutunu_kaydet();
        UYUYOR.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = w.destroy();
        log("Launcher uyku modunda (oyun açık).");
    }
}

/// Ana pencereyi oluşturur. Hafif modda pencere saydam değil, düz olur: Windows saydam
/// pencereyi daha pahalı bir yoldan çizdiği için zayıf bilgisayarda kasma yapıyordu.
fn ana_pencere_kur(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let mut ayar = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or_else(|| std::io::Error::other("ana pencere ayarı yok"))?;
    let duz = ayarlar::getir().hafif_mi();
    ayar.create = true;
    ayar.transparent = !duz;
    // Windows (WebView2): sesli sohbet için mikrofon izni sorulmasın (pencere gizliyken soru görünmez,
    // ses takılır) ve gelen ses kullanıcı tıklamadan çalabilsin. İlk üçü Tauri'nin kendi varsayılanları.
    #[cfg(windows)]
    {
        ayar.additional_browser_args = Some(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required"
                .into(),
        );
    }
    if duz {
        ayar.background_color = Some(tauri::webview::Color(10, 10, 11, 255));
    }
    tauri::WebviewWindowBuilder::from_config(app, &ayar)?
        .initialization_script(if duz { "window.__KCZ_DUZ = true;" } else { "window.__KCZ_DUZ = false;" })
        .on_page_load(|_, yuk| {
            if yuk.event() == tauri::webview::PageLoadEvent::Finished {
                // Arayüzün dinleyicileri kurulsun diye biraz bekle, sonra durumu bildir
                tauri::async_runtime::spawn(async {
                    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                    let d = SON_DURUM.lock().unwrap().take();
                    if let Some(d) = d {
                        gonder("oyun-durum", d);
                    }
                });
            }
        })
        .build()
}

/// Uyuyan launcher'ın arayüzünü yeniden oluşturur. Ana iş parçacığını
/// kilitlememek için arka planda yapılır (Windows'ta gerekli).
/// Sesli sohbet oyunda açılınca: uyuyan launcher'ı görünmeden geri başlat (ses onun içinde çalışır)
pub fn sessizce_uyandir() {
    if !UYUYOR.load(std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let Some(app) = UYGULAMA.get().cloned() else { return };
    UYUYOR.store(false, std::sync::atomic::Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        match ana_pencere_kur(&app) {
            Ok(w) => {
                pencere_olaylari(&w);
                log("Sesli sohbet için launcher arka planda açıldı.");
            }
            Err(e) => {
                UYUYOR.store(true, std::sync::atomic::Ordering::SeqCst);
                log(format!("Sesli sohbet için launcher açılamadı: {e}"));
            }
        }
    });
}

fn uyandir(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        pencereyi_goster(app);
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let kur = ana_pencere_kur(&app);
        match kur {
            Ok(w) => {
                UYUYOR.store(false, std::sync::atomic::Ordering::SeqCst);
                let p = ayarlar::getir().pencere;
                let _ = w.set_size(tauri::LogicalSize::new(p.w as f64, p.h as f64));
                let _ = w.center();
                pencere_olaylari(&w);
                let _ = w.show();
                let _ = w.set_focus();
                log("Launcher uyandı.");
            }
            Err(e) => log(format!("Launcher penceresi açılamadı: {e}")),
        }
    });
}

pub fn oyun_durumu(mut veri: Value) {
    match veri["tur"].as_str() {
        Some("acik") => {
            sure::basla();
            discord::oynuyor(veri["surum"].as_str().unwrap_or(""));
            {
                let a = ayarlar::getir();
                let sunucu = (a.aktif_secim != "profil" && !a.secili_sunucu.is_empty()).then(|| a.secili_sunucu.clone());
                sunucu::oyun_durumu(true, sunucu);
            }
            if let Some(app) = UYGULAMA.get() {
                goruntu::izlemeyi_baslat(app.clone());
            }
            let a = ayarlar::getir();
            // Düşük sistemde launcher hiç bellek/işlemci kullanmasın: tamamen kapanır, oyun kapanınca geri gelir
            // Karar Ayarlar > Performans > "Oyun açılınca launcher" seçiminde (açık / küçül / kapan)
            if a.launcher_uyusun && a.istemci.yakin_ses && cfg!(not(target_os = "linux")) {
                // Sesli sohbet launcher'ın içinde çalışıyor: kapatma, sadece küçült
                if let Some(w) = ana_pencere() {
                    let _ = w.minimize();
                }
            } else if a.launcher_uyusun {
                *SON_DURUM.lock().unwrap() = Some(veri.clone());
                uyut();
            } else if a.oyun_acilinca_gizle {
                if let Some(w) = ana_pencere() {
                    let _ = w.minimize();
                }
            }
        }
        Some("kapandi") => {
            sure::bitir();
            discord::temizle();
            sunucu::oyun_durumu(false, None);
            goruntu::izlemeyi_durdur();
            // Oyunun içindeki KCZ menüsünden yapılan değişiklikleri al
            istemci::ayar_geri_oku();
            // Fabric "Incompatible mods / ... which is missing" hatası: eksik modları bul
            let metin = kayit_metni();
            static EKSIK: LazyLock<Regex> =
                LazyLock::new(|| Regex::new(r"requires [^\n]*? of ([A-Za-z0-9_.\-]+), which is missing").unwrap());
            let mut eksik: Vec<String> = vec![];
            for c in EKSIK.captures_iter(&metin) {
                let id = c[1].to_string();
                if !eksik.contains(&id) {
                    eksik.push(id);
                }
            }
            if !eksik.is_empty() {
                let satirlar: Vec<&str> = metin
                    .lines()
                    .filter(|x| x.contains("which is missing") || x.contains("Install "))
                    .take(6)
                    .collect();
                veri["modHatasi"] = json!({ "eksik": eksik, "satirlar": satirlar });
            } else {
                // Hatayla kapandıysa (oyuncu kapatmadıysa) sebebini bul
                let kod = veri["kod"].as_i64().unwrap_or(0);
                if kod != 0 && kod != 130 && kod != 143 {
                    veri["cokme"] = cokme::incele(kod as i32);
                }
            }
            if UYUYOR.load(std::sync::atomic::Ordering::SeqCst) {
                // Arayüz yeniden açılınca bu durum ona iletilir (eksik mod uyarısı dahil)
                *SON_DURUM.lock().unwrap() = Some(veri.clone());
                if let Some(app) = UYGULAMA.get() {
                    uyandir(app);
                }
            } else if let Some(w) = ana_pencere() {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        _ => {}
    }
    gonder("oyun-durum", veri);
}

/* =========================================================
Ayarlar ve hesap
========================================================= */
#[tauri::command]
fn ayarlar_getir() -> Value {
    serde_json::to_value(ayarlar::getir()).unwrap_or(Value::Null)
}

#[tauri::command]
fn ayarlar_kaydet(yeni: Value) -> Value {
    serde_json::to_value(ayarlar::kaydet(&yeni)).unwrap_or(Value::Null)
}

#[tauri::command]
async fn hesap_durum() -> Value {
    hesap::oturumu_yenile().await
}

#[tauri::command]
fn hesap_cevrimdisi_giris(ad: String) -> Value {
    hesap::cevrimdisi_giris(&ad)
}

#[tauri::command]
async fn hesap_pencere_giris(app: AppHandle) -> Value {
    hesap::pencere_girisi(app).await
}

#[tauri::command]
async fn hesap_tarayici_baslat(app: AppHandle) -> Value {
    match hesap::tarayici_baslat().await {
        Ok((kod, adres)) => {
            hesap::edge_ac(&app, &adres);
            json!({ "ok": true, "kod": kod, "adres": adres })
        }
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
fn edge_ac(app: AppHandle, adres: String) {
    hesap::edge_ac(&app, &adres);
}

#[tauri::command]
fn hesap_tarayici_iptal() {
    hesap::tarayici_iptal();
}

#[tauri::command]
fn hesap_listesi() -> Value {
    hesap::hesaplar()
}

#[tauri::command]
async fn hesap_gec(uuid: String) -> Value {
    skin::profili_unut();
    hesap::hesaba_gec(&uuid).await
}

#[tauri::command]
async fn hesap_unut(uuid: String) -> Value {
    skin::profili_unut();
    hesap::hesabi_unut(&uuid).await
}

#[tauri::command]
fn hesap_cikis() -> Value {
    skin::profili_unut();
    hesap::cikis()
}

/* =========================================================
Skinler ve süre
========================================================= */
#[tauri::command]
async fn skin_liste() -> Value {
    skin::liste().await
}

#[tauri::command]
async fn kafa_dokusu(kimlik: String) -> Option<String> {
    skin::kafa_dokusu(&kimlik).await
}

#[tauri::command]
async fn skin_isim_ekle(isim: String) -> Value {
    match skin::isimden_ekle(&isim).await {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
async fn skin_dosya_ekle(app: AppHandle, ince: bool) -> Value {
    let (gonderici, alici) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Skin dosyası seç")
        .add_filter("Minecraft skini (PNG)", &["png"])
        .pick_file(move |p| {
            let _ = gonderici.send(p);
        });
    let Some(Some(secilen)) = alici.await.ok() else {
        return json!({ "ok": false });
    };
    let Ok(yol) = secilen.into_path() else {
        return json!({ "ok": false });
    };
    match skin::dosyadan_ekle(&yol, ince) {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
fn skin_kaldir(sira: usize) -> Value {
    skin::kaldir(sira);
    json!({ "ok": true })
}

#[tauri::command]
async fn skin_giy(kaynak: Value) -> Value {
    match skin::giy(&kaynak).await {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
fn skin_gizle(anahtar: String) -> Value {
    skin::gizle(&anahtar);
    json!({ "ok": true })
}

#[tauri::command]
async fn skin_yenile() -> Value {
    skin::yenile().await
}

#[tauri::command]
fn skin_gizlenenleri_geri() -> Value {
    skin::gizlenenleri_geri();
    json!({ "ok": true })
}

#[tauri::command]
async fn pelerin_liste() -> Value {
    sonuc_json(skin::pelerinler().await)
}

#[tauri::command]
async fn pelerin_tak(id: String) -> Value {
    sonuc_json(skin::pelerin_tak(&id).await.map(|_| true))
}

#[tauri::command]
fn sure_hafta() -> Value {
    sure::hafta()
}

/// Öneri kartlarındaki bağlantılar (sadece Modrinth)
#[tauri::command]
fn dis_ac(app: AppHandle, adres: String) {
    // Galeri "Discord'a gönder": resim panoya kopyalanır, Discord uygulaması açılır
    if adres.starts_with("https://modrinth.com/") || adres == "discord://-/channels/@me" {
        let _ = app.opener().open_url(adres, None::<&str>);
    }
}

/* =========================================================
Güncelleme (GitHub üzerinden)
========================================================= */
static GUNCELLEME: LazyLock<Mutex<Value>> = LazyLock::new(|| Mutex::new(json!({ "tur": "bilinmiyor" })));
static BEKLEYEN_GUNCELLEME: LazyLock<Mutex<Option<tauri_plugin_updater::Update>>> = LazyLock::new(|| Mutex::new(None));
static INEN_GUNCELLEME: LazyLock<Mutex<Option<Vec<u8>>>> = LazyLock::new(|| Mutex::new(None));

fn guncelleme_bildir(d: Value) {
    *GUNCELLEME.lock().unwrap() = d.clone();
    gonder("guncelleme", d);
}

/// Son denetimin zamanı (saniye). Odak/zamanlayıcı denetimleri buna bakıp boşuna istek atmaz.
static SON_DENETIM: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn simdi_sn() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Son denetimden en az `aralik` saniye geçtiyse denetle; yoksa hiçbir şey yapma.
async fn guncelleme_gerekirse(app: AppHandle, aralik: u64) {
    let son = SON_DENETIM.load(std::sync::atomic::Ordering::SeqCst);
    if simdi_sn().saturating_sub(son) < aralik {
        return;
    }
    // Yeni sürüm zaten bulunduysa tekrar sormaya gerek yok
    let tur = GUNCELLEME.lock().unwrap()["tur"].as_str().unwrap_or("").to_string();
    if matches!(tur.as_str(), "var" | "iniyor" | "hazir" | "bakiliyor") {
        return;
    }
    guncelleme_bak(app).await;
}

async fn guncelleme_bak(app: AppHandle) {
    SON_DENETIM.store(simdi_sn(), std::sync::atomic::Ordering::SeqCst);
    if cfg!(debug_assertions) {
        guncelleme_bildir(json!({ "tur": "gelistirme" }));
        return;
    }
    let tur = GUNCELLEME.lock().unwrap()["tur"].as_str().unwrap_or("").to_string();
    if tur == "iniyor" || tur == "hazir" {
        return;
    }
    guncelleme_bildir(json!({ "tur": "bakiliyor" }));
    let sonuc = match app.updater() {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    };
    match sonuc {
        Ok(Some(u)) => {
            let surum = u.version.clone();
            *BEKLEYEN_GUNCELLEME.lock().unwrap() = Some(u);
            guncelleme_bildir(json!({ "tur": "var", "surum": surum }));
        }
        Ok(None) => guncelleme_bildir(json!({ "tur": "yok" })),
        Err(e) => guncelleme_bildir(json!({ "tur": "hata", "hata": e })),
    }
}

#[tauri::command]
fn guncelleme_durum() -> Value {
    GUNCELLEME.lock().unwrap().clone()
}

#[tauri::command]
fn guncelleme_denetle(app: AppHandle) -> bool {
    tauri::async_runtime::spawn(guncelleme_bak(app));
    true
}

#[tauri::command]
async fn guncelleme_indir() -> Value {
    let u = BEKLEYEN_GUNCELLEME.lock().unwrap().clone();
    let Some(u) = u else {
        return json!({ "ok": false, "hata": "Önce güncelleme denetlenmeli." });
    };
    guncelleme_bildir(json!({ "tur": "iniyor", "yuzde": 0 }));
    let mut inen: u64 = 0;
    let mut son = std::time::Instant::now();
    let sonuc = u
        .download(
            |parca, toplam| {
                inen += parca as u64;
                if let Some(t) = toplam {
                    if t > 0 && son.elapsed().as_millis() > 250 {
                        son = std::time::Instant::now();
                        guncelleme_bildir(json!({ "tur": "iniyor", "yuzde": inen * 100 / t }));
                    }
                }
            },
            || {},
        )
        .await;
    match sonuc {
        Ok(b) => {
            *INEN_GUNCELLEME.lock().unwrap() = Some(b);
            guncelleme_bildir(json!({ "tur": "hazir", "surum": u.version }));
            json!({ "ok": true })
        }
        Err(e) => {
            guncelleme_bildir(json!({ "tur": "hata", "hata": e.to_string() }));
            json!({ "ok": false, "hata": e.to_string() })
        }
    }
}

#[tauri::command]
fn guncelleme_kur(app: AppHandle) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Önce oyunu kapat, sonra güncelle." });
    }
    let u = BEKLEYEN_GUNCELLEME.lock().unwrap().clone();
    let b = INEN_GUNCELLEME.lock().unwrap().clone();
    let (Some(u), Some(b)) = (u, b) else {
        return json!({ "ok": false, "hata": "Güncelleme henüz inmedi." });
    };
    sure::bitir();
    match u.install(b) {
        Ok(()) => app.restart(),
        Err(e) => json!({ "ok": false, "hata": e.to_string() }),
    }
}

/* =========================================================
Modlar
========================================================= */
struct ModProfili {
    tur: String,
    mc: String,
    yukleyici: String,
    sunucu: Option<String>,
}

/// Genel profil, sunucuya özel profil ya da kayıtlı sürüm profili ("profil:<id>")
fn mod_profili(o: &Value) -> ModProfili {
    let a = ayarlar::getir();
    let tur = match o["tur"].as_str() {
        Some("shader") => "shader",
        Some("paket") => "paket",
        _ => "mod",
    }
    .to_string();
    let anahtar = o["sunucu"].as_str().unwrap_or("").to_string();
    if let Some(id) = anahtar.strip_prefix("profil:") {
        if let Some(p) = a.profiller.iter().find(|x| x.id == id) {
            return ModProfili {
                tur,
                mc: p.surum.clone(),
                yukleyici: p.yukleyici.clone(),
                sunucu: Some(anahtar),
            };
        }
    }
    if let Some(sp) = a.sunucu_profilleri.get(&anahtar) {
        return ModProfili {
            tur,
            mc: sp.surum.clone(),
            yukleyici: sp.yukleyici.clone(),
            sunucu: Some(anahtar),
        };
    }
    ModProfili {
        tur,
        mc: a.mc_surum,
        yukleyici: a.yukleyici,
        sunucu: None,
    }
}

#[tauri::command]
async fn mod_ara(o: Value) -> Value {
    let p = mod_profili(&o);
    let sonuc = modlar::ara(
        o["sorgu"].as_str().unwrap_or(""),
        &p.tur,
        &p.mc,
        &p.yukleyici,
        p.sunucu.as_deref(),
        o["sira"].as_str().unwrap_or("relevance"),
        o["sayfa"].as_u64().unwrap_or(0),
    )
    .await;
    sonuc_json(sonuc)
}

#[tauri::command]
fn mod_sunucu_sayilari() -> Value {
    let a = ayarlar::getir();
    let mut s = serde_json::Map::new();
    for (adres, sp) in &a.sunucu_profilleri {
        s.insert(adres.clone(), json!(modlar::mod_sayisi(&sp.yukleyici, &sp.surum, Some(adres))));
    }
    for p in &a.profiller {
        let anahtar = format!("profil:{}", p.id);
        let n = if p.yukleyici == "vanilla" {
            0
        } else {
            modlar::mod_sayisi(&p.yukleyici, &p.surum, Some(&anahtar))
        };
        s.insert(anahtar, json!(n));
    }
    Value::Object(s)
}

#[tauri::command]
async fn mod_yukle(o: Value) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Oyun açıkken mod kurulamaz." });
    }
    let p = mod_profili(&o);
    let sonuc = modlar::yukle(o["proje"].as_str().unwrap_or(""), &p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref()).await;
    // Kaynak paketi ve shader kurulunca hemen kullanılır hâle gelsin
    if sonuc.is_ok() && (p.tur == "paket" || p.tur == "shader") {
        if let Some(d) = modlar::dosya_adi(o["proje"].as_str().unwrap_or(""), &p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref()) {
            if p.tur == "paket" {
                istemci::kaynak_paketini_ac(&d);
            } else {
                istemci::shaderi_sec(&d);
            }
        }
    }
    sonuc_json(sonuc)
}

#[tauri::command]
fn mod_liste(o: Value) -> Value {
    let p = mod_profili(&o);
    sonuc_json::<Vec<Value>>(Ok(modlar::liste(&p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref())))
}

/// Kurulu içeriğin güncellemeleri (Modlar > Yüklü)
#[tauri::command]
async fn mod_guncellemeler(o: Value) -> Value {
    let p = mod_profili(&o);
    sonuc_json(modlar::guncellemeler(&p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref()).await)
}

#[tauri::command]
async fn mod_guncelle(o: Value) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Oyun açıkken mod güncellenemez." });
    }
    let p = mod_profili(&o);
    sonuc_json(modlar::guncelle(o["proje"].as_str().unwrap_or(""), &p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref()).await)
}

/// "Onar": son açılan (yoksa seçili) sürüm için önbellek, oyun dosyaları ve Java onarımı
#[tauri::command]
async fn oyunu_onar() -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Oyun açıkken ya da başka bir işlem sürerken onarılamaz." });
    }
    let son = SON_ACILIS.lock().unwrap().clone();
    let mc = son
        .as_ref()
        .map(|a| metin(a, "mc"))
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| ayarlar::getir().mc_surum);
    sonuc_json(onar::onar(&mc).await)
}

#[tauri::command]
fn oyun_ayarlarini_sifirla() -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Oyun açıkken ayarlar sıfırlanamaz." });
    }
    sonuc_json(onar::ayarlari_sifirla())
}

#[tauri::command]
async fn mod_eksikleri_kur(eksik: Vec<String>) -> Value {
    let a = SON_ACILIS.lock().unwrap().clone();
    let Some(a) = a else {
        return json!({ "ok": false, "hata": "Önce oyunu bir kez aç." });
    };
    let y = metin(&a, "yukleyici");
    if !["fabric", "quilt", "forge", "neoforge"].contains(&y.as_str()) {
        return json!({ "ok": false, "hata": "Bu profilde mod yükleyici yok." });
    }
    let sunucu = a["sunucu"].as_str().map(String::from);
    let eksik: Vec<String> = eksik.into_iter().take(20).collect();
    sonuc_json(modlar::eksikleri_kur(&metin(&a, "mc"), &y, sunucu.as_deref(), &eksik).await)
}

#[tauri::command]
fn oyun_son_acilis() -> Value {
    SON_ACILIS.lock().unwrap().clone().unwrap_or(Value::Null)
}

#[tauri::command]
fn mod_ac_kapat(o: Value) -> Value {
    let p = mod_profili(&o);
    sonuc_json(modlar::ac_kapat(
        &p.tur,
        &p.mc,
        &p.yukleyici,
        p.sunucu.as_deref(),
        o["dosya"].as_str().unwrap_or(""),
        o["acik"].as_bool().unwrap_or(false),
    ))
}

#[tauri::command]
fn mod_sil(o: Value) -> Value {
    let p = mod_profili(&o);
    sonuc_json(modlar::sil(
        &p.tur,
        &p.mc,
        &p.yukleyici,
        p.sunucu.as_deref(),
        o["dosya"].as_str().unwrap_or(""),
    ))
}

#[tauri::command]
fn mod_klasor(app: AppHandle, o: Value) {
    let p = mod_profili(&o);
    let k = modlar::hedef_klasor(&p.tur, &p.yukleyici, &p.mc, p.sunucu.as_deref());
    let _ = app.opener().open_path(k.display().to_string(), None::<&str>);
}

#[tauri::command]
fn config_liste() -> Value {
    sonuc_json::<Vec<Value>>(Ok(modlar::config_liste()))
}

#[tauri::command]
fn config_oku(yol: String) -> Value {
    sonuc_json(modlar::config_oku(&yol))
}

#[tauri::command]
fn config_yaz(yol: String, metin: String) -> Value {
    sonuc_json(modlar::config_yaz(&yol, &metin))
}

#[tauri::command]
fn config_klasor(app: AppHandle) {
    let _ = app.opener().open_path(modlar::config_klasoru().display().to_string(), None::<&str>);
}

/* =========================================================
Sunucular ve sürümler
========================================================= */
#[tauri::command]
fn sunucu_liste() -> Value {
    Value::Array(sunucular::listele(&oyun_klasoru()))
}

#[tauri::command]
async fn sunucu_sorgula(adres: String) -> Value {
    ping::sorgula(&adres).await
}

#[tauri::command]
fn sunucu_ekle(ad: String, adres: String) -> Value {
    sonuc_json(sunucular::ekle(&oyun_klasoru(), &ad, &adres))
}

#[tauri::command]
fn sunucu_sil(adres: String) -> Value {
    sonuc_json(sunucular::sil(&oyun_klasoru(), &adres))
}

#[tauri::command]
fn sunucu_dis_sayisi() -> usize {
    sunucular::dis_sayisi()
}

#[tauri::command]
fn sunucu_ice_aktar() -> Value {
    sonuc_json(sunucular::ice_aktar(&oyun_klasoru()))
}

#[tauri::command]
async fn surum_liste() -> Value {
    surumler::liste().await
}

#[tauri::command]
async fn surum_yukle(id: String) -> Value {
    match oyun::surum_yukle(&id).await {
        Ok(()) => json!({ "ok": true }),
        Err(e) => {
            log(format!("HATA: {e}"));
            json!({ "ok": false, "hata": e })
        }
    }
}

#[tauri::command]
fn surum_sil(id: String) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Önce devam eden işlem bitsin." });
    }
    match surumler::sil(&id) {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

/* =========================================================
Performans
========================================================= */
#[tauri::command]
async fn sistem_tara() -> Value {
    performans::sistem_tara().await
}

#[tauri::command]
async fn performans_uygula(seviye: String) -> Value {
    performans::uygula(&seviye).await
}

/* =========================================================
KCZ Client, profil kodu, yedekler
========================================================= */
#[tauri::command]
fn istemci_bilgi() -> Value {
    json!({ "surumler": istemci::desteklenen_surumler(), "isletim": ortak::os_adi() })
}

#[tauri::command]
fn profil_kodu(id: String) -> Value {
    match profil::kod_olustur(&id) {
        Ok(kod) => json!({ "ok": true, "kod": kod }),
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
fn profil_kod_ekle(kod: String) -> Value {
    match profil::ice_aktar(&kod) {
        Ok(v) => v,
        Err(e) => json!({ "ok": false, "hata": e }),
    }
}

#[tauri::command]
fn yedek_klasor_ac(app: AppHandle) {
    let _ = app.opener().open_path(yedek::klasor().display().to_string(), None::<&str>);
}

/* =========================================================
Sistem tepsisi
========================================================= */
fn pencereyi_goster(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    } else if UYUYOR.load(std::sync::atomic::Ordering::SeqCst) {
        // Oyun açıkken tepsiden açıldı: arayüz "oyun açık" durumunda gelsin
        if oyun::mesgul_mu() {
            *SON_DURUM.lock().unwrap() = Some(json!({ "tur": "acik", "surum": "", "sessiz": true }));
        }
        uyandir(app);
    }
}

/// Ana pencerenin olayları (boyut, odak, kapatma). Uyanınca yeniden kurulur.
fn pencere_olaylari(w: &tauri::WebviewWindow) {
    let w2 = w.clone();
    w.on_window_event(move |e| match e {
        WindowEvent::Resized(boyut) => {
            if let Ok(f) = w2.scale_factor() {
                let l = boyut.to_logical::<f64>(f);
                if l.width >= 900.0 && l.height >= 500.0 {
                    *PENCERE_BOYUTU.lock().unwrap() = Some((l.width.round() as u32, l.height.round() as u32));
                }
            }
        }
        // Pencereye geri dönüldüğünde: son denetimden 5 dk geçtiyse sessizce bak
        WindowEvent::Focused(true) => {
            tauri::async_runtime::spawn(guncelleme_gerekirse(w2.app_handle().clone(), 5 * 60));
        }
        WindowEvent::CloseRequested { api, .. } => {
            pencere_boyutunu_kaydet();
            // Ayar açıksa ve tepsi kurulduysa: kapatma yerine saatin yanına küçül
            if ayarlar::getir().tepsiye_kucult && TEPSI_VAR.load(std::sync::atomic::Ordering::SeqCst) {
                api.prevent_close();
                let _ = w2.hide();
            } else {
                sure::bitir();
            }
        }
        _ => {}
    });
}

fn pencere_boyutunu_kaydet() {
    let b = *PENCERE_BOYUTU.lock().unwrap();
    if let Some((w, h)) = b {
        ayarlar::kaydet(&json!({ "pencere": { "w": w, "h": h } }));
    }
}

fn tamamen_kapat(app: &AppHandle) {
    pencere_boyutunu_kaydet();
    sure::bitir();
    app.exit(0);
}

fn tepsi_kur(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let ac = MenuItem::with_id(app, "ac", "KCZ Launcher'ı aç", true, None::<&str>)?;
    let oyna = MenuItem::with_id(app, "oyna", "Oyna", true, None::<&str>)?;
    let ayrac = PredefinedMenuItem::separator(app)?;
    let cik = MenuItem::with_id(app, "cik", "Çıkış", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&ac, &oyna, &ayrac, &cik])?;
    let mut b = TrayIconBuilder::with_id("kcz")
        .tooltip("KCZ Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, olay| match olay.id.as_ref() {
            "ac" => pencereyi_goster(app),
            "oyna" => {
                pencereyi_goster(app);
                let _ = app.emit("tepsi-oyna", ());
            }
            "cik" => tamamen_kapat(app),
            _ => {}
        })
        .on_tray_icon_event(|tepsi, olay| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = olay
            {
                pencereyi_goster(tepsi.app_handle());
            }
        });
    if let Some(ikon) = app.default_window_icon() {
        b = b.icon(ikon.clone());
    }
    b.build(app)?;
    Ok(())
}

/* =========================================================
OYNA
========================================================= */
#[tauri::command]
async fn oyun_baslat(hedef_sunucu: Option<String>, surum: Option<String>, profil_id: Option<String>, modsuz: Option<bool>) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Şu an başka bir işlem sürüyor." });
    }
    let Some(yetki) = hesap::yetki().await else {
        return json!({ "ok": false, "hata": "Önce Microsoft hesabınla giriş yapmalısın." });
    };
    let a = ayarlar::getir();
    let hedef = hedef_sunucu.filter(|h| !h.trim().is_empty());
    // Kayıtlı profil seçildiyse o profilin sürümü, yükleyicisi ve modları
    let pr = profil_id.as_ref().and_then(|id| a.profiller.iter().find(|x| &x.id == id).cloned());
    let sp = match &pr {
        Some(p) => Some((p.surum.clone(), p.yukleyici.clone())),
        None => hedef
            .as_ref()
            .and_then(|h| a.sunucu_profilleri.get(h))
            .map(|s| (s.surum.clone(), s.yukleyici.clone())),
    };
    let mod_anahtari = match (&pr, &sp) {
        (Some(p), _) => Some(format!("profil:{}", p.id)),
        (None, Some(_)) => hedef.clone(),
        _ => None,
    };
    let mut acilis = a.clone();
    if let Some((s, y)) = &sp {
        acilis.mc_surum = s.clone();
        acilis.yukleyici = y.clone();
    } else if let Some(s) = surum.as_ref().filter(|s| ayarlar::surum_gecerli(s)) {
        acilis.mc_surum = s.clone();
    }
    *SON_ACILIS.lock().unwrap() = Some(json!({
        "mc": acilis.mc_surum, "yukleyici": acilis.yukleyici, "sunucu": mod_anahtari,
        "hedefSunucu": hedef, "surum": surum, "profilId": profil_id
    }));
    kayit_temizle();
    let sonuc = oyun::baslat(oyun::Acilis {
        ayarlar: acilis,
        hedef_sunucu: if pr.is_some() { None } else { hedef },
        mod_sunucusu: mod_anahtari,
        yetki,
        modsuz: modsuz.unwrap_or(false),
    })
    .await;
    match sonuc {
        Ok(()) => json!({ "ok": true }),
        Err(e) => {
            log(format!("HATA: {e}"));
            json!({ "ok": false, "hata": e })
        }
    }
}

#[tauri::command]
fn oyun_klasor_ac(app: AppHandle) {
    let _ = app.opener().open_path(oyun_klasoru().display().to_string(), None::<&str>);
}

/* =========================================================
Başlangıç
========================================================= */
static PENCERE_BOYUTU: LazyLock<Mutex<Option<(u32, u32)>>> = LazyLock::new(|| Mutex::new(None));
static TEPSI_VAR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _| {
            // Masaüstü kısayolu: launcher açıkken tıklandıysa sunucuya bağlan, pencereyi gösterme
            match kisayol::argumandan(&argv) {
                Some(adres) => kisayol::ilet(adres),
                None => pencereyi_goster(app),
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let _ = UYGULAMA.set(app.handle().clone());
            ayarlar::yukle();
            // Önceki oyun sırasında launcher kapandıysa güç planını geri al
            std::thread::spawn(performans::guc_plani_geri);
            sunucular::izle();
            // Masaüstü kısayoluyla açıldıysa pencere gösterilmez; arayüz oyunu doğrudan başlatır
            let kisayoldan = kisayol::argumandan(&std::env::args().collect::<Vec<_>>());
            let ilk = match ana_pencere_kur(app.handle()) {
                Ok(w) => Some(w),
                Err(e) => {
                    log(format!("Launcher penceresi açılamadı: {e}"));
                    None
                }
            };
            if let Some(w) = ilk {
                let p = ayarlar::getir().pencere;
                let _ = w.set_size(tauri::LogicalSize::new(p.w as f64, p.h as f64));
                let _ = w.center();
                match kisayoldan {
                    Some(adres) => kisayol::beklet(adres),
                    None => {
                        let _ = w.show();
                    }
                }
                pencere_olaylari(&w);
            }
            match tepsi_kur(app) {
                Ok(()) => TEPSI_VAR.store(true, std::sync::atomic::Ordering::SeqCst),
                Err(e) => log(format!("Sistem tepsisi kurulamadı: {e}")),
            }
            sunucu::sayimi_baslat();
            // KCZ Optimizasyon: oyuncu beklemesin diye arka planda önceden hazırla
            tauri::async_runtime::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                performans::onceden_hazirla().await;
            });
            // Güncelleme: açılıştan 4 sn sonra, sonra 10 dakikada bir (odakla yapılan denetim
            // sayacı sıfırladıysa o tur atlanır). Her denetim ~1 KB'lık tek bir istek.
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                guncelleme_bak(h.clone()).await;
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    // Oyun açıkken de denetlenir (tek küçük istek); kurulum oyun kapanınca yapılır
                    guncelleme_gerekirse(h.clone(), 10 * 60).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ayarlar_getir,
            ayarlar_kaydet,
            hesap_durum,
            hesap_cevrimdisi_giris,
            hesap_pencere_giris,
            hesap_tarayici_baslat,
            edge_ac,
            hesap_tarayici_iptal,
            hesap_cikis,
            hesap_listesi,
            hesap_gec,
            hesap_unut,
            skin_liste,
            kafa_dokusu,
            skin_isim_ekle,
            skin_dosya_ekle,
            skin_kaldir,
            skin_giy,
            pelerin_liste,
            skin_gizle,
            skin_gizlenenleri_geri,
            skin_yenile,
            pelerin_tak,
            sure_hafta,
            dis_ac,
            guncelleme_durum,
            guncelleme_denetle,
            sunucu::sunucu_bagli,
            sunucu::oneri_gonder,
            sunucu::arkadas_durumlari,
            kisayol::kisayol_bekleyen,
            kisayol::kisayol_olustur,
            sunucu::arkadas_ekle,
            sunucu::arkadas_sil,
            sunucu::kimlik_kodu,
            sunucu::arkadas_istek_gonder,
            sunucu::arkadas_listesi,
            sunucu::arkadas_istek_yanit,
            sunucu::arkadas_cikar,
            sunucu::mesaj_gonder,
            sunucu::mesajlari_al,
            sunucu::profil_al,
            sunucu::profil_kaydet,
            sunucu::davet_gonder,
            sunucu::davetleri_al,
            sunucu::ses_katil,
            sunucu::ses_ayril,
            sunucu::ses_sinyal_gonder,
            sunucu::ses_sinyalleri_al,
            sunucu::ses_durum_yaz,
            sunucu::ses_ice,
            foto::foto_gonder,
            foto::foto_al,
            sunucu::duyurular,
            sunucu::surum_notlari,
            sunucu::yonetici_duyurular,
            sunucu::yonetici_duyuru_ekle,
            sunucu::yonetici_duyuru_sil,
            sunucu::yonetici_oneri_kaydi,
            cokme::cokme_bildir,
            goruntu::ekran_goruntuleri,
            goruntu::ekran_goruntusu_oku,
            goruntu::ekran_goruntusu_kopyala,
            goruntu::ekran_goruntusu_sil,
            goruntu::ekran_goruntusu_klasor,
            cokme::cokme_raporu_ac,
            sunucu::yonetici_kod_iste,
            sunucu::yonetici_kod_dogrula,
            sunucu::yonetici_durum,
            sunucu::yonetici_cikis,
            sunucu::yonetici_istatistik,
            sunucu::yonetici_oneriler,
            sunucu::yonetici_oneri_durum,
            sunucu::yonetici_listesi,
            sunucu::yonetici_davet,
            sunucu::yonetici_kaldir,
            guncelleme_indir,
            guncelleme_kur,
            mod_ara,
            mod_sunucu_sayilari,
            mod_yukle,
            mod_liste,
            mod_guncellemeler,
            mod_guncelle,
            oyunu_onar,
            oyun_ayarlarini_sifirla,
            mod_eksikleri_kur,
            oyun_son_acilis,
            mod_ac_kapat,
            mod_sil,
            mod_klasor,
            config_liste,
            config_oku,
            config_yaz,
            config_klasor,
            sunucu_liste,
            sunucu_sorgula,
            sunucu_ekle,
            sunucu_sil,
            sunucu_dis_sayisi,
            sunucu_ice_aktar,
            surum_liste,
            surum_yukle,
            surum_sil,
            oyun_baslat,
            oyun_klasor_ac,
            sistem_tara,
            performans_uygula,
            istemci_bilgi,
            profil_kodu,
            profil_kod_ekle,
            yedek_klasor_ac
        ])
        .build(tauri::generate_context!())
        .expect("KCZ Launcher başlatılamadı")
        .run(|_, olay| {
            // Uyurken pencere kalmıyor: Tauri bunu "çıkış" sanmasın
            if let tauri::RunEvent::ExitRequested { api, code: None, .. } = olay {
                if UYUYOR.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
