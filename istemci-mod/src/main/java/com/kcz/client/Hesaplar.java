package com.kcz.client;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.exceptions.AuthenticationException;
import com.mojang.authlib.minecraft.UserApiService;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ProfileKeyPairManager;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.chat.report.ReportEnvironment;
import net.minecraft.client.multiplayer.chat.report.ReportingContext;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.telemetry.ClientTelemetryManager;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Util;

import com.kcz.client.hesap.SurumServisi;
import com.kcz.client.mixin.MinecraftHesapErisim;

/**
 * Oyun içinde hesap değiştirme ve ekleme.
 *
 * Hesaplar launcher'da durur (giriş anahtarları Windows kasasında); oyun hiçbir anahtarı saklamaz.
 * - Launcher hesap listesini (sadece ad + uuid) köprü dosyasına (kcz-arkadaslar.json) yazar.
 * - Oyun "hesap_gec" / "hesap_ekle" isteğini kcz-davet-istek.json ile bırakır.
 * - Launcher o hesabın oturumunu tek seferlik kcz-hesap-oturum.json'a yazar; oyun okur, hemen siler
 *   ve Minecraft'ın hesaba bağlı nesnelerini yeni hesapla yeniden kurar.
 */
public final class Hesaplar {
	public record Hesap(String uuid, String ad) {
	}

	private static final long GECIS_ZAMAN_ASIMI = 45_000;

	private static List<Hesap> liste = List.of();
	/** Oyundan başlatılan "hesap ekle" girişi: "", "bekliyor", "kod", "hata", "tamam" */
	private static String girisDurum = "";
	private static String girisKod = "";
	private static String girisHata = "";
	private static long girisId = 0;

	/** Cevabı beklenen geçiş isteği (0: yok) */
	private static long gecisId = 0;
	private static long gecisZamani = 0;
	private static String gecisAd = "";
	/** Hesap ekranında gösterilen durum yazısı */
	private static String durum = "";
	private static boolean durumHata = false;
	private static boolean degistiriliyor = false;
	/** Ekran yenilensin diye her değişiklikte artar */
	private static int surum = 0;

	private Hesaplar() {
	}

	public static List<Hesap> liste() {
		return liste;
	}

	public static String girisDurum() {
		return girisDurum;
	}

	public static String girisKod() {
		return girisKod;
	}

	public static String girisHata() {
		return girisHata;
	}

	public static String durum() {
		return durum;
	}

	public static boolean durumHata() {
		return durumHata;
	}

	public static boolean mesgul() {
		return gecisId != 0 || degistiriliyor;
	}

	public static int surum() {
		return surum;
	}

	/** Oyunda şu an açık hesap mı? (uuid tiresiz gelir) */
	public static boolean oyundakiMi(Minecraft mc, Hesap h) {
		return tiresiz(mc.getUser().getProfileId()).equalsIgnoreCase(h.uuid().replace("-", ""));
	}

	private static String tiresiz(UUID u) {
		return u.toString().replace("-", "");
	}

	private static UUID uuidCoz(String s) {
		String t = s.replace("-", "");
		if (t.length() != 32) {
			throw new IllegalArgumentException("Geçersiz uuid: " + s);
		}
		return UUID.fromString(t.substring(0, 8) + "-" + t.substring(8, 12) + "-" + t.substring(12, 16) + "-"
				+ t.substring(16, 20) + "-" + t.substring(20));
	}

	private static void durumYaz(String yazi, boolean hata) {
		durum = yazi;
		durumHata = hata;
		surum++;
	}

	private static String yazi(JsonObject o, String k) {
		JsonElement e = o == null ? null : o.get(k);
		return e == null || e.isJsonNull() ? "" : e.getAsString();
	}

	private static long sayi(JsonObject o, String k) {
		JsonElement e = o == null ? null : o.get(k);
		return e == null || e.isJsonNull() ? 0 : e.getAsLong();
	}

