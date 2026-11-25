// Oyunu hazırlayıp başlatan kısım:
// 1) Seçili sürüm yüklü değilse önce onu yükler
// 2) O sürümün istediği Java'yı yoksa indirir
// 3) Mod yükleyiciyi (Fabric, Quilt, Forge, NeoForge) hazırlar, modları yerleştirir
// 4) Sürüm bilgisinden komut satırını kurup oyunu açar
use crate::ayarlar::Ayarlar;
use crate::hesap::Oturum;
use crate::ortak::*;
use crate::surumler::{self, ilerleme, kural_uygun};
use crate::yukleyici::{self, Ek};
use crate::{istemci, java, modlar, performans, yedek};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncBufReadExt, BufReader};

static MESGUL: AtomicBool = AtomicBool::new(false);

pub fn mesgul_mu() -> bool {
    MESGUL.load(Ordering::SeqCst)
}

/// Meşgul işaretini işlem bitince (hata olsa bile) kaldıran yardımcı
struct MesgulKilidi(bool);
impl MesgulKilidi {
    fn al() -> Sonuc<Self> {
        if MESGUL.swap(true, Ordering::SeqCst) {
            return Err("Şu an başka bir işlem sürüyor.".into());
        }
        Ok(MesgulKilidi(true))
    }
    /// Oyun açıldı: işaret oyun kapanınca kaldırılacak
    fn birak_sonra(mut self) {
        self.0 = false;
    }
}
impl Drop for MesgulKilidi {
    fn drop(&mut self) {
        if self.0 {
            MESGUL.store(false, Ordering::SeqCst);
        }
    }
}

async fn surum_ve_java(id: &str) -> Sonuc<(Value, PathBuf)> {
    let json = surumler::hazirla(id).await?;
    let java = java::hazirla(surumler::java_surumu(&json), id).await?;
    Ok((json, java))
}

/// Sadece yükle (Sürümler sayfasındaki "Yükle" butonu)
pub async fn surum_yukle(id: &str) -> Sonuc<()> {
    let _k = MesgulKilidi::al()?;
    surum_ve_java(id).await?;
    crate::oyun_durumu(json!({ "tur": "yuklendi", "surum": id }));
    Ok(())
}

/* ---------- Kütüphaneler ve sınıf yolu ---------- */
/// "grup:ad:sürüm[:sınıf]" -> aynı kütüphaneyi tanımak için "grup:ad[:sınıf]"
fn kutuphane_anahtari(ad: &str) -> String {
    let p: Vec<&str> = ad.split('@').next().unwrap_or("").split(':').collect();
    match p.len() {
        0..=2 => ad.to_string(),
        3 => format!("{}:{}", p[0], p[1]),
        _ => format!("{}:{}:{}", p[0], p[1], p[3]),
    }
}

fn kutuphane_yolu(l: &Value, kok: &Path) -> Option<PathBuf> {
    if let Some(y) = l["downloads"]["artifact"]["path"].as_str() {
        return Some(kok.join(y));
    }
    if l["downloads"].get("artifact").is_none() && l["downloads"].get("classifiers").is_some() {
        return None; // sadece natives içeren eski kütüphane
    }
    maven_yolu(&metin(l, "name")).map(|y| kok.join(y))
}

fn natives_mi(l: &Value) -> bool {
    let ad = metin(l, "name");
    let os = os_adi();
    let os = if os == "osx" { "macos" } else { os };
    ad.contains(&format!(":natives-{os}")) && !ad.contains("-x86") && !ad.contains("-arm64") && !ad.contains("-arm32")
}

