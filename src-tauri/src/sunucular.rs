// Sunucu listesi: oyunun servers.dat dosyası (NBT biçimi). Türler korunarak okunur ve yazılır,
// böylece oyunun kendi eklediği alanlar (ikon, kaynak paketi izni…) bozulmaz.
use crate::ortak::*;
use base64::Engine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub enum Nbt {
    Bayt(i8),
    Kisa(i16),
    Tam(i32),
    Uzun(i64),
    Ondalik(f32),
    Cift(f64),
    BaytDizi(Vec<u8>),
    Metin(String),
    Liste(u8, Vec<Nbt>),
    Bilesik(Vec<(u8, String, Nbt)>),
    TamDizi(Vec<i32>),
    UzunDizi(Vec<i64>),
}

struct Okuyucu<'a> {
    b: &'a [u8],
    k: usize,
}

impl<'a> Okuyucu<'a> {
    fn al(&mut self, n: usize) -> Sonuc<&'a [u8]> {
        if self.k + n > self.b.len() {
            return Err("servers.dat bozuk".into());
        }
        let s = &self.b[self.k..self.k + n];
        self.k += n;
        Ok(s)
    }
    fn u8(&mut self) -> Sonuc<u8> {
        Ok(self.al(1)?[0])
    }
    fn i32(&mut self) -> Sonuc<i32> {
        Ok(i32::from_be_bytes(self.al(4)?.try_into().unwrap()))
    }
    fn metin(&mut self) -> Sonuc<String> {
        let n = u16::from_be_bytes(self.al(2)?.try_into().unwrap()) as usize;
        Ok(String::from_utf8_lossy(self.al(n)?).to_string())
    }
    fn deger(&mut self, t: u8) -> Sonuc<Nbt> {
        Ok(match t {
            1 => Nbt::Bayt(self.al(1)?[0] as i8),
            2 => Nbt::Kisa(i16::from_be_bytes(self.al(2)?.try_into().unwrap())),
            3 => Nbt::Tam(self.i32()?),
            4 => Nbt::Uzun(i64::from_be_bytes(self.al(8)?.try_into().unwrap())),
            5 => Nbt::Ondalik(f32::from_be_bytes(self.al(4)?.try_into().unwrap())),
            6 => Nbt::Cift(f64::from_be_bytes(self.al(8)?.try_into().unwrap())),
            7 => {
                let n = self.i32()?.max(0) as usize;
                Nbt::BaytDizi(self.al(n)?.to_vec())
            }
            8 => Nbt::Metin(self.metin()?),
            9 => {
                let ic = self.u8()?;
                let n = self.i32()?.max(0);
                let mut d = vec![];
                for _ in 0..n {
                    d.push(self.deger(ic)?);
                }
                Nbt::Liste(ic, d)
            }
            10 => {
                let mut o = vec![];
                loop {
                    let tt = self.u8()?;
                    if tt == 0 {
                        break;
                    }
                    let ad = self.metin()?;
                    o.push((tt, ad, self.deger(tt)?));
                }
                Nbt::Bilesik(o)
            }
            11 => {
                let n = self.i32()?.max(0);
                let mut d = vec![];
                for _ in 0..n {
                    d.push(self.i32()?);
                }
                Nbt::TamDizi(d)
            }
            12 => {
                let n = self.i32()?.max(0);
                let mut d = vec![];
                for _ in 0..n {
                    d.push(i64::from_be_bytes(self.al(8)?.try_into().unwrap()));
                }
                Nbt::UzunDizi(d)
            }
            _ => return Err(format!("Bilinmeyen NBT türü: {t}")),
        })
    }
}

pub fn oku(b: &[u8]) -> Sonuc<Nbt> {
    let mut o = Okuyucu { b, k: 0 };
    if o.u8()? != 10 {
        return Err("servers.dat bozuk".into());
    }
    o.metin()?;
    o.deger(10)
}

fn yaz_metin(c: &mut Vec<u8>, s: &str) {
    let b = s.as_bytes();
    c.extend((b.len() as u16).to_be_bytes());
    c.extend(b);
}

