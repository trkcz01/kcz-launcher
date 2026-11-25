// Sunucuya bağlanmadan durumunu öğrenme (Minecraft "Server List Ping"):
// açık mı, kaç kişi var, sürüm, açıklama, gecikme. Oyundaki sunucu listesinin yaptığının aynısı.
use crate::ortak::*;
use serde_json::{json, Value};
use std::net::IpAddr;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

fn var_int(mut n: u32, c: &mut Vec<u8>) {
    loop {
        let mut b = (n & 0x7f) as u8;
        n >>= 7;
        if n != 0 {
            b |= 0x80;
        }
        c.push(b);
        if n == 0 {
            break;
        }
    }
}

async fn var_int_oku(s: &mut TcpStream) -> Sonuc<u32> {
    let mut sayi: u32 = 0;
    for kayma in 0..5 {
        let b = s.read_u8().await.h()?;
        sayi |= ((b & 0x7f) as u32) << (7 * kayma);
        if b & 0x80 == 0 {
            return Ok(sayi);
        }
    }
    Err("Geçersiz VarInt".into())
}

fn adres_ayir(adres: &str) -> (String, Option<u16>) {
    let a = adres.trim();
    if let Some(ic) = a.strip_prefix('[') {
        if let Some((h, kalan)) = ic.split_once(']') {
            let port = kalan.strip_prefix(':').and_then(|p| p.parse().ok());
            return (h.to_string(), port);
        }
    }
    if let Some(i) = a.rfind(':') {
        if a.find(':') == Some(i) {
            return (a[..i].to_string(), a[i + 1..].parse().ok());
        }
    }
    (a.to_string(), None)
}

async fn hedef_coz(adres: &str) -> (String, u16) {
    let (host, port) = adres_ayir(adres);
    if let Some(p) = port {
        return (host, p);
    }
    if host.parse::<IpAddr>().is_ok() {
        return (host, 25565);
    }
    // play.ornek.com gibi adresler portu SRV kaydında saklar
    if let Ok(cozucu) = hickory_resolver::TokioAsyncResolver::tokio_from_system_conf() {
        if let Ok(k) = cozucu.srv_lookup(format!("_minecraft._tcp.{host}.")).await {
            if let Some(r) = k.iter().next() {
                let ad = r.target().to_utf8();
                return (ad.trim_end_matches('.').to_string(), r.port());
            }
        }
    }
    (host, 25565)
}

fn sohbet_metni(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Array(d) => d.iter().map(sohbet_metni).collect(),
        Value::Object(_) => {
            let mut s = c
                .get("text")
                .and_then(|x| x.as_str())
                .or_else(|| c.get("translate").and_then(|x| x.as_str()))
                .unwrap_or("")
                .to_string();
            if let Some(e) = c.get("extra") {
                s += &sohbet_metni(e);
            }
            s
        }
        _ => String::new(),
    }
}

fn renk_sil(s: &str) -> String {
    let mut c = String::new();
    let mut atla = false;
    for ch in s.chars() {
        if atla {
            atla = false;
            continue;
        }
        if ch == '§' {
            atla = true;
            continue;
        }
        c.push(ch);
    }
    c
}

async fn sorgu(host: &str, port: u16) -> Sonuc<(Value, u128)> {
    let baslangic = Instant::now();
    let mut s = TcpStream::connect((host, port)).await.map_err(|_| "Bağlanılamadı".to_string())?;
    // El sıkışma: paket 0, protokol -1, adres, port, sonraki durum 1 (durum sorgusu)
    let mut veri = vec![];
    var_int(0, &mut veri);
    var_int(u32::MAX, &mut veri);
    var_int(host.len() as u32, &mut veri);
    veri.extend(host.as_bytes());
    veri.extend(port.to_be_bytes());
    var_int(1, &mut veri);
    let mut paket = vec![];
    var_int(veri.len() as u32, &mut paket);
    paket.extend(veri);
    paket.extend([0x01, 0x00]);
    s.write_all(&paket).await.h()?;
    let _uzunluk = var_int_oku(&mut s).await?;
    let _paket_id = var_int_oku(&mut s).await?;
    let n = var_int_oku(&mut s).await? as usize;
    if n > 2_000_000 {
        return Err("Geçersiz cevap".into());
    }
    let mut metin = vec![0u8; n];
    s.read_exact(&mut metin).await.h()?;
    let gecikme = baslangic.elapsed().as_millis();
    Ok((serde_json::from_slice(&metin).h()?, gecikme))
}

pub async fn sorgula(adres: &str) -> Value {
    let sonuc = tokio::time::timeout(Duration::from_secs(6), async {
        let (host, port) = hedef_coz(adres).await;
        sorgu(&host, port).await
    })
    .await;
    match sonuc {
        Ok(Ok((v, gecikme))) => {
            let oyuncular: Vec<String> = v["players"]["sample"]
                .as_array()
                .map(|d| d.iter().map(|o| renk_sil(&metin(o, "name"))).collect())
                .unwrap_or_default();
            let ikon = v.get("favicon").and_then(|x| x.as_str()).filter(|x| x.starts_with("data:image/"));
            json!({
                "durum": "acik",
                "motd": renk_sil(&sohbet_metni(&v["description"])).trim(),
                "surum": v["version"]["name"].as_str().unwrap_or("?"),
                "oyuncu": v["players"]["online"].as_u64().unwrap_or(0),
                "maks": v["players"]["max"].as_u64().unwrap_or(0),
                "oyuncular": oyuncular,
                "gecikme": gecikme as u64,
                "ikon": ikon
            })
        }
        Ok(Err(h)) => json!({ "durum": "kapali", "hata": h }),
        Err(_) => json!({ "durum": "kapali", "hata": "Zaman aşımı" }),
    }
}
