// Performans: sistemi tarama, hazır ayarlar (options.txt), KCZ Optimizasyon (görünmez performans modları),
// ekran kartı tercihi, güç planı, Java bellek ayarları ve oyun önceliği.
use crate::ortak::*;
use crate::{ayarlar, modlar};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

/* ---------- Gizli komut çalıştırma (siyah pencere açılmasın) ---------- */
fn komut(program: &str, args: &[&str]) -> Option<String> {
    let mut k = std::process::Command::new(program);
    k.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        k.creation_flags(PENCERESIZ);
    }
    let c = k.output().ok()?;
    if !c.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&c.stdout).to_string())
}

fn powershell(betik: &str) -> Option<String> {
    komut(
        "powershell.exe",
        // Betik dosyası çalıştırılmıyor, sadece komut: çalıştırma ilkesini değiştirmeye gerek yok
        // (antivirüsler "-ExecutionPolicy Bypass" görünce programı şüpheli sayabiliyor)
        &["-NoProfile", "-NonInteractive", "-Command", betik],
    )
}

/* =========================================================
Sistemi tara
========================================================= */
const TARAMA_BETIGI: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$c=Get-CimInstance Win32_Processor|Select-Object -First 1;
$s=Get-CimInstance Win32_ComputerSystem;
$o=Get-CimInstance Win32_OperatingSystem;
$g=@(Get-CimInstance Win32_VideoController|ForEach-Object{[pscustomobject]@{ad=[string]$_.Name;vram=[double]$_.AdapterRAM}});
$v=@(Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction SilentlyContinue|Where-Object{$_.'HardwareInformation.qwMemorySize'}|ForEach-Object{[pscustomobject]@{ad=[string]$_.DriverDesc;vram=[double]$_.'HardwareInformation.qwMemorySize'}});
$p=@(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0;
[pscustomobject]@{cpu=[string]$c.Name;cekirdek=[int]$c.NumberOfCores;izlek=[int]$c.NumberOfLogicalProcessors;ram=[double]$s.TotalPhysicalMemory;bos=[double]$o.FreePhysicalMemory*1024;gpu=$g;vram=$v;isletim=[string]$o.Caption;dizustu=$p}|ConvertTo-Json -Compress -Depth 4"#;

static TARAMA: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));

const GB: f64 = 1024.0 * 1024.0 * 1024.0;

/// Ekran kartının türü ve puanı (0 zayıf, 1 orta, 2 güçlü). None: sanal/uzak masaüstü kartı
fn ekran_karti_puani(ad: &str, vram_gb: f64) -> Option<(&'static str, u8)> {
    let a = ad.to_lowercase();
    if [
        "basic",
        "remote",
        "virtual",
        "parsec",
        "meta virtual",
        "dummy",
        "displaylink",
        "citrix",
    ]
    .iter()
    .any(|x| a.contains(x))
    {
        return None;
    }
    let (tur, mut puan) = if a.contains("nvidia") || a.contains("geforce") || a.contains("quadro") {
        if a.contains("mx") || a.contains(" gt ") || a.contains("gt 7") || a.contains("gt 10") {
            ("harici", 0)
        } else if a.contains("rtx") {
            ("harici", 2)
        } else {
            ("harici", 1)
        }
    } else if a.contains("radeon") || a.contains("amd") {
        if a.contains("rx 6") || a.contains("rx 7") || a.contains("rx 9") {
            ("harici", 2)
        } else if a.contains("rx") {
            ("harici", 1)
        } else {
            ("dahili", 0)
        }
    } else if a.contains("intel") {
        if a.contains("arc") && !a.contains("arc(tm) graphics") && !a.contains("arc graphics") {
            ("harici", 1)
        } else {
            ("dahili", 0)
        }
    } else {
        ("bilinmiyor", 1)
    };
    if tur == "harici" && vram_gb >= 7.5 && puan < 2 {
        puan = 2;
    }
    if tur == "harici" && vram_gb > 0.1 && vram_gb < 2.5 {
        puan = 0;
    }
    Some((tur, puan))
}

fn durum(puan: u8) -> &'static str {
    match puan {
        0 => "zayif",
        1 => "orta",
        _ => "iyi",
    }
}

