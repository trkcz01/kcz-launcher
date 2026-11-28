// KCZ Client: launcher'a gömülü oyun içi menü modu, ayarlarının oyunla eşitlenmesi
// ve eklentiler (shader, sesli sohbet, oyun kaydı).
use crate::ayarlar::{self, Ayarlar};
use crate::ortak::*;
use crate::performans;
use serde_json::{json, Value};
use std::path::PathBuf;

// Derleme sırasında istemci-mod/cikti/kcz-client-<sürüm>.jar dosyalarından oluşturulur
include!(concat!(env!("OUT_DIR"), "/istemci_jarlar.rs"));

/// Bu Minecraft sürümü için gömülü KCZ Client var mı? (26.3 -> 26.3, 26.3.1 ...)
pub fn jar_bul(mc: &str) -> Option<&'static [u8]> {
    JARLAR
        .iter()
        .filter(|(v, _)| mc == *v || mc.starts_with(&format!("{v}.")))
        .max_by_key(|(v, _)| v.len())
        .map(|(_, b)| *b)
}

pub fn desteklenen_surumler() -> Vec<&'static str> {
    JARLAR.iter().map(|(v, _)| *v).collect()
}

fn mod_yukleyici_fabric(tur: &str) -> bool {
    tur == "fabric" || tur == "quilt"
}

/// Vanilla seçiliyken bile oyunun Fabric ile açılmasını gerektiren bir özellik açık mı?
pub fn fabric_gerekli(a: &Ayarlar, mc: &str) -> bool {
    let i = &a.istemci;
    (i.acik && jar_bul(mc).is_some()) || i.sesli_sohbet || i.uzak_gorus || i.kayit
}

/// Launcher temasının oyundaki menü renkleri
fn tema_renkleri(tema: &str) -> (&'static str, &'static str) {
    match tema {
        "siyah" => ("#0a0a0a", "#000000"),
        "end" => ("#22143f", "#07050f"),
        "nether" => ("#43100c", "#120404"),
        "dunya" => ("#123a31", "#0a1620"),
        "performans" => ("#141416", "#0a0a0b"),
        "sade" => ("#121215", "#08080a"),
        _ => ("#232328", "#0d0d10"),
    }
}

fn ayar_dosyasi() -> PathBuf {
    oyun_klasoru().join("config").join("kcz-client.json")
}

/// Oyunu açmadan önce: launcher ayarlarını ve tema renklerini oyundaki menüye yaz
pub fn ayar_yaz(a: &Ayarlar) {
    let yol = ayar_dosyasi();
    let mut j: Value = std::fs::read_to_string(&yol)
        .ok()
        .and_then(|m| serde_json::from_str(&m).ok())
        .filter(|v: &Value| v.is_object())
        .unwrap_or_else(|| json!({}));
    let i = &a.istemci;
    let (zemin, zemin2) = tema_renkleri(&a.tema);
    for (k, v) in [
        ("zoom", json!(i.zoom)),
        ("zoomKat", json!(i.zoom_kat)),
        ("zoomBaslangic", json!(i.zoom_baslangic)),
        ("fps", json!(i.fps)),
        ("ping", json!(i.ping)),
        ("tuslar", json!(i.tuslar)),
        ("koordinat", json!(i.koordinat)),
        ("zirh", json!(i.zirh)),
        ("iksir", json!(i.iksir)),
        ("cps", json!(i.cps)),
        ("eldeki", json!(i.eldeki)),
        ("okSayisi", json!(i.ok_sayisi)),
        ("totem", json!(i.totem)),
        ("hiz", json!(i.hiz)),
        ("saat", json!(i.saat)),
        ("surekliKos", json!(i.surekli_kos)),
        ("egilmeTut", json!(i.egilme_tut)),
        // Özel nişangah kaldırıldı: oyunun kendi nişangahı kullanılır
        ("nisangah", json!(false)),
        ("konum", json!(i.konum)),
        ("optimizasyon", json!(a.hafif_mod)),
        ("shader", json!(i.shader)),
        ("sesliSohbet", json!(i.sesli_sohbet)),
        ("uzakGorus", json!(i.uzak_gorus)),
        ("yakinSes", json!(i.yakin_ses)),
        ("sesSadeceArkadas", json!(i.ses_sadece_arkadas)),
        ("arkadasBildirim", json!(i.arkadas_bildirim)),
        ("kayit", json!(i.kayit)),
        ("arkaplanFps", json!(i.arkaplan_fps)),
        ("kenarliksiz", json!(i.kenarliksiz)),
        ("dusukSistem", json!(i.dusuk_sistem)),
        ("gucluSistem", json!(i.guclu_sistem)),
        // ad: temanın adı (oyun içi menüdeki maskot ve süsler için), maskot: kapalıysa çizilmez
        ("tema", json!({ "zemin": zemin, "zemin2": zemin2, "vurgu": a.vurgu, "ad": a.tema, "maskot": a.maskot })),
    ] {
        j[k] = v;
    }
    if let Some(k) = yol.parent() {
        let _ = std::fs::create_dir_all(k);
    }
    if let Ok(m) = serde_json::to_string_pretty(&j) {
        let _ = std::fs::write(&yol, m);
    }
}