/// Dll dosyalarını natives klasörüne çıkarır (eski ve yeni sürümler için)
fn natives_cikar(kutuphaneler: &[Value], kok: &Path, hedef: &Path) {
    let _ = std::fs::create_dir_all(hedef);
    let mut jarlar: Vec<PathBuf> = vec![];
    for l in kutuphaneler {
        if !kural_uygun(l.get("rules"), &surumler::ozellik_yok) {
            continue;
        }
        if let (Some(n), Some(c)) = (l["natives"][os_adi()].as_str(), l["downloads"].get("classifiers")) {
            let sinif = n.replace("${arch}", "64");
            if let Some(y) = c[&sinif]["path"].as_str() {
                jarlar.push(kok.join(y));
            }
        } else if natives_mi(l) {
            if let Some(y) = kutuphane_yolu(l, kok) {
                jarlar.push(y);
            }
        }
    }
    for jar in jarlar {
        let Ok(f) = std::fs::File::open(&jar) else { continue };
        let Ok(mut z) = zip::ZipArchive::new(f) else { continue };
        for i in 0..z.len() {
            let Ok(mut g) = z.by_index(i) else { continue };
            let ad = g.name().to_string();
            if g.is_dir() || ad.starts_with("META-INF") || !(ad.ends_with(".dll") || ad.ends_with(".so") || ad.ends_with(".dylib")) {
                continue;
            }
            let dosya = Path::new(&ad).file_name().map(|x| x.to_owned());
            let Some(dosya) = dosya else { continue };
            let yol = hedef.join(dosya);
            if yol.exists() {
                continue;
            }
            if let Ok(mut c) = std::fs::File::create(&yol) {
                let _ = std::io::copy(&mut g, &mut c);
            }
        }
    }
}

/* ---------- Argümanlar ---------- */
fn argumanlari_topla(liste: &Value, ozellik: &dyn Fn(&str) -> bool, cikti: &mut Vec<String>) {
    for a in liste.as_array().cloned().unwrap_or_default() {
        if let Some(s) = a.as_str() {
            cikti.push(s.to_string());
        } else if a.is_object() && kural_uygun(a.get("rules"), ozellik) {
            match &a["value"] {
                Value::String(s) => cikti.push(s.clone()),
                Value::Array(d) => cikti.extend(d.iter().filter_map(|x| x.as_str().map(String::from))),
                _ => {}
            }
        }
    }
}

fn degistir(s: &str, d: &HashMap<&str, String>) -> String {
    let mut sonuc = s.to_string();
    for (k, v) in d {
        let anahtar = format!("${{{k}}}");
        if sonuc.contains(&anahtar) {
            sonuc = sonuc.replace(&anahtar, v);
        }
    }
    sonuc
}

fn adres_ayir(adres: &str) -> (String, String) {
    let a = adres.trim();
    if let Some(i) = a.rfind(':') {
        if a.find(':') == Some(i) {
            return (a[..i].to_string(), a[i + 1..].to_string());
        }
    }
    (a.to_string(), "25565".to_string())
}

/* ---------- Başlatma ---------- */
pub struct Acilis {
    pub ayarlar: Ayarlar,
    pub hedef_sunucu: Option<String>,
    pub mod_sunucusu: Option<String>,
    pub yetki: Oturum,
    /// "Onar > Modsuz dene": hiçbir mod olmadan (KCZ Client ve performans modları dahil) saf vanilla açılır
    pub modsuz: bool,
}

/* ---------- Açılış süresi ölçümü ----------
   "Oyna"dan oyunun ilk log satırına ve ana menüye kadar geçen süre, hazırlığın her adımıyla birlikte
   kayda ve kullanıcı klasöründeki acilis-sureleri.json'a (son 30 açılış) yazılır. */