/// Bilgisayara göre oyuna ayrılacak RAM (GB)
fn ram_onerisi(ram_gb: f64) -> u32 {
    let n = if ram_gb < 5.0 {
        2
    } else if ram_gb < 7.5 {
        3
    } else if ram_gb < 11.5 {
        4
    } else if ram_gb < 15.5 {
        5
    } else if ram_gb < 23.5 {
        6
    } else {
        8
    };
    // Windows'a da en az 2 GB kalsın
    n.min(((ram_gb - 2.0).floor().max(2.0)) as u32).clamp(2, 16)
}

fn analiz(h: &Value) -> Value {
    let cpu = metin(h, "cpu").trim().to_string();
    let cekirdek = h["cekirdek"].as_u64().unwrap_or(0);
    let izlek = h["izlek"].as_u64().unwrap_or(0);
    let ram_gb = h["ram"].as_f64().unwrap_or(0.0) / GB;
    let bos_gb = h["bos"].as_f64().unwrap_or(0.0) / GB;
    let dizustu = h["dizustu"].as_bool().unwrap_or(false);

    // Ekran kartları: VRAM'i (varsa) kayıt defterinden, yoksa WMI'den al
    let vramler: Vec<(String, f64)> = h["vram"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|x| (metin(x, "ad"), x["vram"].as_f64().unwrap_or(0.0) / GB))
        .collect();
    let mut kartlar: Vec<(String, f64, &'static str, u8)> = vec![];
    for g in h["gpu"].as_array().cloned().unwrap_or_default() {
        let ad = metin(&g, "ad").trim().to_string();
        let vram = vramler
            .iter()
            .find(|(a, _)| a.trim() == ad)
            .map(|(_, v)| *v)
            .unwrap_or(g["vram"].as_f64().unwrap_or(0.0) / GB);
        if let Some((tur, puan)) = ekran_karti_puani(&ad, vram) {
            kartlar.push((ad, vram, tur, puan));
        }
    }
    kartlar.sort_by(|a, b| b.3.cmp(&a.3).then(b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)));
    let iki_kart = kartlar.iter().any(|k| k.2 == "harici") && kartlar.iter().any(|k| k.2 == "dahili");

    let ram_puan = if ram_gb < 7.5 {
        0
    } else if ram_gb < 15.5 {
        1
    } else {
        2
    };
    let cpu_puan = if cekirdek <= 2 || izlek < 4 {
        0
    } else if cekirdek < 6 {
        1
    } else {
        2
    };
    let gpu_puan = kartlar.first().map(|k| k.3).unwrap_or(0);
    let en_dusuk = ram_puan.min(cpu_puan).min(gpu_puan);
    let toplam = ram_puan + cpu_puan + gpu_puan;
    // Çok zayıf: dahili ekran kartı ve ya 2 çekirdekli işlemci ya da az RAM
    let seviye = if gpu_puan == 0 && (cpu_puan == 0 || ram_puan == 0) {
        "cokdusuk"
    } else if en_dusuk == 0 {
        "dusuk"
    } else if toplam >= 5 {
        "yuksek"
    } else {
        "orta"
    };

    let mut parcalar = vec![
        json!({ "ad": "İşlemci", "deger": format!("{cpu} · {cekirdek} çekirdek / {izlek} iş parçacığı"), "durum": durum(cpu_puan) }),
        json!({ "ad": "Bellek (RAM)", "deger": format!("{:.0} GB · şu an {:.1} GB boş", ram_gb.round(), bos_gb), "durum": durum(ram_puan) }),
    ];
    match kartlar.first() {
        Some((ad, vram, tur, puan)) => {
            let tur_adi = match *tur {
                "harici" => "harici",
                "dahili" => "işlemciyle birlikte (dahili)",
                _ => "bilinmeyen tür",
            };
            let v = if *vram > 0.1 {
                format!(" · {:.0} GB", vram.round().max(1.0))
            } else {
                String::new()
            };
            parcalar.push(json!({ "ad": "Ekran kartı", "deger": format!("{ad}{v} · {tur_adi}"), "durum": durum(*puan) }));
        }
        None => parcalar.push(json!({ "ad": "Ekran kartı", "deger": "Bulunamadı", "durum": "zayif" })),
    }

    let mut notlar: Vec<String> = vec![];
    if iki_kart {
        notlar.push("İki ekran kartın var: oyun güçlü olanla açılacak şekilde ayarlanabilir (Ekran kartı tercihi).".into());
    }
    if dizustu {
        notlar.push("Dizüstü bilgisayar: oynarken şarja takılı olması FPS'i belirgin artırır.".into());
    }
    if bos_gb < 2.0 && ram_gb > 0.0 {
        notlar.push("Şu an az boş bellek var: oynarken tarayıcı gibi programları kapatmak takılmaları azaltır.".into());
    }
    if ram_puan == 0 {
        notlar.push("Bellek az: KCZ Optimizasyon ve Düşük ayar önerilir.".into());
    }

    json!({
        "ok": true,
        "seviye": seviye,
        "ram": ram_onerisi(ram_gb),
        "ramGb": (ram_gb * 10.0).round() / 10.0,
        "dizustu": dizustu,
        "ikiEkranKarti": iki_kart,
        "isletim": metin(h, "isletim"),
        "parcalar": parcalar,
        "notlar": notlar
    })
}

