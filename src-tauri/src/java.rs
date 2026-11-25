// Oyunun istediği Java'yı (8, 17, 21, 25…) Adoptium'dan indirip launcher klasörüne kurar.
use crate::ortak::*;
use crate::surumler::ilerleme;
use std::path::{Path, PathBuf};

fn java_bul(klasor: &Path) -> Option<PathBuf> {
    let d = std::fs::read_dir(klasor).ok()?;
    for e in d.flatten() {
        let yol = e.path().join("bin").join(java_programi());
        if yol.exists() {
            return Some(yol);
        }
    }
    None
}

/// Zip dosyasını klasöre açar (yolu klasörün dışına çıkan girdiler atlanır)
pub fn zip_ac(zip: &Path, hedef: &Path) -> Sonuc<()> {
    let f = std::fs::File::open(zip).h()?;
    let mut arsiv = zip::ZipArchive::new(f).h()?;
    for i in 0..arsiv.len() {
        let mut girdi = arsiv.by_index(i).h()?;
        let Some(goreli) = girdi.enclosed_name() else { continue };
        let yol = hedef.join(goreli);
        if girdi.is_dir() {
            std::fs::create_dir_all(&yol).h()?;
        } else {
            if let Some(u) = yol.parent() {
                std::fs::create_dir_all(u).h()?;
            }
            let mut cikti = std::fs::File::create(&yol).h()?;
            std::io::copy(&mut girdi, &mut cikti).h()?;
        }
    }
    Ok(())
}

pub async fn hazirla(surum: u64, ilerleme_surum: &str) -> Sonuc<PathBuf> {
    let klasor = ana_klasor().join("java").join(surum.to_string());
    if let Some(j) = java_bul(&klasor) {
        return Ok(j);
    }
    if surum == 25 {
        if let Some(j) = java_bul(&ana_klasor().join("java25")) {
            return Ok(j);
        }
    }
    std::fs::create_dir_all(&klasor).h()?;
    let windows = cfg!(windows);
    let zip = ana_klasor().join(format!("java{surum}.{}", if windows { "zip" } else { "tar.gz" }));
    let baslik = format!("Java {surum} indiriliyor (sadece bir kere)…");
    ilerleme(ilerleme_surum, 0, &baslik);
    let os = if windows {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    };
    let adres = format!("https://api.adoptium.net/v3/binary/latest/{surum}/ga/{os}/x64/jre/hotspot/normal/eclipse");
    let mut son = std::time::Instant::now();
    let isim = ilerleme_surum.to_string();
    indir(&adres, &zip, None, None, |inen, toplam| {
        if toplam > 0 && son.elapsed().as_millis() > 200 {
            son = std::time::Instant::now();
            ilerleme(&isim, inen * 100 / toplam, &baslik);
        }
    })
    .await?;
    ilerleme(ilerleme_surum, 100, &format!("Java {surum} kuruluyor…"));
    let (z, k) = (zip.clone(), klasor.clone());
    if windows {
        tokio::task::spawn_blocking(move || zip_ac(&z, &k)).await.h()??;
    } else {
        // Linux/macOS: tar.gz, dosya izinleri (çalıştırılabilir) korunsun diye sistemin tar'ı
        let durum = tokio::process::Command::new("tar")
            .arg("-xzf")
            .arg(&z)
            .arg("-C")
            .arg(&k)
            .status()
            .await
            .map_err(|e| format!("Java açılamadı (tar): {e}"))?;
        if !durum.success() {
            return Err(format!("Java {surum} açılamadı."));
        }
    }
    let _ = std::fs::remove_file(&zip);
    java_bul(&klasor).ok_or_else(|| format!("Java {surum} kurulamadı."))
}
