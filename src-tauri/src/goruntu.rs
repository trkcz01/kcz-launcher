// Ekran görüntüleri: launcher'daki galeri ve oyunda F2'ye basınca panoya otomatik kopyalama.
use crate::ortak::*;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

fn klasor() -> PathBuf {
    oyun_klasoru().join("screenshots")
}

/// Sadece klasördeki bir dosya adı kabul edilir (başka yere ulaşılamasın)
fn guvenli_yol(ad: &str) -> Sonuc<PathBuf> {
    if ad.is_empty() || ad.contains('/') || ad.contains('\\') || ad.contains("..") || !ad.to_lowercase().ends_with(".png") {
        return Err("Geçersiz dosya adı.".into());
    }
    Ok(klasor().join(ad))
}

fn zaman_ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[tauri::command]
pub fn ekran_goruntuleri() -> Value {
    let mut liste: Vec<(u64, String, u64)> = vec![];
    if let Ok(o) = std::fs::read_dir(klasor()) {
        for g in o.flatten() {
            let ad = g.file_name().to_string_lossy().to_string();
            if !ad.to_lowercase().ends_with(".png") {
                continue;
            }
            let Ok(m) = g.metadata() else { continue };
            liste.push((m.modified().map(zaman_ms).unwrap_or(0), ad, m.len()));
        }
    }
    liste.sort_by(|a, b| b.0.cmp(&a.0));
    json!(liste.into_iter().map(|(z, ad, boyut)| json!({ "ad": ad, "zaman": z, "boyut": boyut })).collect::<Vec<_>>())
}

/// Resmin baytları (arayüze ham veri olarak gider, JSON'a çevrilmez)
#[tauri::command]
pub fn ekran_goruntusu_oku(ad: String) -> Result<tauri::ipc::Response, String> {
    let yol = guvenli_yol(&ad)?;
    let veri = std::fs::read(yol).map_err(|_| "Dosya okunamadı.".to_string())?;
    Ok(tauri::ipc::Response::new(veri))
}

fn panoya(app: &AppHandle, yol: &PathBuf) -> Sonuc<()> {
    let veri = std::fs::read(yol).h()?;
    let resim = tauri::image::Image::from_bytes(&veri).h()?;
    app.clipboard().write_image(&resim).h()
}

#[tauri::command]
pub fn ekran_goruntusu_kopyala(app: AppHandle, ad: String) -> Value {
    sonuc_json(guvenli_yol(&ad).and_then(|y| panoya(&app, &y)).map(|_| true))
}

#[tauri::command]
pub fn ekran_goruntusu_sil(ad: String) -> Value {
    sonuc_json(guvenli_yol(&ad).and_then(|y| std::fs::remove_file(y).h()).map(|_| true))
}

#[tauri::command]
pub fn ekran_goruntusu_klasor(app: AppHandle) -> bool {
    use tauri_plugin_opener::OpenerExt;
    let k = klasor();
    let _ = std::fs::create_dir_all(&k);
    app.opener().open_path(k.display().to_string(), None::<&str>).is_ok()
}

/* ---------- Oyun açıkken: yeni ekran görüntüsünü panoya kopyala ---------- */
static IZLIYOR: AtomicBool = AtomicBool::new(false);

/// Oyun açılınca başlar, kapanınca durur. Saniyede bir sadece klasörün değişme zamanına bakar.
pub fn izlemeyi_baslat(app: AppHandle) {
    if !crate::ayarlar::getir().istemci.ss_panoya || IZLIYOR.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let baslangic = zaman_ms(SystemTime::now());
        let mut son_kopyalanan = baslangic;
        let mut son_klasor_zamani = 0u64;
        while IZLIYOR.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(1000)).await;
            let k = klasor();
            let kz = std::fs::metadata(&k).and_then(|m| m.modified()).map(zaman_ms).unwrap_or(0);
            if kz == son_klasor_zamani {
                continue;
            }
            son_klasor_zamani = kz;
            // En yeni png
            let mut en_yeni: Option<(u64, PathBuf)> = None;
            if let Ok(o) = std::fs::read_dir(&k) {
                for g in o.flatten() {
                    let y = g.path();
                    if y.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("png")) != Some(true) {
                        continue;
                    }
                    let z = g.metadata().and_then(|m| m.modified()).map(zaman_ms).unwrap_or(0);
                    if en_yeni.as_ref().map(|(e, _)| z > *e).unwrap_or(true) {
                        en_yeni = Some((z, y));
                    }
                }
            }
            let Some((z, yol)) = en_yeni else { continue };
            if z <= son_kopyalanan {
                continue;
            }
            // Oyun dosyayı yazmayı bitirsin
            tokio::time::sleep(Duration::from_millis(400)).await;
            son_kopyalanan = z;
            match panoya(&app, &yol) {
                Ok(()) => log("Ekran görüntüsü panoya kopyalandı."),
                Err(e) => log(format!("Ekran görüntüsü panoya kopyalanamadı: {e}")),
            }
        }
    });
}

pub fn izlemeyi_durdur() {
    IZLIYOR.store(false, Ordering::SeqCst);
}
