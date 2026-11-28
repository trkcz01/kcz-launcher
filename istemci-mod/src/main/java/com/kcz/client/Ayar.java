package com.kcz.client;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

/**
 * KCZ Client ayarları: config/kcz-client.json
 * Launcher oyunu açmadan önce bu dosyayı (tema renkleriyle) yazar,
 * oyun kapanınca da oyunda yapılan değişiklikleri geri okur.
 */
public class Ayar {
	// Oyun içi özellikler (hemen uygulanır)
	public boolean zoom = true;
	/** En fazla yakınlaşma (tekerlekle buraya kadar çıkılır) */
	public float zoomKat = 4f;
	/** C'ye basınca ilk yakınlaşma */
	public float zoomBaslangic = 3f;
	/** HUD parçalarının ekrandaki yeri: ad -> {x, y} (ekranın oranı, 0..1). Yoksa varsayılan yer. */
	public java.util.Map<String, float[]> hudKonum = new java.util.HashMap<>();
	public boolean fps = true;
	public boolean ping = true;
	public boolean tuslar = false;
	public String konum = "sol-ust";
	public boolean koordinat = false;   // XYZ ve yön
	public boolean zirh = false;        // zırh dayanıklılığı
	public boolean iksir = false;       // iksir etkileri ve kalan süre
	public boolean cps = false;         // saniyedeki tıklama
	public boolean eldeki = false;      // eldeki eşyanın dayanıklılığı
	public boolean okSayisi = false;    // envanterdeki ok sayısı
	public boolean totem = false;       // envanterdeki totem sayısı
	public boolean hiz = false;         // hız (blok/saniye)
	public boolean saat = false;        // gerçek saat
	public boolean surekliKos = false;  // ileri giderken kendiliğinden koş
	public boolean egilmeTut = false;   // eğilme: bir kere bas, açık kalsın
	public boolean nisangah = false;    // özel nişangah
	public String nisangahSekil = "arti";
	public String nisangahRenk = "beyaz";
	public int nisangahBoyut = 2;       // 1-3
	public boolean nisangahDinamik = true; // yaratığa bakınca renk değişsin
	// KCZ optimizasyonu: pencere arkadayken FPS'i düşür
	public boolean arkaplanFps = true;
	// Tam ekran (F11) çerçevesiz pencere olur: Alt-Tab'da kararma ve donma olmaz
	public boolean kenarliksiz = true;

	// Düşük sistem / Güçlü sistem (ikisi aynı anda açık olmaz). Ayrıntılar ⋮ ile seçilir.
	public boolean dusukSistem = false;
	public boolean gucluSistem = false;
	public Dusuk dusuk = new Dusuk();
	public Guclu guclu = new Guclu();
	/** Dinamik görüş mesafesinin hedeflediği FPS */
	public int hedefFps = 60;

	/** Zayıf bilgisayarlar: FPS için kısılanlar */
	public static class Dusuk {
		public boolean animasyon = true;     // su, lav, ateş animasyonları durur
		public boolean uzakVarlik = true;    // uzaktaki yaratıklar ve eşya çerçeveleri çizilmez
		public boolean parcacik = true;      // parçacık sınırı
		public boolean menuFps = true;       // menüde / duraklatınca 30 FPS
		public boolean dinamikGorus = true;  // FPS düşerse görüş mesafesi kendiliğinden azalır
		public int gorusAlt = 6;             // dinamik görüşün inebileceği en düşük mesafe
		public boolean tabela = true;        // uzaktaki tabela yazıları gizlenir
		public boolean yagis = true;         // yağmur ve kar azalır
		public boolean gokyuzu = true;       // yıldızlar ve gün batımı renkleri kapanır
		public boolean isimEtiketi = true;   // uzaktaki isimler gizlenir
	}

	/** Güçlü bilgisayarlar: görüntü kalitesi */
	public static class Guclu {
		public boolean kenar = true;         // kenar yumuşatma (FXAA)
		public boolean keskin = true;        // keskinleştirme
		public boolean renk = false;         // renk canlılığı ve kontrast
		public boolean bulaniklik = false;   // hareket bulanıklığı
		public boolean hzFps = true;         // FPS sınırı ekranın Hz'i
	}