	/** Köprü dosyası her değiştiğinde Arkadaslar.tick içinden çağrılır. */
	static void oku(JsonObject k) {
		List<Hesap> l = new ArrayList<>();
		if (k.has("hesaplar") && k.get("hesaplar").isJsonObject()) {
			JsonArray a = k.getAsJsonObject("hesaplar").has("liste") ? k.getAsJsonObject("hesaplar").getAsJsonArray("liste") : new JsonArray();
			for (JsonElement e : a) {
				JsonObject o = e.getAsJsonObject();
				l.add(new Hesap(yazi(o, "uuid"), yazi(o, "ad")));
			}
		}
		if (!l.equals(liste)) {
			liste = List.copyOf(l);
			surum++;
		}
		// Oyundan başlatılan "hesap ekle" girişinin durumu
		if (k.has("hesapGiris") && k.get("hesapGiris").isJsonObject()) {
			JsonObject g = k.getAsJsonObject("hesapGiris");
			if (sayi(g, "id") == girisId && girisId != 0) {
				String d = yazi(g, "durum");
				if (!d.equals(girisDurum) || !yazi(g, "kod").equals(girisKod)) {
					girisDurum = d;
					girisKod = yazi(g, "kod");
					girisHata = yazi(g, "hata");
					if (d.equals("tamam")) {
						// Oturum dosyası geliyor: geçiş olarak bekle
						gecisId = girisId;
						gecisZamani = System.currentTimeMillis();
						gecisAd = yazi(g, "ad");
						durumYaz(gecisAd + " eklendi, hesaba geçiliyor…", false);
					}
					surum++;
				}
			}
		}
		// Geçiş isteğine launcher'ın cevabı (hata varsa)
		if (k.has("hesapSonuc") && k.get("hesapSonuc").isJsonObject()) {
			JsonObject s = k.getAsJsonObject("hesapSonuc");
			if (gecisId != 0 && sayi(s, "id") == gecisId && !yazi(s, "hata").isEmpty()) {
				gecisId = 0;
				durumYaz(yazi(s, "hata"), true);
			}
		}
	}

	/** Başka bir kayıtlı hesaba geç (launcher oturumu yeniler ve gönderir). */
	public static void gec(Minecraft mc, Hesap h) {
		if (mesgul()) {
			return;
		}
		long id = System.currentTimeMillis();
		JsonObject o = new JsonObject();
		o.addProperty("tur", "hesap_gec");
		o.addProperty("uuid", h.uuid());
		o.addProperty("id", id);
		if (Arkadaslar.istekBirak(mc, o)) {
			gecisId = id;
			gecisZamani = System.currentTimeMillis();
			gecisAd = h.ad();
			durumYaz(h.ad() + " hesabına geçiliyor…", false);
		}
	}

	/** Yeni Microsoft hesabı ekle: launcher tarayıcıda giriş sayfasını açar, kod burada gösterilir. */
	public static void ekle(Minecraft mc) {
		long id = System.currentTimeMillis();
		JsonObject o = new JsonObject();
		o.addProperty("tur", "hesap_ekle");
		o.addProperty("id", id);
		if (Arkadaslar.istekBirak(mc, o)) {
			girisId = id;
			girisDurum = "bekliyor";
			girisKod = "";
			girisHata = "";
			durumYaz("", false);
		}
	}

	public static void tarayiciAc(Minecraft mc) {
		JsonObject o = new JsonObject();
		o.addProperty("tur", "hesap_tarayici");
		Arkadaslar.istekBirak(mc, o);
	}

	public static void girisIptal(Minecraft mc) {
		JsonObject o = new JsonObject();
		o.addProperty("tur", "hesap_iptal");
		Arkadaslar.istekBirak(mc, o);
		girisId = 0;
		girisDurum = "";
		girisKod = "";
		surum++;
	}

	private static Path oturumDosyasi() {
		return FabricLoader.getInstance().getConfigDir().resolve("kcz-hesap-oturum.json");
	}

