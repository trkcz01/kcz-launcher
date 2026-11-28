package com.kcz.client;

import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

/**
 * Oyun sırasında performans ölçümü (launcher'ın "oyun sonu performans özeti" için).
 *
 * Dünyadayken her karenin süresi ölçülür: ortalama FPS, en kötü %1 ve %0,1 kareler, takılmalar
 * (50 ms üstü kareler) ve sebepleri (bellek temizliği mi, hızlı gidip yeni bölge yüklenirken mi).
 * Menüde, duraklatmada, pencere arkadayken ve dünyaya girişin ilk saniyelerinde ölçülmez (o anlarda
 * FPS bilerek düşük ya da yükleme var). Dünyadan çıkınca ya da oyun kapanırken config/kcz-oturum.json'a
 * yazılır, son 20 oturum config/kcz-oturumlar.json'da durur. Kendi yükü: kare başına bir saat okuması.
 */
public final class Olcum {
	private Olcum() {
	}

	/** Kare süresi histogramı: 0,25 ms adımlarla 0-250 ms, sonuncusu taşma */
	private static final int KUTU = 1000;
	private static final double ADIM_MS = 0.25;
	private static final long[] kutular = new long[KUTU + 1];
	private static long kareSayisi = 0L, toplamNs = 0L, sonKareNs = 0L;
	private static int takilma50 = 0, takilma100 = 0, takilma250 = 0;
	private static double enUzunMs = 0;
	/** Takılmalar: {bitiş (duvar saati ms), süre ms, hızlı gidiyor muydu (1/0)} (sebep sonda bulunur) */
	private static final List<double[]> takilmalar = new ArrayList<>();
	/** Bellek temizliği duraklamaları: {başlangıç ms, süre ms} (ayrı iş parçacığından gelir) */
	private static final ConcurrentLinkedDeque<long[]> gcler = new ConcurrentLinkedDeque<>();
	private static boolean gcDinleniyor = false;

	private static boolean aktif = false;
	private static long baslangicMs = 0L;
	/** Dünyaya giriş, boyut değişimi, ışınlanma: bu ana kadar ölçme (yükleme) */
	private static long beklemeBitisNs = 0L;
	private static Object sonDunya = null;
	private static double sonX, sonZ;
	private static boolean konumVar = false;
	/** Yatay hız (blok/sn), her tick */
	private static volatile double hiz = 0;
	private static long bellekEnCok = 0L;
	private static long gcSayisiBas = 0L, gcSureBas = 0L;
	/** Dünyadan çıkınca yazılacak son ayarlar (çıkıştan sonra oyuncu/dünya yok) */
	private static JsonObject sonAyar = null;
	private static String ekranKarti = null;

	/* ---------- Her kare (GameRenderer.render başı, KareOlcumMixin) ---------- */
	public static void kare() {
		long simdi = System.nanoTime();
		long once = sonKareNs;
		sonKareNs = simdi;
		if (!aktif || once == 0L || simdi < beklemeBitisNs) return;
		Minecraft mc = Minecraft.getInstance();
		// Menü, duraklatma, arka plan: FPS bilerek kısılır, ölçme
		if (mc.gui.screen() != null || !mc.isWindowActive() || mc.isPaused()) return;
		long dt = simdi - once;
		if (dt <= 0L || dt > 5_000_000_000L) return;
		double ms = dt / 1_000_000.0;
		int k = (int) (ms / ADIM_MS);
		kutular[Math.min(k, KUTU)]++;
		kareSayisi++;
		toplamNs += dt;
		if (ms >= 50) {
			takilma50++;
			if (ms >= 100) takilma100++;
			if (ms >= 250) takilma250++;
			if (ms > enUzunMs) enUzunMs = ms;
			if (takilmalar.size() < 2000) takilmalar.add(new double[] { System.currentTimeMillis(), ms, hiz > 12 ? 1 : 0 });
		}
	}

	/* ---------- Her tick: başlat/bitir, hız, bellek, ayarlar ---------- */
	public static void tick(Minecraft mc) {
		boolean dunyada = mc.level != null && mc.player != null;
		if (dunyada && !aktif && Ayar.get().olcum) basla(mc);
		else if (!dunyada && aktif) bitir();
		if (!aktif) return;
		try {
			long simdi = System.nanoTime();
			// Boyut değişti (Nether, End) ya da sunucu değişti: yükleme
			if (mc.level != sonDunya) {
				sonDunya = mc.level;
				beklemeBitisNs = simdi + 5_000_000_000L;
				konumVar = false;
			}
			double x = mc.player.getX(), z = mc.player.getZ();
			if (konumVar) {
				double m = Math.sqrt((x - sonX) * (x - sonX) + (z - sonZ) * (z - sonZ));
				if (m > 40) {
					// Işınlanma: yeni bölge yükleniyor
					beklemeBitisNs = simdi + 3_000_000_000L;
					hiz = 0;
				} else {
					hiz = hiz * 0.7 + m * 20 * 0.3;
				}
			}
			sonX = x;
			sonZ = z;
			konumVar = true;
			Runtime r = Runtime.getRuntime();
			bellekEnCok = Math.max(bellekEnCok, r.totalMemory() - r.freeMemory());
			// Saniyede bir ayarları al (dünyadan çıkınca bunlar yazılır)
			if (mc.level.getGameTime() % 20 == 0) sonAyar = ayarlar(mc);
		} catch (Throwable t) {
			KczClient.LOG.debug("Ölçüm: {}", t.toString());
		}
	}

