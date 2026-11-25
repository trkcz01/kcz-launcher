// Derleme betiği: KÇZ Client modunun derlenmiş jar dosyalarını launcher'ın içine gömer.
// istemci-mod/cikti/kcz-client-<sürüm>.jar (TAURI-KUR.bat oluşturur). Yoksa launcher yine derlenir.
use std::path::Path;

fn main() {
    let klasor = Path::new("../istemci-mod/cikti");
    println!("cargo:rerun-if-changed=../istemci-mod/cikti");
    let mut kod = String::from("pub static JARLAR: &[(&str, &[u8])] = &[\n");
    if let Ok(d) = std::fs::read_dir(klasor) {
        let mut dosyalar: Vec<_> = d.flatten().collect();
        dosyalar.sort_by_key(|e| e.file_name());
        for e in dosyalar {
            let ad = e.file_name().to_string_lossy().to_string();
            let Some(surum) = ad.strip_prefix("kcz-client-").and_then(|x| x.strip_suffix(".jar")) else {
                continue;
            };
            let Ok(tam) = std::fs::canonicalize(e.path()) else { continue };
            let mut yol = tam.display().to_string();
            if let Some(x) = yol.strip_prefix(r"\\?\") {
                yol = x.to_string();
            }
            println!("cargo:rerun-if-changed={yol}");
            kod.push_str(&format!("    ({surum:?}, include_bytes!({yol:?})),\n"));
        }
    }
    kod.push_str("];\n");
    let cikti = Path::new(&std::env::var("OUT_DIR").unwrap()).join("istemci_jarlar.rs");
    std::fs::write(cikti, kod).unwrap();
    tauri_build::build()
}