struct Kronometre {
    bas: std::time::Instant,
    son: std::time::Instant,
    adimlar: Vec<(&'static str, u128)>,
}

impl Kronometre {
    fn yeni() -> Self {
        let s = std::time::Instant::now();
        Kronometre { bas: s, son: s, adimlar: vec![] }
    }
    fn adim(&mut self, ad: &'static str) {
        let s = std::time::Instant::now();
        self.adimlar.push((ad, (s - self.son).as_millis()));
        self.son = s;
    }
}

struct AcilisOlcumu {
    bas: std::time::Instant,
    surum: String,
    yukleyici: String,
    mod_sayisi: usize,
    adimlar: Vec<(&'static str, u128)>,
    hazirlik_ms: u128,
    ilk_log_ms: Option<u128>,
    menu_ms: Option<u128>,
    yazildi: bool,
}

/// Ölçümü bir kez kayda ve dosyaya yazar (menü açılınca ya da oyun menüye varmadan kapanınca)
fn olcumu_yaz(o: &mut AcilisOlcumu) {
    if o.yazildi {
        return;
    }
    o.yazildi = true;
    let sn = |ms: u128| format!("{:.1} sn", ms as f64 / 1000.0);
    let adimlar = o.adimlar.iter().map(|(a, ms)| format!("{a} {}", sn(*ms))).collect::<Vec<_>>().join(", ");
    log(format!(
        "Açılış süresi: hazırlık {} ({adimlar}); ilk log {}; ana menü {}",
        sn(o.hazirlik_ms),
        o.ilk_log_ms.map(sn).unwrap_or_else(|| "-".into()),
        o.menu_ms.map(sn).unwrap_or_else(|| "menüye varmadı".into())
    ));
    let yol = kullanici_klasoru().join("acilis-sureleri.json");
    let mut liste: Vec<Value> = std::fs::read_to_string(&yol)
        .ok()
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or_default();
    let adim_json: serde_json::Map<String, Value> = o.adimlar.iter().map(|(a, ms)| (a.to_string(), json!(*ms as u64))).collect();
    liste.push(json!({
        "zaman": chrono::Local::now().to_rfc3339(), "surum": o.surum, "yukleyici": o.yukleyici, "mod": o.mod_sayisi,
        "hazirlik_ms": o.hazirlik_ms as u64, "adimlar": adim_json,
        "ilk_log_ms": o.ilk_log_ms.map(|x| x as u64), "menu_ms": o.menu_ms.map(|x| x as u64)
    }));
    let fazla = liste.len().saturating_sub(30);
    liste.drain(..fazla);
    let _ = std::fs::write(&yol, serde_json::to_string_pretty(&liste).unwrap_or_default());
}

pub async fn baslat(a: Acilis) -> Sonuc<()> {
    let kilit = MesgulKilidi::al()?;
    let mut kr = Kronometre::yeni();
    let id = a.ayarlar.mc_surum.clone();
    let kok = oyun_klasoru();
    let kutuphane_kok = kok.join("libraries");

    let (vanilla, java) = surum_ve_java(&id).await?;
    kr.adim("Sürüm ve Java");
    let hafif = a.ayarlar.hafif_mod && !a.modsuz;
    let mut tur = if a.modsuz { "vanilla".to_string() } else { a.ayarlar.yukleyici.clone() };
    if a.modsuz {
        log("Modsuz deneme: oyun hiçbir mod olmadan (vanilla) açılıyor.");
    }
    // Vanilla'da KCZ Optimizasyon / KCZ Client: oyun sadece bunlarla Fabric üzerinden açılır
    let kullanici_modlari = tur != "vanilla";
    if !a.modsuz && (hafif || istemci::fabric_gerekli(&a.ayarlar, &id)) && tur == "vanilla" {
        tur = "fabric".into();
    }
    let ek = if tur == "vanilla" {
        None
    } else {
        yukleyici::hazirla(&tur, &id).await
    };
    kr.adim("Mod yükleyici");

    // Modları onar ve oyunun mods klasörüne yerleştir
    if ek.is_some() && kullanici_modlari {
        match modlar::onar(&id, &tur, a.mod_sunucusu.as_deref()).await {
            Ok(k) if !k.is_empty() => log(format!("Eksik olduğu için kuruldu: {}", k.join(", "))),
            Err(h) => log(format!("Mod onarımı yapılamadı: {h}")),
            _ => {}
        }
    }
    kr.adim("Mod kontrolü");
    let etkin = if ek.is_some() { tur.as_str() } else { "vanilla" };
    let mut ek_klasorler: Vec<PathBuf> = vec![];
    if ek.is_some() {
        ek_klasorler.extend(istemci::klasorler_hazirla(&id, &tur, &a.ayarlar).await);
        if hafif {
            ek_klasorler.push(performans::modlari_hazirla(&id, &tur, false).await);
        }
    }
    kr.adim("KCZ ve eklentiler");
    istemci::ayar_yaz(&a.ayarlar);
    istemci::bulaniklik_ayarla(&a.ayarlar);
    if a.ayarlar.dunya_yedek {
        yedek::gerekirse(format!("{id}|{etkin}"), id.clone()).await;
    }
    kr.adim("Ayarlar ve yedek");
    let n = modlar::esitle(etkin, &id, a.mod_sunucusu.as_deref(), kullanici_modlari, &ek_klasorler);
    if n > 0 {
        log(format!("{n} mod etkin."));
    }
    kr.adim("Modları yerleştirme");
    ilerleme(&id, 100, if a.modsuz { "Modsuz başlatılıyor…" } else { "Oyun başlatılıyor…" });

    // Çocuk (Fabric/Forge) ve ebeveyn (vanilla) sürüm bilgisi
    let (cocuk, forge) = match &ek {
        Some(Ek::Profil(p)) => (Some(p.clone()), None),
        Some(Ek::Forge {
            json,
            kurulum,
            sarmalayici,
        }) => (Some(json.clone()), Some((kurulum.clone(), sarmalayici.clone()))),
        None => (None, None),
    };
    let surum_adi = cocuk
        .as_ref()
        .map(|c| metin(c, "id"))
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| id.clone());