	/** Her tick: bekleyen geçiş varsa launcher'ın yazdığı oturum dosyasına bak. */
	public static void tick(Minecraft mc) {
		if (gecisId == 0) {
			return;
		}
		if (System.currentTimeMillis() - gecisZamani > GECIS_ZAMAN_ASIMI) {
			gecisId = 0;
			durumYaz("Launcher cevap vermedi. KÇZ Launcher açık mı?", true);
			return;
		}
		Path p = oturumDosyasi();
		if (!Files.exists(p)) {
			return;
		}
		JsonObject o;
		try {
			o = JsonParser.parseString(Files.readString(p, StandardCharsets.UTF_8)).getAsJsonObject();
		} catch (Exception e) {
			return; // launcher yazarken denk geldi; sonraki tick'te tekrar
		} finally {
			// Anahtar diskte kalmasın: okur okumaz sil (başkasına aitse de eskimiştir)
			try {
				Files.deleteIfExists(p);
			} catch (Exception ignored) {
			}
		}
		if (sayi(o, "id") != gecisId) {
			return;
		}
		gecisId = 0;
		String ad = yazi(o, "ad");
		String erisim = yazi(o, "erisim");
		UUID uuid;
		try {
			uuid = uuidCoz(yazi(o, "uuid"));
		} catch (Exception e) {
			durumYaz("Launcher'dan gelen hesap bilgisi bozuk.", true);
			return;
		}
		degistir(mc, ad, uuid, erisim, false);
	}

	/* ---------- İsimle giriş (çevrimdışı) ----------
	   Launcher'daki "Çevrimdışı Oyna" ile aynı: Microsoft girişi yok, UUID isimden hesaplanır
	   (vanilla: MD5("OfflinePlayer:<ad>")), böylece aynı isim her zaman aynı oyuncudur.
	   Sadece çevrimdışı (premium istemeyen) sunucularda ve tek oyunculuda geçerlidir.
	   Kullanılan isimler config/kcz-cevrimdisi.json'da durur (anahtar yok, sadece isim). */
	private static List<String> cevrimdisiAdlar = null;

	private static Path cevrimdisiDosyasi() {
		return FabricLoader.getInstance().getConfigDir().resolve("kcz-cevrimdisi.json");
	}

	public static List<String> cevrimdisiAdlar() {
		if (cevrimdisiAdlar == null) {
			List<String> l = new ArrayList<>();
			try {
				Path p = cevrimdisiDosyasi();
				if (Files.exists(p)) {
					JsonObject o = JsonParser.parseString(Files.readString(p, StandardCharsets.UTF_8)).getAsJsonObject();
					for (JsonElement e : o.getAsJsonArray("adlar")) {
						String ad = e.getAsString();
						if (gecerliAd(ad) && l.stream().noneMatch(x -> x.equalsIgnoreCase(ad))) {
							l.add(ad);
						}
					}
				}
			} catch (Exception e) {
				KczClient.LOG.warn("Çevrimdışı hesaplar okunamadı: {}", e.toString());
			}
			cevrimdisiAdlar = l;
		}
		return cevrimdisiAdlar;
	}

	private static void cevrimdisiKaydet() {
		try {
			JsonArray a = new JsonArray();
			cevrimdisiAdlar().forEach(a::add);
			JsonObject o = new JsonObject();
			o.add("adlar", a);
			Files.writeString(cevrimdisiDosyasi(), o.toString(), StandardCharsets.UTF_8);
		} catch (Exception e) {
			KczClient.LOG.warn("Çevrimdışı hesaplar kaydedilemedi: {}", e.toString());
		}
	}

	/** Minecraft kullanıcı adı kuralı (launcher ile aynı): 3-16 karakter, harf, rakam veya _ */
	public static boolean gecerliAd(String ad) {
		return ad != null && ad.matches("[A-Za-z0-9_]{3,16}");
	}

	public static UUID cevrimdisiUuid(String ad) {
		return UUID.nameUUIDFromBytes(("OfflinePlayer:" + ad).getBytes(StandardCharsets.UTF_8));
	}

	public static boolean oyundakiAdMi(Minecraft mc, String ad) {
		return mc.getUser().getProfileId().equals(cevrimdisiUuid(ad));
	}

	/** Yazılan isimle (çevrimdışı) oyuna geç; isim listeye eklenir. Launcher gerekmez. */
	public static void cevrimdisiGec(Minecraft mc, String ad) {
		if (mesgul()) {
			return;
		}
		if (!gecerliAd(ad)) {
			durumYaz("İsim 3-16 karakter olmalı: harf, rakam veya _", true);
			return;
		}
		List<String> l = cevrimdisiAdlar();
		if (l.stream().noneMatch(x -> x.equals(ad))) {
			l.removeIf(x -> x.equalsIgnoreCase(ad));
			l.add(0, ad);
			cevrimdisiKaydet();
			surum++;
		}
		degistir(mc, ad, cevrimdisiUuid(ad), "", true);
	}

