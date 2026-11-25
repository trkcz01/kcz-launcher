package com.kcz.client;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;

/**
 * Oyun içinde arkadaşlar: launcher config/kcz-arkadaslar.json'a arkadaş listesini ve gelen
 * davetleri yazar; buradan yapılan davetler config/kcz-davet-istek.json ile launcher'a gider.
 * Hiçbir ağ işi oyunda yapılmaz.
 */
public final class Arkadaslar {
	/** son: en son görülme zamanı (ISO tarih, launcher'dan; bilinmiyorsa boş) */
	public record Arkadas(String ad, String uuid, boolean cevrimici, boolean oyunda, String sunucu, String son) {
	}

	/** "Çevrimdışı · 2 saat önce" (son görülme bilinmiyorsa sadece "Çevrimdışı") */
	public static String cevrimdisiYazi(Arkadas a) {
		String once = zamanOnce(a.son());
		return once.isEmpty() ? "Çevrimdışı" : "Çevrimdışı · " + once;
	}

	/** Launcher'daki "x dk/saat/gün önce" ile aynı yuvarlama */
	static String zamanOnce(String iso) {
		if (iso == null || iso.isBlank()) return "";
		java.time.Instant t;
		try {
			t = java.time.OffsetDateTime.parse(iso).toInstant();
		} catch (Exception e) {
			try {
				t = java.time.Instant.parse(iso);
			} catch (Exception e2) {
				return "";
			}
		}
		long dk = Math.round((System.currentTimeMillis() - t.toEpochMilli()) / 60000.0);
		if (dk < 60) return Math.max(1, dk) + " dk önce";
		long sa = Math.round(dk / 60.0);
		if (sa < 24) return sa + " saat önce";
		return Math.round(sa / 24.0) + " gün önce";
	}

	public record Davet(long id, String ad, String sunucu) {
	}

	public record Mesaj(long id, boolean benden, String metin) {
	}

	private static final SystemToast.SystemToastId TOAST = new SystemToast.SystemToastId(6000L);
	private static List<Arkadas> arkadaslar = List.of();
	private static List<Davet> davetler = List.of();
	private static final Set<Long> gorulenDavet = new HashSet<>();
	private static final Set<Long> gorulenBildirim = new HashSet<>();
	private static final Set<Long> gorulenMesaj = new HashSet<>();
	private static final java.util.Map<String, List<Mesaj>> sohbetler = new java.util.HashMap<>();
	/** Oyunda gelen ama sohbet ekranında henüz bakılmamış mesaj sayısı */
	private static final java.util.Map<String, Integer> okunmamis = new java.util.HashMap<>();
	/** Gönderildi ama launcher henüz onaylamadı (sohbette soluk görünür) */
	private static final java.util.Map<String, List<String>> gidiyor = new java.util.HashMap<>();
	/** Açık sohbet ekranının arkadaşı (o sohbete gelen mesaj okunmamış sayılmaz) */
	public static String acikSohbet = null;
	private static boolean ilk = true;
	/** Arkadaş oyuna girdi bildirimi için önceki durum */
	private static final java.util.Map<String, Boolean> oncekiOyunda = new java.util.HashMap<>();
	private static long sonOkuma = 0, sonDegisme = 0;
	private static boolean launcherVar = false;

	private Arkadaslar() {
	}

	private static Path dosya(String ad) {
		return FabricLoader.getInstance().getConfigDir().resolve(ad);
	}

	public static List<Arkadas> liste() {
		return arkadaslar;
	}

	public static List<Davet> davetler() {
		return davetler;
	}

	/** Launcher son 30 saniyede dosyayı yazdıysa bağlı sayılır */
	public static boolean bagli() {
		return launcherVar;
	}

	private static String yazi(JsonObject o, String k) {
		JsonElement e = o.get(k);
		return e == null || e.isJsonNull() ? "" : e.getAsString();
	}

	private static boolean dogru(JsonObject o, String k) {
		JsonElement e = o.get(k);
		return e != null && !e.isJsonNull() && e.getAsBoolean();
	}