    // Kütüphaneler: önce çocuğunkiler (aynı kütüphanenin yeni sürümü kazanır)
    let mut tum: Vec<Value> = vec![];
    if let Some(c) = &cocuk {
        tum.extend(c["libraries"].as_array().cloned().unwrap_or_default());
    }
    tum.extend(vanilla["libraries"].as_array().cloned().unwrap_or_default());
    let mut gorulen = HashSet::new();
    let mut sinif_yolu: Vec<String> = vec![];
    if let Some((_, s)) = &forge {
        sinif_yolu.push(s.display().to_string());
    }
    for l in &tum {
        if !kural_uygun(l.get("rules"), &surumler::ozellik_yok) {
            continue;
        }
        if l.get("natives").is_some() {
            continue;
        }
        if !gorulen.insert(kutuphane_anahtari(&metin(l, "name"))) {
            continue;
        }
        if let Some(y) = kutuphane_yolu(l, &kutuphane_kok) {
            let s = y.display().to_string();
            if !sinif_yolu.contains(&s) {
                sinif_yolu.push(s);
            }
        }
    }
    sinif_yolu.push(surumler::istemci_jar(&id).display().to_string());

    let natives = kok.join("natives").join(&id);
    {
        let (t, k, n) = (tum.clone(), kutuphane_kok.clone(), natives.clone());
        tokio::task::spawn_blocking(move || natives_cikar(&t, &k, &n)).await.h()?;
    }
    kr.adim("Kütüphaneler");

    // Asset klasörü (çok eski sürümler için sanal klasör)
    let indeks_id = metin(&vanilla["assetIndex"], "id");
    let assets = kok.join("assets");
    let oyun_assets = {
        let yol = assets.join("indexes").join(format!("{indeks_id}.json"));
        let indeks: Value = std::fs::read_to_string(&yol)
            .ok()
            .and_then(|m| serde_json::from_str(&m).ok())
            .unwrap_or(Value::Null);
        if indeks["map_to_resources"].as_bool().unwrap_or(false) {
            kok.join("resources")
        } else if indeks["virtual"].as_bool().unwrap_or(false) {
            assets.join("virtual").join(&indeks_id)
        } else {
            assets.clone()
        }
    };

    // Direkt sunucuya bağlanma: yeni sürümlerde --quickPlayMultiplayer, eskilerde --server/--port
    let hizli_destek = vanilla["arguments"]["game"].to_string().contains("quickPlayMultiplayer");
    let hedef = a.hedef_sunucu.clone().filter(|h| !h.trim().is_empty());
    let hizli = hedef.is_some() && hizli_destek;
    let ozellik = move |f: &str| f == "is_quick_play_multiplayer" && hizli;

