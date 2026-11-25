// Haftalık oyun süresi: oyun açılınca başlar, kapanınca güne eklenir (sure.json, eski sürümle aynı).
use crate::ortak::*;
use chrono::{Datelike, Duration as Gun, Local, NaiveDate, TimeZone};
use serde_json::{json, Map, Value};
use std::sync::{LazyLock, Mutex};

static BASLANGIC: LazyLock<Mutex<Option<chrono::DateTime<Local>>>> = LazyLock::new(|| Mutex::new(None));

fn dosya() -> std::path::PathBuf {
    kullanici_klasoru().join("sure.json")
}

fn oku() -> Map<String, Value> {
    std::fs::read_to_string(dosya())
        .ok()
        .and_then(|m| serde_json::from_str::<Value>(&m).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn anahtar(g: NaiveDate) -> String {
    g.format("%Y-%m-%d").to_string()
}

pub fn basla() {
    *BASLANGIC.lock().unwrap() = Some(Local::now());
}

pub fn bitir() {
    let Some(bas) = BASLANGIC.lock().unwrap().take() else { return };
    let bitis = Local::now();
    let mut veri = oku();
    // Gece yarısını geçen oturumları günlere böl
    let mut t = bas;
    while t < bitis {
        let ertesi = t.date_naive() + Gun::days(1);
        let gun_sonu = Local
            .from_local_datetime(&ertesi.and_hms_opt(0, 0, 0).unwrap())
            .earliest()
            .unwrap_or(bitis);
        let son = if bitis < gun_sonu { bitis } else { gun_sonu };
        let k = anahtar(t.date_naive());
        let dk = (son - t).num_milliseconds() as f64 / 60000.0;
        toplam_ekle(&mut veri, dk);
        let eski = veri.get(&k).and_then(|x| x.as_f64()).unwrap_or(0.0);
        veri.insert(k, json!(eski + dk));
        if son <= t {
            break;
        }
        t = son;
    }
    // 60 günden eski kayıtları temizle
    let sinir = anahtar(Local::now().date_naive() - Gun::days(60));
    veri.retain(|k, _| k.as_str() >= sinir.as_str());
    let _ = std::fs::write(dosya(), Value::Object(veri).to_string());
}

/// Tüm zamanların toplamı "toplam" anahtarında (yoksa eldeki günlerin toplamıyla başlar)
fn toplam_ekle(veri: &mut Map<String, Value>, dk: f64) {
    let eski = match veri.get("toplam").and_then(|x| x.as_f64()) {
        Some(t) => t,
        None => veri.iter().filter(|(k, _)| k.starts_with('2')).filter_map(|(_, v)| v.as_f64()).sum(),
    };
    veri.insert("toplam".into(), json!(eski + dk));
}

/// Profil için: (tüm zamanlar, son 7 gün) dakika
pub fn ozet() -> (i64, i64) {
    let veri = oku();
    let mut toplam = veri
        .get("toplam")
        .and_then(|x| x.as_f64())
        .unwrap_or_else(|| veri.iter().filter(|(k, _)| k.starts_with('2')).filter_map(|(_, v)| v.as_f64()).sum());
    if let Some(b) = *BASLANGIC.lock().unwrap() {
        toplam += (Local::now() - b).num_milliseconds() as f64 / 60000.0;
    }
    let hafta = hafta()["toplam"].as_i64().unwrap_or(0);
    (toplam.round() as i64, hafta)
}

const GUNLER: [&str; 7] = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/// Son 7 gün (bugün dahil) ve önceki 7 günün toplamı
pub fn hafta() -> Value {
    let veri = oku();
    let bugun = Local::now().date_naive();
    let dakika = |g: NaiveDate| veri.get(&anahtar(g)).and_then(|x| x.as_f64()).unwrap_or(0.0);
    let mut gunler = vec![];
    let mut toplam = 0.0;
    let mut onceki = 0.0;
    let acik = *BASLANGIC.lock().unwrap();
    for i in (0..7).rev() {
        let g = bugun - Gun::days(i);
        let mut dk = dakika(g);
        if i == 0 {
            if let Some(b) = acik {
                let gun_basi = Local
                    .from_local_datetime(&bugun.and_hms_opt(0, 0, 0).unwrap())
                    .earliest()
                    .unwrap_or(b);
                let bas = if b > gun_basi { b } else { gun_basi };
                dk += (Local::now() - bas).num_milliseconds() as f64 / 60000.0;
            }
        }
        gunler.push(json!({ "gun": GUNLER[g.weekday().num_days_from_monday() as usize], "dk": dk.round() as i64, "bugun": i == 0 }));
        toplam += dk;
    }
    for i in 7..14 {
        onceki += dakika(bugun - Gun::days(i));
    }
    json!({ "gunler": gunler, "toplam": toplam.round() as i64, "onceki": onceki.round() as i64 })
}