	public static void cevrimdisiSil(String ad) {
		if (cevrimdisiAdlar().remove(ad)) {
			cevrimdisiKaydet();
			surum++;
		}
	}

	/** Hazırlık arka planda (ağ), uygulama ana thread'de. */
	private static void degistir(Minecraft mc, String ad, UUID uuid, String erisim, boolean cevrimdisi) {
		degistiriliyor = true;
		durumYaz(ad + " hesabına geçiliyor…", false);
		User yeni = new User(ad, uuid, erisim, Optional.empty(), Optional.empty());
		MinecraftHesapErisim e = (MinecraftHesapErisim) mc;
		CompletableFuture.supplyAsync(() -> {
			SurumServisi s = new SurumServisi(e, yeni, cevrimdisi);
			return new Object[] { s, s.kullaniciApi() };
		}, Util.nonCriticalIoPool()).whenComplete((sonuc, hata) -> mc.execute(() -> {
			degistiriliyor = false;
			if (hata != null) {
				KczClient.LOG.warn("Hesap değiştirilemedi", hata);
				durumYaz("Hesap değiştirilemedi: " + (hata.getMessage() == null ? hata.toString() : hata.getMessage()), true);
				return;
			}
			ServerData sunucu = mc.level != null && !mc.isLocalServer() ? mc.getCurrentServer() : null;
			boolean dunyada = mc.level != null;
			try {
				if (dunyada) {
					mc.disconnectFromWorld(Component.literal("Hesap değiştiriliyor…"));
				}
				uygula(mc, e, yeni, (SurumServisi) sonuc[0], (UserApiService) sonuc[1]);
			} catch (Throwable t) {
				KczClient.LOG.error("Hesap değiştirilirken hata", t);
				durumYaz("Hesap değiştirilemedi: " + t, true);
				if (dunyada) {
					mc.gui.setScreen(new TitleScreen());
				}
				return;
			}
			durumYaz(ad + " hesabına geçildi.", false);
			Arkadaslar.bildir(mc, "Hesap değiştirildi", ad);
			if (sunucu != null) {
				ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(sunucu.ip), sunucu, false, null);
			} else if (dunyada) {
				mc.gui.setScreen(new TitleScreen());
			}
		}));
	}

	/** Minecraft'ın hesaba bağlı nesnelerini, oyunun açılışta kurduğu şekilde yeniden kurar. */
	private static void uygula(Minecraft mc, MinecraftHesapErisim e, User yeni, SurumServisi s, UserApiService api) {
		e.kcz$kullaniciYaz(yeni);
		e.kcz$kullaniciApiYaz(api);
		e.kcz$ozelliklerYaz(CompletableFuture.supplyAsync(() -> {
			try {
				return api.fetchProperties();
			} catch (AuthenticationException ex) {
				KczClient.LOG.error("Hesap özellikleri alınamadı", ex);
				return UserApiService.OFFLINE_PROPERTIES;
			}
		}, Util.nonCriticalIoPool()));
		UUID id = yeni.getProfileId();
		e.kcz$profilYaz(CompletableFuture.supplyAsync(() -> mc.services().sessionService().fetchProfile(id, true), Util.nonCriticalIoPool()));
		s.sosyalKur(mc, e, api);
		try {
			mc.getTelemetryManager().close();
		} catch (Exception ignored) {
		}
		e.kcz$telemetriYaz(new ClientTelemetryManager(mc, api, yeni));
		// Sohbet imza anahtarları yeni hesabın olmalı, yoksa sunucu sohbette atar
		e.kcz$anahtarlarYaz(ProfileKeyPairManager.create(api, yeni, mc.gameDirectory.toPath()));
		e.kcz$raporlamaYaz(ReportingContext.create(ReportEnvironment.local(), api));
		KczClient.LOG.info("Oyundaki hesap değiştirildi: {}", yeni.getName());
	}
}