	private static void basla(Minecraft mc) {
		java.util.Arrays.fill(kutular, 0L);
		kareSayisi = toplamNs = 0L;
		takilma50 = takilma100 = takilma250 = 0;
		enUzunMs = 0;
		takilmalar.clear();
		gcler.clear();
		bellekEnCok = 0L;
		konumVar = false;
		hiz = 0;
		sonDunya = mc.level;
		baslangicMs = System.currentTimeMillis();
		beklemeBitisNs = System.nanoTime() + 8_000_000_000L;
		long[] gc = gcToplam();
		gcSayisiBas = gc[0];
		gcSureBas = gc[1];
		if (!gcDinleniyor) {
			try {
				OlcumGc.kur((bas, sure) -> {
					if (gcler.size() > 5000) gcler.pollFirst();
					gcler.add(new long[] { bas, sure });
				});
				gcDinleniyor = true;
			} catch (Throwable t) {
				// jdk.management yoksa: sadece toplam süre (sebep ayrımı yapılmaz)
				gcDinleniyor = true;
				KczClient.LOG.info("KCZ ölçüm: bellek temizliği ayrıntısı yok ({})", t.toString());
			}
		}
		sonAyar = ayarlar(mc);
		aktif = true;
	}

	/** Oyun kapanırken de çağrılır */
	public static void bitir() {
		if (!aktif) return;
		aktif = false;
		try {
			yaz();
		} catch (Throwable t) {
			KczClient.LOG.warn("KCZ ölçüm yazılamadı: {}", t.toString());
		}
	}

	private static long[] gcToplam() {
		long sayi = 0, sure = 0;
		try {
			for (var b : ManagementFactory.getGarbageCollectorMXBeans()) {
				String ad = b.getName();
				if (ad.contains("Cycles") || ad.contains("Concurrent")) continue;
				sayi += Math.max(0, b.getCollectionCount());
				sure += Math.max(0, b.getCollectionTime());
			}
		} catch (Throwable ignored) {
		}
		return new long[] { sayi, sure };
	}

	/** Histogramda yüzdelik dilim (0-1): o dilimdeki kare süresi (ms) */
	private static double dilim(double oran) {
		long hedef = (long) Math.ceil(kareSayisi * oran);
		long say = 0;
		for (int i = 0; i <= KUTU; i++) {
			say += kutular[i];
			if (say >= hedef) return (i + 0.5) * ADIM_MS;
		}
		return KUTU * ADIM_MS;
	}