fn yaz_deger(c: &mut Vec<u8>, v: &Nbt) {
    match v {
        Nbt::Bayt(x) => c.push(*x as u8),
        Nbt::Kisa(x) => c.extend(x.to_be_bytes()),
        Nbt::Tam(x) => c.extend(x.to_be_bytes()),
        Nbt::Uzun(x) => c.extend(x.to_be_bytes()),
        Nbt::Ondalik(x) => c.extend(x.to_be_bytes()),
        Nbt::Cift(x) => c.extend(x.to_be_bytes()),
        Nbt::BaytDizi(x) => {
            c.extend((x.len() as i32).to_be_bytes());
            c.extend(x);
        }
        Nbt::Metin(s) => yaz_metin(c, s),
        Nbt::Liste(ic, d) => {
            c.push(if d.is_empty() && *ic == 0 { 10 } else { *ic });
            c.extend((d.len() as i32).to_be_bytes());
            for e in d {
                yaz_deger(c, e);
            }
        }
        Nbt::Bilesik(o) => {
            for (t, ad, vv) in o {
                c.push(*t);
                yaz_metin(c, ad);
                yaz_deger(c, vv);
            }
            c.push(0);
        }
        Nbt::TamDizi(d) => {
            c.extend((d.len() as i32).to_be_bytes());
            for e in d {
                c.extend(e.to_be_bytes());
            }
        }
        Nbt::UzunDizi(d) => {
            c.extend((d.len() as i32).to_be_bytes());
            for e in d {
                c.extend(e.to_be_bytes());
            }
        }
    }
}

pub fn yaz(kok: &Nbt) -> Vec<u8> {
    let mut c = vec![10u8];
    yaz_metin(&mut c, "");
    yaz_deger(&mut c, kok);
    c
}

fn alan<'a>(o: &'a Nbt, ad: &str) -> Option<&'a Nbt> {
    if let Nbt::Bilesik(v) = o {
        v.iter().find(|(_, a, _)| a == ad).map(|(_, _, x)| x)
    } else {
        None
    }
}

fn alan_metin(o: &Nbt, ad: &str) -> String {
    match alan(o, ad) {
        Some(Nbt::Metin(s)) => s.clone(),
        _ => String::new(),
    }
}

pub fn dosya_yolu(oyun: &Path) -> PathBuf {
    oyun.join("servers.dat")
}

/// Kök ve içindeki sunucu listesini döndürür (liste yoksa oluşturur)
fn tipli(oyun: &Path) -> Sonuc<Nbt> {
    match std::fs::read(dosya_yolu(oyun)) {
        Ok(b) => oku(&b),
        Err(_) => Ok(Nbt::Bilesik(vec![])),
    }
}

fn sunucu_listesi(kok: &mut Nbt) -> &mut Vec<Nbt> {
    let Nbt::Bilesik(alanlar) = kok else { unreachable!() };
    if !alanlar.iter().any(|(t, a, _)| *t == 9 && a == "servers") {
        alanlar.push((9, "servers".into(), Nbt::Liste(10, vec![])));
    }
    let (_, _, l) = alanlar.iter_mut().find(|(t, a, _)| *t == 9 && a == "servers").unwrap();
    if let Nbt::Liste(ic, d) = l {
        *ic = 10;
        d
    } else {
        unreachable!()
    }
}

fn kaydet(oyun: &Path, kok: &Nbt) -> Sonuc<()> {
    let yol = dosya_yolu(oyun);
    if yol.exists() {
        let _ = std::fs::copy(&yol, oyun.join("servers.dat_old"));
    }
    let gecici = oyun.join("servers.dat.tmp");
    std::fs::write(&gecici, yaz(kok)).h()?;
    std::fs::rename(&gecici, &yol).h()
}

