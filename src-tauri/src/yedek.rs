// Otomatik dünya yedeği: farklı bir sürüm ya da yükleyiciyle oyun açılmadan önce
// tek oyunculu dünyalar yedeklenir (değişmeyenler tekrar yedeklenmez, son 5 yedek tutulur).
use crate::ortak::*;
use serde_json::{json, Map, Value};
use std::io::Write;
use std::path::{Path, PathBuf};

const SAKLANAN: usize = 5;
const EN_BUYUK: u64 = 3 * 1024 * 1024 * 1024; // 3 GB'den büyük dünyalar atlanır

pub fn klasor() -> PathBuf {
    let k = ana_klasor().join("yedekler");
    let _ = std::fs::create_dir_all(&k);
    k
}

fn durum_dosyasi() -> PathBuf {
    kullanici_klasoru().join("yedek-durumu.json")
}

/// Klasörün toplam boyutu ve en son değişme zamanı
fn tara(k: &Path, boyut: &mut u64, son: &mut u64) {
    let Ok(d) = std::fs::read_dir(k) else { return };
    for e in d.flatten() {
        let Ok(m) = e.metadata() else { continue };
        if m.is_dir() {
            tara(&e.path(), boyut, son);
        } else {
            *boyut += m.len();
            if let Ok(t) = m.modified() {
                let s = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                *son = (*son).max(s);
            }
        }
    }
}

fn zip_ekle(z: &mut zip::ZipWriter<std::fs::File>, kok: &Path, k: &Path, ayar: zip::write::SimpleFileOptions) -> std::io::Result<()> {
    for e in std::fs::read_dir(k)?.flatten() {
        let yol = e.path();
        let goreli = yol.strip_prefix(kok).unwrap_or(&yol).to_string_lossy().replace('\\', "/");
        if yol.is_dir() {
            z.add_directory(format!("{goreli}/"), ayar.clone())?;
            zip_ekle(z, kok, &yol, ayar.clone())?;
        } else {
            if goreli.ends_with("session.lock") {
                continue;
            }
            z.start_file(goreli, ayar.clone())?;
            let mut f = std::fs::File::open(&yol)?;
            std::io::copy(&mut f, z)?;
        }
    }
    Ok(())
}

fn dunyayi_yedekle(dunya: &Path, hedef: &Path) -> std::io::Result<()> {
    let ad = dunya.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    let gecici = hedef.with_extension("zip.part");
    let f = std::fs::File::create(&gecici)?;
    let mut z = zip::ZipWriter::new(f);
    let ayar = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    z.add_directory(format!("{ad}/"), ayar.clone())?;
    zip_ekle(&mut z, dunya.parent().unwrap_or(dunya), dunya, ayar.clone())?;
    let mut f = z.finish()?;
    f.flush()?;
    drop(f);
    std::fs::rename(&gecici, hedef)?;
    Ok(())
}

/// Oyunu açmadan önce çağrılır. `anahtar`: "<sürüm>|<yükleyici>"
pub async fn gerekirse(anahtar: String, mc: String) {
    let durum: Value = std::fs::read_to_string(durum_dosyasi())
        .ok()
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or(json!({}));
    let onceki = metin(&durum, "son");
    if onceki.is_empty() || onceki == anahtar {
        let mut d = durum.clone();
        d["son"] = json!(anahtar);
        let _ = std::fs::write(durum_dosyasi(), d.to_string());
        return;
    }
    let saves = oyun_klasoru().join("saves");
    let Ok(liste) = std::fs::read_dir(&saves) else {
        let mut d = durum.clone();
        d["son"] = json!(anahtar);
        let _ = std::fs::write(durum_dosyasi(), d.to_string());
        return;
    };
    let dunyalar: Vec<PathBuf> = liste.flatten().map(|e| e.path()).filter(|p| p.join("level.dat").exists()).collect();
    if dunyalar.is_empty() {
        let mut d = durum.clone();
        d["son"] = json!(anahtar);
        let _ = std::fs::write(durum_dosyasi(), d.to_string());
        return;
    }
    crate::surumler::ilerleme(&mc, 100, "Dünyalar yedekleniyor…");
    let onceki_ad: String = onceki
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' { c } else { '-' })
        .collect();
    let sonuc = tokio::task::spawn_blocking(move || {
        let mut zamanlar: Map<String, Value> = durum["dunyalar"].as_object().cloned().unwrap_or_default();
        let tarih = chrono::Local::now().format("%Y-%m-%d_%H-%M").to_string();
        let hedef_klasor = klasor().join(format!("{tarih}_{onceki_ad}"));
        let mut yedeklenen = 0;
        for dunya in dunyalar {
            let ad = dunya.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
            let (mut boyut, mut son) = (0u64, 0u64);
            tara(&dunya, &mut boyut, &mut son);
            if zamanlar.get(&ad).and_then(|v| v.as_u64()) == Some(son) {
                continue; // son yedekten beri değişmemiş
            }
            if boyut > EN_BUYUK {
                log(format!("Dünya yedeği atlandı (çok büyük): {ad}"));
                continue;
            }
            let _ = std::fs::create_dir_all(&hedef_klasor);
            let dosya_adi: String = ad.chars().map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c }).collect();
            match dunyayi_yedekle(&dunya, &hedef_klasor.join(format!("{dosya_adi}.zip"))) {
                Ok(()) => {
                    zamanlar.insert(ad, json!(son));
                    yedeklenen += 1;
                }
                Err(e) => log(format!("Dünya yedeklenemedi ({ad}): {e}")),
            }
        }
        // Eski yedekleri temizle
        if let Ok(d) = std::fs::read_dir(klasor()) {
            let mut l: Vec<PathBuf> = d.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
            l.sort();
            while l.len() > SAKLANAN {
                let _ = std::fs::remove_dir_all(l.remove(0));
            }
        }
        (yedeklenen, zamanlar)
    })
    .await;
    let mut d = json!({ "son": anahtar });
    if let Ok((n, zamanlar)) = sonuc {
        d["dunyalar"] = Value::Object(zamanlar);
        if n > 0 {
            log(format!("{n} dünya yedeklendi."));
        }
    }
    let _ = std::fs::write(durum_dosyasi(), d.to_string());
}
