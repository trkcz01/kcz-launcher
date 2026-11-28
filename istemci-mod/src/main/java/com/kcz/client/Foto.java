package com.kcz.client;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.Stream;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

/**
 * Konumlu Anı: F2 ile çekilen ekran görüntüsü, çekildiği yerle (sunucu, boyut, koordinat) birlikte
 * tek tuşla arkadaşa gider. Gelen fotoğraf oyunun içinde açılır; "Yol göster" ile ekranda o yere ok çıkar.
 * Ağ işi yok: gönderme ve indirme launcher'da yapılır.
 */
public final class Foto {
	/** Fotoğrafın çekildiği yer (sunucu tek oyunculuda boş) */
	public record Konum(String sunucu, String boyut, int x, int y, int z) {
	}

	public record Doku(Identifier id, int w, int h) {
	}

	/** Gelen/giden fotoğrafın bilgisi (launcher config/kcz-fotolar/<id>.json'a yazar) */
	public record Bilgi(String not, Konum konum, boolean benden) {
	}

	// Son çekilen ekran görüntüsü
	private static Path sonDosya = null;
	private static Konum sonKonum = null;
	private static long kartBitis = 0;
	// Klasör taraması
	private static long sonTarama = 0, enYeni = -1;
	private static Path bekleyen = null;
	private static long bekleyenBoyut = -1;
	// Yol gösterme
	private static Konum hedef = null;
	private static String hedefAd = null;

	// Dokular: en fazla 6 tane bellekte (yeni kullanılan kalır)
	private static final Map<String, Doku> dokular = new LinkedHashMap<>(16, 0.75f, true);
	private static final Set<String> yukleniyor = ConcurrentHashMap.newKeySet();
	private static final Set<String> bozuk = ConcurrentHashMap.newKeySet();
	private static final ConcurrentLinkedQueue<Object[]> hazir = new ConcurrentLinkedQueue<>();
	private static int sayac = 0;

	private Foto() {
	}

	static Path ekranKlasoru(Minecraft mc) {
		return mc.gameDirectory.toPath().resolve("screenshots");
	}

	static Path fotoKlasoru() {
		return FabricLoader.getInstance().getConfigDir().resolve("kcz-fotolar");
	}

	/** Mesaj "[foto:123]" ise 123, değilse -1 */
	public static long fotoId(String metin) {
		if (metin == null || !metin.startsWith("[foto:") || !metin.endsWith("]")) return -1;
		try {
			return Long.parseLong(metin.substring(6, metin.length() - 1));
		} catch (NumberFormatException e) {
			return -1;
		}
	}

	public static Path png(long id) {
		return fotoKlasoru().resolve(id + ".png");
	}

	public static Bilgi bilgi(long id) {
		try {
			Path p = fotoKlasoru().resolve(id + ".json");
			if (!Files.exists(p)) return null;
			JsonObject o = JsonParser.parseString(Files.readString(p, StandardCharsets.UTF_8)).getAsJsonObject();
			Konum k = null;
			if (o.has("x") && o.get("x").isJsonPrimitive()) {
				k = new Konum(yazi(o, "sunucu"), yazi(o, "boyut"), o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt());
			}
			boolean ben = o.has("benden") && o.get("benden").isJsonPrimitive() && o.get("benden").getAsBoolean();
			return new Bilgi(yazi(o, "not"), k, ben);
		} catch (Exception e) {
			return null;
		}
	}

	private static String yazi(JsonObject o, String k) {
		JsonElement e = o.get(k);
		return e == null || e.isJsonNull() ? "" : e.getAsString();
	}

	public static Konum simdikiKonum(Minecraft mc) {
		if (mc.player == null || mc.level == null) return null;
		String s = Arkadaslar.sunucu(mc);
		return new Konum(s == null ? "" : s, mc.level.dimension().identifier().toString(),
				(int) Math.floor(mc.player.getX()), (int) Math.floor(mc.player.getY()), (int) Math.floor(mc.player.getZ()));
	}

	public static String boyutAdi(String b) {
		if (b == null) return "";
		return switch (b) {
			case "minecraft:overworld" -> Dil.t("Overworld");
			case "minecraft:the_nether" -> Dil.t("Nether");
			case "minecraft:the_end" -> Dil.t("End");
			default -> b.contains(":") ? b.substring(b.indexOf(':') + 1) : b;
		};
	}

	public static String konumYazisi(Konum k) {
		if (k == null) return "";
		String s = "X " + k.x() + "  Y " + k.y() + "  Z " + k.z() + " · " + boyutAdi(k.boyut());
		return k.sunucu() == null || k.sunucu().isEmpty() ? s + Dil.t(" · tek oyunculu") : s + " · " + k.sunucu();
	}