    let mut jvm: Vec<String> = vec![format!("-Xmx{}G", a.ayarlar.ram), format!("-Xms{}G", a.ayarlar.ram.min(2))];
    if a.ayarlar.java_ayar {
        jvm.extend(performans::java_bayraklari());
    }
    let mut oyun_arg: Vec<String> = vec![];
    if vanilla["arguments"].is_object() {
        argumanlari_topla(&vanilla["arguments"]["jvm"], &ozellik, &mut jvm);
        if let Some(c) = &cocuk {
            argumanlari_topla(&c["arguments"]["jvm"], &ozellik, &mut jvm);
        }
        argumanlari_topla(&vanilla["arguments"]["game"], &ozellik, &mut oyun_arg);
        if let Some(c) = &cocuk {
            argumanlari_topla(&c["arguments"]["game"], &ozellik, &mut oyun_arg);
        }
    } else {
        jvm.push("-Djava.library.path=${natives_directory}".into());
        jvm.push("-cp".into());
        jvm.push("${classpath}".into());
        let eski = cocuk
            .as_ref()
            .and_then(|c| c["minecraftArguments"].as_str())
            .or_else(|| vanilla["minecraftArguments"].as_str())
            .unwrap_or("");
        oyun_arg.extend(eski.split_whitespace().map(String::from));
    }
    // Log ayarı (log4j güvenlik düzeltmesi dahil)
    if let Some(f) = vanilla["logging"]["client"].get("file") {
        let yol = assets.join("log_configs").join(metin(f, "id"));
        let arg = metin(&vanilla["logging"]["client"], "argument");
        if yol.exists() && !arg.is_empty() {
            jvm.push(arg.replace("${path}", &yol.display().to_string()));
        }
    }
    jvm.push("-Dminecraft.launcher.brand=kcz-launcher".into());
    jvm.push(format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")));
    // Hızlı açılış: Java sınıf paylaşım arşivi (CDS). İlk açılışta oyun kapanırken oluşur, sonraki açılışlarda
    // sınıflar hazır yüklenir; sınıf yolu değişirse (sürüm/kütüphane) Java arşivi kendisi yeniler.
    // Sadece Java 19+: eski Java'lar bu seçeneği tanımaz ve hiç açılmaz.
    if surumler::java_surumu(&vanilla) >= 19 {
        let cds = ana_klasor().join("cds");
        if std::fs::create_dir_all(&cds).is_ok() {
            let ad: String = surum_adi
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || "._-".contains(c) { c } else { '_' })
                .collect();
            jvm.push("-XX:+AutoCreateSharedArchive".into());
            jvm.push(format!("-XX:SharedArchiveFile={}", cds.join(format!("{ad}.jsa")).display()));
        }
    }

    let mut ana_sinif = cocuk
        .as_ref()
        .map(|c| metin(c, "mainClass"))
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| metin(&vanilla, "mainClass"));
    if let Some((kurulum, _)) = &forge {
        jvm.push(format!("-Dforgewrapper.librariesDir={}", kutuphane_kok.display()));
        jvm.push(format!("-Dforgewrapper.installer={}", kurulum.display()));
        jvm.push(format!("-Dforgewrapper.minecraft={}", surumler::istemci_jar(&id).display()));
        ana_sinif = "io.github.zekerzhayard.forgewrapper.installer.Main".into();
    }
    if let (Some(h), false) = (&hedef, hizli) {
        let (host, port) = adres_ayir(h);
        oyun_arg.extend(["--server".to_string(), host, "--port".to_string(), port]);
    }

    let mut d: HashMap<&str, String> = HashMap::new();
    d.insert("auth_player_name", a.yetki.ad.clone());
    d.insert("version_name", surum_adi.clone());
    d.insert("game_directory", kok.display().to_string());
    d.insert("assets_root", assets.display().to_string());
    d.insert("game_assets", oyun_assets.display().to_string());
    d.insert("assets_index_name", indeks_id.clone());
    d.insert("auth_uuid", a.yetki.uuid.clone());
    d.insert("auth_access_token", a.yetki.erisim.clone());
    d.insert("auth_session", a.yetki.erisim.clone());
    d.insert("clientid", String::new());
    d.insert("auth_xuid", String::new());
    d.insert("user_type", "msa".into());
    d.insert("user_properties", "{}".into());
    d.insert("version_type", {
        let t = metin(&vanilla, "type");
        if t.is_empty() {
            "release".into()
        } else {
            t
        }
    });
    d.insert("natives_directory", natives.display().to_string());
    d.insert("launcher_name", "kcz-launcher".into());
    d.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    d.insert("classpath", sinif_yolu.join(yol_ayirici()));
    d.insert("classpath_separator", yol_ayirici().into());
    d.insert("library_directory", kutuphane_kok.display().to_string());
    d.insert("quickPlayMultiplayer", hedef.clone().unwrap_or_default());

    let mut argumanlar: Vec<String> = jvm.iter().map(|x| degistir(x, &d)).collect();
    argumanlar.push(ana_sinif);
    argumanlar.extend(oyun_arg.iter().map(|x| degistir(x, &d)));

