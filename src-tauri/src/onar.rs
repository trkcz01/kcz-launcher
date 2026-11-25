// "Onar": oyun açılmıyor ya da çöküyorsa tek tıkla güvenli onarımlar. Sırayla:
//  1) Mod yükleyici önbelleği (.fabric, .quilt, .mixin.out) silinir; oyun açılışta yeniden oluşturur
//  2) Seçili sürümün oyun dosyaları doğrulanır, eksik ya da bozuk olanlar yeniden indirilir
//  3) Java çalıştırılıp denenir; çalışmıyorsa (launcher'ın indirdiği Java ise) silinip yeniden indirilir
// Daha ileri adımlar ayrı düğmelerle: modsuz deneme (oyun.rs) ve oyun ayarlarını sıfırlama (aşağıda).
use crate::ortak::*;
use std::path::Path;
use std::time::Duration;

pub async fn onar(mc: &str) -> Sonuc<Vec<String>> {
    let mut yapilan: Vec<String> = vec![];
    let kok = oyun_klasoru();

    // 1) Mod yükleyici önbelleği
    let mut silinen = 0;
    for ad in [".fabric", ".quilt", ".mixin.out"] {
        let k = kok.join(ad);
        if k.exists() && std::fs::remove_dir_all(&k).is_ok() {
            silinen += 1;
        }
    }
    yapilan.push(if silinen > 0 { "mod yükleyici önbelleği temizlendi" } else { "önbellek zaten temizdi" }.into());

    // 2) Oyun dosyaları: yükleme yeniden çalışır, sağlam dosyalar atlanır, eksik/bozuk olanlar iner
    log(format!("Onar: {mc} dosyaları doğrulanıyor"));
    let json = crate::surumler::yukle(mc)
        .await
        .map_err(|e| format!("Oyun dosyaları doğrulanamadı: {e}"))?;
    yapilan.push("oyun dosyaları doğrulandı".into());

    // 3) Java
    let surum = crate::surumler::java_surumu(&json);
    let java = crate::java::hazirla(surum, mc).await?;
    if java_calisiyor(&java).await {
        yapilan.push("Java sağlam".into());
    } else {
        let bizim = ana_klasor().join("java").join(surum.to_string());
        if java.starts_with(&bizim) {
            log(format!("Onar: Java {surum} çalışmıyor, yeniden indiriliyor"));
            let _ = std::fs::remove_dir_all(&bizim);
            let yeni = crate::java::hazirla(surum, mc).await?;
            if java_calisiyor(&yeni).await {
                yapilan.push("Java yeniden indirildi".into());
            } else {
                return Err("Java yeniden indirildi ama yine çalışmıyor. Antivirüs engelliyor olabilir.".into());
            }
        } else {
            return Err(format!("Java çalışmıyor: {}", java.display()));
        }
    }
    log(format!("Onar bitti: {}", yapilan.join(", ")));
    Ok(yapilan)
}

/// `java -version` 20 saniye içinde başarıyla bitiyor mu?
async fn java_calisiyor(java: &Path) -> bool {
    let mut k = tokio::process::Command::new(java);
    k.arg("-version").stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    k.creation_flags(PENCERESIZ);
    match tokio::time::timeout(Duration::from_secs(20), k.status()).await {
        Ok(Ok(d)) => d.success(),
        _ => false,
    }
}

/// Oyun ayarlarını (options.txt) sıfırlar: eskisi tarihli adla yedeklenir, oyun açılışta yenisini oluşturur.
pub fn ayarlari_sifirla() -> Sonuc<String> {
    let yol = oyun_klasoru().join("options.txt");
    if !yol.exists() {
        return Ok("Oyun ayarları zaten varsayılan.".into());
    }
    let yedek = format!("options.txt.yedek-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    std::fs::rename(&yol, oyun_klasoru().join(&yedek)).map_err(|e| format!("Ayarlar sıfırlanamadı: {e}"))?;
    log(format!("Oyun ayarları sıfırlandı, eskisi: {yedek}"));
    Ok(yedek)
}