/// Esc menüsü bulanıklığı: açıksa options.txt'ye menuBackgroundBlurriness:0 yazılır
/// Oyunun options.txt'sine launcher'ın akıcılık ayarlarını yazar (oyun açılmadan önce).
/// - Esc menüsünde bulanıklık kapalı: menü açılırken ekran kartı bir anda yorulmaz
/// - Alt-Tab'da durdurma kapalı: pencereden çıkınca Esc menüsü açılmaz, tek oyunculuda
///   dünya kaydı başlamaz; geri dönünce donma olmaz
pub fn bulaniklik_ayarla(a: &Ayarlar) {
    let mut istenen: Vec<(&str, &str)> = Vec::new();
    if a.istemci.bulaniklik_kapali {
        istenen.push(("menuBackgroundBlurriness:", "0"));
    }
    if a.istemci.alttab_durdurma_kapali {
        istenen.push(("pauseOnLostFocus:", "false"));
    }
    // Oyuncu durunca (AFK) Minecraft FPS'i 30'a, 10 dakika sonra 10'a düşürüyor: kapat.
    // Pencere arkadayken düşürmeyi zaten KCZ Client yapıyor.
    if a.istemci.acik {
        istenen.push(("inactivityFpsLimit:", "\"minimized\""));
    }
    let yol = oyun_klasoru().join("options.txt");
    let eski = std::fs::read_to_string(&yol).unwrap_or_default();
    let mut satirlar: Vec<String> = eski.lines().map(String::from).collect();
    let mut degisti = false;
    // Eski KCZ Client geçici FPS sınırını (15/30) kalıcı kaydedebiliyordu: bir kereliğine onar
    let isaret = oyun_klasoru().join("config").join(".kcz-fps-onarildi");
    if !isaret.exists() {
        if let Some(s) = satirlar.iter_mut().find(|s| s.starts_with("maxFps:")) {
            if matches!(s.as_str(), "maxFps:10" | "maxFps:15" | "maxFps:20" | "maxFps:30") {
                *s = "maxFps:260".into();
                degisti = true;
            }
        }
        let _ = std::fs::create_dir_all(isaret.parent().unwrap_or(&oyun_klasoru()));
        let _ = std::fs::write(&isaret, "1");
    }
    for (on, deger) in istenen {
        let yeni = format!("{on}{deger}");
        match satirlar.iter_mut().find(|s| s.starts_with(on)) {
            Some(s) if *s == yeni => {}
            Some(s) => {
                *s = yeni;
                degisti = true;
            }
            None => {
                satirlar.push(yeni);
                degisti = true;
            }
        }
    }
    if degisti {
        let _ = std::fs::write(&yol, satirlar.join("\n") + "\n");
    }
}

