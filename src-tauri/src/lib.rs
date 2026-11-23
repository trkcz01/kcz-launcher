// KÇZ Launcher (Tauri) - ana kısım: arayüzün çağırdığı komutlar, pencere, güncelleme.
mod ayarlar;
mod cevrimdisi;
mod hesap;
mod istemci;
mod java;
mod modlar;
mod ortak;
mod oyun;
mod performans;
mod ping;
mod profil;
mod skin;
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

pub fn oyun_durumu(mut veri: Value) {
    match veri["tur"].as_str() {
        Some("acik") => {
            sure::basla();
            if ayarlar::getir().oyun_acilinca_gizle {
                if let Some(w) = ana_pencere() {
                    let _ = w.minimize();
                }
            }
        }
        Some("kapandi") => {
            sure::bitir();
            // Oyunun içindeki KÇZ menüsünden yapılan değişiklikleri al
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
            }
            if let Some(w) = ana_pencere() {
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
async fn hesap_tekrar_dene() -> Value {
    hesap::tekrar_dene().await
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
fn hesap_cikis() -> Value {
    hesap::cikis()
}

#[tauri::command]
fn hesap_cevrimdisi_giris(ad: String) -> Value {
    hesap::cevrimdisi_giris(&ad)
}

/* =========================================================
Skinler ve süre
========================================================= */
#[tauri::command]
async fn skin_liste() -> Value {
    skin::liste().await
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
fn sure_hafta() -> Value {
    sure::hafta()
}

/// Öneri kartlarındaki bağlantılar (sadece Modrinth)
#[tauri::command]
fn dis_ac(app: AppHandle, adres: String) {
    if adres.starts_with("https://modrinth.com/") {
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

async fn guncelleme_bak(app: AppHandle) {
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
    sonuc_json(modlar::yukle(o["proje"].as_str().unwrap_or(""), &p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref()).await)
}

#[tauri::command]
fn mod_liste(o: Value) -> Value {
    let p = mod_profili(&o);
    sonuc_json::<Vec<Value>>(Ok(modlar::liste(&p.tur, &p.mc, &p.yukleyici, p.sunucu.as_deref())))
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
KÇZ Client, profil kodu, yedekler
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
    }
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
    let ac = MenuItem::with_id(app, "ac", "KÇZ Launcher'ı aç", true, None::<&str>)?;
    let oyna = MenuItem::with_id(app, "oyna", "Oyna", true, None::<&str>)?;
    let ayrac = PredefinedMenuItem::separator(app)?;
    let cik = MenuItem::with_id(app, "cik", "Çıkış", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&ac, &oyna, &ayrac, &cik])?;
    let mut b = TrayIconBuilder::with_id("kcz")
        .tooltip("KÇZ Launcher")
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
async fn oyun_baslat(hedef_sunucu: Option<String>, surum: Option<String>, profil_id: Option<String>) -> Value {
    if oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Şu an başka bir işlem sürüyor." });
    }
    let Some(yetki) = hesap::yetki().await else {
        return json!({ "ok": false, "hata": "Önce Microsoft hesabınla giriş yapmalısın." });
    };
    let a = ayarlar::getir();
    let hedef = hedef_sunucu.filter(|h| !h.trim().is_empty());
    let cevrimdisi = yetki.cevrimdisi;
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
    if cevrimdisi {
        log("Çevrimdışı mod: tek oyunculu ve LAN oynanabilir, internetteki sunuculara bağlanılamaz.");
    }
    let sonuc = oyun::baslat(oyun::Acilis {
        ayarlar: acilis,
        hedef_sunucu: if pr.is_some() { None } else { hedef },
        mod_sunucusu: mod_anahtari,
        yetki,
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
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let _ = UYGULAMA.set(app.handle().clone());
            ayarlar::yukle();
            // Önceki oyun sırasında launcher kapandıysa güç planını geri al
            std::thread::spawn(performans::guc_plani_geri);
            sunucular::izle();
            if let Some(w) = app.get_webview_window("main") {
                let p = ayarlar::getir().pencere;
                let _ = w.set_size(tauri::LogicalSize::new(p.w as f64, p.h as f64));
                let _ = w.center();
                let _ = w.show();
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
            match tepsi_kur(app) {
                Ok(()) => TEPSI_VAR.store(true, std::sync::atomic::Ordering::SeqCst),
                Err(e) => log(format!("Sistem tepsisi kurulamadı: {e}")),
            }
            // KÇZ Optimizasyon: oyuncu beklemesin diye arka planda önceden hazırla
            tauri::async_runtime::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                performans::onceden_hazirla().await;
            });
            // Güncellemeyi açılıştan 4 sn sonra ve her 30 dakikada bir denetle
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                loop {
                    guncelleme_bak(h.clone()).await;
                    tokio::time::sleep(std::time::Duration::from_secs(30 * 60)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ayarlar_getir,
            ayarlar_kaydet,
            hesap_durum,
            hesap_tekrar_dene,
            hesap_pencere_giris,
            hesap_tarayici_baslat,
            edge_ac,
            hesap_tarayici_iptal,
            hesap_cikis,
            hesap_cevrimdisi_giris,
            skin_liste,
            skin_isim_ekle,
            skin_dosya_ekle,
            skin_kaldir,
            skin_giy,
            sure_hafta,
            dis_ac,
            guncelleme_durum,
            guncelleme_denetle,
            guncelleme_indir,
            guncelleme_kur,
            mod_ara,
            mod_sunucu_sayilari,
            mod_yukle,
            mod_liste,
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
        .run(tauri::generate_context!())
        .expect("KÇZ Launcher başlatılamadı");
}
