package com.kcz.client;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;

/**
 * Komut çarkı (Fortnite'taki ifade çarkı gibi). Ekran açmaz: çark açıkken yürümeye, koşmaya, zıplamaya devam edilir.
 * - G basılı tutulunca HUD'da çark açılır. Fare hareketi kamerayı çevirmez, çarkta yön seçer (MouseHandlerMixin).
 * - G bırakılınca seçili komut gider. Ortaya dönersen seçim kalkar.
 * - G'ye kısa basılırsa çark açık kalır: sol tık ya da 1-8 seçer, G tekrar kapatır.
 * - Sağ tık: o dilimi düzenle. Çark açıkken tıklamalar saldırmaz/koymaz, 1-8 eşya çubuğunu değiştirmez.
 */
public final class CarkEkrani {
	private CarkEkrani() {
	}

	private static final int N = Ayar.CARK_DILIM;
	private static final double DILIM_ACI = 360.0 / N;
	/** Bu süreden kısa basılırsa çark açık kalır (tıklayarak seçilir) */
	private static final long KISA_BASIS_MS = 250;
	/** Şerit türleri: 0..N-1 dilim, MERKEZ ortadaki daire, TASMA+i seçili dilimin dışa taşan kenarı */
	private static final int MERKEZ = 100, TASMA = 200;

	private static boolean acik = false;
	/** G hâlâ basılı mı: bırakılınca seçili dilim gider */
	private static boolean basili = false;
	private static long acilis = 0;
	private static int secili = -1;
	/** Sanal imleç: çarkın ortasına göre, GUI pikseli */
	private static double vx = 0, vy = 0;

	public static boolean acikMi() {
		return acik;
	}

	/** G'ye basıldı: çark açıksa ve oyundaysak çarkı aç */
	public static boolean ac(Minecraft mc) {
		if (!Ayar.get().komutCarki || mc.player == null || mc.gui.screen() != null) return false;
		acik = true;
		basili = true;
		acilis = System.currentTimeMillis();
		secili = -1;
		vx = vy = 0;
		return true;
	}

	public static void kapat() {
		acik = false;
		basili = false;
		secili = -1;
	}

	/** Çark açıkken G'ye yeniden basıldı: kısa basışla açık kalmışsa kapanır */
	public static void tusBasildi() {
		if (!basili) kapat();
	}

	/* ---------- Ölçüler ---------- */

	private static int dis(int w, int h) {
		return Math.max(60, Math.min(112, Math.min(w, h) / 2 - 24));
	}

	private static int ic(int dis) {
		return Math.round(dis * 0.41f);
	}

	/** Sanal imleçten seçilen dilim (ortadaysa -1) */
	private static int dilim(double dx, double dy, int ic) {
		double olu = ic * 0.5;
		if (dx * dx + dy * dy < olu * olu) return -1;
		double aci = Math.toDegrees(Math.atan2(dx, -dy));
		if (aci < 0) aci += 360;
		return (int) ((aci + DILIM_ACI / 2) / DILIM_ACI) % N;
	}

