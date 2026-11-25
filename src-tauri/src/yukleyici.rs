// Mod yükleyiciler: Fabric ve Quilt (hazır profil), Forge ve NeoForge (kurulum dosyası + ForgeWrapper).
use crate::ortak::*;
use crate::surumler::{self, ilerleme, Is};
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;

pub fn ad(tur: &str) -> &'static str {
    match tur {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        _ => "Vanilla",
    }
}

pub enum Ek {
    /// Fabric / Quilt: vanilla'nın üstüne eklenen profil
    Profil(Value),
    /// Forge / NeoForge: kurulumun sürüm bilgisi, kurulum dosyası ve ForgeWrapper
    Forge {
        json: Value,
        kurulum: PathBuf,
        sarmalayici: PathBuf,
    },
}

const FORGE_SARMALAYICI: &str = "https://github.com/ZekerZhayard/ForgeWrapper/releases/download/1.6.0/ForgeWrapper-1.6.0.jar";

pub async fn hazirla(tur: &str, mc: &str) -> Option<Ek> {
    let sonuc = match tur {
        "fabric" | "quilt" => profil(tur, mc).await,
        "forge" | "neoforge" => forge(tur, mc).await,
        _ => return None,
    };
    match sonuc {
        Ok(e) => Some(e),
        Err(h) => {
            log(format!("{} kullanılamadı ({h}). Oyun modsuz açılıyor.", ad(tur)));
            None
        }
    }
}

/* ---------- Fabric / Quilt ---------- */
/// Profil bu kadar eskiyse arka planda yenilenir (oyun yine beklemeden diskteki profille açılır)
const PROFIL_YENILEME: std::time::Duration = std::time::Duration::from_secs(24 * 3600);

/// Diskte bu sürüm için kayıtlı en yeni Fabric/Quilt profili ve yazıldığı zaman
fn yerel_profil(tur: &str, mc: &str) -> Option<(Value, std::time::SystemTime)> {
    let on = format!("{tur}-loader-");
    let son = format!("-{mc}");
    let versions = oyun_klasoru().join("versions");
    std::fs::read_dir(&versions)
        .ok()?
        .flatten()
        .filter_map(|e| {
            let ad = e.file_name().to_string_lossy().to_string();
            if !ad.starts_with(&on) || !ad.ends_with(&son) {
                return None;
            }
            let json = versions.join(&ad).join(format!("{ad}.json"));
            let zaman = std::fs::metadata(&json).and_then(|m| m.modified()).ok()?;
            Some((json, zaman))
        })
        .max_by_key(|(_, z)| *z)
        .and_then(|(json, z)| {
            let p: Value = serde_json::from_str(&std::fs::read_to_string(json).ok()?).ok()?;
            Some((p, z))
        })
}

async fn profil(tur: &str, mc: &str) -> Sonuc<Ek> {
    // Hızlı açılış: diskte profil varsa internete sormadan onu kullan; eskiyse arka planda yenile
    let p = match yerel_profil(tur, mc) {
        Some((p, zaman)) => {
            if zaman.elapsed().map(|e| e > PROFIL_YENILEME).unwrap_or(true) {
                let (t, m) = (tur.to_string(), mc.to_string());
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = profil_indir(&t, &m).await {
                        log(format!("{} profili arka planda yenilenemedi: {e}", ad(&t)));
                    }
                });
            }
            p
        }
        None => profil_indir(tur, mc).await?,
    };
    // Profilin kütüphanelerini indir (varsa atlanır: sadece boyut kontrolü)
    let mut isler = vec![];
    surumler::kutuphane_isleri(&p, &mut isler);
    surumler::hepsini_indir(mc, isler, &format!("{} hazırlanıyor…", ad(tur))).await?;
    Ok(Ek::Profil(p))
}

/// Fabric/Quilt meta sunucusundan en yeni kararlı yükleyicinin profilini indirip diske yazar
async fn profil_indir(tur: &str, mc: &str) -> Sonuc<Value> {
    let meta = if tur == "fabric" {
        "https://meta.fabricmc.net/v2/versions/loader"
    } else {
        "https://meta.quiltmc.org/v3/versions/loader"
    };
    let on = format!("{tur}-loader-");
    let versions = oyun_klasoru().join("versions");
    let sonuc: Sonuc<Value> = async {
        let liste = json_al(&format!("{meta}/{mc}")).await?;
        let liste = liste.as_array().cloned().unwrap_or_default();
        if liste.is_empty() {
            return Err(format!("{mc} için {} yok", ad(tur)));
        }
        let secilen = liste
            .iter()
            .find(|x| {
                let l = &x["loader"];
                l["stable"].as_bool().unwrap_or(false) || !metin(l, "version").to_lowercase().contains("beta")
            })
            .unwrap_or(&liste[0]);
        let loader = metin(&secilen["loader"], "version");
        let p = json_al(&format!("{meta}/{mc}/{loader}/profile/json")).await?;
        let pid = metin(&p, "id");
        let k = versions.join(&pid);
        std::fs::create_dir_all(&k).h()?;
        std::fs::write(k.join(format!("{pid}.json")), serde_json::to_string_pretty(&p).h()?).h()?;
        log(format!("{} {loader} hazır ({pid}).", ad(tur)));
        Ok(p)
    }
    .await;
    let p = match sonuc {
        Ok(p) => p,
        Err(e) => {
            // İnternet yoksa daha önce kaydedilen profili kullan
            let eski = std::fs::read_dir(&versions).ok().and_then(|d| {
                d.flatten()
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .find(|a| a.starts_with(&on) && a.ends_with(&format!("-{mc}")))
            });
            let Some(eski) = eski else { return Err(e) };
            let m = std::fs::read_to_string(versions.join(&eski).join(format!("{eski}.json"))).h()?;
            serde_json::from_str(&m).h()?
        }
    };
    Ok(p)
}

