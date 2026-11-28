//! Otomatik ayar ve performans geçmişi.
//!
//! Her oyundan sonra KCZ Client'ın ölçümüne (config/kcz-oturum.json) bakılır:
//! - Kötü geçtiyse (düşük FPS, sık takılma) bir ayar bir adım hafifletilir: önce bellek
//!   yetmiyorsa RAM, sonra görüş mesafesi, tek oyunculuda simülasyon, en son Düşük sistem modu.
//! - Üst üste iki oyun çok rahat geçtiyse görüş mesafesi bir adım geri artırılır, ama oyuncunun
//!   kendi seçtiği değeri (tavan) asla geçmez. Oyuncu görüşü elle değiştirirse yeni tavan odur.
//! - Her seferinde en fazla bir değişiklik; özet penceresinde "Geri al" ile geri alınır ve
//!   sonraki 3 oyunda otomatik ayar dokunmaz.
//! Geçmiş: ana klasörde performans-gecmisi.json (son 30 oyun, o oyundaki ayarlarla birlikte).

use serde_json::{json, Value};

use crate::ayarlar;
use crate::ortak::{ana_klasor, log};

const GORUS_ALT: i64 = 6;
const SIM_ALT: i64 = 5;
const ADIM: i64 = 2;
const GECMIS_EN_COK: usize = 30;

fn sayi(v: &Value, k: &str) -> f64 {
    v.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}
fn tam(v: &Value, k: &str) -> Option<i64> {
    v.get(k).and_then(Value::as_i64)
}

/// Oyun sonunda çağrılır. Değişiklik yaptıysa {tur, ad, eski, yeni, sebep} döner.
pub fn calistir(p: &Value) -> Option<Value> {
    let a = ayarlar::getir();
    if !a.otomatik_ayar {
        return None;
    }
    let sure = sayi(p, "sure");
    // Kısa oyun güvenilir değil (sadece girip çıkmış)
    if sure < 300.0 || sayi(p, "kare") < 3000.0 {
        return None;
    }
    let ayar = p.get("ayar").cloned().unwrap_or(Value::Null);
    let gorus = tam(&ayar, "gorus")?;
    let sim = tam(&ayar, "simulasyon").unwrap_or(10);
    let mut d = if a.oto_durum.is_object() { a.oto_durum.clone() } else { json!({}) };

    // Oyuncu görüşü/simülasyonu elle değiştirdiyse (son yazdığımızdan farklı) yeni tavan odur
    if tam(&d, "sonGorus") != Some(gorus) {
        d["gorusTavan"] = json!(gorus);
    }
    if tam(&d, "sonSim") != Some(sim) {
        d["simTavan"] = json!(sim);
    }
    d["sonGorus"] = json!(gorus);
    d["sonSim"] = json!(sim);

    let bekle = tam(&d, "bekle").unwrap_or(0);
    if bekle > 0 {
        d["bekle"] = json!(bekle - 1);
        ayarlar::kaydet(&json!({ "otoDurum": d }));
        return None;
    }

    // Hedef: 60 FPS (oyuncu daha düşük bir sınır koyduysa o)
    let sinir = sayi(&ayar, "fpsSiniri");
    let hz = sayi(&ayar, "ekranHz").max(30.0);
    let vsync = ayar.get("vsync").and_then(Value::as_bool).unwrap_or(false);
    let mut ust = if vsync { hz } else if sinir > 0.0 && sinir < 260.0 { sinir } else { 1000.0 };
    // KCZ Client'ın kendi sınırları: Akıllı FPS (Hz / pilde en çok 60), Güçlü sistemde Hz
    match ayar.get("akilliFps").and_then(Value::as_str) {
        Some("hz") => ust = ust.min(hz),
        Some("pil") => ust = ust.min(hz.min(60.0)),
        _ => {}
    }
    if ayar.get("gucluSistem").and_then(Value::as_bool) == Some(true) {
        ust = ust.min(hz);
    }
    let hedef = ust.min(60.0);
    let sinirli = ust <= 75.0;
    let fps = sayi(p, "fps");
    let fps1 = sayi(p, "fps1");
    let takilma_dk = sayi(p, "takilma") / (sure / 60.0);
    let kotu = fps1 < hedef * 0.5 || fps < hedef * 0.8 || takilma_dk > 2.0;
    let cok_iyi = if sinirli {
        fps1 >= ust * 0.95 && takilma_dk < 0.3
    } else {
        fps1 >= hedef * 0.9 && fps >= hedef * 1.4 && takilma_dk < 0.5
    };

    let mut degisim: Option<Value> = None;
    if kotu {
        d["iyiSeri"] = json!(0);
        let sebep = p.get("sebep").cloned().unwrap_or(Value::Null);
        let gc = sayi(&sebep, "gc");
        let bellek = p.get("bellek").map(|b| sayi(b, "enCokYuzde")).unwrap_or(0.0);
        let sistem_ram = crate::cekirdek::toplam_ram_gb();
        let ram_tavan = ((sistem_ram / 2) as u32).clamp(4, 12);
        let tek = ayar.get("tekOyunculu").and_then(Value::as_bool).unwrap_or(false);
        if (gc >= 3.0 && gc * 3.0 >= sayi(p, "takilma") || bellek >= 92.0) && a.ram < ram_tavan {
            let yeni = a.ram + 1;
            ayarlar::kaydet(&json!({ "ram": yeni }));
            degisim = Some(json!({ "tur": "ram", "eski": a.ram, "yeni": yeni, "sebep": "bellek" }));
        } else if gorus > GORUS_ALT {
            let yeni = (gorus - ADIM).max(GORUS_ALT);
            if crate::performans::secenek_yaz("renderDistance", &yeni.to_string())["ok"] == true {
                d["sonGorus"] = json!(yeni);
                degisim = Some(json!({ "tur": "gorus", "eski": gorus, "yeni": yeni, "sebep": "fps" }));
            }
        } else if tek && sim > SIM_ALT {
            let yeni = (sim - ADIM).max(SIM_ALT);
            if crate::performans::secenek_yaz("simulationDistance", &yeni.to_string())["ok"] == true {
                d["sonSim"] = json!(yeni);
                degisim = Some(json!({ "tur": "sim", "eski": sim, "yeni": yeni, "sebep": "fps" }));
            }
        } else if !a.istemci.dusuk_sistem {
            let mut i = a.istemci.clone();
            i.dusuk_sistem = true;
            i.guclu_sistem = false;
            ayarlar::kaydet(&json!({ "istemci": i }));
            degisim = Some(json!({ "tur": "dusukSistem", "eski": false, "yeni": true, "sebep": "fps" }));
        }
    } else if cok_iyi {
        let seri = tam(&d, "iyiSeri").unwrap_or(0) + 1;
        d["iyiSeri"] = json!(seri);
        let tavan = tam(&d, "gorusTavan").unwrap_or(gorus);
        if seri >= 2 && gorus < tavan {
            let yeni = (gorus + ADIM).min(tavan);
            if crate::performans::secenek_yaz("renderDistance", &yeni.to_string())["ok"] == true {
                d["sonGorus"] = json!(yeni);
                d["iyiSeri"] = json!(0);
                degisim = Some(json!({ "tur": "gorus", "eski": gorus, "yeni": yeni, "sebep": "rahat" }));
            }
        }
    } else {
        d["iyiSeri"] = json!(0);
    }
    ayarlar::kaydet(&json!({ "otoDurum": d }));
    if let Some(v) = &degisim {
        log(format!("Otomatik ayar: {v}"));
    }
    degisim
}