	public static Path sonDosya() {
		return sonDosya;
	}

	public static Konum sonKonum() {
		return sonKonum;
	}

	/* ---------- Dokular ---------- */

	/** Resim dokusu: hazırsa döner, değilse arka planda okumaya başlar ve null döner */
	public static Doku doku(Path png) {
		if (png == null) return null;
		String k = png.toString();
		Doku d = dokular.get(k);
		if (d != null) return d;
		if (bozuk.contains(k) || !Files.exists(png) || !yukleniyor.add(k)) return null;
		Thread t = new Thread(() -> {
			try (InputStream in = Files.newInputStream(png)) {
				hazir.add(new Object[] { k, NativeImage.read(in) });
			} catch (Exception e) {
				bozuk.add(k);
				yukleniyor.remove(k);
			}
		}, "KCZ foto");
		t.setDaemon(true);
		t.start();
		return null;
	}

	private static void dokulariKaydet(Minecraft mc) {
		Object[] o;
		while ((o = hazir.poll()) != null) {
			String k = (String) o[0];
			NativeImage img = (NativeImage) o[1];
			try {
				Identifier id = KczClient.id("foto/" + (sayac++));
				mc.getTextureManager().register(id, new DynamicTexture(() -> "KCZ foto", img));
				dokular.put(k, new Doku(id, img.getWidth(), img.getHeight()));
			} catch (Throwable t) {
				bozuk.add(k);
				KczClient.LOG.warn("KCZ fotoğrafı yüklenemedi: {}", t.toString());
			}
			yukleniyor.remove(k);
			while (dokular.size() > 6) {
				Iterator<Map.Entry<String, Doku>> it = dokular.entrySet().iterator();
				Map.Entry<String, Doku> e = it.next();
				mc.getTextureManager().release(e.getValue().id());
				it.remove();
			}
		}
	}

	/** Resmi kutuya oranını bozmadan sığdırıp çizer; çizdiği alanı {x, y, w, h} döner */
	public static int[] ciz(GuiGraphicsExtractor g, Doku d, int x, int y, int w, int h) {
		float o = Math.min(w / (float) d.w(), h / (float) d.h());
		int rw = Math.max(1, Math.round(d.w() * o)), rh = Math.max(1, Math.round(d.h() * o));
		int rx = x + (w - rw) / 2, ry = y + (h - rh) / 2;
		g.blit(d.id(), rx, ry, rx + rw, ry + rh, 0f, 1f, 0f, 1f);
		return new int[] { rx, ry, rw, rh };
	}

	/* ---------- Her tick ---------- */

	public static void tick(Minecraft mc) {
		dokulariKaydet(mc);
		while (KczClient.FOTO.consumeClick()) {
			if (mc.gui.screen() != null) continue;
			if (sonDosya == null || !Files.exists(sonDosya)) {
				Arkadaslar.bildir(mc, Dil.t("Önce fotoğraf çek"), Dil.t("F2'ye bas, sonra ") + tus() + Dil.t(" ile arkadaşına gönder."));
			} else {
				kartBitis = 0;
				mc.gui.setScreen(new FotoPaylasEkrani(null, sonDosya, sonKonum));
			}
		}
		// Yol göster: varınca kapanır
		if (hedef != null && mc.player != null && ayniYer(mc, hedef)) {
			double dx = hedef.x() + 0.5 - mc.player.getX(), dz = hedef.z() + 0.5 - mc.player.getZ();
			if (dx * dx + dz * dz < 16 && Math.abs(hedef.y() - mc.player.getY()) < 6) {
				Arkadaslar.bildir(mc, Dil.t("Vardın!"), hedefAd == null ? Dil.t("Anının çekildiği yer") : hedefAd + Dil.t(" burada çekmişti"));
				hedef = null;
			}
		}
		long simdi = System.currentTimeMillis();
		if (simdi - sonTarama < 700) return;
		sonTarama = simdi;
		tara(mc);
	}

	/** screenshots klasöründe yeni fotoğraf var mı? Dosya yazılması bitince (boyutu sabitlenince) kart çıkar. */
	private static void tara(Minecraft mc) {
		Path k = ekranKlasoru(mc);
		try {
			if (bekleyen != null) {
				long b = Files.exists(bekleyen) ? Files.size(bekleyen) : -1;
				if (b > 0 && b == bekleyenBoyut) {
					sonDosya = bekleyen;
					bekleyen = null;
					if (mc.level != null) kartBitis = System.currentTimeMillis() + 9000;
					doku(sonDosya);
				} else {
					bekleyenBoyut = b;
				}
				return;
			}
			if (!Files.isDirectory(k)) {
				if (enYeni < 0) enYeni = 0;
				return;
			}
			Path yeni = null;
			long z = enYeni;
			try (Stream<Path> s = Files.list(k)) {
				for (Path p : (Iterable<Path>) s::iterator) {
					if (!p.getFileName().toString().toLowerCase().endsWith(".png")) continue;
					long m = Files.getLastModifiedTime(p).toMillis();
					if (m > z) {
						z = m;
						yeni = p;
					}
				}
			}
			boolean ilk = enYeni < 0;
			enYeni = Math.max(z, 0);
			// İlk taramada eskiler gösterilmez
			if (ilk || yeni == null) return;
			bekleyen = yeni;
			bekleyenBoyut = Files.size(yeni);
			sonKonum = simdikiKonum(mc);
		} catch (Exception e) {
			// klasör o an değişiyor olabilir
		}
	}