fn windows_tarama() -> Option<Value> {
    let ham = powershell(&TARAMA_BETIGI.replace('\n', " "))?;
    let ham = ham.trim_start_matches('\u{feff}').trim().to_string();
    match serde_json::from_str::<Value>(&ham) {
        Ok(h) => Some(h),
        Err(_) => {
            log(format!("Sistem taraması okunamadı: {}", ham.chars().take(300).collect::<String>()));
            None
        }
    }
}

/// Linux: /proc/cpuinfo, /proc/meminfo, lspci (yoksa /sys/class/drm), pil, dağıtım adı
fn linux_tarama() -> Option<Value> {
    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").ok()?;
    let cpu = cpuinfo
        .lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| v.trim().to_string())
        .unwrap_or_default();
    let izlek = cpuinfo.lines().filter(|l| l.starts_with("processor")).count();
    let mut cekirdekler = std::collections::HashSet::new();
    for blok in cpuinfo.split("\n\n") {
        let deger = |ad: &str| {
            blok.lines()
                .find(|l| l.starts_with(ad))
                .and_then(|l| l.split_once(':'))
                .map(|(_, v)| v.trim().to_string())
        };
        if let (Some(p), Some(c)) = (deger("physical id"), deger("core id")) {
            cekirdekler.insert((p, c));
        }
    }
    let cekirdek = if cekirdekler.is_empty() { izlek } else { cekirdekler.len() };

    let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let kb = |ad: &str| -> f64 {
        meminfo
            .lines()
            .find(|l| l.starts_with(ad))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|x| x.parse::<f64>().ok())
            .unwrap_or(0.0)
            * 1024.0
    };

    let mut gpu: Vec<Value> = vec![];
    if let Some(c) = komut("lspci", &[]) {
        for l in c.lines() {
            if l.contains("VGA compatible controller") || l.contains("3D controller") || l.contains("Display controller") {
                if let Some((_, ad)) = l.split_once(": ") {
                    gpu.push(json!({ "ad": ad.trim(), "vram": 0.0 }));
                }
            }
        }
    }
    if gpu.is_empty() {
        // lspci yoksa: üretici kimliğinden kaba ad
        if let Ok(d) = std::fs::read_dir("/sys/class/drm") {
            for e in d.flatten() {
                let ad = e.file_name().to_string_lossy().to_string();
                if !ad.starts_with("card") || ad.contains('-') {
                    continue;
                }
                let uretici = std::fs::read_to_string(e.path().join("device").join("vendor")).unwrap_or_default();
                let isim = match uretici.trim() {
                    "0x10de" => "NVIDIA GeForce",
                    "0x1002" => "AMD Radeon",
                    "0x8086" => "Intel Graphics",
                    _ => continue,
                };
                gpu.push(json!({ "ad": isim, "vram": 0.0 }));
            }
        }
    }
    let dizustu = std::fs::read_dir("/sys/class/power_supply")
        .map(|d| d.flatten().any(|e| e.file_name().to_string_lossy().starts_with("BAT")))
        .unwrap_or(false);
    let isletim = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|m| {
            m.lines()
                .find(|l| l.starts_with("PRETTY_NAME="))
                .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
        })
        .unwrap_or_else(|| "Linux".into());
    Some(json!({
        "cpu": cpu, "cekirdek": cekirdek, "izlek": izlek,
        "ram": kb("MemTotal:"), "bos": kb("MemAvailable:"),
        "gpu": gpu, "vram": [], "isletim": isletim, "dizustu": dizustu
    }))
}

