//! Oyun sürecine işlemci ayarları ve bilgisayar bilgisi.
//!
//! Windows:
//! - Enerji kısıtlaması kapalı: Windows oyunu "verimlilik modu"na (EcoQoS) almaz, zamanlayıcı
//!   çözünürlüğünü düşürmez. Özellikle Alt-Tab sonrası FPS düşüşü ve kare takılmalarını önler.
//! - Güçlü çekirdekler: hibrit Intel (12-14. nesil ve sonrası) işlemcilerde oyun P-çekirdeklerine,
//!   iki farklı L3 önbellekli AMD X3D işlemcilerde büyük önbellekli (3D V-Cache) çekirdeklere
//!   yönlendirilir (SetProcessDefaultCpuSets). Oyunun içine hiçbir şey dokunmaz, oynanış aynı.
//! Linux: işlemci ayarı yapılmaz; sadece bilgi (RAM, çekirdek) verilir.

use serde_json::{json, Value};

/// Bilgisayardaki mantıksal işlemci sayısı
pub fn cekirdek_sayisi() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
}

/// Toplam fiziksel bellek (GB, yuvarlanmış). Bulunamazsa 0.
pub fn toplam_ram_gb() -> u64 {
    #[cfg(windows)]
    {
        win::toplam_ram_gb()
    }
    #[cfg(not(windows))]
    {
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|m| {
                m.lines()
                    .find(|l| l.starts_with("MemTotal:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|kb| kb.parse::<u64>().ok())
            })
            .map(|kb| (kb as f64 / 1024.0 / 1024.0).round() as u64)
            .unwrap_or(0)
    }
}

/// Ayarlar ve öneriler için: işlemci hibrit mi, kaç güçlü çekirdek var
pub fn bilgi() -> Value {
    #[cfg(windows)]
    {
        let s = win::secim();
        json!({
            "tur": s.tur,
            "guclu": s.idler.len(),
            "toplam": s.toplam,
            "ram": toplam_ram_gb(),
            "cekirdek": cekirdek_sayisi(),
        })
    }
    #[cfg(not(windows))]
    {
        json!({ "tur": "yok", "guclu": 0, "toplam": cekirdek_sayisi(), "ram": toplam_ram_gb(), "cekirdek": cekirdek_sayisi() })
    }
}

/// Oyun açıldıktan hemen sonra çağrılır. guclu: Ayarlar > Performans > "Güçlü çekirdekleri kullan"
pub fn oyuna_uygula(pid: u32, guclu: bool) {
    #[cfg(windows)]
    {
        std::thread::spawn(move || win::uygula(pid, guclu));
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, guclu);
    }
}

#[cfg(windows)]
mod win {
    use crate::ortak::log;
    use std::ffi::c_void;

    type Handle = *mut c_void;

    #[repr(C)]
    struct GucKisitlama {
        version: u32,
        control_mask: u32,
        state_mask: u32,
    }

    #[repr(C)]
    struct BellekDurumu {
        length: u32,
        memory_load: u32,
        total_phys: u64,
        avail_phys: u64,
        total_page_file: u64,
        avail_page_file: u64,
        total_virtual: u64,
        avail_virtual: u64,
        avail_extended_virtual: u64,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
        fn CloseHandle(h: Handle) -> i32;
        fn SetProcessInformation(h: Handle, class: i32, info: *const c_void, size: u32) -> i32;
        fn GetSystemCpuSetInformation(info: *mut u8, len: u32, returned: *mut u32, process: Handle, flags: u32) -> i32;
        fn SetProcessDefaultCpuSets(h: Handle, ids: *const u32, count: u32) -> i32;
        fn GetLogicalProcessorInformationEx(rel: i32, buf: *mut u8, len: *mut u32) -> i32;
        fn GlobalMemoryStatusEx(durum: *mut BellekDurumu) -> i32;
    }

    const PROCESS_SET_INFORMATION: u32 = 0x0200;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const PROCESS_SET_LIMITED_INFORMATION: u32 = 0x2000;
    const PROCESS_POWER_THROTTLING: i32 = 4;
    const THROTTLE_EXECUTION_SPEED: u32 = 0x1;
    const THROTTLE_IGNORE_TIMER_RESOLUTION: u32 = 0x4;
    const RELATION_CACHE: i32 = 2;

    pub fn toplam_ram_gb() -> u64 {
        let mut d = BellekDurumu {
            length: std::mem::size_of::<BellekDurumu>() as u32,
            memory_load: 0,
            total_phys: 0,
            avail_phys: 0,
            total_page_file: 0,
            avail_page_file: 0,
            total_virtual: 0,
            avail_virtual: 0,
            avail_extended_virtual: 0,
        };
        if unsafe { GlobalMemoryStatusEx(&mut d) } == 0 {
            return 0;
        }
        (d.total_phys as f64 / 1024.0 / 1024.0 / 1024.0).round() as u64
    }

    /// Bir mantıksal işlemci (CPU set)
    struct Islemci {
        id: u32,
        grup: u16,
        mantiksal: u8,
        verim_sinifi: u8,
    }