	// Eklentiler (launcher bir sonraki açılışta uygular)
	public boolean optimizasyon = true;
	public boolean shader = false;
	public boolean sesliSohbet = false;
	public boolean uzakGorus = false;
	/** KCZ yakınlık sesli sohbeti (sunucuda mod gerekmez, sadece KCZ kullananlar birbirini duyar) */
	public boolean yakinSes = false;
	/** Sesli sohbette sadece arkadaşlarla bağlan (IP adresi yabancılara gitmesin) */
	public boolean sesSadeceArkadas = true;
	/** Arkadaş oyuna girince bildir */
	public boolean arkadasBildirim = true;
	public boolean kayit = false;

	public Tema tema = new Tema();

	public static class Tema {
		public String zemin = "#232328";
		public String zemin2 = "#0d0d10";
		public String vurgu = "#a1a1aa";
		/** Launcher teması (gri, siyah, end, nether, dunya, performans): menüdeki maskot ve süsler */
		public String ad = "gri";
		/** Launcher'da "Tema maskotu" açık mı */
		public boolean maskot = true;
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Ayar mevcut = new Ayar();

	public static Ayar get() {
		return mevcut;
	}

	private static Path dosya() {
		return FabricLoader.getInstance().getConfigDir().resolve("kcz-client.json");
	}

	public static void yukle() {
		try {
			Path d = dosya();
			if (Files.exists(d)) {
				Ayar a = GSON.fromJson(Files.readString(d, StandardCharsets.UTF_8), Ayar.class);
				if (a != null) {
					if (a.tema == null) a.tema = new Tema();
					if (a.konum == null) a.konum = "sol-ust";
					if (a.zoomKat < 1.5f || a.zoomKat > 128f) a.zoomKat = 4f;
					if (a.zoomBaslangic < 1.5f || a.zoomBaslangic > 16f) a.zoomBaslangic = 3f;
					if (a.hudKonum == null) a.hudKonum = new java.util.HashMap<>();
					if (a.nisangahSekil == null) a.nisangahSekil = "arti";
					if (a.nisangahRenk == null) a.nisangahRenk = "beyaz";
					if (a.dusuk == null) a.dusuk = new Dusuk();
					if (a.guclu == null) a.guclu = new Guclu();
					if (a.dusuk.gorusAlt < 2 || a.dusuk.gorusAlt > 32) a.dusuk.gorusAlt = 6;
					if (a.hedefFps != 30 && a.hedefFps != 60 && a.hedefFps != 100) a.hedefFps = 60;
					if (a.dusukSistem && a.gucluSistem) a.gucluSistem = false;
					mevcut = a;
				}
			}
		} catch (Exception e) {
			KczClient.LOG.warn("KCZ ayarları okunamadı: {}", e.toString());
		}
	}

	public static void kaydet() {
		try {
			Files.createDirectories(dosya().getParent());
			Files.writeString(dosya(), GSON.toJson(mevcut), StandardCharsets.UTF_8);
		} catch (Exception e) {
			KczClient.LOG.warn("KCZ ayarları yazılamadı: {}", e.toString());
		}
	}

	/** "#rrggbb" -> 0xAARRGGBB */
	public static int renk(String hex, int alfa, int yedek) {
		try {
			String h = hex.startsWith("#") ? hex.substring(1) : hex;
			int rgb = Integer.parseInt(h, 16) & 0xFFFFFF;
			return (alfa & 0xFF) << 24 | rgb;
		} catch (Exception e) {
			return yedek;
		}
	}

	/** Rengi beyaza doğru açar (0..1) */
	public static int ac(int argb, float oran) {
		int a = argb >>> 24, r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		r = (int) (r + (255 - r) * oran);
		g = (int) (g + (255 - g) * oran);
		b = (int) (b + (255 - b) * oran);
		return a << 24 | r << 16 | g << 8 | b;
	}

	/** Vurgu açık renkse üstüne koyu yazı */
	public static int ustYazi(int argb) {
		int r = argb >> 16 & 0xFF, g = argb >> 8 & 0xFF, b = argb & 0xFF;
		return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 0xFF0B0D10 : 0xFFFFFFFF;
	}
}
