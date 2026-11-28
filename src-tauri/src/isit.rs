//! Oyun dosyalarını önceden hazırlama: launcher boştayken son açılışta kullanılan jar'ları,
//! modları ve Java'nın modül dosyasını bir kere okur. İşletim sistemi bunları bellekte (dosya
//! önbelleği) tutar; OYNA'dan sonra diskten okuma beklenmez, açılış hızlanır (özellikle HDD'de).
//! Oyun açılırsa hemen durur, en fazla ~900 MB okur, düşük bellekli bilgisayarda hiç çalışmaz.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::ortak::{kullanici_klasoru, log};

fn liste_dosyasi() -> PathBuf {
    kullanici_klasoru().join("hazirlik-listesi.txt")
}

/// Oyun açılırken: kullanılan dosyaları (sınıf yolu, Java, modlar) bir sonraki hazırlık için yaz
pub fn listeyi_yaz(sinif_yolu: &[String], java: &Path, mods: &Path) {
    let mut l: Vec<String> = vec![];
    // Java: modül dosyası ve sanal makine (en büyük ve ilk okunanlar)
    if let Some(kok) = java.parent().and_then(|b| b.parent()) {
        for p in [kok.join("lib").join("modules"), kok.join("bin").join("server").join("jvm.dll")] {
            if p.exists() {
                l.push(p.display().to_string());
            }
        }
    }
    l.extend(sinif_yolu.iter().filter(|x| !x.is_empty()).cloned());
    if let Ok(d) = std::fs::read_dir(mods) {
        for e in d.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("jar") {
                l.push(p.display().to_string());
            }
        }
    }
    let _ = std::fs::write(liste_dosyasi(), l.join("\n"));
}

/// Launcher açıldıktan bir süre sonra arka planda bir kere çalışır
pub fn baslat() {
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(25));
        let a = crate::ayarlar::getir();
        if !a.dosya_isit || crate::oyun::mesgul_mu() || crate::cekirdek::toplam_ram_gb() < 6 {
            return;
        }
        let Ok(m) = std::fs::read_to_string(liste_dosyasi()) else { return };
        const SINIR: u64 = 900 * 1024 * 1024;
        let bas = Instant::now();
        let mut toplam: u64 = 0;
        let mut tampon = vec![0u8; 1 << 20];
        'dis: for satir in m.lines() {
            if crate::oyun::mesgul_mu() {
                break;
            }
            let Ok(mut f) = std::fs::File::open(satir.trim()) else { continue };
            loop {
                match f.read(&mut tampon) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => toplam += n as u64,
                }
                if toplam > SINIR {
                    break 'dis;
                }
            }
            // Diski meşgul etmesin: her dosyadan sonra kısa mola
            std::thread::sleep(Duration::from_millis(4));
        }
        if toplam > 0 {
            log(format!(
                "Oyun dosyaları önceden hazırlandı: {} MB, {:.1} sn.",
                toplam / 1024 / 1024,
                bas.elapsed().as_secs_f32()
            ));
        }
    });
}