	private static void seciliGuncelle(Minecraft mc) {
		int dis = dis(mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
		int yeni = dilim(vx, vy, ic(dis));
		if (yeni != secili) {
			secili = yeni;
			if (yeni >= 0) mc.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK.value(), 1.9f, 0.12f));
		}
	}

	/* ---------- Fare ve tuşlar (MouseHandlerMixin ve tick'lerden) ---------- */

	/** Fare hareketi (ham piksel): kamera yerine çarkın imleci. İmleç çarkın kenarında durur, yön hemen değişir. */
	public static void fare(double dx, double dy) {
		Minecraft mc = Minecraft.getInstance();
		double o = 1.0 / Math.max(1, mc.getWindow().getGuiScale());
		vx += dx * o;
		vy += dy * o;
		double r = Math.sqrt(vx * vx + vy * vy);
		int sinir = dis(mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
		if (r > sinir) {
			vx = vx / r * sinir;
			vy = vy / r * sinir;
		}
		seciliGuncelle(mc);
	}

	/** Çark açıkken fare tuşu. true: oyun bu tıklamayı görmez (saldırma/koyma olmaz). */
	public static boolean tikla(int tus, int eylem) {
		if (!acik) return false;
		// Çark bir fare tuşuna atandıysa o tuşu oyuna bırak (basılı/bırakıldı durumu doğru kalsın)
		InputConstants.Key k = KeyMappingHelper.getBoundKeyOf(KczClient.FOTO);
		if (k.getType() == InputConstants.Type.MOUSE && k.getValue() == tus) return false;
		// Bırakma olaylarını engelleme: çark açılmadan önce basılı tutulan saldırı tuşu takılı kalmasın
		if (eylem == 0) return false;
		Minecraft mc = Minecraft.getInstance();
		if (tus == 0) {
			if (secili >= 0) sec(mc, secili);
			else kapat();
		} else if (tus == 1) {
			duzenle(mc, secili >= 0 ? secili : 0);
		}
		return true;
	}

	/** Tick başı: çark açıkken 1-8 eşya çubuğunu değil çarkın dilimini seçer (oyun tuşları işlemeden önce) */
	public static void basTick(Minecraft mc) {
		if (!acik) return;
		var tuslar = mc.options.keyHotbarSlots;
		for (int i = 0; i < N && i < tuslar.length; i++) {
			boolean basildi = false;
			while (tuslar[i].consumeClick()) basildi = true;
			if (basildi && acik) sec(mc, i);
		}
	}

	/** Tick sonu: G bırakıldı mı, çark kapanmalı mı */
	public static void tick(Minecraft mc) {
		ipucuTick(mc);
		if (!acik) return;
		if (mc.player == null || mc.gui.screen() != null) {
			kapat();
			return;
		}
		if (basili && !KczClient.FOTO.isDown()) {
			basili = false;
			if (secili >= 0 && !Ayar.get().cark.get(secili).bos()) sec(mc, secili);
			else if (System.currentTimeMillis() - acilis >= KISA_BASIS_MS) kapat();
			// kısa basış: açık kalır, tıklayarak ya da 1-8 ile seçilir
		}
	}

	/** Dolu dilim: komutu gönder. Boş dilim: düzenlemeyi aç. */
	private static void sec(Minecraft mc, int s) {
		Ayar.CarkDilim d = Ayar.get().cark.get(s);
		if (d.bos()) {
			duzenle(mc, s);
			return;
		}
		kapat();
		calistir(mc, d.komut);
	}

	private static void duzenle(Minecraft mc, int s) {
		kapat();
		mc.gui.setScreen(new CarkDuzenleEkrani(null, s));
	}

	/* ---------- Çizim (HUD) ---------- */

	// Halka yatay şeritlerle çizilir: {y, x1, x2, tür} dörtlüleri, ekran pikseli çözünürlüğünde. Boyut değişmedikçe yeniden hesaplanmaz.
	private static int[] seritler = new int[0];
	private static String seritAnahtar = "";

	private static int[] seritler(int k, int dis, int ic, int orta, int tasma) {
		String anahtar = k + "/" + dis + "/" + ic + "/" + orta + "/" + tasma;
		if (anahtar.equals(seritAnahtar)) return seritler;
		double ro = dis * k, ri = ic * k, rc = orta * k, rp = (dis + tasma) * k;
		double bosluk = k; // dilimler arasında 2 GUI pikseli boşluk (iki yana birer)
		int r = (int) Math.ceil(rp);
		int[] v = new int[8192];
		int n = 0;
		for (int y = -r; y < r; y++) {
			double fy = y + 0.5;
			double yatay = rp * rp - fy * fy;
			if (yatay <= 0) continue;
			int x1 = (int) Math.ceil(Math.sqrt(yatay)), x0 = -x1;
			int tur = -1, bas = x0;
			for (int x = x0; x <= x1; x++) {
				int t = -1;
				if (x < x1) {
					double fx = x + 0.5, rr = Math.sqrt(fx * fx + fy * fy);
					if (rr < rc) {
						t = MERKEZ;
					} else if (rr >= ri && rr < rp) {
						double aci = Math.toDegrees(Math.atan2(fx, -fy));
						if (aci < 0) aci += 360;
						double kay = (aci + DILIM_ACI / 2) % DILIM_ACI;
						double kenar = Math.min(kay, DILIM_ACI - kay);
						if (rr * Math.sin(Math.toRadians(kenar)) >= bosluk) {
							int s = (int) ((aci + DILIM_ACI / 2) / DILIM_ACI) % N;
							t = rr < ro ? s : TASMA + s;
						}
					}
				}
				if (t != tur) {
					if (tur >= 0) {
						if (n + 4 > v.length) v = Arrays.copyOf(v, v.length * 2);
						v[n++] = y;
						v[n++] = bas;
						v[n++] = x;
						v[n++] = tur;
					}
					tur = t;
					bas = x;
				}
			}
		}
		seritler = Arrays.copyOf(v, n);
		seritAnahtar = anahtar;
		return seritler;
	}

	public static void ciz(GuiGraphicsExtractor g, DeltaTracker delta) {
		if (!acik) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.gui.screen() != null) return;
		Font font = mc.font;
		int w = mc.getWindow().getGuiScaledWidth(), h = mc.getWindow().getGuiScaledHeight();
		int cx = w / 2, cy = h / 2;
		int dis = dis(w, h), ic = ic(dis), orta = ic - 4, tasma = 5;

		Ayar a = Ayar.get();
		List<Ayar.CarkDilim> l = a.cark;
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int dolu = 0xDC000000 | (Ayar.ac(zemin, 0.05f) & 0xFFFFFF);
		int bos = 0x8C000000 | (zemin & 0xFFFFFF);
		int sec = 0xF0000000 | (vurgu & 0xFFFFFF);
		int merkez = 0xEE000000 | (Ayar.renk(a.tema.zemin2, 0xFF, 0xFF0D0D10) & 0xFFFFFF);

		g.fill(0, 0, w, h, 0x30000000);

		// Halka ve orta daire
		int k = Math.max(1, Math.min(3, mc.getWindow().getGuiScale()));
		int[] v = seritler(k, dis, ic, orta, tasma);
		g.pose().pushMatrix();
		g.pose().translate(cx, cy);
		g.pose().scale(1f / k, 1f / k);
		for (int i = 0; i < v.length; i += 4) {
			int t = v[i + 3], renk;
			if (t == MERKEZ) {
				renk = merkez;
			} else if (t >= TASMA) {
				if (t - TASMA != secili) continue;
				renk = sec;
			} else {
				renk = t == secili ? sec : l.get(t).bos() ? bos : dolu;
			}
			g.fill(v[i + 1], v[i], v[i + 2], v[i] + 1, renk);
		}
		// Yön göstergesi: ortadaki dairenin kenarında farenin yönü
		double uz = Math.sqrt(vx * vx + vy * vy);
		if (uz > 3) {
			double rr = (orta - 4) * k;
			int px = (int) Math.round(vx / uz * rr), py = (int) Math.round(vy / uz * rr);
			int b = Math.max(2, Math.round(1.5f * k));
			g.fill(px - b, py - b, px + b, py + b, secili >= 0 ? vurgu : 0xFF6B7280);
		}
		g.pose().popMatrix();

		// Dilimlerin simgesi ve adı
		for (int s = 0; s < N; s++) {
			Ayar.CarkDilim dl = l.get(s);
			double aci = Math.toRadians(s * DILIM_ACI);
			int rm = (ic + dis) / 2 + (s == secili ? 2 : 0);
			int x = cx + (int) Math.round(Math.sin(aci) * rm), y = cy - (int) Math.round(Math.cos(aci) * rm);
			int yazi = s == secili ? Ayar.ustYazi(vurgu) : 0xFFE5E7EB;
			if (dl.bos()) {
				ortala(g, font, "+", x, y - 4, 20, s == secili ? yazi : 0xFF8B8F98, 1.5f);
				continue;
			}
			g.item(simge(dl.simge), x - 8, y - 14);
			ortala(g, font, ad(dl), x, y + 5, 64, yazi, 1f);
		}

		// Ortada seçilen dilim
		String ust, alt;
		if (secili >= 0 && !l.get(secili).bos()) {
			ust = ad(l.get(secili));
			alt = l.get(secili).komut.trim();
		} else if (secili >= 0) {
			ust = Dil.t("Boş dilim");
			alt = Dil.t("Tıkla: ekle");
		} else {
			ust = Dil.t("Komut çarkı");
			alt = Dil.t("Fareyle seç");
		}
		int genis = orta * 2 - 12;
		ortala(g, font, ust, cx, cy - 9, genis, 0xFFF1F5F9, 1f);
		ortala(g, font, alt, cx, cy + 4, genis, 0xFF9CA3AF, 0.75f);

		// Alttaki ipucu
		String ipucu = basili ? Dil.t("{tus} bırak: gönder · sağ tık: düzenle").replace("{tus}", tus())
				: Dil.t("Tıkla: gönder · sağ tık: düzenle · 1-8: hızlı seç · {tus}: kapat").replace("{tus}", tus());
		ortala(g, font, ipucu, cx, cy + dis + tasma + 8, w - 20, 0xFFB4B9C2, 0.75f);
	}

	private static String ad(Ayar.CarkDilim d) {
		return d.ad == null || d.ad.isBlank() ? d.komut.trim() : Dil.t(d.ad.trim());
	}

	private static String tus() {
		return KczClient.FOTO.getTranslatedKeyMessage().getString();
	}

	/** Ortalanmış yazı: sığmazsa biraz küçülür, yine sığmazsa kesilir */
	private static void ortala(GuiGraphicsExtractor g, Font font, String m, int x, int y, int enCok, int renk, float olcek) {
		float o = olcek;
		int w = font.width(m);
		if (w * o > enCok) o = Math.max(Math.min(0.75f, olcek), enCok / (float) w);
		if (w * o > enCok) {
			m = font.plainSubstrByWidth(m, (int) (enCok / o) - font.width("…")) + "…";
			w = font.width(m);
		}
		g.pose().pushMatrix();
		g.pose().translate(x - w * o / 2f, y);
		g.pose().scale(o, o);
		g.text(font, m, 0, 0, renk, false);
		g.pose().popMatrix();
	}

	private static final Map<String, ItemStack> SIMGELER = new HashMap<>();

	public static ItemStack simge(String id) {
		return SIMGELER.computeIfAbsent(id == null ? "" : id, k -> {
			Identifier i = Identifier.tryParse(k.isBlank() ? "minecraft:paper" : k);
			Item it = i == null ? Items.PAPER : BuiltInRegistries.ITEM.getValue(i);
			return new ItemStack(it == null || it == Items.AIR ? Items.PAPER : it);
		});
	}

	/* ---------- Gönderme ---------- */

	private static long sonGonderim = 0;

	/** Komutu ya da mesajı gönder. {x} {y} {z} oyuncunun konumuyla değişir. */
	public static void calistir(Minecraft mc, String komut) {
		if (mc.player == null || komut == null) return;
		String m = komut.trim();
		if (m.isEmpty()) return;
		long simdi = System.currentTimeMillis();
		if (simdi - sonGonderim < 600) return; // yanlışlıkla art arda gitmesin
		sonGonderim = simdi;
		BlockPos p = mc.player.blockPosition();
		m = m.replace("{x}", String.valueOf(p.getX())).replace("{y}", String.valueOf(p.getY())).replace("{z}", String.valueOf(p.getZ()));
		if (m.length() > 256) m = m.substring(0, 256);
		if (m.startsWith("/")) {
			String c = m.substring(1).trim();
			if (!c.isEmpty()) mc.player.connection.sendCommand(c);
		} else {
			mc.player.connection.sendChat(m);
		}
	}

	/* ---------- İlk kullanım ipucu ---------- */

	private static long dunyadaBeri = 0;

	/** Oyuna ilk girişte bir kere: "G'yi basılı tut" */
	private static void ipucuTick(Minecraft mc) {
		Ayar a = Ayar.get();
		if (a.carkIpucu || !a.komutCarki) return;
		if (mc.player == null || mc.gui.screen() != null) {
			dunyadaBeri = 0;
			return;
		}
		long simdi = System.currentTimeMillis();
		if (dunyadaBeri == 0) {
			dunyadaBeri = simdi;
		} else if (simdi - dunyadaBeri > 10_000) {
			a.carkIpucu = true;
			Ayar.kaydet();
			Arkadaslar.bildir(mc, Dil.t("Yeni: komut çarkı"), Dil.t("{tus} tuşunu basılı tut, fareyle seç, bırak.").replace("{tus}", tus()));
		}
	}
}
