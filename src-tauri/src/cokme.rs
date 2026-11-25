// Çökme yakalayıcı: oyun hatayla kapanınca kaydı ve çökme raporunu okur,
// sebebi Türkçe anlatır ve "Hatayı bildir" için kaydı hazır tutar.
use crate::ortak::*;
use serde_json::{json, Value};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};

/// Son çökmenin kaydı (bildirilmek üzere)
static SON_KAYIT: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Son 3 dakikada yazılmış en yeni çökme raporu
fn son_cokme_raporu() -> Option<(String, String)> {
    let klasor = oyun_klasoru().join("crash-reports");
    let simdi = SystemTime::now();
    let mut en_yeni: Option<(SystemTime, std::path::PathBuf)> = None;
    for g in std::fs::read_dir(&klasor).ok()?.flatten() {
        let yol = g.path();
        if yol.extension().and_then(|x| x.to_str()) != Some("txt") {
            continue;
        }
        let Ok(z) = g.metadata().and_then(|m| m.modified()) else { continue };
        if simdi.duration_since(z).unwrap_or(Duration::MAX) > Duration::from_secs(180) {
            continue;
        }
        if en_yeni.as_ref().map(|(e, _)| z > *e).unwrap_or(true) {
            en_yeni = Some((z, yol));
        }
    }
    let (_, yol) = en_yeni?;
    let ad = yol.file_name()?.to_string_lossy().to_string();
    Some((ad, std::fs::read_to_string(&yol).ok()?))
}

/// "Suspected Mods: Sodium (sodium), Fabric Loader (fabricloader)" satırından modları çıkarır
fn supheli_modlar(rapor: &str) -> Vec<String> {
    let Some(s) = rapor.lines().find(|x| x.trim_start().starts_with("Suspected Mod")) else {
        return vec![];
    };
    let liste = s.split_once(':').map(|x| x.1).unwrap_or("").trim();
    if liste.is_empty() || liste.eq_ignore_ascii_case("none") || liste.contains("Unknown") {
        return vec![];
    }
    liste
        .split(", ")
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty() && !x.contains("fabricloader") && !x.contains("(minecraft)") && !x.contains("(java)"))
        .take(4)
        .collect()
}

/// Kayıttaki "... mixin ... from mod XYZ" gibi ifadelerden mod kimliği
fn mixin_modu(metin: &str) -> Option<String> {
    static R: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?:from mod|mod ID|owned by mod|\[mod) ['\x22]?([a-z0-9_\-]{2,})").unwrap()
    });
    R.captures(metin).map(|c| c[1].to_string())
}

/// İlk anlamlı hata satırı (Caused by / Exception)
fn ilk_hata(metin: &str) -> Option<String> {
    let mut son: Option<&str> = None;
    for s in metin.lines() {
        let t = s.trim();
        if t.starts_with("Caused by:") {
            son = Some(t);
        } else if son.is_none() && (t.contains("Exception:") || t.contains("Error:")) && !t.starts_with("at ") {
            son = Some(t);
        }
    }
    son.map(|x| x.chars().take(220).collect())
}

