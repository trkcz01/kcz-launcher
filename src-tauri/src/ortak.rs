// Bütün modüllerin kullandığı ortak parçalar:
// klasör yolları, internet istemcisi, dosya indirme, arayüze olay gönderme, hata dönüştürme.
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

pub type Sonuc<T> = Result<T, String>;

/// Herhangi bir hatayı arayüzde gösterilecek metne çevirir.
pub trait HataMetni<T> {
    fn h(self) -> Sonuc<T>;
}
impl<T, E: std::fmt::Display> HataMetni<T> for Result<T, E> {
    fn h(self) -> Sonuc<T> {
        self.map_err(|e| e.to_string())
    }
}

/* ---------- Uygulama ve olaylar ---------- */
pub static UYGULAMA: OnceLock<AppHandle> = OnceLock::new();

/// Arayüze olay gönder (ilerleme, log, durum…)
pub fn gonder<S: Serialize + Clone>(olay: &str, veri: S) {
    if let Some(a) = UYGULAMA.get() {
        let _ = a.emit(olay, veri);
    }
}

// Son oyun kaydı ("eksik mod" hatasını yakalamak için son 400 satır tutulur)
static KAYIT: LazyLock<std::sync::Mutex<std::collections::VecDeque<String>>> =
    LazyLock::new(|| std::sync::Mutex::new(std::collections::VecDeque::new()));

pub fn log(metin: impl Into<String>) {
    let m = metin.into();
    {
        let mut k = KAYIT.lock().unwrap();
        k.push_back(m.clone());
        while k.len() > 400 {
            k.pop_front();
        }
    }
    gonder("oyun-log", m);
}

pub fn kayit_temizle() {
    KAYIT.lock().unwrap().clear();
}

pub fn kayit_metni() -> String {
    KAYIT.lock().unwrap().iter().cloned().collect::<Vec<_>>().join("\n")
}

/* ---------- İşletim sistemi ---------- */
/// Minecraft sürüm bilgisindeki işletim sistemi adı ("windows", "linux", "osx")
pub fn os_adi() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Java'nın sınıf yolu ayırıcısı
pub fn yol_ayirici() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}

/// Konsol penceresi açmayan Java programı
pub fn java_programi() -> &'static str {
    if cfg!(windows) {
        "javaw.exe"
    } else {
        "java"
    }
}

fn ev_klasoru() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."))
}

/// Resmi Minecraft Launcher'ın klasörü (sunucu listesi ve skin kitaplığı buradan okunur)
pub fn resmi_minecraft_klasoru() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft")
    } else if cfg!(target_os = "macos") {
        ev_klasoru().join("Library").join("Application Support").join("minecraft")
    } else {
        ev_klasoru().join(".minecraft")
    }
}

/* ---------- Klasörler ---------- */
/// Windows: %APPDATA%\KCZ Launcher (eski Electron sürümüyle aynı yer)
/// Linux: ~/.local/share/kcz-launcher (XDG_DATA_HOME)
pub fn kullanici_klasoru() -> PathBuf {
    let k = if cfg!(windows) {
        let kok = std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
        kok.join("KÇZ Launcher")
    } else {
        let kok = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| ev_klasoru().join(".local").join("share"));
        kok.join("kcz-launcher")
    };
    let _ = std::fs::create_dir_all(&k);
    k
}

pub fn ana_klasor() -> PathBuf {
    let k = kullanici_klasoru().join("oyun-verileri");
    let _ = std::fs::create_dir_all(&k);
    k
}

/// Minecraft'ın kendi klasörü: versions, libraries, assets, saves, mods, servers.dat
pub fn oyun_klasoru() -> PathBuf {
    let k = ana_klasor().join("minecraft");
    let _ = std::fs::create_dir_all(&k);
    k
}

/* ---------- İnternet ---------- */
pub static ISTEMCI: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("KCZ-Launcher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .expect("internet istemcisi kurulamadı")
});

pub async fn json_al(url: &str) -> Sonuc<Value> {
    let r = ISTEMCI.get(url).send().await.map_err(|_| "İnternete bağlanılamadı.".to_string())?;
    if !r.status().is_success() {
        return Err(format!("Sunucu cevap vermedi ({})", r.status().as_u16()));
    }
    r.json::<Value>().await.h()
}

/// 204/404 gelirse None döner
pub async fn json_al_bos(url: &str, yetki: Option<&str>) -> Sonuc<Option<Value>> {
    let mut i = ISTEMCI.get(url);
    if let Some(y) = yetki {
        i = i.bearer_auth(y);
    }
    let r = i.send().await.map_err(|_| "İnternete bağlanılamadı.".to_string())?;
    let kod = r.status().as_u16();
    if kod == 204 || kod == 404 {
        return Ok(None);
    }
    if !r.status().is_success() {
        return Err(format!("Sunucu cevap vermedi ({kod})"));
    }
    Ok(Some(r.json::<Value>().await.h()?))
}