pub async fn sistem_tara() -> Value {
    let ham = tokio::task::spawn_blocking(|| if cfg!(windows) { windows_tarama() } else { linux_tarama() })
        .await
        .ok()
        .flatten();
    let Some(h) = ham else {
        return json!({ "ok": false, "hata": "Sistem bilgisi okunamadı." });
    };
    // PowerShell tek elemanlı dizileri bazen nesne olarak verir
    let mut h = h;
    for k in ["gpu", "vram"] {
        if h[k].is_object() {
            h[k] = Value::Array(vec![h[k].clone()]);
        }
    }
    let sonuc = analiz(&h);
    *TARAMA.lock().unwrap() = Some(sonuc.clone());
    sonuc
}

/* =========================================================
Hazır ayarlar (options.txt)
========================================================= */
/// (anahtar, değer, yoksa eklensin mi)
fn ayar_seti(seviye: &str) -> Vec<(&'static str, &'static str, bool)> {
    match seviye {
        // Zayıf bilgisayarlar: görüş 8 kalır, FPS'i yiyen her şey kısılır
        "cokdusuk" => vec![
            ("renderDistance", "8", true),
            ("simulationDistance", "5", false),
            ("graphicsMode", "0", false),
            ("fancyGraphics", "false", false),
            ("renderClouds", "false", false),
            ("ao", "false", true),
            ("particles", "2", true),
            ("mipmapLevels", "0", true),
            ("biomeBlendRadius", "0", false),
            ("entityShadows", "false", true),
            ("entityDistanceScaling", "0.5", false),
            ("enableVsync", "false", true),
            ("maxFps", "260", true),
            ("fullscreen", "true", true),
        ],
        "dusuk" => vec![
            ("renderDistance", "8", true),
            ("simulationDistance", "5", false),
            ("graphicsMode", "0", false),
            ("fancyGraphics", "false", false),
            ("renderClouds", "false", false),
            ("particles", "2", true),
            ("mipmapLevels", "2", true),
            ("biomeBlendRadius", "0", false),
            ("entityShadows", "false", true),
            ("entityDistanceScaling", "0.75", false),
            ("enableVsync", "false", true),
        ],
        "orta" => vec![
            ("renderDistance", "10", true),
            ("simulationDistance", "8", false),
            ("graphicsMode", "1", false),
            ("fancyGraphics", "true", false),
            ("renderClouds", "fast", false),
            ("particles", "1", true),
            ("mipmapLevels", "4", true),
            ("biomeBlendRadius", "1", false),
            ("entityShadows", "true", true),
            ("entityDistanceScaling", "1.0", false),
            ("enableVsync", "false", true),
        ],
        _ => vec![
            ("renderDistance", "16", true),
            ("simulationDistance", "12", false),
            ("graphicsMode", "1", false),
            ("fancyGraphics", "true", false),
            ("renderClouds", "true", false),
            ("particles", "0", true),
            ("mipmapLevels", "4", true),
            ("biomeBlendRadius", "2", false),
            ("entityShadows", "true", true),
            ("entityDistanceScaling", "1.0", false),
        ],
    }
}

fn options_yaz(seviye: &str) -> Sonuc<usize> {
    let yol = oyun_klasoru().join("options.txt");
    let eski = std::fs::read_to_string(&yol).unwrap_or_default();
    let mut satirlar: Vec<String> = eski.lines().map(String::from).collect();
    let mut degisen = 0;
    for (anahtar, deger, ekle) in ayar_seti(seviye) {
        let on = format!("{anahtar}:");
        if let Some(s) = satirlar.iter_mut().find(|s| s.starts_with(&on)) {
            // Yeni sürümler bazı değerleri tırnak içinde yazar: aynı biçimi koru
            let tirnakli = s[on.len()..].starts_with('"');
            *s = if tirnakli {
                format!("{on}\"{deger}\"")
            } else {
                format!("{on}{deger}")
            };
            degisen += 1;
        } else if ekle {
            satirlar.push(format!("{on}{deger}"));
            degisen += 1;
        }
    }
    if !eski.is_empty() && std::fs::copy(&yol, oyun_klasoru().join("options.txt.kcz-yedek")).is_err() {
        log("options.txt yedeklenemedi.");
    }
    std::fs::write(&yol, satirlar.join("\n") + "\n").map_err(|e| format!("Oyun ayarları yazılamadı: {e}"))?;
    Ok(degisen)
}

