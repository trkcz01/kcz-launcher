// Discord'da durum: oyun açıkken arkadaşların "KCZ Launcher — Minecraft 26.3 oynuyor" görür.
// Discord'un bilgisayardaki yerel bağlantısı (IPC) kullanılır; Discord kapalıysa sessizce hiçbir şey yapmaz.
use serde_json::{json, Value};
use std::sync::LazyLock;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

/// Discord Developer Portal'daki uygulama kimliği (Application ID). Boşken özellik kapalıdır.
const UYGULAMA_ID: &str = "1572715494006325258";

trait Akis: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Akis for T {}

static BAGLANTI: LazyLock<Mutex<Option<Box<dyn Akis>>>> = LazyLock::new(|| Mutex::new(None));

async fn yaz(akis: &mut Box<dyn Akis>, kod: u32, veri: &Value) -> std::io::Result<()> {
    let govde = serde_json::to_vec(veri).unwrap_or_default();
    let mut paket = Vec::with_capacity(8 + govde.len());
    paket.extend_from_slice(&kod.to_le_bytes());
    paket.extend_from_slice(&(govde.len() as u32).to_le_bytes());
    paket.extend_from_slice(&govde);
    akis.write_all(&paket).await?;
    akis.flush().await
}

async fn oku(akis: &mut Box<dyn Akis>) -> std::io::Result<Value> {
    let mut bas = [0u8; 8];
    akis.read_exact(&mut bas).await?;
    let boy = u32::from_le_bytes([bas[4], bas[5], bas[6], bas[7]]) as usize;
    if boy > 1 << 20 {
        return Err(std::io::Error::other("çok büyük paket"));
    }
    let mut govde = vec![0u8; boy];
    akis.read_exact(&mut govde).await?;
    Ok(serde_json::from_slice(&govde).unwrap_or(Value::Null))
}

#[cfg(windows)]
async fn ac(n: u32) -> Option<Box<dyn Akis>> {
    let ad = format!(r"\\.\pipe\discord-ipc-{n}");
    tokio::net::windows::named_pipe::ClientOptions::new()
        .open(ad)
        .ok()
        .map(|p| Box::new(p) as Box<dyn Akis>)
}

#[cfg(unix)]
async fn ac(n: u32) -> Option<Box<dyn Akis>> {
    let mut koklar: Vec<std::path::PathBuf> = vec![];
    for d in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"] {
        if let Ok(v) = std::env::var(d) {
            koklar.push(v.into());
        }
    }
    koklar.push("/tmp".into());
    for k in koklar {
        // Normal, Flatpak ve Snap Discord'u
        for alt in ["", "app/com.discordapp.Discord", "snap.discord"] {
            let yol = k.join(alt).join(format!("discord-ipc-{n}"));
            if let Ok(s) = tokio::net::UnixStream::connect(&yol).await {
                return Some(Box::new(s) as Box<dyn Akis>);
            }
        }
    }
    None
}

async fn baglan() -> Option<Box<dyn Akis>> {
    for n in 0..10 {
        if let Some(mut a) = ac(n).await {
            if yaz(&mut a, 0, &json!({ "v": 1, "client_id": UYGULAMA_ID })).await.is_err() {
                continue;
            }
            match tokio::time::timeout(std::time::Duration::from_secs(5), oku(&mut a)).await {
                Ok(Ok(v)) if v["evt"] == "READY" => return Some(a),
                _ => continue,
            }
        }
    }
    None
}

async fn etkinlik_gonder(etkinlik: Value) {
    if UYGULAMA_ID.is_empty() {
        return;
    }
    let mut kilit = BAGLANTI.lock().await;
    for _ in 0..2 {
        if kilit.is_none() {
            *kilit = baglan().await;
        }
        let Some(a) = kilit.as_mut() else { return };
        let istek = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": etkinlik },
            "nonce": uuid::Uuid::new_v4().to_string(),
        });
        let tamam = yaz(a, 1, &istek).await.is_ok()
            && matches!(tokio::time::timeout(std::time::Duration::from_secs(5), oku(a)).await, Ok(Ok(_)));
        if tamam {
            return;
        }
        // Discord yeniden başlatılmış olabilir: bağlantıyı yenileyip bir kez daha dene
        *kilit = None;
    }
}

/// Oyun açıldı
pub fn oynuyor(surum: &str) {
    if UYGULAMA_ID.is_empty() || !crate::ayarlar::getir().discord_durum {
        return;
    }
    let simdi = chrono::Utc::now().timestamp();
    let surum = surum.to_string();
    tauri::async_runtime::spawn(async move {
        etkinlik_gonder(json!({
            "details": format!("Minecraft {surum} oynuyor"),
            "state": "KCZ Launcher ile",
            "timestamps": { "start": simdi },
            "assets": { "large_image": "logo", "large_text": "KCZ Launcher" },
            "buttons": [{ "label": "KCZ Launcher'ı indir", "url": "https://github.com/trkcz01/kcz-launcher/releases/latest" }],
        }))
        .await;
    });
}

/// Oyun kapandı: durumu kaldır
pub fn temizle() {
    if UYGULAMA_ID.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async {
        etkinlik_gonder(Value::Null).await;
        // Bağlantıyı kapat ki Discord launcher'ı "oynuyor" göstermesin
        *BAGLANTI.lock().await = None;
    });
}