	private static void yaz() throws Exception {
		double saniye = toplamNs / 1e9;
		// Çok kısa oturum: anlamlı değil
		if (kareSayisi < 600 || saniye < 30) return;
		long bitis = System.currentTimeMillis();
		JsonObject o = new JsonObject();
		o.addProperty("surum", 1);
		o.addProperty("baslangic", baslangicMs);
		o.addProperty("bitis", bitis);
		o.addProperty("sure", Math.round(saniye));
		o.addProperty("kare", kareSayisi);
		o.addProperty("fps", yuvarla(kareSayisi / saniye));
		o.addProperty("fps1", yuvarla(1000.0 / dilim(0.99)));
		o.addProperty("fps01", yuvarla(1000.0 / dilim(0.999)));
		o.addProperty("medyanMs", yuvarla(dilim(0.5)));
		o.addProperty("takilma", takilma50);
		o.addProperty("buyukTakilma", takilma100);
		o.addProperty("cokBuyukTakilma", takilma250);
		o.addProperty("enUzunMs", Math.round(enUzunMs));
		// Takılmaların sebebi: aynı anda bellek temizliği duraklaması var mıydı, hızlı mı gidiliyordu
		int gcSebep = 0, yuklemeSebep = 0, digerSebep = 0;
		List<long[]> g = new ArrayList<>(gcler);
		for (double[] t : takilmalar) {
			double son = t[0], bas = son - t[1];
			boolean gc = false;
			for (long[] e : g) {
				if (e[1] >= 15 && e[0] <= son + 50 && e[0] + e[1] >= bas - 50) {
					gc = true;
					break;
				}
			}
			if (gc) gcSebep++;
			else if (t[2] > 0) yuklemeSebep++;
			else digerSebep++;
		}
		JsonObject sebep = new JsonObject();
		sebep.addProperty("gc", gcSebep);
		sebep.addProperty("yukleme", yuklemeSebep);
		sebep.addProperty("diger", digerSebep);
		o.add("sebep", sebep);
		long[] gc = gcToplam();
		JsonObject gco = new JsonObject();
		gco.addProperty("sayi", Math.max(0, gc[0] - gcSayisiBas));
		gco.addProperty("toplamMs", Math.max(0, gc[1] - gcSureBas));
		long enUzunGc = 0;
		for (long[] e : g) enUzunGc = Math.max(enUzunGc, e[1]);
		gco.addProperty("enUzunMs", enUzunGc);
		gco.addProperty("ayrinti", !g.isEmpty());
		o.add("gc", gco);
		JsonObject bellek = new JsonObject();
		long sinir = Runtime.getRuntime().maxMemory();
		bellek.addProperty("enCokMb", bellekEnCok / 1048576);
		bellek.addProperty("sinirMb", sinir / 1048576);
		bellek.addProperty("enCokYuzde", sinir > 0 ? Math.round(bellekEnCok * 100.0 / sinir) : 0);
		o.add("bellek", bellek);
		if (sonAyar != null) o.add("ayar", sonAyar);
		o.add("sistem", sistem());

		Path config = FabricLoader.getInstance().getConfigDir();
		Gson gson = new GsonBuilder().setPrettyPrinting().create();
		Files.writeString(config.resolve("kcz-oturum.json"), gson.toJson(o), StandardCharsets.UTF_8);
		// Geçmiş: son 20 oturumun kısa hali (karşılaştırma için)
		Path gecmis = config.resolve("kcz-oturumlar.json");
		JsonArray liste = new JsonArray();
		try {
			if (Files.exists(gecmis)) liste = JsonParser.parseString(Files.readString(gecmis, StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("liste");
		} catch (Exception ignored) {
		}
		JsonObject kisa = new JsonObject();
		for (String k : new String[] { "bitis", "sure", "fps", "fps1", "fps01", "takilma", "buyukTakilma", "enUzunMs" }) kisa.add(k, o.get(k));
		liste.add(kisa);
		while (liste.size() > 20) liste.remove(0);
		JsonObject kok = new JsonObject();
		kok.add("liste", liste);
		Files.writeString(gecmis, gson.toJson(kok), StandardCharsets.UTF_8);
		KczClient.LOG.info("KCZ ölçüm: {} sn, ort. {} FPS, %1 {} FPS, {} takılma", Math.round(saniye), o.get("fps"), o.get("fps1"), takilma50);
	}

	private static double yuvarla(double d) {
		return Math.round(d * 10) / 10.0;
	}

	private static JsonObject ayarlar(Minecraft mc) {
		JsonObject a = new JsonObject();
		try {
			var op = mc.options;
			a.addProperty("gorus", op.renderDistance().get());
			a.addProperty("simulasyon", op.simulationDistance().get());
			a.addProperty("fpsSiniri", op.framerateLimit().get());
			a.addProperty("vsync", op.enableVsync().get());
			a.addProperty("tamEkran", op.fullscreen().get());
			a.addProperty("parcacik", String.valueOf(op.particles().get()));
			a.addProperty("genislik", mc.getWindow().getWidth());
			a.addProperty("yukseklik", mc.getWindow().getHeight());
			a.addProperty("tekOyunculu", mc.hasSingleplayerServer());
			Ayar k = Ayar.get();
			a.addProperty("dusukSistem", k.dusukSistem);
			a.addProperty("gucluSistem", k.gucluSistem);
			a.addProperty("akilliFps", k.akilliFps);
			a.addProperty("ekranHz", Performans.ekranHz(mc));
		} catch (Throwable t) {
			KczClient.LOG.debug("Ölçüm ayarları: {}", t.toString());
		}
		return a;
	}

	private static JsonObject sistem() {
		JsonObject s = new JsonObject();
		s.addProperty("java", System.getProperty("java.version", ""));
		s.addProperty("islemci", Runtime.getRuntime().availableProcessors());
		s.addProperty("ekranKarti", ekranKarti());
		try {
			List<String> arg = ManagementFactory.getRuntimeMXBean().getInputArguments();
			s.addProperty("kompakt", arg.contains("-XX:+UseCompactObjectHeaders"));
			s.addProperty("aot", arg.stream().anyMatch(x -> x.startsWith("-XX:AOTCache")));
			s.addProperty("gc", arg.contains("-XX:+UseZGC") ? "ZGC" : "G1");
		} catch (Throwable ignored) {
		}
		return s;
	}

	/** Ekran kartının adı (sürümler arasında API değiştiği için yansıma ile; bulunamazsa boş) */
	private static String ekranKarti() {
		if (ekranKarti != null) return ekranKarti;
		String ad = "";
		try {
			Class<?> rs = Class.forName("com.mojang.blaze3d.systems.RenderSystem");
			Object cihaz = rs.getMethod("getDevice").invoke(null);
			for (String m : new String[] { "getRenderer", "getDeviceName", "renderer" }) {
				try {
					ad = String.valueOf(cihaz.getClass().getMethod(m).invoke(cihaz));
					break;
				} catch (NoSuchMethodException ignored) {
				}
			}
		} catch (Throwable ignored) {
		}
		ekranKarti = ad;
		return ad;
	}
}