/// Oyun hatayla kapandığında çağrılır. Bir şey bulunamazsa genel bir açıklama döner.
pub fn incele(kod: i32) -> Value {
    let kayit = kayit_metni();
    let rapor = son_cokme_raporu();
    let rapor_metni = rapor.as_ref().map(|x| x.1.as_str()).unwrap_or("");
    let hepsi = format!("{kayit}\n{rapor_metni}");
    let h = hepsi.as_str();

    let (baslik, aciklama, oneri): (String, String, String) = if h.contains("OutOfMemoryError") || h.contains("Java heap space") {
        (
            "Bellek yetmedi".into(),
            "Oyuna ayrılan bellek (RAM) doldu.".into(),
            "Ayarlar > Oyun'dan belleği artır. Çok mod varsa birkaçını kapat.".into(),
        )
    } else if h.contains("UnsupportedClassVersionError") || h.contains("compiled by a more recent version of the Java") {
        (
            "Java sürümü uygun değil".into(),
            "Bir mod, launcher'ın kullandığı Java'dan daha yenisini istiyor.".into(),
            "Modun bu Minecraft sürümüne uygun olanını kur ya da modu kapat.".into(),
        )
    } else if h.contains("Mixin apply failed") || h.contains("MixinApplyError") || h.contains("InvalidMixinException") || h.contains("InjectionError") {
        let m = mixin_modu(h).map(|x| format!("\"{x}\" modu")).unwrap_or_else(|| "Bir mod".into());
        (
            "Mod bu sürümle uyumsuz".into(),
            format!("{m} bu Minecraft sürümüyle çalışmıyor."),
            "Modlar sayfasından o modu kapat ya da güncelle, sonra tekrar dene.".into(),
        )
    } else if h.contains("Found duplicate mod") || h.contains("Duplicate mod") || h.contains("duplicate mods") {
        (
            "Aynı mod iki kez kurulu".into(),
            "Modlar klasöründe aynı modun iki farklı dosyası var.".into(),
            "Modlar sayfasında aynı adlı modlardan birini sil.".into(),
        )
    } else if h.contains("Incompatible mod set") || h.contains("Incompatible mods found") || h.contains("but only the wrong version is present") {
        (
            "Modların sürümleri birbirini tutmuyor".into(),
            "Bir mod, başka bir modun farklı sürümünü istiyor.".into(),
            "Modlar sayfasında modları güncelle. Düzelmezse son kurduğun modu kapat.".into(),
        )
    } else if h.contains("GLFW error") || h.contains("Pixel format not accelerated") || h.contains("WGL: The driver does not appear to support OpenGL") || (h.contains("OpenGL") && h.contains("not supported")) {
        (
            "Ekran kartı sürücüsü sorunu".into(),
            "Ekran kartı sürücüsü oyunun istediği grafik özelliğini veremedi.".into(),
            "Ekran kartı sürücünü güncelle (NVIDIA / AMD / Intel sitesinden). Dizüstündeysen Ayarlar'dan \"Güçlü ekran kartı\"nı aç.".into(),
        )
    } else if h.contains("EXCEPTION_ACCESS_VIOLATION") || h.contains("SIGSEGV") {
        (
            "Oyun aniden kapandı".into(),
            "Java ya da ekran kartı sürücüsü kendi içinde çöktü.".into(),
            "Ekran kartı sürücünü güncelle. Shader açıksa kapatıp dene.".into(),
        )
    } else if h.contains("Address already in use") || h.contains("Failed to bind to port") {
        (
            "Bağlantı noktası kullanımda".into(),
            "Açık bir dünya ya da sunucu aynı bağlantı noktasını kullanıyor.".into(),
            "Açık kalan Minecraft varsa kapat ve tekrar dene.".into(),
        )
    } else {
        let supheli = supheli_modlar(rapor_metni);
        if !supheli.is_empty() {
            (
                "Bir mod oyunu çökertti".into(),
                format!("Şüpheli: {}", supheli.join(", ")),
                "Modlar sayfasından bu modu kapatıp tekrar dene.".into(),
            )
        } else {
            (
                "Oyun beklenmedik şekilde kapandı".into(),
                ilk_hata(h).unwrap_or_else(|| format!("Çıkış kodu: {kod}")),
                "Hatayı bildirirsen kaydı inceleyip düzeltmeye çalışırız.".into(),
            )
        }
    };

    // Bildirilecek kayıt: launcher kaydının son kısmı + çökme raporu (sınırlı boyut)
    let son_satirlar: Vec<&str> = kayit.lines().rev().take(250).collect::<Vec<_>>().into_iter().rev().collect();
    let mut gonderilecek = format!("[Çıkış kodu {kod}]\n{}", son_satirlar.join("\n"));
    if let Some((ad, r)) = &rapor {
        let kisa: String = r.chars().take(30000).collect();
        gonderilecek.push_str(&format!("\n\n===== {ad} =====\n{kisa}"));
    }
    let kisa: String = gonderilecek.chars().rev().take(58000).collect::<Vec<_>>().into_iter().rev().collect();
    *SON_KAYIT.lock().unwrap() = Some(kisa);

    json!({
        "baslik": baslik,
        "aciklama": aciklama,
        "oneri": oneri,
        "rapor": rapor.map(|x| x.0),
    })
}

/// Son çökmeyi (kaydıyla birlikte) yönetim paneline gönderir
#[tauri::command]
pub async fn cokme_bildir(not: String, baslik: String) -> Value {
    let kayit = SON_KAYIT.lock().unwrap().clone();
    let Some(kayit) = kayit else {
        return sonuc_json::<bool>(Err("Gönderilecek çökme kaydı yok.".into()));
    };
    let metin = if not.trim().is_empty() { format!("[Çökme] {baslik}") } else { format!("[Çökme] {baslik}\n{}", not.trim()) };
    crate::sunucu::oneri_gonder_kayitli("hata", &metin, "", Some(&kayit)).await
}

#[tauri::command]
pub fn cokme_raporu_ac(app: tauri::AppHandle) -> bool {
    use tauri_plugin_opener::OpenerExt;
    let k = oyun_klasoru().join("crash-reports");
    let hedef = if k.exists() { k } else { oyun_klasoru().join("logs") };
    app.opener().open_path(hedef.to_string_lossy().to_string(), None::<&str>).is_ok()
}
