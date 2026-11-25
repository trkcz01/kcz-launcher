package com.kcz.client;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.AbstractClientPlayer;

/**
 * KCZ yakınlık sesli sohbeti (oyun tarafı). Ses launcher'da (WebRTC) işlenir; oyun sadece
 * bulunduğun sunucuyu, yakındaki oyuncuları (mesafeleriyle) ve bas-konuş tuşunu
 * config/kcz-ses.json'a yazar. Launcher kimin konuştuğunu config/kcz-ses-durum.json'a yazar.
 */
public final class Ses {
	/** Bu mesafeden uzaktakiler hiç duyulmaz (blok) */
	public static final double MESAFE = 48;

	private static int sayac = 0;
	private static String sonYazilan = "";
	private static long sonYazma = 0, sonOkuma = 0;
	private static boolean dosyaVar = false;
	private static int bagli = 0;
	private static List<String> konusanlar = List.of();
	private static String hata = "";
	private static boolean konusuyor = false;

	private Ses() {
	}

	private static Path dosya(String ad) {
		return FabricLoader.getInstance().getConfigDir().resolve(ad);
	}

	public static void tick(Minecraft mc) {
		Ayar a = Ayar.get();
		if (!a.yakinSes) {
			if (dosyaVar) {
				try {
					Files.deleteIfExists(dosya("kcz-ses.json"));
				} catch (Exception e) {
					// önemli değil
				}
				dosyaVar = false;
				konusanlar = List.of();
				bagli = 0;
			}
			return;
		}
		konusuyor = KczClient.KONUS.isDown() && mc.player != null;
		if (++sayac % 4 != 0) return; // saniyede 5 kez
		JsonObject o = new JsonObject();
		String sunucu = Arkadaslar.sunucu(mc);
		boolean oyunda = mc.player != null && mc.level != null && sunucu != null;
		o.addProperty("aktif", oyunda);
		if (oyunda) {
			o.addProperty("sunucu", sunucu.toLowerCase());
			o.addProperty("ben", mc.player.getUUID().toString());
			o.addProperty("konus", konusuyor);
			o.addProperty("sadeceArkadas", a.sesSadeceArkadas);
			JsonArray l = new JsonArray();
			for (AbstractClientPlayer p : mc.level.players()) {
				if (p == mc.player) continue;
				double m = mc.player.distanceTo(p);
				if (m > MESAFE + 16) continue;
				JsonObject y = new JsonObject();
				y.addProperty("uuid", p.getUUID().toString());
				y.addProperty("ad", p.getName().getString());
				y.addProperty("mesafe", Math.round(m * 10) / 10.0);
				l.add(y);
			}
			o.add("yakinlar", l);
		}
		String m = o.toString();
		long simdi = System.currentTimeMillis();
		// Değişmediyse saniyede bir yaz (launcher "oyun hâlâ açık" diye anlasın)
		if (!m.equals(sonYazilan) || simdi - sonYazma > 1000) {
			try {
				Path gecici = dosya("kcz-ses.json.tmp");
				Files.writeString(gecici, m, StandardCharsets.UTF_8);
				Files.move(gecici, dosya("kcz-ses.json"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
				sonYazilan = m;
				sonYazma = simdi;
				dosyaVar = true;
			} catch (Exception e) {
				// bir sonraki turda tekrar
			}
		}
		if (simdi - sonOkuma > 400) {
			sonOkuma = simdi;
			try {
				Path d = dosya("kcz-ses-durum.json");
				if (Files.exists(d) && simdi - Files.getLastModifiedTime(d).toMillis() < 10_000) {
					JsonObject k = JsonParser.parseString(Files.readString(d, StandardCharsets.UTF_8)).getAsJsonObject();
					bagli = k.has("bagli") ? k.get("bagli").getAsInt() : 0;
					List<String> kl = new ArrayList<>();
					if (k.has("konusanlar")) for (JsonElement e : k.getAsJsonArray("konusanlar")) kl.add(e.getAsString());
					konusanlar = kl;
					hata = k.has("hata") && !k.get("hata").isJsonNull() ? k.get("hata").getAsString() : "";
				} else {
					bagli = 0;
					konusanlar = List.of();
					hata = "Launcher bağlı değil";
				}
			} catch (Exception e) {
				// yarım yazılmış dosya: sonra tekrar
			}
		}
	}

	/** Sol altta küçük ses göstergesi: konuşuyor musun, kimler konuşuyor */
	public static void ciz(GuiGraphicsExtractor g, DeltaTracker d) {
		Minecraft mc = Minecraft.getInstance();
		if (!Ayar.get().yakinSes || mc.player == null) return;
		var font = mc.font;
		int x = 6, y = mc.getWindow().getGuiScaledHeight() - 60;
		List<String> satirlar = new ArrayList<>();
		List<Integer> renkler = new ArrayList<>();
		for (String k : konusanlar) {
			satirlar.add("♪ " + k);
			renkler.add(0xFF86EFAC);
		}
		if (konusuyor) {
			satirlar.add(hata.isEmpty() ? "● Konuşuyorsun" : "● " + hata);
			renkler.add(hata.isEmpty() ? 0xFFF87171 : 0xFFFBBF24);
		}
		for (int i = 0; i < satirlar.size(); i++) {
			String s = satirlar.get(i);
			int yy = y - (satirlar.size() - 1 - i) * 12;
			g.fill(x - 2, yy - 2, x + font.width(s) + 3, yy + 10, 0x88000000);
			g.text(font, s, x, yy, renkler.get(i), false);
		}
	}

	public static int bagli() {
		return bagli;
	}
}
