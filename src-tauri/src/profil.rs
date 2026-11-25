// Profil paylaşma kodu: bir profil (ad, ikon, sürüm, yükleyici, modlar) kısa bir koda dönüşür.
// Arkadaşın kodu yapıştırınca aynı profil oluşur ve modlar Modrinth'ten kurulur.
use crate::ortak::*;
use crate::{ayarlar, modlar};
use base64::Engine;
use serde_json::{json, Value};

const ON_EK: &str = "KCZ1-";
const KODLAMA: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;

pub fn kod_olustur(id: &str) -> Sonuc<String> {
    let a = ayarlar::getir();
    let p = a.profiller.iter().find(|x| x.id == id).ok_or("Profil bulunamadı.")?;
    let mut projeler: Vec<String> = vec![];
    if p.yukleyici != "vanilla" {
        for m in modlar::liste("mod", &p.surum, &p.yukleyici, Some(&format!("profil:{id}"))) {
            let pr = metin(&m, "proje");
            // Yan modlar (Fabric API gibi) kurulurken zaten gelir
            if !pr.is_empty() && !m["yan"].as_bool().unwrap_or(false) && m["acik"].as_bool().unwrap_or(true) {
                projeler.push(pr);
            }
        }
    }
    let j = json!({ "a": p.ad, "i": p.ikon, "s": p.surum, "y": p.yukleyici, "m": projeler });
    Ok(format!("{ON_EK}{}", KODLAMA.encode(j.to_string())))
}

fn coz(kod: &str) -> Sonuc<Value> {
    let kod: String = kod.trim().chars().filter(|c| !c.is_whitespace()).collect();
    let govde = kod
        .strip_prefix(ON_EK)
        .ok_or("Bu bir KCZ profil kodu değil (KCZ1- ile başlamalı).")?;
    if govde.len() > 20_000 {
        return Err("Kod çok uzun.".into());
    }
    let b = KODLAMA
        .decode(govde)
        .map_err(|_| "Kod bozuk ya da eksik kopyalanmış.".to_string())?;
    serde_json::from_slice::<Value>(&b).map_err(|_| "Kod bozuk ya da eksik kopyalanmış.".to_string())
}

pub fn ice_aktar(kod: &str) -> Sonuc<Value> {
    let j = coz(kod)?;
    let surum = metin(&j, "s").trim().to_string();
    let yukleyici = metin(&j, "y");
    if !ayarlar::surum_gecerli(&surum) {
        return Err("Koddaki sürüm geçersiz.".into());
    }
    if !["vanilla", "fabric", "quilt", "forge", "neoforge"].contains(&yukleyici.as_str()) {
        return Err("Koddaki yükleyici geçersiz.".into());
    }
    let ad: String = metin(&j, "a").trim().chars().take(32).collect();
    let ad = if ad.is_empty() { format!("Profil {surum}") } else { ad };
    let ikon = metin(&j, "i");
    let projeler: Vec<String> = j["m"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|x| x.as_str().map(String::from))
        .filter(|x| !x.is_empty() && x.len() <= 64 && x.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .take(150)
        .collect();

    let id: String = uuid::Uuid::new_v4().simple().to_string().chars().take(12).collect();
    let a = ayarlar::getir();
    let mut liste = serde_json::to_value(&a.profiller).unwrap_or(json!([]));
    if let Some(l) = liste.as_array_mut() {
        l.push(json!({ "id": id, "ad": ad, "ikon": ikon, "surum": surum, "yukleyici": yukleyici }));
    }
    ayarlar::kaydet(&json!({ "profiller": liste, "seciliProfil": id, "aktifSecim": "profil" }));

    // Modları arka planda sırayla kur
    let n = projeler.len();
    if n > 0 && yukleyici != "vanilla" {
        let (id2, surum2, y2, ad2) = (id.clone(), surum.clone(), yukleyici.clone(), ad.clone());
        tauri::async_runtime::spawn(async move {
            let anahtar = format!("profil:{id2}");
            let mut tamam = 0;
            for (i, p) in projeler.iter().enumerate() {
                gonder("mod-durum", format!("{ad2}: mod kuruluyor ({}/{n})…", i + 1));
                match modlar::yukle(p, "mod", &surum2, &y2, Some(&anahtar)).await {
                    Ok(_) => tamam += 1,
                    Err(e) => log(format!("Profil modu kurulamadı ({p}): {e}")),
                }
            }
            gonder("mod-durum", format!("{ad2} hazır: {tamam}/{n} mod kuruldu ✓"));
        });
    }
    Ok(json!({ "ok": true, "id": id, "ad": ad, "modSayisi": n }))
}