/// Oyun kapandıktan sonra: oyunun içinden yapılan değişiklikleri launcher ayarlarına al
pub fn ayar_geri_oku() {
    let Some(j) = std::fs::read_to_string(ayar_dosyasi())
        .ok()
        .and_then(|m| serde_json::from_str::<Value>(&m).ok())
    else {
        return;
    };
    let a = ayarlar::getir();
    let mut i = serde_json::to_value(&a.istemci).unwrap_or(json!({}));
    let mut degisti = false;
    for k in [
        "zoom",
        "zoomKat",
        "zoomBaslangic",
        "fps",
        "ping",
        "tuslar",
        "koordinat",
        "zirh",
        "iksir",
        "cps",
        "eldeki",
        "okSayisi",
        "totem",
        "hiz",
        "saat",
        "surekliKos",
        "egilmeTut",
        "konum",
        "shader",
        "sesliSohbet",
        "uzakGorus",
        "yakinSes",
        "sesSadeceArkadas",
        "arkadasBildirim",
        "kayit",
        "arkaplanFps",
        "kenarliksiz",
        "dusukSistem",
        "gucluSistem",
    ] {
        if let Some(v) = j.get(k) {
            if i.get(k) != Some(v) && (v.is_boolean() || v.is_number() || v.is_string()) {
                i[k] = v.clone();
                degisti = true;
            }
        }
    }
    let mut yeni = json!({ "istemci": i });
    if let Some(o) = j["optimizasyon"].as_bool() {
        if o != a.hafif_mod {
            yeni["hafifMod"] = json!(o);
            degisti = true;
        }
    }
    if degisti {
        ayarlar::kaydet(&yeni);
        log("KCZ Client ayarları oyundan alındı.");
    }
}

/* ---------- Eklentiler ---------- */
#[allow(dead_code)]
const SHADER_PAKETI: &str = "complementary-reimagined";

/// Shader paketini kur (yoksa) ve Iris'e "bunu kullan" de
#[allow(dead_code)]
async fn shader_hazirla(mc: &str, yukleyici: &str) {
    let klasor = oyun_klasoru().join("shaderpacks");
    // Oyuncunun Shader sekmesinden kurup seçtiği paket varsa o kullanılır
    if let Some(p) = ayarlar::getir().istemci.shader_paketi {
        if klasor.join(&p).exists() {
            iris_ayari(Some(p));
            return;
        }
    }
    let bul = || -> Option<String> {
        std::fs::read_dir(&klasor)
            .ok()?
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .find(|d| {
                let d = d.to_lowercase();
                d.contains("complementary") && (d.ends_with(".zip") || !d.contains('.'))
            })
    };
    if bul().is_none() {
        if let Err(e) = crate::modlar::yukle(SHADER_PAKETI, "shader", mc, yukleyici, None).await {
            log(format!("Shader paketi kurulamadı: {e}"));
        }
    }
    iris_ayari(bul());
}

/// config/iris.properties: shader açık/kapalı ve hangi paket
fn iris_ayari(paket: Option<String>) {
    let yol = oyun_klasoru().join("config").join("iris.properties");
    let eski = std::fs::read_to_string(&yol).unwrap_or_default();
    let mut satirlar: Vec<String> = eski
        .lines()
        .filter(|s| !s.starts_with("enableShaders=") && !(paket.is_some() && s.starts_with("shaderPack=")))
        .map(String::from)
        .collect();
    satirlar.push(format!("enableShaders={}", paket.is_some()));
    if let Some(p) = paket {
        satirlar.push(format!("shaderPack={p}"));
    }
    if let Some(k) = yol.parent() {
        let _ = std::fs::create_dir_all(k);
    }
    let _ = std::fs::write(&yol, satirlar.join("\n") + "\n");
}

