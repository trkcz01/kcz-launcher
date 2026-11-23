// Microsoft / Minecraft hesabı ile giriş.
//  1) "tarayici": Microsoft cihaz kodu. Sayfa Edge'de açılır, Windows hesabı zaten açık olduğu için
//     hesaba tıklayıp izin vermek yeter.
//  2) "pencere": Giriş, launcher'ın açtığı küçük bir pencerede yapılır.
// Giriş anahtarı Windows Kimlik Bilgisi Yöneticisi'nde saklanır (şifreli).
//  3) Çevrimdışı: İnternet yoksa son giriş yapılan hesabın adı ve UUID'siyle oyun açılır
//     (tek oyunculu ve LAN). İnternet gelince otomatik olarak tekrar çevrimiçi olunur.
use crate::ortak::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LIVE: &str = "https://login.live.com";
const KAPSAM: &str = "service::user.auth.xboxlive.com::MBI_SSL";
// Cihaz kodu girişi için istemci kimliği
const CIHAZ_ISTEMCI: &str = "00000000441cc96b";
// Pencerede giriş için istemci kimliği ve dönüş adresi (resmi launcher'ın kullandığı)
const PENCERE_ISTEMCI: &str = "00000000402b5328";
const DONUS: &str = "https://login.live.com/oauth20_desktop.srf";

const KASA_SERVIS: &str = "KÇZ Launcher";
const KASA_HESAP: &str = "microsoft-hesabi";

#[derive(Serialize, Deserialize, Clone)]
struct Kayit {
    yontem: String,   // "tarayici" | "pencere"
    yenileme: String, // Microsoft yenileme anahtarı
    // Çevrimdışı giriş için son hesabın adı ve UUID'si (eski kayıtlarda yok)
    #[serde(default)]
    ad: String,
    #[serde(default)]
    uuid: String,
}

/// İnternete hiç ulaşılamadığında dönen hata (çevrimdışı girişe geçmek için)
const AG_YOK: &str = "İnternet bağlantısı yok gibi görünüyor.";
/// Çevrimdışı oturumdaki sahte erişim anahtarı (oyun tek oyunculu/LAN'da bunu denetlemez)
const CEVRIMDISI_ANAHTAR: &str = "kcz-cevrimdisi";
/// Çevrimdışıyken tekrar çevrimiçi olmayı en sık bu aralıkla dene
const CEVRIMDISI_DENEME: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct Oturum {
    pub ad: String,
    pub uuid: String,
    pub erisim: String,
    pub cevrimdisi: bool,
    zaman: Instant,
}

static OTURUM: LazyLock<Mutex<Option<Oturum>>> = LazyLock::new(|| Mutex::new(None));
static BEKLEYEN: AtomicU64 = AtomicU64::new(0);

/* ---------- Anahtarı saklama ---------- */
fn kasa() -> Option<keyring::Entry> {
    keyring::Entry::new(KASA_SERVIS, KASA_HESAP).ok()
}

fn kaydet(k: &Kayit) {
    if let (Some(e), Ok(m)) = (kasa(), serde_json::to_string(k)) {
        let _ = e.set_password(&m);
    }
}

fn oku() -> Option<Kayit> {
    let m = kasa()?.get_password().ok()?;
    serde_json::from_str(&m).ok()
}

fn sil() {
    if let Some(e) = kasa() {
        let _ = e.delete_credential();
    }
}

/* ---------- Yardımcılar ---------- */
fn profil_json(o: &Oturum) -> Value {
    json!({ "girisli": true, "ad": o.ad, "uuid": o.uuid, "cevrimdisi": o.cevrimdisi })
}

fn xbox_hata(kod: u64) -> String {
    match kod {
        2148916233 => "Bu Microsoft hesabının Xbox profili yok. xbox.com adresinden bir kere giriş yapıp profil oluştur.".into(),
        2148916235 => "Xbox Live bu ülkede kullanılamıyor.".into(),
        2148916236 | 2148916237 => "Hesabın yetişkin doğrulaması gerekiyor (xbox.com).".into(),
        2148916238 => "Bu bir çocuk hesabı. Bir yetişkinin hesabı aileye eklemesi gerekiyor.".into(),
        _ => format!("Xbox girişi başarısız (kod {kod})."),
    }
}