/// Özet penceresindeki "Geri al": eski değere dön, 3 oyun boyunca otomatik ayar dokunmasın
pub fn geri_al(tur: &str, eski: &Value) -> Value {
    let a = ayarlar::getir();
    let mut d = if a.oto_durum.is_object() { a.oto_durum.clone() } else { json!({}) };
    let sonuc = match tur {
        "ram" => match eski.as_u64() {
            Some(r) => {
                ayarlar::kaydet(&json!({ "ram": r }));
                json!({ "ok": true })
            }
            None => json!({ "ok": false }),
        },
        "gorus" | "sim" => match eski.as_i64() {
            Some(v) => {
                let anahtar = if tur == "gorus" { "renderDistance" } else { "simulationDistance" };
                let r = crate::performans::secenek_yaz(anahtar, &v.to_string());
                if r["ok"] == true {
                    d[if tur == "gorus" { "sonGorus" } else { "sonSim" }] = json!(v);
                }
                r
            }
            None => json!({ "ok": false }),
        },
        "dusukSistem" => {
            let mut i = a.istemci.clone();
            i.dusuk_sistem = false;
            ayarlar::kaydet(&json!({ "istemci": i }));
            json!({ "ok": true })
        }
        _ => json!({ "ok": false }),
    };
    if sonuc["ok"] == true {
        d["bekle"] = json!(3);
        d["iyiSeri"] = json!(0);
        ayarlar::kaydet(&json!({ "otoDurum": d }));
        log(format!("Otomatik ayar geri alındı: {tur} = {eski}"));
    }
    sonuc
}

fn gecmis_dosyasi() -> std::path::PathBuf {
    ana_klasor().join("performans-gecmisi.json")
}

pub fn gecmis() -> Value {
    std::fs::read_to_string(gecmis_dosyasi())
        .ok()
        .and_then(|m| serde_json::from_str::<Value>(&m).ok())
        .and_then(|v| v.get("liste").cloned())
        .filter(Value::is_array)
        .unwrap_or_else(|| json!([]))
}

/// Oyunu geçmişe ekle: ölçüm + o oyundaki ayarlar (oyun içi ve launcher) + otomatik değişiklik
pub fn gecmise_ekle(p: &Value, otomatik: Option<&Value>, sunucu: Option<String>) {
    let a = ayarlar::getir();
    let oyun = p.get("ayar").cloned().unwrap_or(Value::Null);
    let mut kayit = json!({
        "bitis": p.get("bitis"),
        "sure": p.get("sure"),
        "fps": p.get("fps"),
        "fps1": p.get("fps1"),
        "takilma": p.get("takilma"),
        "enUzunMs": p.get("enUzunMs"),
        "ayar": {
            "gorus": oyun.get("gorus"),
            "simulasyon": oyun.get("simulasyon"),
            "vsync": oyun.get("vsync"),
            "fpsSiniri": oyun.get("fpsSiniri"),
            "ram": a.ram,
            "dusukSistem": oyun.get("dusukSistem"),
            "akilliFps": oyun.get("akilliFps"),
            "javaYeni": a.java_yeni,
            "gucluCekirdek": a.guclu_cekirdek,
        },
    });
    if let Some(s) = sunucu {
        kayit["sunucu"] = json!(s);
    }
    if let Some(o) = otomatik {
        kayit["otomatik"] = o.clone();
    }
    let mut liste = gecmis().as_array().cloned().unwrap_or_default();
    // Aynı oyun iki kez yazılmasın
    if liste.last().and_then(|x| x.get("bitis")) != Some(&kayit["bitis"]) {
        liste.push(kayit);
    }
    let fazla = liste.len().saturating_sub(GECMIS_EN_COK);
    liste.drain(..fazla);
    if let Ok(m) = serde_json::to_string(&json!({ "liste": liste })) {
        let _ = std::fs::write(gecmis_dosyasi(), m);
    }
}