    fn islemciler() -> Vec<Islemci> {
        let mut uzunluk: u32 = 0;
        unsafe {
            GetSystemCpuSetInformation(std::ptr::null_mut(), 0, &mut uzunluk, std::ptr::null_mut(), 0);
        }
        if uzunluk == 0 {
            return vec![];
        }
        let mut tampon = vec![0u8; uzunluk as usize];
        let mut donen: u32 = 0;
        if unsafe { GetSystemCpuSetInformation(tampon.as_mut_ptr(), uzunluk, &mut donen, std::ptr::null_mut(), 0) } == 0 {
            return vec![];
        }
        let mut l = vec![];
        let mut o = 0usize;
        while o + 32 <= donen as usize {
            let boyut = u32::from_le_bytes(tampon[o..o + 4].try_into().unwrap()) as usize;
            let tur = u32::from_le_bytes(tampon[o + 4..o + 8].try_into().unwrap());
            if boyut < 32 {
                break;
            }
            if tur == 0 {
                l.push(Islemci {
                    id: u32::from_le_bytes(tampon[o + 8..o + 12].try_into().unwrap()),
                    grup: u16::from_le_bytes(tampon[o + 12..o + 14].try_into().unwrap()),
                    mantiksal: tampon[o + 14],
                    verim_sinifi: tampon[o + 18],
                });
            }
            o += boyut;
        }
        l
    }

    /// L3 önbellekleri: (boyut bayt, grup, işlemci maskesi)
    fn l3_onbellekler() -> Vec<(u32, u16, u64)> {
        let mut uzunluk: u32 = 0;
        unsafe {
            GetLogicalProcessorInformationEx(RELATION_CACHE, std::ptr::null_mut(), &mut uzunluk);
        }
        if uzunluk == 0 {
            return vec![];
        }
        let mut tampon = vec![0u8; uzunluk as usize];
        if unsafe { GetLogicalProcessorInformationEx(RELATION_CACHE, tampon.as_mut_ptr(), &mut uzunluk) } == 0 {
            return vec![];
        }
        let mut l = vec![];
        let mut o = 0usize;
        while o + 56 <= uzunluk as usize {
            let boyut = u32::from_le_bytes(tampon[o + 4..o + 8].try_into().unwrap()) as usize;
            if boyut < 56 {
                break;
            }
            let seviye = tampon[o + 8];
            let kapasite = u32::from_le_bytes(tampon[o + 12..o + 16].try_into().unwrap());
            if seviye == 3 {
                let maske = u64::from_le_bytes(tampon[o + 40..o + 48].try_into().unwrap());
                let grup = u16::from_le_bytes(tampon[o + 48..o + 50].try_into().unwrap());
                l.push((kapasite, grup, maske));
            }
            o += boyut;
        }
        l
    }

    pub struct Secim {
        /// "hibrit" (Intel P-çekirdek), "x3d" (AMD büyük önbellek) ya da "yok"
        pub tur: &'static str,
        pub idler: Vec<u32>,
        pub toplam: usize,
    }

    /// Oyunun çalışacağı güçlü çekirdekleri bulur (yoksa boş: hepsi kullanılır)
    pub fn secim() -> Secim {
        let l = islemciler();
        let toplam = l.len();
        // 1) Hibrit işlemci: verim sınıfı en yüksek olanlar (P-çekirdekler)
        let en_yuksek = l.iter().map(|x| x.verim_sinifi).max().unwrap_or(0);
        let en_dusuk = l.iter().map(|x| x.verim_sinifi).min().unwrap_or(0);
        if en_yuksek > en_dusuk {
            let idler: Vec<u32> = l.iter().filter(|x| x.verim_sinifi == en_yuksek).map(|x| x.id).collect();
            // Çok az güçlü çekirdek varsa (ör. 2) kısıtlamak zarar verir
            if idler.len() >= 4 {
                return Secim { tur: "hibrit", idler, toplam };
            }
        }
        // 2) AMD X3D: L3 önbellek boyutları farklıysa büyük olanın çekirdekleri
        let l3 = l3_onbellekler();
        if l3.len() >= 2 {
            let buyuk = l3.iter().map(|x| x.0).max().unwrap_or(0);
            let kucuk = l3.iter().map(|x| x.0).min().unwrap_or(0);
            if buyuk > kucuk.saturating_mul(2) {
                let idler: Vec<u32> = l
                    .iter()
                    .filter(|x| {
                        l3.iter().any(|(k, g, m)| *k == buyuk && *g == x.grup && x.mantiksal < 64 && (m >> x.mantiksal) & 1 == 1)
                    })
                    .map(|x| x.id)
                    .collect();
                if idler.len() >= 4 {
                    return Secim { tur: "x3d", idler, toplam };
                }
            }
        }
        Secim { tur: "yok", idler: vec![], toplam }
    }

    pub fn uygula(pid: u32, guclu: bool) {
        let h = unsafe { OpenProcess(PROCESS_SET_INFORMATION | PROCESS_SET_LIMITED_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            log("İşlemci ayarı: oyun sürecine erişilemedi.");
            return;
        }
        // Enerji kısıtlaması kapalı (verimlilik modu ve zamanlayıcı kısması yok)
        let durum = GucKisitlama {
            version: 1,
            control_mask: THROTTLE_EXECUTION_SPEED | THROTTLE_IGNORE_TIMER_RESOLUTION,
            state_mask: 0,
        };
        let ok = unsafe {
            SetProcessInformation(h, PROCESS_POWER_THROTTLING, &durum as *const _ as *const c_void, std::mem::size_of::<GucKisitlama>() as u32)
        };
        if ok != 0 {
            log("İşlemci ayarı: Windows enerji kısıtlaması oyunda kapalı.");
        }
        if guclu {
            let s = secim();
            if !s.idler.is_empty() {
                let ok = unsafe { SetProcessDefaultCpuSets(h, s.idler.as_ptr(), s.idler.len() as u32) };
                let ad = if s.tur == "x3d" { "büyük önbellekli (X3D)" } else { "güçlü (P)" };
                if ok != 0 {
                    log(format!("İşlemci ayarı: oyun {ad} çekirdeklerde ({}/{}).", s.idler.len(), s.toplam));
                } else {
                    log("İşlemci ayarı: güçlü çekirdek seçimi yapılamadı.");
                }
            }
        }
        unsafe {
            CloseHandle(h);
        }
    }
}