/* ---------- Arayüz işlemleri ---------- */
pub fn listele(oyun: &Path) -> Vec<Value> {
    let Ok(kok) = tipli(oyun) else { return vec![] };
    let Some(Nbt::Liste(_, d)) = alan(&kok, "servers") else {
        return vec![];
    };
    d.iter()
        .filter(|s| !alan_metin(s, "ip").is_empty() && !matches!(alan(s, "hidden"), Some(Nbt::Bayt(1))))
        .map(|s| {
            let ip = alan_metin(s, "ip");
            let ad = alan_metin(s, "name");
            let ikon = alan_metin(s, "icon");
            json!({
                "ad": if ad.is_empty() { ip.clone() } else { ad },
                "adres": ip,
                "ikon": if ikon.is_empty() { Value::Null } else { Value::from(format!("data:image/png;base64,{ikon}")) }
            })
        })
        .collect()
}

pub fn ekle(oyun: &Path, ad: &str, adres: &str) -> Sonuc<Value> {
    let ad: String = ad.trim().chars().take(64).collect();
    let adres: String = adres.chars().filter(|c| !c.is_whitespace()).take(253).collect();
    if adres.is_empty() || !adres.chars().all(|c| c.is_ascii_alphanumeric() || ".-_:[]".contains(c)) {
        return Err("Geçerli bir sunucu adresi yaz (ör. play.kcz.net).".into());
    }
    let mut kok = tipli(oyun)?;
    let liste = sunucu_listesi(&mut kok);
    if liste.iter().any(|s| alan_metin(s, "ip").eq_ignore_ascii_case(&adres)) {
        return Err("Bu sunucu zaten listede.".into());
    }
    let gorunen = if ad.is_empty() { adres.clone() } else { ad };
    liste.push(Nbt::Bilesik(vec![
        (8, "ip".into(), Nbt::Metin(adres.clone())),
        (8, "name".into(), Nbt::Metin(gorunen.clone())),
    ]));
    kaydet(oyun, &kok)?;
    Ok(json!({ "ad": gorunen, "adres": adres }))
}

pub fn sil(oyun: &Path, adres: &str) -> Sonuc<bool> {
    let mut kok = tipli(oyun)?;
    let liste = sunucu_listesi(&mut kok);
    let i = liste
        .iter()
        .position(|s| alan_metin(s, "ip") == adres)
        .ok_or("Sunucu bulunamadı.")?;
    liste.remove(i);
    kaydet(oyun, &kok)?;
    Ok(true)
}

/// Normal Minecraft'ın (%APPDATA%\.minecraft) sunucu listesi
fn dis_klasor() -> PathBuf {
    resmi_minecraft_klasoru()
}

pub fn dis_sayisi() -> usize {
    listele(&dis_klasor()).len()
}

pub fn ice_aktar(oyun: &Path) -> Sonuc<usize> {
    let kaynak = oku(&std::fs::read(dosya_yolu(&dis_klasor())).h()?)?;
    let Some(Nbt::Liste(_, dis)) = alan(&kaynak, "servers") else {
        return Ok(0);
    };
    let dis = dis.clone();
    let mut kok = tipli(oyun)?;
    let liste = sunucu_listesi(&mut kok);
    let mut var: std::collections::HashSet<String> = liste.iter().map(|s| alan_metin(s, "ip").to_lowercase()).collect();
    let mut n = 0;
    for s in dis {
        let ip = alan_metin(&s, "ip").to_lowercase();
        if ip.is_empty() || var.contains(&ip) || matches!(alan(&s, "hidden"), Some(Nbt::Bayt(1))) {
            continue;
        }
        var.insert(ip);
        liste.push(s);
        n += 1;
    }
    if n > 0 {
        kaydet(oyun, &kok)?;
    }
    Ok(n)
}

/// servers.dat değişince (oyunda sunucu eklenince) arayüze haber ver
pub fn izle() {
    tauri::async_runtime::spawn(async {
        let yol = dosya_yolu(&oyun_klasoru());
        let zaman = |y: &Path| std::fs::metadata(y).and_then(|m| m.modified()).ok();
        let mut son = zaman(&yol);
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            // Oyun açıkken bekle: değişiklik oyun kapanınca yine fark edilir
            if crate::oyun::mesgul_mu() {
                continue;
            }
            let simdi = zaman(&yol);
            if simdi != son {
                son = simdi;
                gonder("sunucular-degisti", ());
            }
        }
    });
}

pub fn ikon_base64(veri: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(veri)
}