	/** Her tick çağrılır; dosya 2 saniyede bir okunur */
	public static void tick(Minecraft mc) {
		long simdi = System.currentTimeMillis();
		if (simdi - sonOkuma < 2000) return;
		sonOkuma = simdi;
		Path p = dosya("kcz-arkadaslar.json");
		try {
			if (!Files.exists(p)) {
				launcherVar = false;
				return;
			}
			long degisme = Files.getLastModifiedTime(p).toMillis();
			launcherVar = simdi - degisme < 30_000;
			if (degisme == sonDegisme) return;
			sonDegisme = degisme;
			JsonObject k = JsonParser.parseString(Files.readString(p, StandardCharsets.UTF_8)).getAsJsonObject();
			Hesaplar.oku(k);
			KczOyunculari.oku(k);
			List<Arkadas> a = new ArrayList<>();
			JsonArray ka = k.has("arkadaslar") ? k.getAsJsonArray("arkadaslar") : new JsonArray();
			for (JsonElement e : ka) {
				JsonObject o = e.getAsJsonObject();
				a.add(new Arkadas(yazi(o, "ad"), yazi(o, "uuid"), dogru(o, "cevrimici"), dogru(o, "oyunda"), yazi(o, "sunucu"), yazi(o, "son")));
			}
			a.sort((x, y) -> {
				int fx = x.oyunda() ? 0 : x.cevrimici() ? 1 : 2, fy = y.oyunda() ? 0 : y.cevrimici() ? 1 : 2;
				return fx != fy ? fx - fy : x.ad().compareToIgnoreCase(y.ad());
			});
			// Arkadaş oyuna girdi
			for (Arkadas x : a) {
				Boolean once = oncekiOyunda.put(x.uuid(), x.oyunda());
				if (!ilk && x.oyunda() && Boolean.FALSE.equals(once) && Ayar.get().arkadasBildirim) {
					String s = x.sunucu() == null || x.sunucu().isEmpty() ? "" : x.sunucu();
					String burasi = sunucu(mc);
					toast(mc, x.ad() + " oyuna girdi", s.isEmpty() ? "KCZ Launcher" : s.equalsIgnoreCase(burasi) ? "Seninle aynı sunucuda!" : s);
				}
			}
			arkadaslar = a;
			List<Davet> d = new ArrayList<>();
			JsonArray da = k.has("davetler") ? k.getAsJsonArray("davetler") : new JsonArray();
			for (JsonElement e : da) {
				JsonObject o = e.getAsJsonObject();
				Davet v = new Davet(o.get("id").getAsLong(), yazi(o, "ad"), yazi(o, "sunucu"));
				d.add(v);
				if (gorulenDavet.add(v.id()) && !ilk) {
					toast(mc, v.ad() + " seni çağırıyor", v.sunucu() + " · KCZ Menü > Arkadaşlar'dan katıl");
					if (mc.player != null)
						mc.player.sendSystemMessage(Component.literal("§b[KCZ] §f" + v.ad() + " seni §e" + v.sunucu()
								+ "§f sunucusuna çağırıyor. §7Esc > KCZ Menü > Arkadaşlar > Katıl"));
				}
			}
			davetler = d;
			// Sohbetler
			if (k.has("sohbetler") && k.get("sohbetler").isJsonObject()) {
				for (var e : k.getAsJsonObject("sohbetler").entrySet()) {
					List<Mesaj> l = new ArrayList<>();
					for (JsonElement m : e.getValue().getAsJsonArray()) {
						JsonObject o = m.getAsJsonObject();
						l.add(new Mesaj(o.get("id").getAsLong(), dogru(o, "benden"), yazi(o, "metin")));
					}
					sohbetler.put(e.getKey(), l);
					// Onaylanan kendi mesajları "gidiyor"dan düşür
					List<String> g = gidiyor.get(e.getKey());
					if (g != null) g.removeIf(x -> l.stream().anyMatch(m -> m.benden() && m.metin().equals(x)));
				}
			}
			// Yeni gelen mesajlar: sohbete yaz, bildirim göster
			JsonArray ya = k.has("yeniMesajlar") ? k.getAsJsonArray("yeniMesajlar") : new JsonArray();
			for (JsonElement e : ya) {
				JsonObject o = e.getAsJsonObject();
				long id = o.get("id").getAsLong();
				if (!gorulenMesaj.add(id) || ilk) continue;
				String uuid = yazi(o, "uuid"), ad = yazi(o, "ad"), metin = yazi(o, "metin");
				if (uuid.equals(acikSohbet)) continue;
				okunmamis.merge(uuid, 1, Integer::sum);
				if (mc.player != null)
					mc.player.sendSystemMessage(Component.literal("§d✉ " + ad + "§7: §f" + metin + " §8(Esc > Arkadaşlar'dan cevap ver)"));
				else toast(mc, ad, metin);
			}
			if (ilk) for (JsonElement e : ya) gorulenMesaj.add(e.getAsJsonObject().get("id").getAsLong());
			JsonArray ba = k.has("bildirimler") ? k.getAsJsonArray("bildirimler") : new JsonArray();
			for (JsonElement e : ba) {
				JsonObject o = e.getAsJsonObject();
				if (gorulenBildirim.add(o.get("id").getAsLong()) && !ilk) toast(mc, "KCZ", yazi(o, "metin"));
			}
			ilk = false;
		} catch (Exception e) {
			KczClient.LOG.warn("KCZ arkadaş listesi okunamadı: {}", e.toString());
		}
	}

	/** Sağ üstte kısa bildirim */
	public static void bildir(Minecraft mc, String baslik, String metin) {
		toast(mc, baslik, metin);
	}

	private static void toast(Minecraft mc, String baslik, String metin) {
		try {
			SystemToast.addOrUpdate(mc.gui.toastManager(), TOAST, Component.literal(baslik), Component.literal(metin));
		} catch (Throwable t) {
			KczClient.LOG.warn("KCZ bildirimi gösterilemedi: {}", t.toString());
		}
	}

	/** Şu an bağlı olunan sunucu (tek oyunculu dünyada null) */
	public static String sunucu(Minecraft mc) {
		ServerData s = mc.getCurrentServer();
		return s == null || mc.isLocalServer() ? null : s.ip;
	}

