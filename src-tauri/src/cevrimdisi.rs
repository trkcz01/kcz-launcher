// Çevrimdışı oturum yardımcıları: Microsoft girişi olmadan, girilen kullanıcı adından
// vanilla ile aynı offline UUID'yi üretir (tek oyunculu ve LAN için).
use uuid::Builder;

/// Minecraft Java kullanıcı adı kuralı: 3-16 karakter, harf, rakam veya _
pub fn gecerli_ad(ad: &str) -> bool {
    (3..=16).contains(&ad.len()) && ad.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Vanilla offline UUID'si: MD5("OfflinePlayer:<ad>") + UUIDv3 bitleri.
/// Java'daki UUID.nameUUIDFromBytes ile aynı sonucu verir.
pub fn uuid_hesapla(ad: &str) -> String {
    let ozet = md5::compute(format!("OfflinePlayer:{ad}").as_bytes());
    Builder::from_md5_bytes(ozet.0).into_uuid().simple().to_string()
}
