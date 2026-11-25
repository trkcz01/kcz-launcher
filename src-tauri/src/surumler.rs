// Minecraft sürümleri: Mojang'ın listesinden tüm sürümleri getirir, her sürümü ayrı ayrı yükler
// (oyun dosyası, kütüphaneler, ses/doku dosyaları) ve siler. Eski sürümle aynı klasör düzeni.
use crate::ortak::*;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const KAYNAKLAR: &str = "https://resources.download.minecraft.net";
const TAMAM: &str = ".kcz-tamam";

static ONBELLEK: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));

pub fn ilerleme(surum: &str, yuzde: u64, metin: &str) {
    gonder("oyun-ilerleme", json!({ "surum": surum, "yuzde": yuzde.min(100), "metin": metin }));
}

/* ---------- Sürüm listesi ---------- */
pub async fn manifest() -> Value {
    let onceki = ONBELLEK.lock().unwrap().clone();
    if let Some(m) = onceki {
        return m;
    }
    let yol = ana_klasor().join("surum-listesi.json");
    let m = match json_al(MANIFEST).await {
        Ok(j) => {
            let _ = std::fs::write(&yol, j.to_string());
            Some(j)
        }
        // İnternet yoksa en son kaydedilen listeyi kullan
        Err(_) => std::fs::read_to_string(&yol).ok().and_then(|m| serde_json::from_str(&m).ok()),
    };
    let m = m.unwrap_or_else(|| json!({ "latest": {}, "versions": [] }));
    *ONBELLEK.lock().unwrap() = Some(m.clone());
    m
}

pub fn surum_klasoru(id: &str) -> PathBuf {
    oyun_klasoru().join("versions").join(id)
}

pub fn gecerli(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && !id.contains("..") && id.chars().all(|c| c.is_ascii_alphanumeric() || "._- ".contains(c))
}

pub fn yuklu_mu(id: &str) -> bool {
    gecerli(id) && surum_klasoru(id).join(TAMAM).exists()
}

pub async fn liste() -> Value {
    let m = manifest().await;
    let surumler: Vec<Value> = m["versions"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|v| {
            let id = metin(v, "id");
            json!({ "id": id, "tur": metin(v, "type"), "tarih": metin(v, "releaseTime"), "yuklu": yuklu_mu(&id) })
        })
        .collect();
    json!({ "liste": surumler, "enSon": m.get("latest").cloned().unwrap_or(json!({})) })
}

pub fn surum_json(id: &str) -> Sonuc<Value> {
    let m = std::fs::read_to_string(surum_klasoru(id).join(format!("{id}.json"))).h()?;
    serde_json::from_str(&m).h()
}

/// Sürümün istediği Java (Adoptium'da bulunan en yakın LTS sürümüne yuvarlanır)
pub fn java_surumu(json: &Value) -> u64 {
    let m = json["javaVersion"]["majorVersion"].as_u64().unwrap_or(8);
    match m {
        0..=8 => 8,
        9..=11 => 11,
        12..=17 => 17,
        18..=21 => 21,
        22..=25 => 25,
        _ => m,
    }
}