	public static List<Mesaj> sohbet(String uuid) {
		return sohbetler.getOrDefault(uuid, List.of());
	}

	public static List<String> gidenler(String uuid) {
		return gidiyor.getOrDefault(uuid, List.of());
	}

	public static int okunmamis(String uuid) {
		return okunmamis.getOrDefault(uuid, 0);
	}

	public static int okunmamisToplam() {
		return okunmamis.values().stream().mapToInt(Integer::intValue).sum();
	}

	public static void okundu(String uuid) {
		okunmamis.remove(uuid);
	}

	/** Launcher'a istek bırak (davet, mesaj, geçmiş, hesap) */
	static boolean istekBirak(Minecraft mc, JsonObject o) {
		if (!launcherVar) {
			toast(mc, "Gönderilemedi", "KCZ Launcher kapalı görünüyor.");
			return false;
		}
		Path p = dosya("kcz-davet-istek.json");
		try {
			JsonArray liste = Files.exists(p) ? JsonParser.parseString(Files.readString(p, StandardCharsets.UTF_8)).getAsJsonArray() : new JsonArray();
			liste.add(o);
			Path gecici = dosya("kcz-davet-istek.json.tmp");
			Files.writeString(gecici, liste.toString(), StandardCharsets.UTF_8);
			Files.move(gecici, p, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			return true;
		} catch (Exception e) {
			toast(mc, "Gönderilemedi", e.getMessage() == null ? "Dosya yazılamadı" : e.getMessage());
			return false;
		}
	}

	/** Arkadaşa mesaj (hangi sunucuda olursa olsun, oyunda olmasa da gider) */
	public static void mesajGonder(Minecraft mc, Arkadas a, String metin) {
		String m = metin == null ? "" : metin.strip();
		if (m.isEmpty()) return;
		if (m.length() > 500) m = m.substring(0, 500);
		JsonObject o = new JsonObject();
		o.addProperty("tur", "mesaj");
		o.addProperty("kime", a.uuid());
		o.addProperty("ad", a.ad());
		o.addProperty("metin", m);
		if (istekBirak(mc, o)) gidiyor.computeIfAbsent(a.uuid(), x -> new ArrayList<>()).add(m);
	}

	/** Konumlu anı: ekran görüntüsünü arkadaşa gönder (launcher küçültüp yollar) */
	public static boolean fotoGonder(Minecraft mc, Arkadas a, Path dosya, String not, Foto.Konum k) {
		JsonObject o = new JsonObject();
		o.addProperty("tur", "foto");
		o.addProperty("kime", a.uuid());
		o.addProperty("ad", a.ad());
		o.addProperty("dosya", dosya.getFileName().toString());
		String n = not == null ? "" : not.strip();
		if (!n.isEmpty()) o.addProperty("not", n.length() > 200 ? n.substring(0, 200) : n);
		if (k != null) {
			o.addProperty("sunucu", k.sunucu());
			o.addProperty("boyut", k.boyut());
			o.addProperty("x", k.x());
			o.addProperty("y", k.y());
			o.addProperty("z", k.z());
		}
		return istekBirak(mc, o);
	}

	/** Sohbet ekranı açılınca geçmişi iste */
	public static void gecmisIste(Minecraft mc, Arkadas a) {
		JsonObject o = new JsonObject();
		o.addProperty("tur", "gecmis");
		o.addProperty("kime", a.uuid());
		if (launcherVar) istekBirak(mc, o);
	}

	/** Arkadaşı bulunduğun sunucuya davet et (launcher gönderir) */
	public static void davetEt(Minecraft mc, Arkadas a) {
		String s = sunucu(mc);
		if (s == null) {
			toast(mc, "Davet gönderilemedi", "Önce bir sunucuya gir; tek oyunculu dünyaya davet olmaz.");
			return;
		}
		if (!launcherVar) {
			toast(mc, "Davet gönderilemedi", "KCZ Launcher kapalı görünüyor.");
			return;
		}
		JsonObject o = new JsonObject();
		o.addProperty("tur", "davet");
		o.addProperty("kime", a.uuid());
		o.addProperty("ad", a.ad());
		o.addProperty("sunucu", s);
		if (istekBirak(mc, o)) toast(mc, "Davet gidiyor", a.ad() + " → " + s);
	}

	/** Davet edilen sunucuya geç: bulunduğun dünyadan çıkılır, sunucuya bağlanılır */
	public static void katil(Minecraft mc, String adres) {
		if (adres == null || adres.isBlank() || !ServerAddress.isValidAddress(adres)) {
			toast(mc, "Katılınamadı", "Sunucu adresi geçersiz.");
			return;
		}
		String simdiki = sunucu(mc);
		if (adres.equalsIgnoreCase(simdiki)) {
			toast(mc, "Zaten buradasın", adres);
			return;
		}
		mc.execute(() -> {
			if (mc.level != null) mc.disconnectFromWorld(Component.literal("Arkadaşının sunucusuna geçiliyor…"));
			ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(adres),
					new ServerData(adres, adres, ServerData.Type.OTHER), false, null);
		});
	}
}