pub fn sha1_hex(veri: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(veri);
    hex::encode(h.finalize())
}

pub fn dosya_sha1(yol: &Path) -> Option<String> {
    std::fs::read(yol).ok().map(|v| sha1_hex(&v))
}

/// Dosya zaten doğru şekilde var mı? (boyut biliniyorsa boyutuna bakar)
pub fn dosya_hazir(hedef: &Path, boyut: Option<u64>) -> bool {
    match std::fs::metadata(hedef) {
        Ok(m) => match boyut {
            Some(b) if b > 0 => m.len() == b,
            _ => m.len() > 0,
        },
        Err(_) => false,
    }
}

/// Dosya indir: 4 kez dener, sha1 ve boyut kontrol eder, yarım dosya bırakmaz.
/// ilerleme(inen, toplam) her parçada çağrılır.
pub async fn indir<F: FnMut(u64, u64)>(url: &str, hedef: &Path, sha1: Option<&str>, boyut: Option<u64>, mut ilerleme: F) -> Sonuc<u64> {
    if let Some(ust) = hedef.parent() {
        tokio::fs::create_dir_all(ust).await.h()?;
    }
    let gecici = PathBuf::from(format!("{}.part", hedef.display()));
    let mut son_hata = String::new();
    for deneme in 1..=4u64 {
        let _ = tokio::fs::remove_file(&gecici).await;
        let sonuc: Sonuc<u64> = async {
            let r = ISTEMCI.get(url).send().await.h()?;
            if !r.status().is_success() {
                return Err(format!("HTTP {}", r.status().as_u16()));
            }
            let toplam = r.content_length().unwrap_or(boyut.unwrap_or(0));
            let mut dosya = tokio::fs::File::create(&gecici).await.h()?;
            let mut ozet = Sha1::new();
            let mut inen: u64 = 0;
            let mut akis = r.bytes_stream();
            while let Some(parca) = akis.next().await {
                let parca = parca.h()?;
                ozet.update(&parca);
                dosya.write_all(&parca).await.h()?;
                inen += parca.len() as u64;
                ilerleme(inen, toplam);
            }
            dosya.flush().await.h()?;
            drop(dosya);
            if let Some(b) = boyut {
                if b > 0 && inen != b {
                    return Err("dosya eksik indi".into());
                }
            }
            if let Some(s) = sha1 {
                if !s.is_empty() && hex::encode(ozet.finalize()) != s.to_lowercase() {
                    return Err("dosya bozuk indi".into());
                }
            }
            tokio::fs::rename(&gecici, hedef).await.h()?;
            Ok(inen)
        }
        .await;
        match sonuc {
            Ok(n) => return Ok(n),
            Err(e) => {
                son_hata = e;
                let _ = tokio::fs::remove_file(&gecici).await;
                tokio::time::sleep(Duration::from_millis(600 * deneme)).await;
            }
        }
    }
    let ad = hedef.file_name().map(|a| a.to_string_lossy().to_string()).unwrap_or_default();
    Err(format!("{ad} indirilemedi ({son_hata}). İnternetini kontrol et."))
}

/// Maven adını dosya yoluna çevirir: grup:ad:sürüm[:sınıf][@uzantı]
pub fn maven_yolu(ad: &str) -> Option<String> {
    let (ad, uzanti) = match ad.split_once('@') {
        Some((a, u)) => (a, u),
        None => (ad, "jar"),
    };
    let p: Vec<&str> = ad.split(':').collect();
    if p.len() < 3 {
        return None;
    }
    let grup = p[0].replace('.', "/");
    let dosya = if p.len() >= 4 {
        format!("{}-{}-{}.{}", p[1], p[2], p[3], uzanti)
    } else {
        format!("{}-{}.{}", p[1], p[2], uzanti)
    };
    Some(format!("{}/{}/{}/{}", grup, p[1], p[2], dosya))
}

/// Değerden metin al (yoksa boş)
pub fn metin(v: &Value, anahtar: &str) -> String {
    v.get(anahtar).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// { ok: true, veri } / { ok: false, hata } biçimi (arayüz böyle bekliyor)
pub fn sonuc_json<T: Serialize>(s: Sonuc<T>) -> Value {
    match s {
        Ok(v) => serde_json::json!({ "ok": true, "veri": v }),
        Err(e) => serde_json::json!({ "ok": false, "hata": e }),
    }
}

/// Windows'ta konsol penceresi açmadan işlem başlatma bayrağı
#[cfg(windows)]
pub const PENCERESIZ: u32 = 0x0800_0000;
