// KCZ sunucusu (Supabase): isimsiz kullanım sayımı, öneri/hata bildirimi ve yönetim paneli.
// Sunucu adresi ve herkese açık (anon) anahtar aşağıda. Boşken bu özellikler sessizce kapalı kalır.
use crate::ortak::*;
use serde_json::{json, Value};
use std::sync::{LazyLock, Mutex};

const ADRES: &str = "https://rpvzvxqjsyfouskbjsgw.supabase.co";
const ANAHTAR: &str = "sb_publishable_JakN2SJVWmkGM6VaHr-D5Q_d1lQYQLB";

const KASA_SERVIS: &str = "KCZ Launcher";
const KASA_HESAP: &str = "yonetici-oturumu";

fn bagli() -> bool {
    !ADRES.is_empty() && !ANAHTAR.is_empty()
}

fn bagli_degil<T>() -> Sonuc<T> {
    Err("Sunucu henüz bağlanmadı.".into())
}

/* ---------- Kurulum kimliği (rastgele, kişisel bilgi yok) ---------- */
pub fn kurulum_kimligi() -> String {
    let yol = kullanici_klasoru().join("kurulum-kimligi");
    if let Ok(m) = std::fs::read_to_string(&yol) {
        let m = m.trim().to_string();
        if uuid::Uuid::parse_str(&m).is_ok() {
            return m;
        }
    }
    let yeni = uuid::Uuid::new_v4().to_string();
    let _ = std::fs::write(&yol, &yeni);
    yeni
}

fn surum() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/* ---------- İstek ---------- */
pub(crate) async fn rpc(ad: &str, govde: Value, belirtec: Option<&str>) -> Sonuc<Value> {
    if !bagli() {
        return bagli_degil();
    }
    let mut istek = ISTEMCI.post(format!("{ADRES}/rest/v1/rpc/{ad}")).header("apikey", ANAHTAR);
    // Yeni (sb_publishable_) anahtar JWT değil: girişsiz isteklerde Authorization gönderilmez
    if let Some(b) = belirtec {
        istek = istek.bearer_auth(b);
    }
    let r = istek
        .timeout(std::time::Duration::from_secs(20))
        .json(&govde)
        .send()
        .await
        .map_err(|_| "Sunucuya bağlanılamadı.".to_string())?;
    let kod = r.status().as_u16();
    let metin = r.text().await.unwrap_or_default();
    if kod == 401 || kod == 403 {
        return Err("OTURUM".into());
    }
    if !(200..300).contains(&kod) {
        let v: Value = serde_json::from_str(&metin).unwrap_or(Value::Null);
        let m = v.get("message").and_then(|x| x.as_str()).unwrap_or("").to_string();
        return Err(if m.is_empty() { format!("Sunucu hatası ({kod})") } else { m });
    }
    Ok(serde_json::from_str(&metin).unwrap_or(Value::Null))
}

async fn auth(yol: &str, govde: Value) -> Sonuc<Value> {
    if !bagli() {
        return bagli_degil();
    }
    let r = ISTEMCI
        .post(format!("{ADRES}/auth/v1/{yol}"))
        .header("apikey", ANAHTAR)
        .timeout(std::time::Duration::from_secs(20))
        .json(&govde)
        .send()
        .await
        .map_err(|_| "Sunucuya bağlanılamadı.".to_string())?;
    let kod = r.status().as_u16();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    if !(200..300).contains(&kod) {
        let m = ["msg", "error_description", "message"]
            .iter()
            .find_map(|k| v.get(*k).and_then(|x| x.as_str()))
            .unwrap_or("")
            .to_string();
        return Err(match m.as_str() {
            "" => format!("Sunucu hatası ({kod})"),
            x if x.contains("expired") || x.contains("invalid") => "Kod yanlış ya da süresi dolmuş.".into(),
            x if x.contains("rate limit") || x.contains("seconds") => "Çok sık denendi, bir dakika bekle.".into(),
            x => x.into(),
        });
    }
    Ok(v)
}

/* ---------- Kullanım sayımı ---------- */
/// Oyun açıkken bağlanılan sunucu (arkadaşlar görsün diye); oyun kapalıyken None
static OYUN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Oyun açılınca / kapanınca çağrılır: durum hemen güncellenir
pub fn oyun_durumu(acik: bool, sunucu: Option<String>) {
    *OYUN.lock().unwrap() = if acik { Some(sunucu.unwrap_or_default()) } else { None };
    tauri::async_runtime::spawn(kalp_atisi());
    if acik {
        oyun_kopru_baslat();
        ses_kopru_baslat();
    }
}

pub async fn kalp_atisi() {
    let a = crate::ayarlar::getir();
    if !bagli() || (!a.istatistik_gonder && !a.durum_paylas) {
        return;
    }
    let (ad, uuid) = crate::hesap::mevcut().unwrap_or_default();
    let oyun = OYUN.lock().unwrap().clone();
    let paylas = a.durum_paylas && !ad.is_empty();
    let yeni = rpc(
        "kalp_atisi2",
        json!({
            "p_id": kurulum_kimligi(), "p_surum": surum(), "p_os": os_adi(),
            "p_mc_uuid": if uuid.is_empty() { Value::Null } else { json!(uuid) },
            "p_mc_ad": ad, "p_oyunda": oyun.is_some(), "p_sunucu": oyun.unwrap_or_default(), "p_paylas": paylas
        }),
        None,
    )
    .await;
    // Sunucuda 3. güncelleme henüz yoksa eski haliyle say
    if yeni.is_err() && a.istatistik_gonder {
        let _ = rpc(
            "kalp_atisi",
            json!({ "p_id": kurulum_kimligi(), "p_surum": surum(), "p_os": os_adi() }),
            None,
        )
        .await;
    }
}

/* ---------- 6 haneli oyuncu ID'si ve arkadaşlık istekleri ---------- */
// Her hesap için bu bilgisayarda rastgele bir gizli anahtar tutulur; sunucu ID'yi ona bağlar.
static KODLAR: LazyLock<Mutex<std::collections::HashMap<String, String>>> = LazyLock::new(Default::default);

fn sir(uuid: &str) -> String {
    let yol = kullanici_klasoru().join("kimlik-sirlari.json");
    let mut m: serde_json::Map<String, Value> = std::fs::read_to_string(&yol)
        .ok()
        .and_then(|x| serde_json::from_str(&x).ok())
        .unwrap_or_default();
    if let Some(s) = m.get(uuid).and_then(|x| x.as_str()) {
        return s.to_string();
    }
    let yeni = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    m.insert(uuid.to_string(), json!(yeni));
    let _ = std::fs::write(&yol, Value::Object(m).to_string());
    yeni
}