pub async fn uygula(seviye: &str) -> Value {
    if !["cokdusuk", "dusuk", "orta", "yuksek"].contains(&seviye) {
        return json!({ "ok": false, "hata": "Geçersiz seviye." });
    }
    if crate::oyun::mesgul_mu() {
        return json!({ "ok": false, "hata": "Önce oyunu kapat: oyun açıkken ayarlarını kendisi geri yazar." });
    }
    // RAM önerisi için tarama yoksa önce tara
    let tarama = TARAMA.lock().unwrap().clone();
    let tarama = match tarama {
        Some(t) => t,
        None => sistem_tara().await,
    };
    let degisen = match options_yaz(seviye) {
        Ok(n) => n,
        Err(e) => return json!({ "ok": false, "hata": e }),
    };
    let mut yeni = json!({ "performansSeviye": seviye });
    if let Some(r) = tarama["ram"].as_u64() {
        yeni["ram"] = json!(r);
    }
    if seviye != "yuksek" {
        yeni["hafifMod"] = json!(true);
        yeni["javaAyar"] = json!(true);
    }
    // Oyun açıkken: zayıf/orta sistemde launcher kapansın (belleği oyuna kalsın), Yüksek'te açık kalsın
    yeni["launcherUyusun"] = json!(seviye != "yuksek");
    yeni["oyunAcilincaGizle"] = json!(false);
    // KCZ Client: zayıfa Düşük sistem, güçlüye Güçlü sistem (oyuncu KCZ Menü'den değiştirebilir)
    let mut ist = ayarlar::getir().istemci;
    ist.dusuk_sistem = seviye == "cokdusuk" || seviye == "dusuk";
    ist.guclu_sistem = seviye == "yuksek";
    if let Ok(v) = serde_json::to_value(&ist) {
        yeni["istemci"] = v;
    }
    if seviye == "dusuk" || seviye == "cokdusuk" {
        yeni["oncelik"] = json!(true);
    }
    if tarama["ikiEkranKarti"].as_bool() == Some(true) {
        yeni["ekranKarti"] = json!(true);
    }
    let a = ayarlar::kaydet(&yeni);
    log(format!("Performans ayarı uygulandı: {seviye} ({degisen} oyun ayarı)."));
    json!({ "ok": true, "degisen": degisen, "ayarlar": a })
}

/* =========================================================
Hafif mod: performans modları
========================================================= */
const PERFORMANS_ANAHTARI: &str = "kcz-performans";

/// Her satır bir grup: ilk kurulabilen kullanılır (aynı işi yapan modlar birlikte kurulmasın)
fn mod_gruplari(yukleyici: &str) -> Vec<Vec<&'static str>> {
    // Sodium/Embeddium bilerek yok: görüntü motorunu değiştirmeyen, görünmez optimizasyonlar.
    // Arka planda FPS düşürme KCZ Client'ın kendi özelliği (Dynamic FPS yerine).
    match yukleyici {
        "fabric" | "quilt" => vec![
            vec!["lithium"],
            vec!["ferrite-core"],
            vec!["entityculling"],
            vec!["moreculling"],
            vec!["immediatelyfast"],
            vec!["modernfix"],
        ],
        "forge" => vec![
            vec!["canary"],
            vec!["ferrite-core"],
            vec!["entityculling"],
            vec!["moreculling"],
            vec!["immediatelyfast"],
            vec!["modernfix"],
        ],
        "neoforge" => vec![
            vec!["lithium", "canary"],
            vec!["ferrite-core"],
            vec!["entityculling"],
            vec!["moreculling"],
            vec!["immediatelyfast"],
            vec!["modernfix"],
        ],
        _ => vec![],
    }
}

/// Bu klasörlere asla konmayacak modlar (eskiden kurulduysa da silinir)
const ISTENMEYEN: [&str; 4] = ["sodium", "embeddium", "rubidium", "dynamic-fps"];