    // Erişim anahtarı kayda yazılmasın
    let gosterilen: Vec<String> = argumanlar
        .iter()
        .map(|x| if x == &a.yetki.erisim { "********".to_string() } else { x.clone() })
        .collect();
    log(format!("Başlatılıyor: {} {}", java.display(), gosterilen.join(" ")));

    if a.ayarlar.ekran_karti {
        let j = java.clone();
        let _ = tokio::task::spawn_blocking(move || performans::ekran_karti_tercihi(&j)).await;
    }
    let guc = a.ayarlar.guc_plani;
    if guc {
        let _ = tokio::task::spawn_blocking(performans::guc_plani_ac).await;
    }

    let mut komut = tokio::process::Command::new(&java);
    if a.ayarlar.ekran_karti {
        for (k, v) in performans::ekran_karti_ortami() {
            komut.env(k, v);
        }
    }
    komut
        .args(&argumanlar)
        .current_dir(&kok)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    komut.creation_flags(PENCERESIZ);
    let mut surec = match komut.spawn() {
        Ok(s) => s,
        Err(e) => {
            if guc {
                performans::guc_plani_geri();
            }
            return Err(format!("Oyun başlatılamadı: {e}"));
        }
    };
    if a.ayarlar.oncelik {
        if let Some(pid) = surec.id() {
            performans::oncelik_ver(pid);
        }
    }

    let stdout = surec.stdout.take();
    let stderr = surec.stderr.take();
    kilit.birak_sonra();
    kr.adim("Java başlatma");
    let olcum = std::sync::Arc::new(std::sync::Mutex::new(AcilisOlcumu {
        bas: kr.bas,
        surum: id.clone(),
        yukleyici: etkin.to_string(),
        mod_sayisi: n,
        hazirlik_ms: kr.bas.elapsed().as_millis(),
        adimlar: kr.adimlar,
        ilk_log_ms: None,
        menu_ms: None,
        yazildi: false,
    }));
    let surum_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let acildi = std::sync::Arc::new(AtomicBool::new(false));
        let oku = |akis: Option<Box<dyn tokio::io::AsyncRead + Unpin + Send>>,
                   acildi: std::sync::Arc<AtomicBool>,
                   sid: String,
                   olcum: std::sync::Arc<std::sync::Mutex<AcilisOlcumu>>| async move {
            let Some(akis) = akis else { return };
            // Satırları bayt olarak oku: Türkçe karakter gibi bozuk baytlar okumayı durdurmasın
            let mut okuyucu = BufReader::new(akis);
            let mut tampon: Vec<u8> = vec![];
            loop {
                tampon.clear();
                match okuyucu.read_until(b'\n', &mut tampon).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let s = String::from_utf8_lossy(&tampon).trim_end().to_string();
                        {
                            let mut o = olcum.lock().unwrap();
                            if o.ilk_log_ms.is_none() {
                                o.ilk_log_ms = Some(o.bas.elapsed().as_millis());
                            }
                            // Ses motoru ilk kaynak yüklemesinin sonunda, ana menü gelirken başlar
                            if o.menu_ms.is_none() && s.contains("Sound engine started") {
                                o.menu_ms = Some(o.bas.elapsed().as_millis());
                                olcumu_yaz(&mut o);
                            }
                        }
                        log(s);
                        if !acildi.swap(true, Ordering::SeqCst) {
                            crate::oyun_durumu(json!({ "tur": "acik", "surum": sid }));
                        }
                    }
                }
            }
        };
        let o1 = oku(
            stdout.map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
            acildi.clone(),
            surum_id.clone(),
            olcum.clone(),
        );
        let o2 = oku(
            stderr.map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
            acildi.clone(),
            surum_id.clone(),
            olcum.clone(),
        );
        let (_, _, kod) = tokio::join!(o1, o2, surec.wait());
        // Menüye varmadan kapandıysa (çökme) ölçüm yine yazılsın
        olcumu_yaz(&mut olcum.lock().unwrap());
        let kod = kod.ok().and_then(|k| k.code()).unwrap_or(-1);
        MESGUL.store(false, Ordering::SeqCst);
        if guc {
            let _ = tokio::task::spawn_blocking(performans::guc_plani_geri).await;
        }
        log(format!("Oyun kapandı (kod {kod})."));
        crate::oyun_durumu(json!({ "tur": "kapandi", "surum": surum_id, "kod": kod }));
    });
    Ok(())
}