pub(crate) fn kimlik_hatasi(e: String) -> String {
    let c = |k: &str| e.contains(k);
    if c("KOD_YOK") {
        "Bu ID'ye sahip bir oyuncu yok. Numarayı kontrol et.".into()
    } else if c("KENDIN") {
        "Bu senin kendi ID'n.".into()
    } else if c("ZATEN") {
        "Bu oyuncuya zaten istek gönderdin ya da zaten arkadaşsınız.".into()
    } else if c("DEGIL_ARKADAS") {
        "Sadece arkadaşlarına mesaj atabilirsin.".into()
    } else if c("COK_HIZLI") {
        "Çok hızlı yazıyorsun, biraz bekle.".into()
    } else if c("BOS") {
        "Boş mesaj gönderilemez.".into()
    } else if c("ODADA_DEGIL") {
        "Oyuncu artık aynı sunucuda değil.".into()
    } else if c("SUNUCU_YOK") {
        "Davet için bir sunucu seçili olmalı.".into()
    } else if c("COK_FAZLA") {
        "Çok fazla bekleyen isteğin var.".into()
    } else if c("BUYUK") {
        "Dosya çok büyük.".into()
    } else if c("KIMLIK_BASKA") {
        "Bu hesabın ID'si başka bir bilgisayardaki launcher'a bağlı.".into()
    } else if c("Could not find the function") || c("does not exist") {
        "Sunucu henüz güncellenmedi (guncelleme-4.sql çalıştırılmalı).".into()
    } else {
        e
    }
}

/// Giriş yapılmış hesabın (uuid, gizli anahtar, ID)
pub(crate) async fn kimlik() -> Sonuc<(String, String, String)> {
    let (ad, uuid) = crate::hesap::mevcut().ok_or("Önce Microsoft hesabınla giriş yap.")?;
    let s = sir(&uuid);
    if let Some(k) = KODLAR.lock().unwrap().get(&uuid).cloned() {
        return Ok((uuid, s, k));
    }
    let k = rpc("kimlik_al", json!({ "p_uuid": uuid, "p_ad": ad, "p_sir": s }), None)
        .await
        .map_err(kimlik_hatasi)?;
    let k = k.as_str().unwrap_or_default().to_string();
    if k.len() != 6 {
        return Err("ID alınamadı.".into());
    }
    KODLAR.lock().unwrap().insert(uuid.clone(), k.clone());
    Ok((uuid, s, k))
}

#[tauri::command]
pub async fn kimlik_kodu() -> Value {
    sonuc_json(kimlik().await.map(|(_, _, k)| k))
}