fn simdi() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Bir eklenti klasörünü hazırlar: gruplardaki modları kurar (her gruptan ilk kurulabilen),
/// 3 günde bir güncellemeleri denetler. Klasörü döndürür.
pub async fn klasor_hazirla(anahtar: &str, gruplar: Vec<Vec<&str>>, mc: &str, yukleyici: &str, mesaj: Option<&str>) -> PathBuf {
    let k = modlar::profil_klasoru(yukleyici, mc, Some(anahtar));
    let isaret = k.join(".kcz-hazir.json");
    let liste: Vec<&str> = gruplar.iter().flatten().copied().collect();
    let liste_metni = liste.join(",");
    // Sodium yasağı sadece optimizasyon klasöründe: shader (Iris) Sodium'a muhtaç
    let istenmeyen: &[&str] = if anahtar == PERFORMANS_ANAHTARI { &ISTENMEYEN } else { &[] };
    modlar::istenmeyenleri_sil(&k, &liste, istenmeyen);
    let onceki: Value = std::fs::read_to_string(&isaret)
        .ok()
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or(Value::Null);
    let jar_var = std::fs::read_dir(&k)
        .map(|d| {
            d.flatten()
                .any(|e| e.file_name().to_string_lossy().to_lowercase().ends_with(".jar"))
        })
        .unwrap_or(false);
    let taze = onceki["liste"].as_str() == Some(liste_metni.as_str())
        && onceki["zaman"]
            .as_u64()
            .map(|z| simdi().saturating_sub(z) < 3 * 24 * 3600)
            .unwrap_or(false);
    if taze && (jar_var || onceki["kurulan"].as_array().map(|a| a.is_empty()).unwrap_or(false)) {
        return k;
    }
    let gruplar: Vec<Vec<String>> = gruplar.iter().map(|g| g.iter().map(|s| s.to_string()).collect()).collect();
    // Hızlı açılış: daha önce kurulmuş ve listesi aynı, sadece 3 günlük süresi dolmuş. Oyun eldeki modlarla
    // hemen açılır; güncelleme arka planda yapılır (mods klasörü kopyalandıktan sonra başlasın diye 30 sn sonra).
    if jar_var && onceki["liste"].as_str() == Some(liste_metni.as_str()) {
        let (a, m, y) = (anahtar.to_string(), mc.to_string(), yukleyici.to_string());
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            klasoru_yenile(&a, gruplar, &m, &y).await;
        });
        return k;
    }
    if let Some(m) = mesaj {
        crate::surumler::ilerleme(mc, 100, m);
    }
    klasoru_yenile(anahtar, gruplar, mc, yukleyici).await;
    k
}

/// Eklenti klasörünü kurar ya da günceller; sorun yoksa "hazır" işaretini yazar
async fn klasoru_yenile(anahtar: &str, gruplar: Vec<Vec<String>>, mc: &str, yukleyici: &str) {
    let k = modlar::profil_klasoru(yukleyici, mc, Some(anahtar));
    let isaret = k.join(".kcz-hazir.json");
    let liste_metni = gruplar.iter().flatten().cloned().collect::<Vec<_>>().join(",");
    let mut kurulan: Vec<String> = vec![];
    let mut hatali = false;
    for grup in &gruplar {
        for slug in grup {
            let slug = slug.as_str();
            match modlar::yukle(slug, "mod", mc, yukleyici, Some(anahtar)).await {
                Ok(_) => {
                    kurulan.push(slug.to_string());
                    break;
                }
                Err(e) => {
                    // "bu sürüm için yok" normal; bağlantı hatasında sonra tekrar dene
                    if !e.contains("için yok") {
                        hatali = true;
                    }
                    log(format!("{anahtar} / {slug}: {e}"));
                }
            }
        }
    }
    if !hatali {
        let _ = std::fs::write(
            &isaret,
            json!({ "zaman": simdi(), "kurulan": kurulan, "liste": liste_metni }).to_string(),
        );
    }
    if !kurulan.is_empty() {
        log(format!("{anahtar}: {}", kurulan.join(", ")));
    }
}

/// KCZ Optimizasyon modlarını hazırlar (eksikse kurar)
pub async fn modlari_hazirla(mc: &str, yukleyici: &str, sessiz: bool) -> PathBuf {
    klasor_hazirla(
        PERFORMANS_ANAHTARI,
        mod_gruplari(yukleyici),
        mc,
        yukleyici,
        if sessiz {
            None
        } else {
            Some("KCZ Optimizasyon hazırlanıyor…")
        },
    )
    .await
}

/// Launcher açılınca: seçili sürüm için optimizasyonu arka planda önceden indir
pub async fn onceden_hazirla() {
    let a = ayarlar::getir();
    if !a.hafif_mod {
        return;
    }
    let y = if a.yukleyici == "vanilla" {
        "fabric".to_string()
    } else {
        a.yukleyici.clone()
    };
    if !["fabric", "quilt", "forge", "neoforge"].contains(&y.as_str()) {
        return;
    }
    modlari_hazirla(&a.mc_surum, &y, true).await;
}