pub fn sil(id: &str) -> Sonuc<()> {
    if !gecerli(id) {
        return Err("Geçersiz sürüm".into());
    }
    let _ = std::fs::remove_dir_all(surum_klasoru(id));
    // Bu sürüme ait Fabric/Quilt profilleri de gitsin (kütüphaneler ve dünyalar kalır)
    if let Ok(d) = std::fs::read_dir(oyun_klasoru().join("versions")) {
        for e in d.flatten() {
            let ad = e.file_name().to_string_lossy().to_string();
            if (ad.starts_with("fabric-loader-") || ad.starts_with("quilt-loader-")) && ad.ends_with(&format!("-{id}")) {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
    Ok(())
}

/// Kütüphane / argüman kuralları (bu işletim sistemi, 64-bit). ozellikler: oyunun istediği özellikler
pub fn kural_uygun(kurallar: Option<&Value>, ozellikler: &dyn Fn(&str) -> bool) -> bool {
    let Some(k) = kurallar.and_then(|k| k.as_array()) else {
        return true;
    };
    if k.is_empty() {
        return true;
    }
    let mut izin = false;
    for kural in k {
        let mut uyar = true;
        if let Some(os) = kural.get("os") {
            if let Some(ad) = os.get("name").and_then(|x| x.as_str()) {
                if ad != os_adi() {
                    uyar = false;
                }
            }
            if os.get("arch").and_then(|x| x.as_str()) == Some("x86") {
                uyar = false;
            }
        }
        if let Some(f) = kural.get("features").and_then(|x| x.as_object()) {
            for (ad, deger) in f {
                if ozellikler(ad) != deger.as_bool().unwrap_or(false) {
                    uyar = false;
                }
            }
        }
        if uyar {
            izin = kural.get("action").and_then(|x| x.as_str()) == Some("allow");
        }
    }
    izin
}

pub fn ozellik_yok(_: &str) -> bool {
    false
}

#[derive(Clone)]
pub struct Is {
    pub url: String,
    pub hedef: PathBuf,
    pub sha1: Option<String>,
    pub boyut: Option<u64>,
}

/// Kütüphane listesindeki (Mojang biçimi ya da Fabric'in maven biçimi) dosyaları iş listesine ekler
pub fn kutuphane_isleri(json: &Value, isler: &mut Vec<Is>) {
    let kutuphane = oyun_klasoru().join("libraries");
    for l in json["libraries"].as_array().cloned().unwrap_or_default() {
        if !kural_uygun(l.get("rules"), &ozellik_yok) {
            continue;
        }
        let d = &l["downloads"];
        if let Some(a) = d.get("artifact").filter(|a| a.is_object()) {
            let url = metin(a, "url");
            let yol = metin(a, "path");
            if !url.is_empty() && !yol.is_empty() {
                isler.push(Is {
                    url,
                    hedef: kutuphane.join(&yol),
                    sha1: a.get("sha1").and_then(|x| x.as_str()).map(String::from),
                    boyut: a.get("size").and_then(|x| x.as_u64()),
                });
            }
        } else if d.is_null() || d.get("artifact").is_none() {
            // Fabric/Quilt biçimi: { name, url, sha1?, size? }
            let ad = metin(&l, "name");
            if let Some(yol) = maven_yolu(&ad) {
                let mut taban = metin(&l, "url");
                if taban.is_empty() {
                    taban = "https://libraries.minecraft.net/".into();
                }
                if !taban.ends_with('/') {
                    taban.push('/');
                }
                if l.get("downloads").is_none() {
                    isler.push(Is {
                        url: format!("{taban}{yol}"),
                        hedef: kutuphane.join(&yol),
                        sha1: l.get("sha1").and_then(|x| x.as_str()).map(String::from),
                        boyut: l.get("size").and_then(|x| x.as_u64()),
                    });
                }
            }
        }
        // Eski sürümlerin "natives" kütüphaneleri
        if let (Some(n), Some(c)) = (l["natives"][os_adi()].as_str(), d.get("classifiers")) {
            let sinif = n.replace("${arch}", "64");
            if let Some(c) = c.get(&sinif) {
                isler.push(Is {
                    url: metin(c, "url"),
                    hedef: kutuphane.join(metin(c, "path")),
                    sha1: c.get("sha1").and_then(|x| x.as_str()).map(String::from),
                    boyut: c.get("size").and_then(|x| x.as_u64()),
                });
            }
        }
    }
}

/// İşleri 24'er paralel indirir, ilerlemeyi bildirir
pub async fn hepsini_indir(id: &str, isler: Vec<Is>, baslik: &str) -> Sonuc<()> {
    let mut gorulen = HashSet::new();
    let isler: Vec<Is> = isler
        .into_iter()
        .filter(|i| !i.url.is_empty() && gorulen.insert(i.hedef.clone()))
        .filter(|i| !dosya_hazir(&i.hedef, i.boyut))
        .collect();
    if isler.is_empty() {
        return Ok(());
    }
    let toplam: u64 = isler.iter().map(|i| i.boyut.unwrap_or(0)).sum::<u64>().max(1);
    let biten = Arc::new(AtomicU64::new(0));
    let son = Arc::new(Mutex::new(std::time::Instant::now()));
    let mb = |b: u64| b / 1_048_576;
    let sonuclar: Vec<Sonuc<u64>> = futures_util::stream::iter(isler.into_iter().map(|is| {
        let biten = biten.clone();
        let son = son.clone();
        let id = id.to_string();
        let baslik = baslik.to_string();
        async move {
            let n = indir(&is.url, &is.hedef, is.sha1.as_deref(), is.boyut, |_, _| {}).await?;
            let b = biten.fetch_add(is.boyut.unwrap_or(n), Ordering::SeqCst) + is.boyut.unwrap_or(n);
            let mut s = son.lock().unwrap();
            if s.elapsed().as_millis() > 150 {
                *s = std::time::Instant::now();
                ilerleme(&id, (b * 100 / toplam).min(99), &format!("{baslik} {} / {} MB", mb(b), mb(toplam)));
            }
            Ok(n)
        }
    }))
    .buffer_unordered(24)
    .collect()
    .await;
    for s in sonuclar {
        s?;
    }
    Ok(())
}

/* ---------- Yükleme ---------- */
pub async fn yukle(id: &str) -> Sonuc<Value> {
    if !gecerli(id) {
        return Err("Geçersiz sürüm".into());
    }
    ilerleme(id, 0, &format!("{id} hazırlanıyor…"));
    let m = manifest().await;
    let girdi = m["versions"]
        .as_array()
        .and_then(|v| v.iter().find(|x| metin(x, "id") == id))
        .cloned();
    let klasor = surum_klasoru(id);
    let json_yol = klasor.join(format!("{id}.json"));
    std::fs::create_dir_all(&klasor).h()?;
    let _ = std::fs::remove_file(klasor.join(TAMAM));

    let json: Value = if let Some(g) = girdi {
        let j = json_al(&metin(&g, "url"))
            .await
            .map_err(|e| format!("{id} bilgileri alınamadı ({e})"))?;
        std::fs::write(&json_yol, serde_json::to_string_pretty(&j).h()?).h()?;
        j
    } else if json_yol.exists() {
        serde_json::from_str(&std::fs::read_to_string(&json_yol).h()?).h()?
    } else {
        return Err(format!("{id} sürümü bulunamadı. İnternet bağlantını kontrol et."));
    };

    let kok = oyun_klasoru();
    let mut isler = vec![];
    // Oyunun kendisi
    if let Some(c) = json["downloads"].get("client") {
        isler.push(Is {
            url: metin(c, "url"),
            hedef: klasor.join(format!("{id}.jar")),
            sha1: c.get("sha1").and_then(|x| x.as_str()).map(String::from),
            boyut: c.get("size").and_then(|x| x.as_u64()),
        });
    }
    kutuphane_isleri(&json, &mut isler);
    // Log ayar dosyası
    if let Some(f) = json["logging"]["client"].get("file") {
        isler.push(Is {
            url: metin(f, "url"),
            hedef: kok.join("assets").join("log_configs").join(metin(f, "id")),
            sha1: f.get("sha1").and_then(|x| x.as_str()).map(String::from),
            boyut: f.get("size").and_then(|x| x.as_u64()),
        });
    }
    // Ses, doku, dil dosyaları
    if let Some(ai) = json.get("assetIndex") {
        let indeksler = kok.join("assets").join("indexes");
        let indeks_yol = indeksler.join(format!("{}.json", metin(ai, "id")));
        if !dosya_hazir(&indeks_yol, ai.get("size").and_then(|x| x.as_u64())) {
            indir(
                &metin(ai, "url"),
                &indeks_yol,
                ai.get("sha1").and_then(|x| x.as_str()),
                None,
                |_, _| {},
            )
            .await?;
        }
        let indeks: Value = serde_json::from_str(&std::fs::read_to_string(&indeks_yol).h()?).h()?;
        let sanal = indeks.get("virtual").and_then(|x| x.as_bool()).unwrap_or(false)
            || indeks.get("map_to_resources").and_then(|x| x.as_bool()).unwrap_or(false);
        if let Some(o) = indeks["objects"].as_object() {
            for (ad, nesne) in o {
                let h = metin(nesne, "hash");
                if h.len() < 2 {
                    continue;
                }
                isler.push(Is {
                    url: format!("{KAYNAKLAR}/{}/{h}", &h[..2]),
                    hedef: kok.join("assets").join("objects").join(&h[..2]).join(&h),
                    sha1: Some(h.clone()),
                    boyut: nesne.get("size").and_then(|x| x.as_u64()),
                });
                let _ = ad;
            }
        }
        let _ = sanal;
    }
    hepsini_indir(id, isler, &format!("{id} yükleniyor…")).await?;

    // Çok eski sürümler (1.6 öncesi) sesleri "resources" klasöründe arar
    if let Some(ai) = json.get("assetIndex") {
        let indeks_yol = kok.join("assets").join("indexes").join(format!("{}.json", metin(ai, "id")));
        if let Ok(m) = std::fs::read_to_string(&indeks_yol) {
            if let Ok(indeks) = serde_json::from_str::<Value>(&m) {
                let sanal = indeks.get("virtual").and_then(|x| x.as_bool()).unwrap_or(false);
                let kaynak = indeks.get("map_to_resources").and_then(|x| x.as_bool()).unwrap_or(false);
                if sanal || kaynak {
                    let hedef_kok = if kaynak {
                        kok.join("resources")
                    } else {
                        kok.join("assets").join("virtual").join(metin(ai, "id"))
                    };
                    if let Some(o) = indeks["objects"].as_object() {
                        for (ad, nesne) in o {
                            let h = metin(nesne, "hash");
                            if h.len() < 2 {
                                continue;
                            }
                            let kaynak_dosya = kok.join("assets").join("objects").join(&h[..2]).join(&h);
                            let hedef = hedef_kok.join(ad);
                            if !hedef.exists() {
                                if let Some(u) = hedef.parent() {
                                    let _ = std::fs::create_dir_all(u);
                                }
                                let _ = std::fs::copy(&kaynak_dosya, &hedef);
                            }
                        }
                    }
                }
            }
        }
    }

    std::fs::write(klasor.join(TAMAM), chrono::Local::now().to_rfc3339()).h()?;
    ilerleme(id, 100, &format!("{id} yüklendi"));
    Ok(json)
}

/// Yüklü değilse yükler, yüklüyse json'u okur
pub async fn hazirla(id: &str) -> Sonuc<Value> {
    if yuklu_mu(id) {
        if let Ok(j) = surum_json(id) {
            return Ok(j);
        }
    }
    yukle(id).await
}

pub fn istemci_jar(id: &str) -> PathBuf {
    surum_klasoru(id).join(format!("{id}.jar"))
}

pub fn var_mi(yol: &Path) -> bool {
    yol.exists()
}