async fn form_gonder(url: &str, veri: &[(&str, &str)]) -> Sonuc<(bool, Value)> {
    let r = ISTEMCI
        .post(url)
        .form(veri)
        .send()
        .await
        .map_err(|_| AG_YOK.to_string())?;
    let ok = r.status().is_success();
    let j = r.json::<Value>().await.unwrap_or(json!({}));
    Ok((ok, j))
}

async fn json_gonder(url: &str, govde: Value) -> Sonuc<Value> {
    let r = ISTEMCI
        .post(url)
        .header("Accept", "application/json")
        .json(&govde)
        .send()
        .await
        .map_err(|_| AG_YOK.to_string())?;
    let kod = r.status();
    let metin = r.text().await.unwrap_or_default();
    let j: Value = serde_json::from_str(&metin).unwrap_or(json!({}));
    if !kod.is_success() {
        if let Some(x) = j.get("XErr").and_then(|x| x.as_u64()) {
            return Err(xbox_hata(x));
        }
        return Err(format!("Sunucu hatası ({})", kod.as_u16()));
    }
    Ok(j)
}

/// Microsoft giriş anahtarı -> Xbox -> Minecraft oturumu
async fn msden_minecrafta(ms_erisim: &str) -> Sonuc<Oturum> {
    let xbl = json_gonder(
        "https://user.auth.xboxlive.com/user/authenticate",
        json!({
            "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("t={ms_erisim}") },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xsts = json_gonder(
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [ metin(&xbl, "Token") ] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"].as_str().unwrap_or("").to_string();
    let mc = json_gonder(
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        json!({ "identityToken": format!("XBL3.0 x={uhs};{}", metin(&xsts, "Token")) }),
    )
    .await?;
    let erisim = metin(&mc, "access_token");
    if erisim.is_empty() {
        return Err("Minecraft girişi yapılamadı.".into());
    }
    let pr = ISTEMCI
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&erisim)
        .send()
        .await
        .map_err(|_| AG_YOK.to_string())?;
    if pr.status().as_u16() == 404 {
        return Err("Bu hesapta Minecraft Java bulunamadı.".into());
    }
    if !pr.status().is_success() {
        return Err(format!("Minecraft profili alınamadı ({}).", pr.status().as_u16()));
    }
    let p: Value = pr.json().await.h()?;
    Ok(Oturum {
        ad: metin(&p, "name"),
        uuid: metin(&p, "id"),
        erisim,
        cevrimdisi: false,
        zaman: Instant::now(),
    })
}

fn oturum_ayarla(o: &Oturum) {
    *OTURUM.lock().unwrap() = Some(o.clone());
}

/* ---------- 1) Edge (cihaz kodu) ile giriş ---------- */
/// Kodu ve açılacak adresi döndürür; giriş bitince "hesap-sonuc" olayı gönderilir.
pub async fn tarayici_baslat() -> Sonuc<(String, String)> {
    let (ok, j) = form_gonder(
        &format!("{LIVE}/oauth20_connect.srf"),
        &[("client_id", CIHAZ_ISTEMCI), ("scope", KAPSAM), ("response_type", "device_code")],
    )
    .await?;
    let cihaz = metin(&j, "device_code");
    let kod = metin(&j, "user_code");
    if !ok || cihaz.is_empty() {
        return Err("Microsoft giriş kodu alınamadı. İnternetini kontrol et.".into());
    }
    let dogrulama = {
        let v = metin(&j, "verification_uri");
        if v.is_empty() {
            "https://www.microsoft.com/link".to_string()
        } else {
            v
        }
    };
    let adres = format!(
        "{dogrulama}?otc={}",
        url::form_urlencoded::byte_serialize(kod.as_bytes()).collect::<String>()
    );
    let bu = BEKLEYEN.fetch_add(1, Ordering::SeqCst) + 1;
    let sure = j.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(900);
    let mut aralik = j.get("interval").and_then(|x| x.as_u64()).unwrap_or(5);

    tauri::async_runtime::spawn(async move {
        let bitis = Instant::now() + Duration::from_secs(sure);
        while Instant::now() < bitis {
            tokio::time::sleep(Duration::from_secs(aralik)).await;
            if BEKLEYEN.load(Ordering::SeqCst) != bu {
                return; // iptal edildi ya da yeni giriş başladı
            }
            let t = form_gonder(
                &format!("{LIVE}/oauth20_token.srf"),
                &[
                    ("client_id", CIHAZ_ISTEMCI),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                    ("device_code", cihaz.as_str()),
                ],
            )
            .await;
            let Ok((tok, tj)) = t else { continue };
            if BEKLEYEN.load(Ordering::SeqCst) != bu {
                return;
            }
            let erisim = metin(&tj, "access_token");
            if tok && !erisim.is_empty() {
                BEKLEYEN.fetch_add(1, Ordering::SeqCst);
                let sonuc = match msden_minecrafta(&erisim).await {
                    Ok(o) => {
                        kaydet(&Kayit {
                            yontem: "tarayici".into(),
                            yenileme: metin(&tj, "refresh_token"),
                            ad: o.ad.clone(),
                            uuid: o.uuid.clone(),
                        });
                        oturum_ayarla(&o);
                        pencereyi_one_getir();
                        profil_json(&o)
                    }
                    Err(e) => json!({ "girisli": false, "hata": e }),
                };
                gonder("hesap-sonuc", sonuc);
                return;
            }
            match metin(&tj, "error").as_str() {
                "authorization_pending" => continue,
                "slow_down" => {
                    aralik += 5;
                    continue;
                }
                e => {
                    BEKLEYEN.fetch_add(1, Ordering::SeqCst);
                    let hata = match e {
                        "authorization_declined" => "Giriş reddedildi.".to_string(),
                        "expired_token" => "Kodun süresi doldu, tekrar dene.".to_string(),
                        _ => {
                            let a = metin(&tj, "error_description");
                            format!("Giriş yapılamadı: {}", if a.is_empty() { e.to_string() } else { a })
                        }
                    };
                    gonder("hesap-sonuc", json!({ "girisli": false, "hata": hata }));
                    return;
                }
            }
        }
        if BEKLEYEN.load(Ordering::SeqCst) == bu {
            gonder(
                "hesap-sonuc",
                json!({ "girisli": false, "hata": "Kodun süresi doldu, tekrar dene." }),
            );
        }
    });
    Ok((kod, adres))
}

pub fn tarayici_iptal() {
    BEKLEYEN.fetch_add(1, Ordering::SeqCst);
}

fn pencereyi_one_getir() {
    if let Some(a) = UYGULAMA.get() {
        if let Some(w) = a.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

/* ---------- 2) Launcher penceresinde giriş ---------- */
pub async fn pencere_girisi(app: AppHandle) -> Value {
    match pencere_girisi_ic(app).await {
        Ok(o) => profil_json(&o),
        Err(e) => json!({ "girisli": false, "hata": e }),
    }
}

async fn pencere_girisi_ic(app: AppHandle) -> Sonuc<Oturum> {
    let adres = format!(
        "{LIVE}/oauth20_authorize.srf?client_id={PENCERE_ISTEMCI}&response_type=code&redirect_uri={}&scope={}&prompt=select_account",
        url::form_urlencoded::byte_serialize(DONUS.as_bytes()).collect::<String>(),
        url::form_urlencoded::byte_serialize(KAPSAM.as_bytes()).collect::<String>()
    );
    let (gonderici, alici) = tokio::sync::oneshot::channel::<Option<String>>();
    let gonderici = Arc::new(Mutex::new(Some(gonderici)));

    if let Some(eski) = app.get_webview_window("giris") {
        let _ = eski.close();
    }
    let g1 = gonderici.clone();
    let pencere = WebviewWindowBuilder::new(&app, "giris", WebviewUrl::External(adres.parse::<tauri::Url>().h()?))
        .title("Microsoft ile giriş")
        .inner_size(500.0, 650.0)
        .resizable(false)
        .center()
        .on_navigation(move |u| {
            if u.as_str().starts_with(DONUS) {
                let kod = u.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.to_string());
                if let Some(g) = g1.lock().unwrap().take() {
                    let _ = g.send(kod);
                }
                return false;
            }
            true
        })
        .build()
        .h()?;
    let g2 = gonderici.clone();
    pencere.on_window_event(move |e| {
        if let tauri::WindowEvent::Destroyed = e {
            if let Some(g) = g2.lock().unwrap().take() {
                let _ = g.send(None);
            }
        }
    });

    let kod = alici.await.ok().flatten();
    if let Some(w) = app.get_webview_window("giris") {
        let _ = w.close();
    }
    let kod = kod.ok_or_else(|| "Giriş penceresi kapatıldı.".to_string())?;
    let (ok, t) = form_gonder(
        &format!("{LIVE}/oauth20_token.srf"),
        &[
            ("client_id", PENCERE_ISTEMCI),
            ("code", kod.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", DONUS),
            ("scope", KAPSAM),
        ],
    )
    .await?;
    let erisim = metin(&t, "access_token");
    if !ok || erisim.is_empty() {
        return Err("Microsoft girişi tamamlanamadı, tekrar dene.".into());
    }
    let o = msden_minecrafta(&erisim).await?;
    kaydet(&Kayit {
        yontem: "pencere".into(),
        yenileme: metin(&t, "refresh_token"),
        ad: o.ad.clone(),
        uuid: o.uuid.clone(),
    });
    oturum_ayarla(&o);
    Ok(o)
}

/* ---------- Kayıtlı girişi yenileme ---------- */
pub async fn oturumu_yenile() -> Value {
    let mevcut = OTURUM.lock().unwrap().clone();
    if let Some(o) = &mevcut {
        // Son 30 dakikada yenilendiyse tekrar sormaya gerek yok.
        // Çevrimdışıysa internet geldi mi diye en fazla dakikada bir bakılır.
        let bekle = if o.cevrimdisi { CEVRIMDISI_DENEME } else { Duration::from_secs(30 * 60) };
        if o.zaman.elapsed() < bekle {
            return profil_json(o);
        }
    }
    let Some(k) = oku() else { return json!({ "girisli": false }) };
    // Ad girilerek açılmış çevrimdışı oturum: Microsoft anahtarı yok, doğrudan geri yükle
    if k.yontem == "cevrimdisi" {
        return match cevrimdisi_oturum(&k) {
            Some(o) => {
                oturum_ayarla(&o);
                profil_json(&o)
            }
            None => json!({ "girisli": false }),
        };
    }
    if k.yenileme.is_empty() {
        return json!({ "girisli": false });
    }
    let istemci = if k.yontem == "pencere" { PENCERE_ISTEMCI } else { CIHAZ_ISTEMCI };
    let sonuc: Sonuc<Oturum> = async {
        let mut alanlar = vec![
            ("client_id", istemci),
            ("scope", KAPSAM),
            ("grant_type", "refresh_token"),
            ("refresh_token", k.yenileme.as_str()),
        ];
        if k.yontem == "pencere" {
            alanlar.push(("redirect_uri", DONUS));
        }
        let (ok, j) = form_gonder(&format!("{LIVE}/oauth20_token.srf"), &alanlar).await?;
        let erisim = metin(&j, "access_token");
        if !ok || erisim.is_empty() {
            return Err("Oturumun süresi dolmuş, tekrar giriş yap.".into());
        }
        let o = msden_minecrafta(&erisim).await?;
        let yeni = metin(&j, "refresh_token");
        kaydet(&Kayit {
            yontem: k.yontem.clone(),
            yenileme: if yeni.is_empty() { k.yenileme.clone() } else { yeni },
            ad: o.ad.clone(),
            uuid: o.uuid.clone(),
        });
        Ok(o)
    }
    .await;
    match sonuc {
        Ok(o) => {
            if mevcut.as_ref().is_some_and(|m| m.cevrimdisi) {
                log("İnternet geldi, tekrar çevrimiçi olundu.");
            }
            oturum_ayarla(&o);
            profil_json(&o)
        }
        // İnternet yok ama daha önce giriş yapılmış: çevrimdışı devam et
        Err(e) if e == AG_YOK => match cevrimdisi_oturum(&k) {
            Some(o) => {
                oturum_ayarla(&o);
                profil_json(&o)
            }
            None => json!({
                "girisli": false,
                "hata": "İnternet yok. Çevrimdışı oynayabilmek için önce bir kere internetliyken giriş yapmalısın."
            }),
        },
        Err(e) => json!({ "girisli": false, "hata": e }),
    }
}

/// Çevrimdışıyken "tekrar bağlan": bekleme süresini atlayıp hemen dene
pub async fn tekrar_dene() -> Value {
    {
        let mut o = OTURUM.lock().unwrap();
        if o.as_ref().is_some_and(|x| x.cevrimdisi) {
            *o = None;
        }
    }
    oturumu_yenile().await
}

/// Kayıtlı hesaptan çevrimdışı oturum (ad ve UUID son çevrimiçi girişten)
fn cevrimdisi_oturum(k: &Kayit) -> Option<Oturum> {
    let gecerli_ad = !k.ad.is_empty() && k.ad.len() <= 16 && k.ad.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    let gecerli_uuid = k.uuid.len() == 32 && k.uuid.chars().all(|c| c.is_ascii_hexdigit());
    if !gecerli_ad || !gecerli_uuid {
        return None;
    }
    Some(Oturum {
        ad: k.ad.clone(),
        uuid: k.uuid.clone(),
        erisim: CEVRIMDISI_ANAHTAR.into(),
        cevrimdisi: true,
        zaman: Instant::now(),
    })
}

/// Oyunu başlatmak ve skin işlemleri için geçerli oturum
pub async fn yetki() -> Option<Oturum> {
    let d = oturumu_yenile().await;
    if d.get("girisli") == Some(&Value::Bool(true)) {
        let o = OTURUM.lock().unwrap().clone();
        o
    } else {
        None
    }
}

/* ---------- Ad girerek çevrimdışı oturum ---------- */
/// Hiç çevrimiçi giriş yapılmamış olsa bile girilen adla çevrimdışı oturum açar ve kaydeder.
/// UUID, vanilla offline modundaki gibi "OfflinePlayer:<ad>" üzerinden hesaplanır.
pub fn cevrimdisi_giris(ad: &str) -> Value {
    let ad = ad.trim().to_string();
    if !crate::cevrimdisi::gecerli_ad(&ad) {
        return json!({
            "girisli": false,
            "hata": "Kullanıcı adı 3-16 karakter olmalı; yalnızca harf, rakam ve _ kullanılabilir."
        });
    }
    let o = Oturum {
        uuid: crate::cevrimdisi::uuid_hesapla(&ad),
        ad,
        erisim: CEVRIMDISI_ANAHTAR.into(),
        cevrimdisi: true,
        zaman: Instant::now(),
    };
    kaydet(&Kayit {
        yontem: "cevrimdisi".into(),
        yenileme: String::new(),
        ad: o.ad.clone(),
        uuid: o.uuid.clone(),
    });
    oturum_ayarla(&o);
    profil_json(&o)
}

pub fn cikis() -> Value {
    *OTURUM.lock().unwrap() = None;
    BEKLEYEN.fetch_add(1, Ordering::SeqCst);
    sil();
    json!({ "girisli": false })
}

/* ---------- Edge'de adres açma ---------- */
pub fn edge_ac(app: &AppHandle, adres: &str) {
    if !adres.starts_with("https://") {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let adaylar = [
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into()),
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into()),
            std::env::var("LOCALAPPDATA").unwrap_or_default(),
        ];
        for kok in adaylar {
            let yol = std::path::Path::new(&kok)
                .join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe");
            if yol.exists() {
                if std::process::Command::new(&yol)
                    .arg("--new-window")
                    .arg(adres)
                    .creation_flags(PENCERESIZ)
                    .spawn()
                    .is_ok()
                {
                    return;
                }
            }
        }
    }
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(adres, None::<&str>);
}