	private static String tus() {
		return KczClient.FOTO.getTranslatedKeyMessage().getString();
	}

	/* ---------- Yol gösterme ---------- */

	public static void yolGoster(Konum k, String kimin) {
		hedef = k;
		hedefAd = kimin;
	}

	public static void yoluKapat() {
		hedef = null;
	}

	public static boolean yolAcik() {
		return hedef != null;
	}

	/** Aynı sunucu (ya da ikisi de tek oyunculu) ve aynı boyut mu? */
	public static boolean ayniSunucu(Minecraft mc, Konum k) {
		String s = Arkadaslar.sunucu(mc);
		return k != null && (s == null ? "" : s).equalsIgnoreCase(k.sunucu() == null ? "" : k.sunucu());
	}

	private static boolean ayniYer(Minecraft mc, Konum k) {
		return mc.level != null && ayniSunucu(mc, k) && mc.level.dimension().identifier().toString().equals(k.boyut());
	}

	private static final String[] OKLAR = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };

	/* ---------- Ekran: fotoğraf kartı ve yol oku ---------- */

	public static void ciz(GuiGraphicsExtractor g, DeltaTracker d) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		Ayar a = Ayar.get();
		int zemin = Ayar.renk(a.tema.zemin, 0xE6, 0xE6232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);

		// Yol oku (ekranın üstünde, ortada)
		if (hedef != null) {
			String yazi;
			if (!ayniSunucu(mc, hedef)) {
				yazi = Dil.t("Anı başka sunucuda: ") + (hedef.sunucu().isEmpty() ? Dil.t("tek oyunculu dünya") : hedef.sunucu());
			} else if (!ayniYer(mc, hedef)) {
				yazi = Dil.t("Anı ") + boyutAdi(hedef.boyut()) + Dil.t("'da");
			} else {
				double dx = hedef.x() + 0.5 - mc.player.getX(), dz = hedef.z() + 0.5 - mc.player.getZ();
				double yon = Math.toDegrees(Math.atan2(-dx, dz));
				double fark = ((yon - mc.player.getYRot()) % 360 + 540) % 360 - 180;
				int i = ((int) Math.round(fark / 45.0) % 8 + 8) % 8;
				int mesafe = (int) Math.round(Math.sqrt(dx * dx + dz * dz));
				int dy = hedef.y() - (int) Math.floor(mc.player.getY());
				yazi = OKLAR[i] + "  " + mesafe + Dil.t(" blok") + (Math.abs(dy) > 3 ? (dy > 0 ? "  ·  ↑" + dy : "  ·  ↓" + (-dy)) : "")
						+ (hedefAd == null ? "" : "  ·  " + hedefAd + Dil.t("'in anısı"));
			}
			int w = mc.font.width(yazi) + 16;
			int x = (sw - w) / 2, y = 22;
			g.fill(x, y, x + w, y + 16, zemin);
			g.fill(x, y + 15, x + w, y + 16, vurgu);
			g.text(mc.font, yazi, x + 8, y + 4, 0xFFF1F5F9, false);
		}

		// F2 sonrası kart (sağ altta)
		if (sonDosya == null || System.currentTimeMillis() > kartBitis || mc.gui.screen() != null) return;
		int w = 150, h = 112;
		int x = sw - w - 8, y = sh - h - 8;
		g.fill(x, y, x + w, y + h, zemin);
		g.fill(x, y, x + 2, y + h, vurgu);
		Doku dk = doku(sonDosya);
		if (dk != null) ciz(g, dk, x + 8, y + 8, w - 14, 70);
		else g.fill(x + 8, y + 8, x + w - 6, y + 78, 0x33FFFFFF);
		g.text(mc.font, Dil.t("Konumlu anı"), x + 8, y + 82, 0xFFF1F5F9, false);
		String alt = "[" + tus() + Dil.t("] Arkadaşına gönder");
		g.text(mc.font, mc.font.plainSubstrByWidth(alt, w - 14), x + 8, y + 95, vurgu, false);
	}
}