/// Oyunu açmadan önce: KCZ Client ve açık eklentilerin klasörlerini hazırlar
pub async fn klasorler_hazirla(mc: &str, tur: &str, a: &Ayarlar) -> Vec<PathBuf> {
    let mut k: Vec<PathBuf> = vec![];
    let i = &a.istemci;

    // Gömülü KCZ Client (yalnızca Fabric/Quilt) + istediği Fabric API
    if i.acik && mod_yukleyici_fabric(tur) {
        if let Some(jar) = jar_bul(mc) {
            let temel = if tur == "quilt" { "qvIfYCYJ" } else { "P7dR8mSH" };
            let klasor = performans::klasor_hazirla("kcz-istemci", vec![vec![temel]], mc, tur, Some("KCZ Client hazırlanıyor…")).await;
            let hedef = klasor.join("kcz-client.jar");
            let ayni = std::fs::read(&hedef).map(|b| b == jar).unwrap_or(false);
            if !ayni && std::fs::write(&hedef, jar).is_err() {
                log("KCZ Client yerleştirilemedi.");
            }
            k.push(klasor);
        }
    }

    // Shader eklentisi kaldırıldı: Iris, Sodium'u zorunlu istiyor ve KCZ Sodium kullanmıyor.
    // Daha önce indirilen Iris + Sodium klasörleri silinir, Iris ayarı kapatılır.
    shader_eklentisini_kaldir();
    // Uzak görüş (Bobby): düşük sistemde yüklenmez
    if i.uzak_gorus && !i.dusuk_sistem {
        k.push(performans::klasor_hazirla("kcz-eklenti-uzak", vec![vec!["bobby"]], mc, tur, Some("Uzak görüş hazırlanıyor…")).await);
    }
    if i.sesli_sohbet {
        k.push(
            performans::klasor_hazirla(
                "kcz-eklenti-sesli",
                vec![vec!["simple-voice-chat"]],
                mc,
                tur,
                Some("Sesli sohbet hazırlanıyor…"),
            )
            .await,
        );
    }
    if i.kayit {
        k.push(
            performans::klasor_hazirla(
                "kcz-eklenti-kayit",
                vec![vec!["flashback"]],
                mc,
                tur,
                Some("Oyun kaydı hazırlanıyor…"),
            )
            .await,
        );
    }
    k
}

/// Kaynak paketi kurulunca oyunda hemen açık gelsin: options.txt resourcePacks listesine eklenir
pub fn kaynak_paketini_ac(dosya: &str) {
    let yol = oyun_klasoru().join("options.txt");
    let eski = std::fs::read_to_string(&yol).unwrap_or_default();
    let mut satirlar: Vec<String> = eski.lines().map(String::from).collect();
    let girdi = format!("file/{dosya}");
    let mut liste: Vec<String> = satirlar
        .iter()
        .find(|s| s.starts_with("resourcePacks:"))
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s["resourcePacks:".len()..]).ok())
        .unwrap_or_else(|| vec!["vanilla".into()]);
    if liste.contains(&girdi) {
        return;
    }
    // Listenin sonundaki paket en üstte uygulanır
    liste.push(girdi);
    let yeni = format!("resourcePacks:{}", serde_json::to_string(&liste).unwrap_or_default());
    match satirlar.iter_mut().find(|s| s.starts_with("resourcePacks:")) {
        Some(s) => *s = yeni,
        None => satirlar.push(yeni),
    }
    let _ = std::fs::write(&yol, satirlar.join("\n") + "\n");
}

/// Shader paketi indirilince sadece seçili paket hatırlanır (shader yükleyicisi artık kurulmuyor)
pub fn shaderi_sec(dosya: &str) {
    let mut a = ayarlar::getir();
    a.istemci.shader_paketi = Some(dosya.to_string());
    ayarlar::kaydet(&json!({ "istemci": a.istemci }));
}

/// Eski shader eklentisinin (Iris + Sodium) izlerini temizler
fn shader_eklentisini_kaldir() {
    let kok = crate::ortak::ana_klasor().join("modlar");
    if let Ok(d) = std::fs::read_dir(&kok) {
        for e in d.flatten() {
            let ad = e.file_name().to_string_lossy().to_lowercase();
            if ad.starts_with("sunucu_kcz-eklenti-shader_") {
                if std::fs::remove_dir_all(e.path()).is_ok() {
                    log(format!("Shader eklentisi (Iris + Sodium) kaldırıldı: {ad}"));
                }
            }
        }
    }
    if std::fs::metadata(oyun_klasoru().join("config").join("iris.properties")).is_ok() {
        iris_ayari(None);
    }
    let mut a = ayarlar::getir();
    if a.istemci.shader {
        a.istemci.shader = false;
        ayarlar::kaydet(&json!({ "istemci": a.istemci }));
    }
}
