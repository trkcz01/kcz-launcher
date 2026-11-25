package com.kcz.client;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * Oyunda KÇZ kullananlar (her sunucuda, sunucuya bir şey kurmadan):
 * - Tab listesindeki isimler dakikada bir launcher'a sorulur; launcher KÇZ arka ucundaki "durumlar" ile
 *   şu an KÇZ'le oyunda olanları (durumunu paylaşanları) döndürür. Bunların isminin önünde tab'da KÇZ simgesi çıkar.
 * - Böyle birine eğilip, elin boşken sağ tıklayınca sunucuya gitmeden KÇZ menüsü açılır (arkadaş ekle, mesaj).
 */
public final class KczOyunculari {
	public record Kisi(String ad, String uuid) {
	}

	/** Tab'da isimden önce gelen simge (assets/kcz-client/font/simge.json, 8x7 piksel) */
	public static final Component SIMGE = Component.literal("")
			.withStyle(s -> s.withFont(new FontDescription.Resource(KczClient.id("simge"))).withColor(0xFFFFFF));

	private static final long ARALIK = 60_000;
	private static Map<String, Kisi> kisiler = Map.of(); // küçük harf ad -> kişi
	private static long sonSorgu = 0;
	private static String sonSunucu = null;
	private static long sonMenu = 0;

	private KczOyunculari() {
	}

	/** Bu isim KÇZ kullanıyor mu? Kendi ismimiz her zaman evet (biz de KÇZ'deyiz). */
	public static boolean kczMi(String ad) {
		if (ad == null) return false;
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null && ad.equalsIgnoreCase(mc.player.getGameProfile().name())) return true;
		return kisiler.containsKey(ad.toLowerCase(Locale.ROOT));
	}

	public static Kisi kisi(String ad) {
		return ad == null ? null : kisiler.get(ad.toLowerCase(Locale.ROOT));
	}

	/** Her tick: sunucudayken dakikada bir tab listesini launcher'a sor. */
	public static void tick(Minecraft mc) {
		ClientPacketListener baglanti = mc.getConnection();
		if (baglanti == null || mc.level == null || mc.player == null || mc.isLocalServer()) {
			if (!kisiler.isEmpty()) kisiler = Map.of();
			sonSunucu = null;
			return;
		}
		String sunucu = Arkadaslar.sunucu(mc);
		long simdi = System.currentTimeMillis();
		if (!Objects.equals(sunucu, sonSunucu)) {
			// Yeni sunucu: eski liste geçersiz, oyuncular yüklensin diye 5 sn sonra sor
			kisiler = Map.of();
			sonSunucu = sunucu;
			sonSorgu = simdi - ARALIK + 5_000;
			return;
		}
		if (simdi - sonSorgu < ARALIK || !Arkadaslar.bagli()) return;
		sonSorgu = simdi;
		String ben = mc.player.getGameProfile().name();
		JsonArray adlar = new JsonArray();
		for (PlayerInfo p : baglanti.getOnlinePlayers()) {
			String ad = p.getProfile().name();
			if (ad != null && !ad.isBlank() && !ad.equalsIgnoreCase(ben) && adlar.size() < 200) adlar.add(ad);
		}
		if (adlar.isEmpty()) {
			kisiler = Map.of();
			return;
		}
		JsonObject o = new JsonObject();
		o.addProperty("tur", "kcz_kimler");
		o.add("adlar", adlar);
		Arkadaslar.istekBirak(mc, o);
	}

	/** Köprü dosyası değişince (Arkadaslar.tick): launcher'ın bulduğu KÇZ oyuncuları */
	static void oku(JsonObject k) {
		if (!k.has("kczOyuncular") || !k.get("kczOyuncular").isJsonArray()) return;
		Map<String, Kisi> m = new HashMap<>();
		for (JsonElement e : k.getAsJsonArray("kczOyuncular")) {
			if (!e.isJsonObject()) continue;
			JsonObject o = e.getAsJsonObject();
			String ad = yazi(o, "ad");
			if (!ad.isEmpty()) m.put(ad.toLowerCase(Locale.ROOT), new Kisi(ad, yazi(o, "uuid")));
		}
		kisiler = Map.copyOf(m);
	}

	private static String yazi(JsonObject o, String k) {
		JsonElement e = o.get(k);
		return e == null || e.isJsonNull() ? "" : e.getAsString();
	}

	/**
	 * Eğilip, eli boşken bir KÇZ oyuncusuna sağ tık: KÇZ menüsü açılır ve tık sunucuya gönderilmez.
	 * El boş şartı: eşyayla yapılan etkileşimleri (ör. boss savaşında arkadaşı kurtarma) bozmamak için.
	 */
	public static InteractionResult sagTik(Player oyuncu, Level dunya, InteractionHand el, Entity varlik) {
		if (!dunya.isClientSide() || el != InteractionHand.MAIN_HAND || !(varlik instanceof Player hedef)) return InteractionResult.PASS;
		if (!oyuncu.isShiftKeyDown() || !oyuncu.getMainHandItem().isEmpty()) return InteractionResult.PASS;
		Kisi k = kisi(hedef.getGameProfile().name());
		if (k == null) return InteractionResult.PASS;
		long simdi = System.currentTimeMillis();
		// Aynı tık iki olay olarak gelebilir (interactAt + interact): menü bir kez açılsın
		if (simdi - sonMenu > 400) {
			sonMenu = simdi;
			Minecraft mc = Minecraft.getInstance();
			mc.execute(() -> mc.gui.setScreen(new KczOyuncuEkrani(k)));
		}
		return InteractionResult.FAIL;
	}
}