#[tauri::command]
pub async fn arkadas_istek_gonder(kod: String) -> Value {
    let s = async {
        let kod: String = kod.chars().filter(|c| c.is_ascii_digit()).collect();
        if kod.len() != 6 {
            return Err("ID 6 haneli bir sayı olmalı.".to_string());
        }
        let (u, s, _) = kimlik().await?;
        let r = rpc("istek_gonder", json!({ "p_uuid": u, "p_sir": s, "p_kod": kod }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(r.as_str().unwrap_or("gonderildi").to_string())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn arkadas_listesi() -> Value {
    let s = async {
        let (u, s, k) = kimlik().await?;
        let l = rpc("arkadas_listesi", json!({ "p_uuid": u, "p_sir": s }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(json!({ "kod": k, "liste": l }))
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn arkadas_istek_yanit(uuid: String, kabul: bool) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("istek_yanit", json!({ "p_uuid": u, "p_sir": s, "p_kimden": uuid, "p_kabul": kabul }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn arkadas_cikar(uuid: String) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("arkadas_cikar", json!({ "p_uuid": u, "p_sir": s, "p_diger": uuid }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn mesaj_gonder(uuid: String, metin: String) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        let id = rpc("mesaj_gonder", json!({ "p_uuid": u, "p_sir": s, "p_kime": uuid, "p_metin": metin }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(id)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn mesajlari_al(uuid: String, sonra: i64) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("mesajlari_al", json!({ "p_uuid": u, "p_sir": s, "p_kim": uuid, "p_sonra": sonra }), None)
            .await
            .map_err(kimlik_hatasi)
    }
    .await;
    sonuc_json(s)
}

/* ---------- Profil, oynama süresi, davet ---------- */
#[tauri::command]
pub async fn profil_al(uuid: Option<String>) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        // Kendi profilinde süre taze olsun
        if uuid.is_none() {
            let _ = sure_gonder().await;
        }
        let l = rpc("profil_al", json!({ "p_uuid": u, "p_sir": s, "p_kim": uuid }), None)
            .await
            .map_err(kimlik_hatasi)?;
        l.as_array().and_then(|x| x.first().cloned()).ok_or_else(|| "Profil bulunamadı.".to_string())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn profil_kaydet(hakkinda: String) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("profil_kaydet", json!({ "p_uuid": u, "p_sir": s, "p_hakkinda": hakkinda }), None)
            .await
            .map_err(kimlik_hatasi)?;
        Ok(())
    }
    .await;
    sonuc_json(s)
}

/// Oynama süresini sunucuya bildirir (profilde arkadaşlar görsün)
pub async fn sure_gonder() -> Sonuc<()> {
    if crate::hesap::mevcut().is_none() {
        return Ok(());
    }
    let (u, s, _) = kimlik().await?;
    let (toplam, hafta) = crate::sure::ozet();
    rpc("sure_bildir", json!({ "p_uuid": u, "p_sir": s, "p_toplam": toplam, "p_hafta": hafta }), None)
        .await
        .map_err(kimlik_hatasi)?;
    Ok(())
}

/// Davet edilecek sunucu: oyun açıksa bağlanılan, değilse launcher'da seçili sunucu
fn davet_sunucusu(istenen: Option<String>) -> Option<String> {
    istenen
        .filter(|x| !x.trim().is_empty())
        .or_else(|| OYUN.lock().unwrap().clone().filter(|x| !x.is_empty()))
        .or_else(|| {
            let a = crate::ayarlar::getir();
            (!a.secili_sunucu.is_empty()).then_some(a.secili_sunucu)
        })
}

async fn davet_et(kime: &str, sunucu: Option<String>) -> Sonuc<String> {
    let sunucu = davet_sunucusu(sunucu).ok_or("Davet için bir sunucu seçili olmalı.")?;
    let (u, s, _) = kimlik().await?;
    rpc("davet_gonder", json!({ "p_uuid": u, "p_sir": s, "p_kime": kime, "p_sunucu": sunucu }), None)
        .await
        .map_err(kimlik_hatasi)?;
    Ok(sunucu)
}

#[tauri::command]
pub async fn davet_gonder(uuid: String, sunucu: Option<String>) -> Value {
    sonuc_json(davet_et(&uuid, sunucu).await)
}

async fn yeni_davetler() -> Sonuc<Vec<Value>> {
    let (u, s, _) = kimlik().await?;
    let v = rpc("davetleri_al", json!({ "p_uuid": u, "p_sir": s }), None)
        .await
        .map_err(kimlik_hatasi)?;
    Ok(v.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn davetleri_al() -> Value {
    sonuc_json(yeni_davetler().await)
}

/// Oyundaki hesap değişimi: geçerli oturumu tek seferlik dosyaya yazar (oyun okur okumaz siler,
/// okunmazsa köprü 60 sn sonra siler).
async fn hesap_oturumu_yaz(dosya: &std::path::Path, id: u64) -> Result<(), String> {
    let o = crate::hesap::yetki()
        .await
        .ok_or_else(|| "Hesaba giriş yapılamadı, launcher'dan tekrar ekle.".to_string())?;
    if o.erisim.is_empty() {
        return Err("Çevrimdışı hesaba oyun içinden geçilemez.".into());
    }
    let veri = json!({ "id": id, "ad": o.ad, "uuid": o.uuid, "erisim": o.erisim });
    let gecici = dosya.with_extension("json.tmp");
    std::fs::write(&gecici, veri.to_string()).map_err(|e| format!("Oturum yazılamadı: {e}"))?;
    std::fs::rename(&gecici, dosya).map_err(|e| format!("Oturum yazılamadı: {e}"))
}

/// Giriş sayfasını varsayılan tarayıcıda aç (oyundaki hesap menüsü için)
fn tarayici_ac(adres: &str) {
    if let Some(a) = UYGULAMA.get() {
        crate::hesap::edge_ac(a, adres);
    }
}

/* ---------- Oyun içi köprü (KCZ Client) ----------
   Oyun açıkken launcher arkadaş listesini ve gelen davetleri config/kcz-arkadaslar.json'a yazar;
   oyundaki menüden yapılan davetler config/kcz-davet-istek.json'dan okunup gönderilir. */
static KOPRU: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn oyun_kopru_baslat() {
    if KOPRU.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async {
        use std::collections::{HashMap, HashSet};
        let config = oyun_klasoru().join("config");
        let _ = std::fs::create_dir_all(&config);
        let cikis = config.join("kcz-arkadaslar.json");
        let istek = config.join("kcz-davet-istek.json");
        let mut davetler: Vec<(u64, Value)> = vec![];
        let mut bildirimler: Vec<Value> = vec![];
        // Oyun içi sohbet: arkadaş başına son mesajlar, son görülen mesaj, oyunda gösterilecek yeni mesajlar
        let mut sohbetler: HashMap<String, Vec<Value>> = HashMap::new();
        let mut son_id: HashMap<String, i64> = HashMap::new();
        let mut yeni_mesajlar: Vec<Value> = vec![];
        let mut arkadaslar: Vec<Value> = vec![];
        let mut sayac: u64 = 0;
        let mut foto_denenen: HashSet<i64> = HashSet::new();
        // Oyun içi hesap değiştirme / ekleme (KCZ Client "Hesap" menüsü)
        let oturum_dosyasi = config.join("kcz-hesap-oturum.json");
        let mut hesap_giris: Value = Value::Null;
        let mut hesap_sonuc: Value = Value::Null;
        let mut giris_id: u64 = 0;
        let mut oturum_zamani: Option<std::time::Instant> = None;
        // Oyunda tab listesindeki KÇZ kullanıcıları (ad + uuid); oyun dakikada bir sorar
        let mut kcz_oyuncular: Vec<Value> = vec![];
        *crate::hesap::OYUN_GIRIS.lock().unwrap() = None;
        while OYUN.lock().unwrap().is_some() {
            let simdi = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let mut getir: HashSet<String> = HashSet::new();
            // Oyundan gelen istekler: davet, mesaj, sohbet geçmişi
            if let Ok(m) = std::fs::read_to_string(&istek) {
                let _ = std::fs::remove_file(&istek);
                let liste: Vec<Value> = serde_json::from_str(&m).unwrap_or_default();
                for d in liste.iter().take(20) {
                    let kime = metin(d, "kime");
                    let ad = metin(d, "ad");
                    match metin(d, "tur").as_str() {
                        "mesaj" => {
                            let yazi = metin(d, "metin");
                            let sonuc = async {
                                let (u, s, _) = kimlik().await?;
                                rpc("mesaj_gonder", json!({ "p_uuid": u, "p_sir": s, "p_kime": kime, "p_metin": yazi }), None)
                                    .await
                                    .map_err(kimlik_hatasi)
                            }
                            .await;
                            if let Err(e) = sonuc {
                                sayac += 1;
                                bildirimler.push(json!({ "id": sayac, "metin": format!("Mesaj gönderilemedi: {e}") }));
                            }
                            getir.insert(kime);
                        }
                        "gecmis" => {
                            getir.insert(kime);
                        }
                        // Konumlu Anı: oyunda F2 ile çekilen fotoğraf
                        "foto" => {
                            let bilgi = json!({ "not": d["not"], "sunucu": d["sunucu"], "boyut": d["boyut"],
                                                "x": d["x"], "y": d["y"], "z": d["z"] });
                            sayac += 1;
                            let m = match crate::foto::gonder(&kime, &metin(d, "dosya"), bilgi).await {
                                Ok(_) => format!("Fotoğraf {ad} adlı arkadaşına gönderildi."),
                                Err(e) => format!("Fotoğraf gönderilemedi: {e}"),
                            };
                            bildirimler.push(json!({ "id": sayac, "metin": m }));
                            getir.insert(kime);
                        }
                        // Oyundaki hesap menüsü: kayıtlı başka hesaba geç
                        "hesap_gec" => {
                            let id = d["id"].as_u64().unwrap_or(0);
                            let r = crate::hesap::hesaba_gec(&metin(d, "uuid")).await;
                            hesap_sonuc = if r["girisli"].as_bool() == Some(true) {
                                // Launcher arayüzü de yeni hesabı göstersin (hata olursa arayüz olduğu gibi kalır)
                                gonder("hesap-sonuc", r.clone());
                                match hesap_oturumu_yaz(&oturum_dosyasi, id).await {
                                    Ok(()) => {
                                        oturum_zamani = Some(std::time::Instant::now());
                                        json!({ "id": id })
                                    }
                                    Err(e) => json!({ "id": id, "hata": e }),
                                }
                            } else {
                                let h = metin(&r, "hata");
                                let h = if h.is_empty() { "Hesaba geçilemedi, launcher'dan tekrar ekle.".to_string() } else { h };
                                json!({ "id": id, "hata": h })
                            };
                        }
                        // Oyundaki hesap menüsü: yeni hesap ekle (tarayıcıda cihaz koduyla giriş)
                        "hesap_ekle" => {
                            giris_id = d["id"].as_u64().unwrap_or(0);
                            *crate::hesap::OYUN_GIRIS.lock().unwrap() = None;
                            hesap_giris = match crate::hesap::tarayici_baslat_ic(true).await {
                                Ok((kod, adres)) => {
                                    tarayici_ac(&adres);
                                    json!({ "id": giris_id, "durum": "kod", "kod": kod, "adres": adres })
                                }
                                Err(e) => json!({ "id": giris_id, "durum": "hata", "hata": e }),
                            };
                        }
                        "hesap_tarayici" => {
                            let adres = metin(&hesap_giris, "adres");
                            if !adres.is_empty() {
                                tarayici_ac(&adres);
                            }
                        }
                        "hesap_iptal" => {
                            crate::hesap::tarayici_iptal();
                            hesap_giris = Value::Null;
                        }
                        // Tab listesindeki isimlerden hangileri şu an KÇZ ile oyunda? (durum paylaşanlar)
                        "kcz_kimler" => {
                            let adlar: Vec<String> = d["adlar"]
                                .as_array()
                                .map(|l| l.iter().filter_map(|x| x.as_str().map(String::from)).take(200).collect())
                                .unwrap_or_default();
                            let mut bulunan: Vec<Value> = vec![];
                            for parca in adlar.chunks(100) {
                                if let Ok(l) = rpc("durumlar", json!({ "p_adlar": parca }), None).await {
                                    for x in l.as_array().cloned().unwrap_or_default() {
                                        if x["oyunda"].as_bool() == Some(true) && !metin(&x, "ad").is_empty() {
                                            bulunan.push(json!({ "ad": x["ad"], "uuid": x["uuid"] }));
                                        }
                                    }
                                }
                            }
                            kcz_oyuncular = bulunan;
                        }
                        // Oyunda eğilip sağ tıklanan KÇZ oyuncusuna arkadaşlık isteği (profilindeki ID ile)
                        "arkadas_ekle_uuid" => {
                            let hedef = metin(d, "uuid");
                            let sonuc = async {
                                let (u, s, _) = kimlik().await?;
                                let p = rpc("profil_al", json!({ "p_uuid": u, "p_sir": s, "p_kim": hedef }), None)
                                    .await
                                    .map_err(kimlik_hatasi)?;
                                let kod = p
                                    .as_array()
                                    .and_then(|x| x.first())
                                    .map(|x| metin(x, "kod"))
                                    .filter(|k| k.len() == 6)
                                    .ok_or_else(|| "Bu oyuncunun KÇZ profili görülemiyor, ondan 6 haneli ID'sini iste.".to_string())?;
                                rpc("istek_gonder", json!({ "p_uuid": u, "p_sir": s, "p_kod": kod }), None)
                                    .await
                                    .map_err(kimlik_hatasi)
                            }
                            .await;
                            sayac += 1;
                            let m = match sonuc {
                                Ok(_) => format!("{ad} adlı oyuncuya arkadaşlık isteği gönderildi."),
                                Err(e) => format!("İstek gönderilemedi: {e}"),
                            };
                            bildirimler.push(json!({ "id": sayac, "metin": m }));
                        }
                        _ => {
                            let sunucu = Some(metin(d, "sunucu")).filter(|x| !x.is_empty());
                            sayac += 1;
                            let mesaj = match davet_et(&kime, sunucu).await {
                                Ok(s) => format!("{ad} {s} sunucusuna davet edildi."),
                                Err(e) => format!("Davet gönderilemedi: {e}"),
                            };
                            bildirimler.push(json!({ "id": sayac, "metin": mesaj }));
                        }
                    }
                }
            }
            // Oyundan başlatılan giriş bittiyse: başarılıysa yeni hesabın oturumunu oyuna ver
            let giris = crate::hesap::OYUN_GIRIS.lock().unwrap().take();
            if let Some(v) = giris {
                hesap_giris = if v["girisli"].as_bool() == Some(true) {
                    match hesap_oturumu_yaz(&oturum_dosyasi, giris_id).await {
                        Ok(()) => {
                            oturum_zamani = Some(std::time::Instant::now());
                            json!({ "id": giris_id, "durum": "tamam", "ad": v["ad"] })
                        }
                        Err(e) => json!({ "id": giris_id, "durum": "hata", "hata": e }),
                    }
                } else {
                    json!({ "id": giris_id, "durum": "hata", "hata": metin(&v, "hata") })
                };
            }
            // Oyunun okumadığı oturum dosyası diskte kalmasın
            if oturum_zamani.is_some_and(|z| z.elapsed() > std::time::Duration::from_secs(60)) {
                let _ = std::fs::remove_file(&oturum_dosyasi);
                oturum_zamani = None;
            }
            // Gelen davetler (10 dk saklanır)
            if let Ok(yeni) = yeni_davetler().await {
                for d in yeni {
                    davetler.push((simdi, d));
                }
            }
            davetler.retain(|(z, _)| simdi.saturating_sub(*z) < 600);
            bildirimler.truncate(20);
            // Arkadaş listesi (okunmamış mesaj sayısıyla)
            let mut okunmamis: HashMap<String, i64> = HashMap::new();
            if let Ok((u, s, _)) = kimlik().await {
                if let Some(l) = rpc("arkadas_listesi", json!({ "p_uuid": u, "p_sir": s }), None)
                    .await
                    .ok()
                    .and_then(|v| v.as_array().cloned())
                {
                    arkadaslar = l
                        .into_iter()
                        .filter(|x| metin(x, "tur") == "arkadas")
                        .map(|x| {
                            let uuid = metin(&x, "mc_uuid");
                            let n = x["okunmamis"].as_i64().unwrap_or(0);
                            if n > 0 {
                                okunmamis.insert(uuid.clone(), n);
                                getir.insert(uuid.clone());
                            }
                            json!({ "ad": x["ad"], "uuid": uuid, "cevrimici": x["cevrimici"],
                                    "oyunda": x["oyunda"], "sunucu": x["sunucu"], "son": x["son"] })
                        })
                        .collect();
                }
                // Mesajları çek (okununca launcher'da da okundu olur)
                for kim in getir.iter().take(8) {
                    let onceki = son_id.get(kim).copied();
                    let Ok(v) = rpc(
                        "mesajlari_al",
                        json!({ "p_uuid": u, "p_sir": s, "p_kim": kim, "p_sonra": onceki.unwrap_or(0) }),
                        None,
                    )
                    .await
                    else {
                        continue;
                    };
                    let gelen: Vec<Value> = v.as_array().cloned().unwrap_or_default();
                    if gelen.is_empty() {
                        continue;
                    }
                    let ad = arkadaslar
                        .iter()
                        .find(|x| metin(x, "uuid") == *kim)
                        .map(|x| metin(x, "ad"))
                        .unwrap_or_else(|| "Arkadaşın".into());
                    // İlk açılışta sadece okunmamışlar bildirilir, sonra her yeni gelen
                    let bildir: Vec<&Value> = match onceki {
                        Some(o) => gelen.iter().filter(|m| m["id"].as_i64().unwrap_or(0) > o && !m["benden"].as_bool().unwrap_or(false)).collect(),
                        None => {
                            let n = okunmamis.get(kim).copied().unwrap_or(0) as usize;
                            let theirs: Vec<&Value> = gelen.iter().filter(|m| !m["benden"].as_bool().unwrap_or(false)).collect();
                            theirs[theirs.len().saturating_sub(n)..].to_vec()
                        }
                    };
                    for m in bildir {
                        let yazi = if crate::foto::foto_id(&metin(m, "metin")).is_some() {
                            json!("Sana bir fotoğraf gönderdi")
                        } else {
                            m["metin"].clone()
                        };
                        yeni_mesajlar.push(json!({ "id": m["id"], "uuid": kim, "ad": ad, "metin": yazi }));
                    }
                    let k = sohbetler.entry(kim.clone()).or_default();
                    for m in &gelen {
                        let id = m["id"].as_i64().unwrap_or(0);
                        if !k.iter().any(|x| x["id"].as_i64() == Some(id)) {
                            k.push(json!({ "id": id, "benden": m["benden"], "metin": m["metin"], "zaman": m["zaman"] }));
                        }
                    }
                    let fazla = k.len().saturating_sub(40);
                    k.drain(..fazla);
                    if let Some(son) = gelen.iter().filter_map(|m| m["id"].as_i64()).max() {
                        son_id.insert(kim.clone(), son.max(onceki.unwrap_or(0)));
                    }
                }
            }
            let fazla = yeni_mesajlar.len().saturating_sub(30);
            yeni_mesajlar.drain(..fazla);
            // Sohbetteki fotoğrafları oyun için hazırla (her turda en fazla 4; başarısız olan tekrar denenmez)
            let mut hazirlanan = 0;
            for k in sohbetler.values() {
                for m in k.iter().rev() {
                    let Some(id) = crate::foto::foto_id(&metin(m, "metin")) else { continue };
                    if hazirlanan >= 4 || foto_denenen.contains(&id) {
                        continue;
                    }
                    if crate::foto::foto_klasoru().join(format!("{id}.png")).exists() {
                        foto_denenen.insert(id);
                        continue;
                    }
                    hazirlanan += 1;
                    if crate::foto::oyun_icin(id).await.is_err() {
                        foto_denenen.insert(id);
                    }
                }
            }
            let veri = json!({
                "zaman": simdi,
                "arkadaslar": arkadaslar,
                "davetler": davetler.iter().map(|(_, d)| d.clone()).collect::<Vec<_>>(),
                "bildirimler": bildirimler,
                "sohbetler": sohbetler,
                "yeniMesajlar": yeni_mesajlar,
                // Oyundaki hesap menüsü: sadece ad ve uuid (giriş anahtarı yok)
                "hesaplar": crate::hesap::hesaplar(),
                "hesapGiris": hesap_giris,
                "hesapSonuc": hesap_sonuc,
                "kczOyuncular": kcz_oyuncular,
            });
            let gecici = config.join("kcz-arkadaslar.json.tmp");
            if std::fs::write(&gecici, veri.to_string()).is_ok() {
                let _ = std::fs::rename(&gecici, &cikis);
            }
            // Oyundan istek geldiyse hemen dön, yoksa 4 sn bekle
            for _ in 0..8 {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if istek.exists() || OYUN.lock().unwrap().is_none() || crate::hesap::OYUN_GIRIS.lock().unwrap().is_some() {
                    break;
                }
            }
        }
        let _ = std::fs::remove_file(&cikis);
        let _ = std::fs::remove_file(&oturum_dosyasi);
        let _ = sure_gonder().await;
        KOPRU.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

/* ---------- KCZ yakınlık sesli sohbeti ----------
   Ses launcher'daki WebRTC ile doğrudan oyuncular arasında gider. Oyun (KCZ Client) yakındaki
   oyuncuları config/kcz-ses.json'a yazar; burası onu okuyup arayüze "ses-durum" olayı olarak iletir.
   Eşleştirme mesajları (teklif/cevap/aday) Supabase üzerinden geçer. */
static SES_KOPRU: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn ses_kopru_baslat() {
    if SES_KOPRU.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async {
        let config = oyun_klasoru().join("config");
        let dosya = config.join("kcz-ses.json");
        let mut son = String::new();
        let mut son_gonderme = std::time::Instant::now();
        let mut uyandirildi = false;
        while OYUN.lock().unwrap().is_some() {
            if let Ok(m) = std::fs::read_to_string(&dosya) {
                let taze = std::fs::metadata(&dosya)
                    .and_then(|x| x.modified())
                    .ok()
                    .and_then(|z| z.elapsed().ok())
                    .map(|e| e.as_secs() < 5)
                    .unwrap_or(false);
                if let Ok(mut v) = serde_json::from_str::<Value>(&m) {
                    if !taze {
                        v = json!({ "aktif": false });
                    }
                    let aktif = v["aktif"].as_bool().unwrap_or(false);
                    // Linux: ses launcher'ın Rust kodunda işlenir (ses_yerel); Windows: arayüzde (ses.js)
                    #[cfg(target_os = "linux")]
                    {
                        let _ = (&mut uyandirildi, &mut son, &mut son_gonderme, aktif);
                        crate::ses_yerel::guncelle(v);
                    }
                    #[cfg(not(target_os = "linux"))]
                    {
                        if aktif && !uyandirildi {
                            uyandirildi = true;
                            crate::sessizce_uyandir();
                        }
                        let metin = v.to_string();
                        // Değiştiyse hemen, değişmediyse saniyede bir (arayüzün zamanlayıcısı bu olaylar)
                        if metin != son || son_gonderme.elapsed().as_millis() > 900 {
                            gonder("ses-durum", v);
                            son = metin;
                            son_gonderme = std::time::Instant::now();
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
        gonder("ses-durum", json!({ "aktif": false }));
        #[cfg(target_os = "linux")]
        crate::ses_yerel::kapat();
        let _ = std::fs::remove_file(&dosya);
        let _ = std::fs::remove_file(config.join("kcz-ses-durum.json"));
        SES_KOPRU.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

#[tauri::command]
pub async fn ses_katil(oda: String) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("ses_katil", json!({ "p_uuid": u, "p_sir": s, "p_oda": oda }), None)
            .await
            .map_err(kimlik_hatasi)
            .map(|v| json!({ "ben": u, "liste": v }))
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn ses_ayril() -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("ses_ayril", json!({ "p_uuid": u, "p_sir": s }), None).await.map_err(kimlik_hatasi)?;
        Ok(())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn ses_sinyal_gonder(kime: String, tur: String, veri: String) -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc(
            "ses_sinyal_gonder",
            json!({ "p_uuid": u, "p_sir": s, "p_kime": kime, "p_tur": tur, "p_veri": veri }),
            None,
        )
        .await
        .map_err(kimlik_hatasi)?;
        Ok(())
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn ses_sinyalleri_al() -> Value {
    let s = async {
        let (u, s, _) = kimlik().await?;
        rpc("ses_sinyalleri_al", json!({ "p_uuid": u, "p_sir": s }), None).await.map_err(kimlik_hatasi)
    }
    .await;
    sonuc_json(s)
}

/// Sesli sohbet aktarma sunucusu (Cloudflare TURN) için geçici şifre: Supabase "turn" fonksiyonundan.
/// 5 saat saklanır. Fonksiyon kurulmamışsa hata döner (o zaman sadece arkadaşlarla doğrudan bağlanılır).
static ICE: LazyLock<Mutex<Option<(std::time::Instant, Value)>>> = LazyLock::new(Default::default);
/// Son başarısız deneme: kurulmamışsa dakikada bir sorulsun
static ICE_HATA: LazyLock<Mutex<Option<(std::time::Instant, String)>>> = LazyLock::new(Default::default);

pub(crate) async fn ice_sunuculari() -> Sonuc<Value> {
    if let Some((z, v)) = ICE.lock().unwrap().clone() {
        if z.elapsed().as_secs() < 5 * 3600 {
            return Ok(v);
        }
    }
    if let Some((z, h)) = ICE_HATA.lock().unwrap().clone() {
        if z.elapsed().as_secs() < 60 {
            return Err(h);
        }
    }
    let sonuc = ice_iste().await;
    if let Err(h) = &sonuc {
        *ICE_HATA.lock().unwrap() = Some((std::time::Instant::now(), h.clone()));
    }
    sonuc
}

async fn ice_iste() -> Sonuc<Value> {
    let (u, s, _) = kimlik().await?;
    let r = ISTEMCI
        .post(format!("{ADRES}/functions/v1/turn"))
        .header("apikey", ANAHTAR)
        .json(&json!({ "uuid": u, "sir": s }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let durum = r.status();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    let liste = v["iceServers"].clone();
    if !durum.is_success() || !liste.as_array().is_some_and(|a| a.iter().any(|x| x.get("username").is_some())) {
        return Err(format!("Aktarma sunucusu yok ({durum})"));
    }
    *ICE.lock().unwrap() = Some((std::time::Instant::now(), liste.clone()));
    Ok(liste)
}

#[tauri::command]
pub async fn ses_ice() -> Value {
    sonuc_json(ice_sunuculari().await)
}

/// Arayüz kimin konuştuğunu buraya yazar, oyun okuyup ekranda gösterir
#[tauri::command]
pub fn ses_durum_yaz(bagli: u32, konusanlar: Vec<String>, hata: Option<String>) {
    let d = oyun_klasoru().join("config").join("kcz-ses-durum.json");
    let gecici = d.with_extension("json.tmp");
    let v = json!({ "bagli": bagli, "konusanlar": konusanlar, "hata": hata });
    if std::fs::write(&gecici, v.to_string()).is_ok() {
        let _ = std::fs::rename(&gecici, &d);
    }
}

/* ---------- Arkadaşlar (eski: ada göre) ---------- */
#[tauri::command]
pub async fn arkadas_durumlari() -> Value {
    let adlar = crate::ayarlar::getir().arkadaslar;
    if adlar.is_empty() {
        return sonuc_json(Ok::<_, String>(json!([])));
    }
    let durum = if bagli() {
        rpc("durumlar", json!({ "p_adlar": adlar }), None).await.unwrap_or(json!([]))
    } else {
        json!([])
    };
    let liste: Vec<Value> = adlar
        .iter()
        .map(|ad| {
            let d = durum
                .as_array()
                .and_then(|l| l.iter().find(|x| metin(x, "ad").eq_ignore_ascii_case(ad)).cloned())
                .unwrap_or(Value::Null);
            json!({
                "ad": ad,
                "uuid": d.get("uuid").cloned().unwrap_or(Value::Null),
                "cevrimici": d.get("cevrimici").and_then(|x| x.as_bool()).unwrap_or(false),
                "oyunda": d.get("oyunda").and_then(|x| x.as_bool()).unwrap_or(false),
                "sunucu": d.get("sunucu").cloned().unwrap_or(Value::Null),
                "son": d.get("son").cloned().unwrap_or(Value::Null),
                "kcz": !d.is_null(),
            })
        })
        .collect();
    sonuc_json(Ok::<_, String>(Value::Array(liste)))
}

#[tauri::command]
pub async fn arkadas_ekle(ad: String) -> Value {
    let s = async {
        let ad = ad.trim().to_string();
        if !(2..=16).contains(&ad.len()) || !ad.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err("Geçerli bir Minecraft kullanıcı adı yaz.".to_string());
        }
        // Adın doğru yazılışı Mojang'dan
        let gercek = match json_al_bos(&format!("https://api.mojang.com/users/profiles/minecraft/{ad}"), None).await {
            Ok(Some(o)) => metin(&o, "name"),
            Ok(None) => return Err("Bu isimde bir Minecraft oyuncusu yok.".to_string()),
            Err(_) => ad.clone(),
        };
        let mut a = crate::ayarlar::getir();
        if !a.arkadaslar.iter().any(|x| x.eq_ignore_ascii_case(&gercek)) {
            a.arkadaslar.push(gercek.clone());
        }
        crate::ayarlar::kaydet(&json!({ "arkadaslar": a.arkadaslar }));
        Ok(gercek)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub fn arkadas_sil(ad: String) -> Value {
    let mut a = crate::ayarlar::getir();
    a.arkadaslar.retain(|x| !x.eq_ignore_ascii_case(&ad));
    crate::ayarlar::kaydet(&json!({ "arkadaslar": a.arkadaslar }));
    json!({ "ok": true })
}

/// Açılışta ve her 5 dakikada bir. Tek, çok küçük bir istek.
pub fn sayimi_baslat() {
    tauri::async_runtime::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(6)).await;
        loop {
            kalp_atisi().await;
            let _ = sure_gonder().await;
            tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await;
        }
    });
}

/* ---------- Öneri / hata bildirimi ---------- */
/// Öneri ya da hata gönderir; çökme bildiriminde oyun kaydı da eklenir.
pub async fn oneri_gonder_kayitli(tur: &str, metin: &str, iletisim: &str, kayit: Option<&str>) -> Value {
    let s = async {
        let metin = metin.trim().to_string();
        if metin.chars().count() < 3 {
            return Err("Biraz daha yaz.".to_string());
        }
        if metin.chars().count() > 2000 {
            return Err("En fazla 2000 karakter yazabilirsin.".to_string());
        }
        let tur = if tur == "hata" { "hata" } else { "oneri" };
        let mut govde = json!({
            "p_tur": tur, "p_metin": metin, "p_iletisim": iletisim.trim(),
            "p_kurulum": kurulum_kimligi(), "p_surum": surum(), "p_os": os_adi()
        });
        // Kayıt sadece varsa gönderilir (sunucudaki eski sürüm fonksiyonla da çalışsın)
        if let Some(k) = kayit {
            govde["p_kayit"] = json!(k);
        }
        rpc("oneri_gonder", govde, None).await.map(|_| true)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn oneri_gonder(tur: String, metin: String, iletisim: String) -> Value {
    oneri_gonder_kayitli(&tur, &metin, &iletisim, None).await
}

/* ---------- Yeni neler var ---------- */
fn surum_sayi(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split('.').map(|x| x.parse().unwrap_or(0)).collect()
}

/// "once"dan sonraki ve "surum"a kadar olan bütün sürümlerin yenilik maddeleri (yeniden eskiye)
#[tauri::command]
pub async fn surum_notlari(surum: String, once: String) -> Value {
    let s = async {
        let v = json_al("https://api.github.com/repos/trkcz01/kcz-launcher/releases?per_page=40").await?;
        let (alt, ust) = (surum_sayi(&once), surum_sayi(&surum));
        let mut maddeler: Vec<String> = vec![];
        for r in v.as_array().cloned().unwrap_or_default() {
            let etiket = metin(&r, "tag_name");
            let n = surum_sayi(&etiket);
            if n <= alt || n > ust {
                continue;
            }
            let govde = metin(&r, "body");
            if let (Some(a), Some(b)) = (govde.find("<!--notlar-->"), govde.find("<!--/notlar-->")) {
                if b > a {
                    for x in govde[a + "<!--notlar-->".len()..b].lines() {
                        let x = x.trim().trim_start_matches("- ").trim().to_string();
                        if !x.is_empty() && !maddeler.contains(&x) {
                            maddeler.push(x);
                        }
                    }
                }
            }
        }
        Ok::<_, String>(maddeler)
    }
    .await;
    sonuc_json(s)
}

/* ---------- Duyurular ---------- */
#[tauri::command]
pub async fn duyurular() -> Value {
    if !bagli() {
        return json!([]);
    }
    rpc("duyurular_al", json!({}), None).await.unwrap_or(json!([]))
}

#[tauri::command]
pub async fn yonetici_duyurular() -> Value {
    sonuc_json(yonetici_rpc("duyuru_listesi", json!({})).await)
}

#[tauri::command]
pub async fn yonetici_duyuru_ekle(metin: String, gun: i32) -> Value {
    let m = metin.trim().to_string();
    if m.chars().count() < 2 || m.chars().count() > 300 {
        return sonuc_json::<bool>(Err("Duyuru 2-300 karakter olmalı.".into()));
    }
    sonuc_json(yonetici_rpc("duyuru_ekle", json!({ "p_metin": m, "p_gun": gun })).await.map(|_| true))
}

#[tauri::command]
pub async fn yonetici_duyuru_sil(id: i64) -> Value {
    sonuc_json(yonetici_rpc("duyuru_sil", json!({ "p_id": id })).await.map(|_| true))
}

#[tauri::command]
pub async fn yonetici_oneri_kaydi(id: i64) -> Value {
    sonuc_json(yonetici_rpc("oneri_kaydi", json!({ "p_id": id })).await)
}

#[tauri::command]
pub fn sunucu_bagli() -> bool {
    bagli()
}

/* ---------- Yönetici oturumu ---------- */
#[derive(Clone)]
struct Oturum {
    erisim: String,
    yenileme: String,
    eposta: String,
    bitis: i64,
}

static OTURUM: LazyLock<Mutex<Option<Oturum>>> = LazyLock::new(|| Mutex::new(None));

fn kasa() -> Option<keyring::Entry> {
    keyring::Entry::new(KASA_SERVIS, KASA_HESAP).ok()
}

fn oturumu_al(v: &Value) -> Sonuc<Oturum> {
    let erisim = metin(v, "access_token");
    let yenileme = metin(v, "refresh_token");
    if erisim.is_empty() {
        return Err("Giriş yapılamadı.".into());
    }
    let sure = v.get("expires_in").and_then(|x| x.as_i64()).unwrap_or(3600);
    let eposta = v.get("user").map(|u| metin(u, "email")).unwrap_or_default();
    let o = Oturum { erisim, yenileme: yenileme.clone(), eposta, bitis: chrono::Utc::now().timestamp() + sure - 60 };
    if let Some(k) = kasa() {
        let _ = k.set_password(&yenileme);
    }
    *OTURUM.lock().unwrap() = Some(o.clone());
    Ok(o)
}

async fn yenile(yenileme: &str) -> Sonuc<Oturum> {
    let v = auth("token?grant_type=refresh_token", json!({ "refresh_token": yenileme })).await?;
    oturumu_al(&v)
}

/// Geçerli erişim belirteci; gerekirse yeniler.
async fn belirtec() -> Sonuc<String> {
    let simdi = OTURUM.lock().unwrap().clone();
    if let Some(o) = simdi {
        if o.bitis > chrono::Utc::now().timestamp() {
            return Ok(o.erisim);
        }
        return Ok(yenile(&o.yenileme).await?.erisim);
    }
    let kayitli = kasa().and_then(|k| k.get_password().ok()).unwrap_or_default();
    if kayitli.is_empty() {
        return Err("OTURUM".into());
    }
    match yenile(&kayitli).await {
        Ok(o) => Ok(o.erisim),
        Err(_) => {
            cikis_temizle();
            Err("OTURUM".into())
        }
    }
}

fn cikis_temizle() {
    *OTURUM.lock().unwrap() = None;
    if let Some(k) = kasa() {
        let _ = k.delete_credential();
    }
}

async fn yonetici_rpc(ad: &str, govde: Value) -> Sonuc<Value> {
    let b = belirtec().await?;
    match rpc(ad, govde.clone(), Some(&b)).await {
        Err(e) if e == "OTURUM" => {
            // Belirteç beklenenden önce düştüyse bir kez yenileyip dene
            *OTURUM.lock().unwrap() = None;
            let b = belirtec().await?;
            rpc(ad, govde, Some(&b)).await
        }
        s => s,
    }
}

/* ---------- Maildeki linkle giriş ----------
Ücretsiz Supabase mail şablonuna kod koydurmuyor; mailde sadece link var. Link önce Supabase'e,
oradan bu bilgisayarda launcher'ın dinlediği yerel adrese döner. Belirteçler adresin # kısmında
geldiği için küçük bir sayfa onları okuyup launcher'a iletir. */
const YEREL_PORT: u16 = 47615;
static DINLEYICI: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

const ARA_SAYFA: &str = r#"<!doctype html><meta charset="utf-8"><title>KCZ Launcher</title>
<body style="background:#111;color:#eee;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div id="m" style="font-size:18px">Giriş yapılıyor…</div>
<script>
fetch('/belirtec?' + location.hash.slice(1)).then(r => r.text()).then(t => { document.getElementById('m').textContent = t; })
  .catch(() => { document.getElementById('m').textContent = 'Launcher kapalı görünüyor. Launcher açıkken tekrar dene.'; });
</script>"#;

fn sorgu_cozumle(q: &str) -> std::collections::HashMap<String, String> {
    url::form_urlencoded::parse(q.as_bytes()).into_owned().collect()
}

async fn cevap_yaz(akis: &mut tokio::net::TcpStream, tur: &str, govde: &str) {
    use tokio::io::AsyncWriteExt;
    let b = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {tur}; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{govde}",
        govde.len()
    );
    let _ = akis.write_all(b.as_bytes()).await;
}

/// Linkten gelen belirteçlerle oturumu kurar ve yetkiyi denetler. Sonucu arayüze bildirir.
async fn linkten_giris(p: std::collections::HashMap<String, String>) -> Sonuc<Value> {
    if let Some(h) = p.get("error_description").or(p.get("error")) {
        return Err(if h.contains("expired") || h.contains("invalid") {
            "Link geçersiz ya da süresi dolmuş. Yeni link iste.".into()
        } else {
            h.replace('+', " ")
        });
    }
    let erisim = p.get("access_token").cloned().unwrap_or_default();
    if erisim.is_empty() {
        return Err("Linkte giriş bilgisi yok. Yeni link iste.".into());
    }
    let kullanici: Value = ISTEMCI
        .get(format!("{ADRES}/auth/v1/user"))
        .header("apikey", ANAHTAR)
        .bearer_auth(&erisim)
        .send()
        .await
        .map_err(|_| "Sunucuya bağlanılamadı.".to_string())?
        .json()
        .await
        .unwrap_or(Value::Null);
    let v = json!({
        "access_token": erisim,
        "refresh_token": p.get("refresh_token").cloned().unwrap_or_default(),
        "expires_in": p.get("expires_in").and_then(|x| x.parse::<i64>().ok()).unwrap_or(3600),
        "user": kullanici,
    });
    let o = oturumu_al(&v)?;
    let yetkili = rpc("yonetici_mi", json!({}), Some(&o.erisim)).await?;
    if yetkili != Value::Bool(true) {
        cikis_temizle();
        return Err("Bu hesabın yönetim paneline erişimi yok.".into());
    }
    Ok(json!({ "eposta": o.eposta }))
}

/// Yerel adresi 20 dakika dinler; ilk başarılı girişte kapanır.
fn dinleyiciyi_baslat() -> Sonuc<()> {
    if DINLEYICI.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Ok(());
    }
    let std_dinleyici = std::net::TcpListener::bind(("127.0.0.1", YEREL_PORT)).map_err(|_| {
        DINLEYICI.store(false, std::sync::atomic::Ordering::SeqCst);
        format!("{YEREL_PORT} numaralı yerel bağlantı noktası kullanımda.")
    })?;
    let _ = std_dinleyici.set_nonblocking(true);
    tauri::async_runtime::spawn(async move {
        use tokio::io::AsyncReadExt;
        let dinleyici = match tokio::net::TcpListener::from_std(std_dinleyici) {
            Ok(d) => d,
            Err(_) => {
                DINLEYICI.store(false, std::sync::atomic::Ordering::SeqCst);
                return;
            }
        };
        let bitis = tokio::time::Instant::now() + std::time::Duration::from_secs(20 * 60);
        loop {
            let kabul = tokio::time::timeout_at(bitis, dinleyici.accept()).await;
            let Ok(Ok((mut akis, _))) = kabul else { break };
            let mut tampon = vec![0u8; 8192];
            let n = match tokio::time::timeout(std::time::Duration::from_secs(5), akis.read(&mut tampon)).await {
                Ok(Ok(n)) => n,
                _ => continue,
            };
            let istek = String::from_utf8_lossy(&tampon[..n]).to_string();
            let yol = istek.split_whitespace().nth(1).unwrap_or("/").to_string();
            let (ad, sorgu) = yol.split_once('?').unwrap_or((yol.as_str(), ""));
            if ad == "/belirtec" {
                let p = sorgu_cozumle(sorgu);
                match linkten_giris(p).await {
                    Ok(v) => {
                        cevap_yaz(&mut akis, "text/plain", "Giriş tamam. Launcher'a dönebilirsin, bu sekmeyi kapat.").await;
                        gonder("yonetici-giris", json!({ "ok": true, "veri": v }));
                        break;
                    }
                    Err(e) => {
                        cevap_yaz(&mut akis, "text/plain", &e).await;
                        gonder("yonetici-giris", json!({ "ok": false, "hata": e }));
                    }
                }
            } else {
                cevap_yaz(&mut akis, "text/html", ARA_SAYFA).await;
            }
        }
        DINLEYICI.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    Ok(())
}

/// Mailine giriş linki gönderir. Link bu bilgisayarda açılınca launcher girişi kendisi alır.
/// Link herkese gidebilir ama panel sadece yönetici listesindekilere açılır.
#[tauri::command]
pub async fn yonetici_kod_iste(eposta: String) -> Value {
    let s = async {
        let eposta = eposta.trim().to_lowercase();
        dinleyiciyi_baslat()?;
        let geri = format!("http://127.0.0.1:{YEREL_PORT}/giris");
        let yol = format!("otp?redirect_to={}", url::form_urlencoded::byte_serialize(geri.as_bytes()).collect::<String>());
        auth(&yol, json!({ "email": eposta, "create_user": true })).await.map(|_| true)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn yonetici_kod_dogrula(eposta: String, kod: String) -> Value {
    let s = async {
        let v = auth(
            "verify",
            json!({ "type": "email", "email": eposta.trim().to_lowercase(), "token": kod.trim() }),
        )
        .await?;
        let o = oturumu_al(&v)?;
        let yetkili = rpc("yonetici_mi", json!({}), Some(&o.erisim)).await?;
        if yetkili != Value::Bool(true) {
            cikis_temizle();
            return Err("Bu hesabın yönetim paneline erişimi yok.".to_string());
        }
        Ok(json!({ "eposta": o.eposta }))
    }
    .await;
    sonuc_json(s)
}

/// Kayıtlı oturum varsa ve hâlâ yöneticiyse { eposta } döner; yoksa null.
#[tauri::command]
pub async fn yonetici_durum() -> Value {
    if !bagli() {
        return Value::Null;
    }
    match yonetici_rpc("yonetici_mi", json!({})).await {
        Ok(Value::Bool(true)) => {
            let e = OTURUM.lock().unwrap().as_ref().map(|o| o.eposta.clone()).unwrap_or_default();
            json!({ "eposta": e })
        }
        Ok(_) => {
            cikis_temizle();
            Value::Null
        }
        Err(_) => Value::Null,
    }
}

#[tauri::command]
pub fn yonetici_cikis() -> bool {
    cikis_temizle();
    true
}

/* ---------- Panel verileri ---------- */
async fn indirme_sayisi() -> Option<u64> {
    let v = json_al("https://api.github.com/repos/trkcz01/kcz-launcher/releases?per_page=100").await.ok()?;
    let mut n = 0;
    for r in v.as_array()? {
        for a in r.get("assets").and_then(|x| x.as_array()).into_iter().flatten() {
            let ad = metin(a, "name");
            // Sadece elle indirilen kurulum dosyaları; otomatik güncellemenin indirdiği "-guncelleme" kopyaları sayılmaz
            if ad.contains("-guncelleme") {
                continue;
            }
            if ad.ends_with(".exe") || ad.ends_with(".AppImage") || ad.ends_with(".deb") || ad.ends_with(".rpm") {
                n += a.get("download_count").and_then(|x| x.as_u64()).unwrap_or(0);
            }
        }
    }
    Some(n)
}

#[tauri::command]
pub async fn yonetici_istatistik() -> Value {
    let s = async {
        let (ist, ind) = tokio::join!(yonetici_rpc("istatistik", json!({})), indirme_sayisi());
        let mut ist = ist?;
        ist["indirme"] = json!(ind);
        Ok::<_, String>(ist)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn yonetici_oneriler() -> Value {
    sonuc_json(yonetici_rpc("oneri_listesi", json!({})).await)
}

#[tauri::command]
pub async fn yonetici_oneri_durum(id: i64, durum: String) -> Value {
    sonuc_json(yonetici_rpc("oneri_durum", json!({ "p_id": id, "p_durum": durum })).await.map(|_| true))
}

#[tauri::command]
pub async fn yonetici_listesi() -> Value {
    sonuc_json(yonetici_rpc("yonetici_listesi", json!({})).await)
}

/// Yönetici listesine ekler ve kişiye giriş kodlu davet e-postası gönderir.
#[tauri::command]
pub async fn yonetici_davet(eposta: String) -> Value {
    let s = async {
        let e = eposta.trim().to_lowercase();
        yonetici_rpc("yonetici_ekle", json!({ "p_eposta": e })).await?;
        let geri = format!("http://127.0.0.1:{YEREL_PORT}/giris");
        let yol = format!("otp?redirect_to={}", url::form_urlencoded::byte_serialize(geri.as_bytes()).collect::<String>());
        let _ = auth(&yol, json!({ "email": e, "create_user": true })).await;
        Ok::<_, String>(true)
    }
    .await;
    sonuc_json(s)
}

#[tauri::command]
pub async fn yonetici_kaldir(eposta: String) -> Value {
    sonuc_json(yonetici_rpc("yonetici_sil", json!({ "p_eposta": eposta })).await.map(|_| true))
}