/* =========================================================
Java bellek ayarları (takılmaları azaltır)
========================================================= */
pub fn java_bayraklari() -> Vec<String> {
    [
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/* =========================================================
Ekran kartı tercihi (Windows > Grafik ayarları ile aynı yer)
========================================================= */
pub fn ekran_karti_tercihi(java: &Path) {
    if !cfg!(windows) {
        return; // Linux'ta ortam değişkenleriyle yapılır: ekran_karti_ortami()
    }
    let yol = java.display().to_string();
    let sonuc = komut(
        "reg.exe",
        &[
            "add",
            r"HKCU\Software\Microsoft\DirectX\UserGpuPreferences",
            "/v",
            &yol,
            "/t",
            "REG_SZ",
            "/d",
            "GpuPreference=2;",
            "/f",
        ],
    );
    if sonuc.is_none() {
        log("Ekran kartı tercihi ayarlanamadı.");
    }
}

/// Linux: oyunu güçlü ekran kartıyla açtıran ortam değişkenleri (PRIME)
pub fn ekran_karti_ortami() -> Vec<(&'static str, &'static str)> {
    if cfg!(windows) {
        return vec![];
    }
    if Path::new("/proc/driver/nvidia/version").exists() {
        vec![
            ("__NV_PRIME_RENDER_OFFLOAD", "1"),
            ("__GLX_VENDOR_LIBRARY_NAME", "nvidia"),
            ("__VK_LAYER_NV_optimus", "NVIDIA_only"),
        ]
    } else {
        vec![("DRI_PRIME", "1")]
    }
}

/* =========================================================
Güç planı: oyun açıkken Yüksek performans, kapanınca eski hali
========================================================= */
static GUID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}").unwrap());

fn guc_dosyasi() -> PathBuf {
    kullanici_klasoru().join("guc-plani.txt")
}

fn aktif_plan() -> Option<String> {
    let c = komut("powercfg.exe", &["/getactivescheme"])?;
    GUID_RE.find(&c).map(|m| m.as_str().to_string())
}

pub fn guc_plani_ac() {
    if !cfg!(windows) {
        // Linux: power-profiles-daemon (GNOME/KDE'de genelde kurulu)
        let Some(eski) = komut("powerprofilesctl", &["get"]).map(|x| x.trim().to_string()) else {
            log("powerprofilesctl yok: güç profili değiştirilemedi.");
            return;
        };
        if eski != "performance" && komut("powerprofilesctl", &["set", "performance"]).is_some() {
            let _ = std::fs::write(guc_dosyasi(), &eski);
            log("Güç profili: performance.");
        }
        return;
    }
    let Some(eski) = aktif_plan() else { return };
    // Yüksek performans planı (SCHEME_MIN); bazı bilgisayarlarda yoksa dokunma
    if komut("powercfg.exe", &["/setactive", "SCHEME_MIN"]).is_some() {
        if aktif_plan().as_deref() != Some(eski.as_str()) {
            let _ = std::fs::write(guc_dosyasi(), &eski);
            log("Güç planı: Yüksek performans.");
        }
    } else {
        log("Yüksek performans güç planı bu bilgisayarda yok.");
    }
}

/// Oyun kapanınca ya da launcher açılırken (önceki sefer yarım kaldıysa) eski planı geri yükle
pub fn guc_plani_geri() {
    let Ok(eski) = std::fs::read_to_string(guc_dosyasi()) else { return };
    let eski = eski.trim().to_string();
    if !cfg!(windows) {
        if ["power-saver", "balanced", "performance"].contains(&eski.as_str()) {
            let _ = komut("powerprofilesctl", &["set", &eski]);
        }
    } else if eski.len() == 36 && GUID_RE.is_match(&eski) {
        let _ = komut("powercfg.exe", &["/setactive", &eski]);
    }
    let _ = std::fs::remove_file(guc_dosyasi());
}

/* =========================================================
Oyun önceliği: Windows oyuna biraz daha işlemci zamanı versin
========================================================= */
pub fn oncelik_ver(pid: u32) {
    if !cfg!(windows) {
        let _ = pid; // Linux'ta önceliği yükseltmek yönetici izni ister; atlanır
        return;
    }
    std::thread::spawn(move || {
        let betik = format!("(Get-Process -Id {pid}).PriorityClass='AboveNormal'");
        if powershell(&betik).is_none() {
            log("Oyun önceliği ayarlanamadı.");
        }
    });
}