/* ---------- Forge / NeoForge ---------- */
async fn forge_surumu(tur: &str, mc: &str) -> Sonuc<(String, String)> {
    if tur == "forge" {
        let p = json_al("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").await?;
        let v = p["promos"][format!("{mc}-recommended")]
            .as_str()
            .or_else(|| p["promos"][format!("{mc}-latest")].as_str())
            .ok_or_else(|| format!("{mc} için Forge yok"))?
            .to_string();
        let url = format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{v}/forge-{mc}-{v}-installer.jar");
        return Ok((v, url));
    }
    let j = json_al("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge").await?;
    // NeoForge sürüm adı: 1.21.1 -> 21.1.x, 26.2 -> 26.2.x
    let p: Vec<&str> = mc.split('.').collect();
    let on = if p[0] == "1" {
        format!("{}.{}.", p.get(1).unwrap_or(&"0"), p.get(2).unwrap_or(&"0"))
    } else {
        format!("{mc}.")
    };
    let uygun: Vec<String> = j["versions"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .filter(|v| v.starts_with(&on))
        .collect();
    let v = uygun
        .iter()
        .rev()
        .find(|x| !x.to_lowercase().contains("beta") && !x.to_lowercase().contains("alpha"))
        .or(uygun.last())
        .ok_or_else(|| format!("{mc} için NeoForge yok"))?
        .clone();
    let url = format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar");
    Ok((v, url))
}

/// Kurulum dosyasının içinden bir dosya oku
fn jar_icinden(jar: &std::path::Path, ad: &str) -> Sonuc<String> {
    let f = std::fs::File::open(jar).h()?;
    let mut z = zip::ZipArchive::new(f).h()?;
    let mut g = z.by_name(ad).map_err(|_| format!("{ad} kurulum dosyasında yok"))?;
    let mut s = String::new();
    g.read_to_string(&mut s).h()?;
    Ok(s)
}

async fn forge(tur: &str, mc: &str) -> Sonuc<Ek> {
    let klasor = ana_klasor().join("yukleyiciler");
    std::fs::create_dir_all(&klasor).h()?;
    let (surum, url) = match forge_surumu(tur, mc).await {
        Ok(x) => x,
        Err(e) => {
            // İnternet yoksa daha önce indirilen kurulum dosyasını kullan
            let on = format!("{tur}-{mc}-");
            let mut eski: Vec<String> = std::fs::read_dir(&klasor)
                .h()?
                .flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|d| d.starts_with(&on) && d.ends_with(".jar"))
                .collect();
            eski.sort();
            let Some(son) = eski.pop() else { return Err(e) };
            (son[on.len()..son.len() - 4].to_string(), String::new())
        }
    };
    let kurulum = klasor.join(format!("{tur}-{mc}-{surum}.jar"));
    if !kurulum.exists() {
        let baslik = format!("{} indiriliyor…", ad(tur));
        ilerleme(mc, 0, &baslik);
        let isim = mc.to_string();
        indir(&url, &kurulum, None, None, |a, t| {
            if t > 0 {
                ilerleme(&isim, a * 100 / t, &baslik);
            }
        })
        .await?;
    }
    let surum_json: Value = serde_json::from_str(&jar_icinden(&kurulum, "version.json")?).h()?;
    let profil: Value = serde_json::from_str(&jar_icinden(&kurulum, "install_profile.json")?).unwrap_or(Value::Null);

    // ForgeWrapper ve gerekli kütüphaneler
    let kutuphane = oyun_klasoru().join("libraries");
    let sarmalayici = kutuphane.join("io/github/zekerzhayard/ForgeWrapper/1.6.0/ForgeWrapper-1.6.0.jar");
    let mut isler = vec![Is {
        url: FORGE_SARMALAYICI.into(),
        hedef: sarmalayici.clone(),
        sha1: None,
        boyut: None,
    }];
    surumler::kutuphane_isleri(&surum_json, &mut isler);
    if profil.is_object() {
        surumler::kutuphane_isleri(&profil, &mut isler);
    }
    surumler::hepsini_indir(mc, isler, &format!("{} hazırlanıyor…", ad(tur))).await?;
    log(format!("{} {surum} hazır.", ad(tur)));
    Ok(Ek::Forge {
        json: surum_json,
        kurulum,
        sarmalayici,
    })
}
