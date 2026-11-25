// Konumlu Anı: ekran görüntüsünü arkadaşa gönder. Fotoğraf küçültülüp JPEG olarak Supabase'e gider,
// yanında not ve çekildiği yer (sunucu, boyut, koordinat) bulunur. Alan taraf launcher'da ya da
// oyunun içinde görür; oyun için PNG'ye çevrilip config/kcz-fotolar klasörüne konur.
use crate::ortak::*;
use crate::sunucu::{kimlik, kimlik_hatasi, rpc};
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
/// Supabase'deki sınır 700.000; biraz pay bırak
const EN_FAZLA: usize = 660_000;

fn ekran_klasoru() -> PathBuf {
    oyun_klasoru().join("screenshots")
}

pub fn foto_klasoru() -> PathBuf {
    oyun_klasoru().join("config").join("kcz-fotolar")
}

/// Sadece screenshots klasöründeki bir .png adı kabul edilir
fn ekran_yolu(ad: &str) -> Sonuc<PathBuf> {
    if ad.is_empty() || ad.contains('/') || ad.contains('\\') || ad.contains("..") || !ad.to_lowercase().ends_with(".png") {
        return Err("Geçersiz dosya adı.".into());
    }
    let y = ekran_klasoru().join(ad);
    if !y.is_file() {
        return Err("Ekran görüntüsü bulunamadı.".into());
    }
    Ok(y)
}

/// Gönderilecek boyuta küçült: önce 1600x900, sığmazsa daha küçük ve daha sıkı
fn kucult(yol: &Path) -> Sonuc<String> {
    let img = image::open(yol).map_err(|e| format!("Fotoğraf açılamadı: {e}"))?;
    for (w, h, q) in [(1600u32, 900u32, 82u8), (1280, 720, 76), (960, 540, 70), (720, 405, 65)] {
        let k = if img.width() > w || img.height() > h { img.resize(w, h, FilterType::Triangle) } else { img.clone() };
        let mut buf = Vec::new();
        JpegEncoder::new_with_quality(&mut buf, q)
            .encode_image(&k.to_rgb8())
            .map_err(|e| format!("Fotoğraf sıkıştırılamadı: {e}"))?;
        let s = B64.encode(&buf);
        if s.len() <= EN_FAZLA {
            return Ok(s);
        }
    }
    Err("Fotoğraf çok büyük.".into())
}

/// bilgi: { not, sunucu, boyut, x, y, z } (hepsi isteğe bağlı)
pub async fn gonder(kime: &str, dosya: &str, bilgi: Value) -> Sonuc<i64> {
    let yol = ekran_yolu(dosya)?;
    let veri = tauri::async_runtime::spawn_blocking(move || kucult(&yol)).await.map_err(|e| e.to_string())??;
    // Bilgiyi temizle: sadece bilinen alanlar, kısa metinler
    let kisa = |k: &str, n: usize| -> Value {
        let s: String = metin(&bilgi, k).chars().take(n).collect();
        if s.trim().is_empty() { Value::Null } else { Value::String(s.trim().to_string()) }
    };
    let sayi = |k: &str| bilgi.get(k).and_then(|v| v.as_f64()).filter(|v| v.is_finite() && v.abs() < 1e8).map(|v| v.round() as i64);
    let mut b = json!({ "not": kisa("not", 200), "sunucu": kisa("sunucu", 120), "boyut": kisa("boyut", 80) });
    if let (Some(x), Some(y), Some(z)) = (sayi("x"), sayi("y"), sayi("z")) {
        b["x"] = json!(x);
        b["y"] = json!(y);
        b["z"] = json!(z);
    }
    let (u, s, _) = kimlik().await?;
    let id = rpc(
        "foto_gonder",
        json!({ "p_uuid": u, "p_sir": s, "p_kime": kime, "p_veri": veri, "p_bilgi": b }),
        None,
    )
    .await
    .map_err(|e| if e.contains("BUYUK") { "Fotoğraf çok büyük.".to_string() } else { kimlik_hatasi(e) })?;
    id.as_i64().ok_or_else(|| "Sunucu cevabı anlaşılamadı.".to_string())
}

/// Mesaj metni "[foto:123]" ise 123
pub fn foto_id(metin: &str) -> Option<i64> {
    metin.strip_prefix("[foto:")?.strip_suffix(']')?.parse().ok().filter(|n: &i64| *n > 0)
}

/// Fotoğrafı getir (diskte varsa oradan): JPEG baytları ve bilgisi
pub async fn al(id: i64) -> Sonuc<(Vec<u8>, Value)> {
    let k = foto_klasoru();
    let jpg = k.join(format!("{id}.jpg"));
    let js = k.join(format!("{id}.json"));
    if let (Ok(v), Ok(b)) = (std::fs::read(&jpg), std::fs::read_to_string(&js)) {
        return Ok((v, serde_json::from_str(&b).unwrap_or(Value::Null)));
    }
    let (u, s, _) = kimlik().await?;
    let l = rpc("foto_al", json!({ "p_uuid": u, "p_sir": s, "p_id": id }), None).await.map_err(kimlik_hatasi)?;
    let r = l.as_array().and_then(|a| a.first().cloned()).ok_or_else(|| "Fotoğraf bulunamadı (7 günden eski olabilir).".to_string())?;
    let veri = B64.decode(metin(&r, "veri")).map_err(|_| "Fotoğraf bozuk.".to_string())?;
    let mut bilgi = r["bilgi"].clone();
    if !bilgi.is_object() {
        bilgi = json!({});
    }
    bilgi["benden"] = r["benden"].clone();
    bilgi["zaman"] = r["zaman"].clone();
    let _ = std::fs::create_dir_all(&k);
    let _ = std::fs::write(&jpg, &veri);
    let _ = std::fs::write(&js, bilgi.to_string());
    eski_temizle(&k);
    Ok((veri, bilgi))
}

/// Oyun için PNG hazırla (oyun JPEG okuyamaz). Yarım dosya okunmasın diye önce geçici adla yazılır.
pub async fn oyun_icin(id: i64) -> Sonuc<()> {
    let png = foto_klasoru().join(format!("{id}.png"));
    if png.exists() {
        return Ok(());
    }
    let (veri, _) = al(id).await?;
    tauri::async_runtime::spawn_blocking(move || -> Sonuc<()> {
        let img = image::load_from_memory(&veri).map_err(|e| e.to_string())?;
        let img = if img.width() > 1280 || img.height() > 720 { img.resize(1280, 720, FilterType::Triangle) } else { img };
        let gecici = png.with_extension("png.tmp");
        img.to_rgba8().save_with_format(&gecici, image::ImageFormat::Png).map_err(|e| e.to_string())?;
        std::fs::rename(&gecici, &png).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 8 günden eski önbellek dosyalarını sil
fn eski_temizle(k: &Path) {
    let Ok(o) = std::fs::read_dir(k) else { return };
    for g in o.flatten() {
        let eski = g
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|d| d.as_secs() > 8 * 86400);
        if eski {
            let _ = std::fs::remove_file(g.path());
        }
    }
}

#[tauri::command]
pub async fn foto_gonder(uuid: String, dosya: String, not: Option<String>) -> Value {
    sonuc_json(gonder(&uuid, &dosya, json!({ "not": not.unwrap_or_default() })).await)
}

#[tauri::command]
pub async fn foto_al(id: i64) -> Value {
    sonuc_json(al(id).await.map(|(v, b)| json!({ "resim": format!("data:image/jpeg;base64,{}", B64.encode(v)), "bilgi": b })))
}
