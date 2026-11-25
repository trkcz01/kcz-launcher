// Masaüstü kısayolu: tıklayınca launcher'ı göstermeden oyunu açıp doğrudan bir sunucuya bağlanır.
// Kısayol launcher'ı "--sunucu <adres>" ile başlatır; launcher zaten açıksa adres ona iletilir.
use crate::ortak::*;
use serde_json::Value;
use std::sync::{LazyLock, Mutex};

/// Arayüz hazır olunca alınacak bekleyen sunucu adresi
static BEKLEYEN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Komut satırında "--sunucu <adres>" var mı
pub fn argumandan(args: &[String]) -> Option<String> {
    let i = args.iter().position(|a| a == "--sunucu")?;
    let adres = args.get(i + 1)?.trim().to_string();
    guvenli(&adres).then_some(adres)
}

fn guvenli(s: &str) -> bool {
    !s.is_empty() && s.len() <= 100 && s.chars().all(|c| c.is_ascii_alphanumeric() || ".-_:".contains(c))
}

pub fn beklet(adres: String) {
    *BEKLEYEN.lock().unwrap() = Some(adres);
}

/// Açık launcher'a yeni kısayol tıklaması geldi: arayüze hemen ilet
pub fn ilet(adres: String) {
    gonder("kisayol-oyna", adres);
}

#[tauri::command]
pub fn kisayol_bekleyen() -> Value {
    match BEKLEYEN.lock().unwrap().take() {
        Some(a) => Value::String(a),
        None => Value::Null,
    }
}

/// Dosya adında sorun çıkarmayacak görünen ad
fn dosya_adi(ad: &str) -> String {
    let s: String = ad
        .chars()
        .filter(|c| c.is_alphanumeric() || " -_.".contains(*c))
        .take(40)
        .collect();
    let s = s.trim().to_string();
    if s.is_empty() { "Sunucu".into() } else { s }
}

#[tauri::command]
pub fn kisayol_olustur(adres: String, ad: String) -> Value {
    sonuc_json(olustur(&adres, &ad))
}

/// Windows'ta masaüstü klasörü (OneDrive'a taşınmış olabilir): kayıt defterindeki gerçek yer
#[cfg(windows)]
fn masaustu_windows() -> std::path::PathBuf {
    use winreg::enums::HKEY_CURRENT_USER;
    let ev = std::env::var("USERPROFILE").map(std::path::PathBuf::from).unwrap_or_default();
    let kayit = winreg::RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
        .and_then(|k| k.get_value::<String, _>("Desktop"))
        .ok()
        .map(|y| y.replace("%USERPROFILE%", &ev.display().to_string()))
        .map(std::path::PathBuf::from)
        .filter(|y| y.is_dir());
    kayit.unwrap_or_else(|| ev.join("Desktop"))
}

fn olustur(adres: &str, ad: &str) -> Sonuc<String> {
    if !guvenli(adres) {
        return Err("Bu sunucu adresiyle kısayol oluşturulamıyor.".into());
    }
    let ad = dosya_adi(ad);
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().h()?;
        let dosya = masaustu_windows().join(format!("KCZ - {ad}.lnk"));
        let mut k = mslnk::ShellLink::new(&exe).h()?;
        k.set_arguments(Some(format!("--sunucu {adres}")));
        k.set_name(Some(format!("KCZ Launcher ile {ad} sunucusuna bağlan")));
        k.set_icon_location(Some(exe.display().to_string()));
        if let Some(k2) = exe.parent() {
            k.set_working_dir(Some(k2.display().to_string()));
        }
        k.create_lnk(&dosya).h()?;
        Ok(format!("KCZ - {ad}"))
    }
    #[cfg(not(windows))]
    {
        // AppImage ise kendi yolu, değilse çalışan program
        let exe = std::env::var("APPIMAGE")
            .map(std::path::PathBuf::from)
            .or_else(|_| std::env::current_exe())
            .h()?;
        let ev = std::env::var("HOME").map(std::path::PathBuf::from).h()?;
        let masaustu = ["Desktop", "Masaüstü"]
            .iter()
            .map(|d| ev.join(d))
            .find(|d| d.is_dir())
            .unwrap_or_else(|| ev.join("Desktop"));
        let _ = std::fs::create_dir_all(&masaustu);
        let dosya = masaustu.join(format!("kcz-{}.desktop", ad.replace(' ', "-").to_lowercase()));
        let icerik = format!(
            "[Desktop Entry]\nType=Application\nName=KCZ - {ad}\nComment=KCZ Launcher ile {ad} sunucusuna bağlan\nExec=\"{}\" --sunucu {adres}\nIcon=kcz-launcher\nTerminal=false\nCategories=Game;\n",
            exe.display()
        );
        std::fs::write(&dosya, icerik).h()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&dosya, std::fs::Permissions::from_mode(0o755));
        }
        Ok(format!("KCZ - {ad}"))
    }
}
