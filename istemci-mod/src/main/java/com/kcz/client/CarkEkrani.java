package com.kcz.client;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Komut çarkı (Fortnite'taki ifade çarkı gibi): G basılı tutulunca ortada yuvarlak bir seçim alanı açılır.
 * Fare hangi yöne giderse o dilim seçilir, G bırakılınca komut gider. Ortaya dönersen seçim kalkar.
 * G'ye kısa basılırsa çark açık kalır: tıklayarak ya da 1-8 tuşlarıyla seçilir, G ya da Esc kapatır.
 * Sağ tık: o dilimi düzenle. Boş dilime tıklamak da düzenlemeyi açar.
 */
public class CarkEkrani extends Screen {
	private static final int N = Ayar.CARK_DILIM;
	private static final double DILIM_ACI = 360.0 / N;
	/** Bu süreden kısa basılırsa çark açık kalır (tıklayarak seçilir) */
	private static final long KISA_BASIS_MS = 250;
	// Derlenen sürümün tuş kodları (26.3'te değerleri farklı, her sürüm kendi değeriyle derlenir)
	private static final int[] RAKAMLAR = { InputConstants.KEY_1, InputConstants.KEY_2, InputConstants.KEY_3, InputConstants.KEY_4,
			InputConstants.KEY_5, InputConstants.KEY_6, InputConstants.KEY_7, InputConstants.KEY_8 };
	/** Şerit türleri: 0..N-1 dilim, MERKEZ ortadaki daire, TASMA+i seçili dilimin dışa taşan kenarı */
	private static final int MERKEZ = 100, TASMA = 200;

	private final long acilis = System.currentTimeMillis();
	/** G hâlâ basılı mı: bırakılınca seçili dilim gider. Basılıyken gelen tuş tekrarları yok sayılır. */
	private boolean basili = true;
	private int secili = -1;
	private int cx, cy, dis, ic, orta, tasma;

	public CarkEkrani() {
		super(Component.literal(Dil.t("Komut çarkı")));
	}

	/** G'ye basıldı: çark açıksa ve oyundaysak çarkı aç */
	public static boolean ac(Minecraft mc) {
		if (!Ayar.get().komutCarki || mc.player == null || mc.gui.screen() != null) return false;
		mc.gui.setScreen(new CarkEkrani());
		return true;
	}

	@Override
	protected void init() {
		cx = this.width / 2;
		cy = this.height / 2;
		dis = Math.max(60, Math.min(112, Math.min(this.width, this.height) / 2 - 24));
		ic = Math.round(dis * 0.41f);
		orta = ic - 4;
		tasma = 5;
	}

	/** Fare bu noktadayken seçilen dilim (ortadaysa -1). Çarkın dışına taşsa da yön geçerli. */
	private int dilim(double x, double y) {
		double dx = x - cx, dy = y - cy;
		double olu = ic * 0.5;
		if (dx * dx + dy * dy < olu * olu) return -1;
		double aci = Math.toDegrees(Math.atan2(dx, -dy));
		if (aci < 0) aci += 360;
		return (int) ((aci + DILIM_ACI / 2) / DILIM_ACI) % N;
	}

	/* ---------- Çizim ---------- */

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

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float d) {
		g.fill(0, 0, this.width, this.height, 0x48000000);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float d) {
		super.extractRenderState(g, mx, my, d);
		int yeni = dilim(mx, my);
		if (yeni != secili) {
			secili = yeni;
			if (yeni >= 0) this.minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK.value(), 1.9f, 0.12f));
		}
		Ayar a = Ayar.get();
		List<Ayar.CarkDilim> l = a.cark;
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int dolu = 0xDC000000 | (Ayar.ac(zemin, 0.05f) & 0xFFFFFF);
		int bos = 0x8C000000 | (zemin & 0xFFFFFF);
		int sec = 0xF0000000 | (vurgu & 0xFFFFFF);
		int merkez = 0xEE000000 | (Ayar.renk(a.tema.zemin2, 0xFF, 0xFF0D0D10) & 0xFFFFFF);

		// Halka ve orta daire
		int k = Math.max(1, Math.min(3, this.minecraft.getWindow().getGuiScale()));
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
		double dx = mx - cx, dy = my - cy, uz = Math.sqrt(dx * dx + dy * dy);
		if (uz > 3) {
			double rr = (orta - 4) * k;
			int px = (int) Math.round(dx / uz * rr), py = (int) Math.round(dy / uz * rr);
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
				ortala(g, "+", x, y - 4, 20, s == secili ? yazi : 0xFF8B8F98, 1.5f);
				continue;
			}
			g.item(simge(dl.simge), x - 8, y - 14);
			ortala(g, ad(dl), x, y + 5, 64, yazi, 1f);
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
		ortala(g, ust, cx, cy - 9, genis, 0xFFF1F5F9, 1f);
		ortala(g, alt, cx, cy + 4, genis, 0xFF9CA3AF, 0.75f);

		// Alttaki ipucu
		String ipucu = basili ? Dil.t("{tus} bırak: gönder · sağ tık: düzenle").replace("{tus}", tus())
				: Dil.t("Tıkla: gönder · sağ tık: düzenle · 1-8: hızlı seç · Esc: kapat");
		ortala(g, ipucu, cx, cy + dis + tasma + 8, this.width - 20, 0xFFB4B9C2, 0.75f);
	}

	private static String ad(Ayar.CarkDilim d) {
		return d.ad == null || d.ad.isBlank() ? d.komut.trim() : Dil.t(d.ad.trim());
	}

	private static String tus() {
		return KczClient.FOTO.getTranslatedKeyMessage().getString();
	}

	/** Ortalanmış yazı: sığmazsa biraz küçülür, yine sığmazsa kesilir */
	private void ortala(GuiGraphicsExtractor g, String m, int x, int y, int enCok, int renk, float olcek) {
		float o = olcek;
		int w = this.font.width(m);
		if (w * o > enCok) o = Math.max(Math.min(0.75f, olcek), enCok / (float) w);
		if (w * o > enCok) {
			m = this.font.plainSubstrByWidth(m, (int) (enCok / o) - this.font.width("…")) + "…";
			w = this.font.width(m);
		}
		g.pose().pushMatrix();
		g.pose().translate(x - w * o / 2f, y);
		g.pose().scale(o, o);
		g.text(this.font, m, 0, 0, renk, false);
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

	/* ---------- Tuşlar ve fare ---------- */

	@Override
	public boolean keyPressed(KeyEvent e) {
		if (KczClient.FOTO.matches(e)) {
			if (!basili) onClose();
			return true;
		}
		for (int i = 0; i < N; i++) {
			if (e.key() == RAKAMLAR[i]) {
				sec(i);
				return true;
			}
		}
		return super.keyPressed(e);
	}

	@Override
	public boolean keyReleased(KeyEvent e) {
		if (basili && KczClient.FOTO.matches(e)) {
			birakildi();
			return true;
		}
		return super.keyReleased(e);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean cift) {
		// Çark bir fare tuşuna atandıysa (ör. yan tuş)
		if (KczClient.FOTO.matchesMouse(e)) {
			if (!basili) onClose();
			return true;
		}
		int s = dilim(e.x(), e.y());
		if (e.button() == 1) {
			duzenle(s < 0 ? 0 : s);
			return true;
		}
		if (e.button() == 0) {
			if (s < 0) onClose();
			else sec(s);
			return true;
		}
		return super.mouseClicked(e, cift);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent e) {
		if (basili && KczClient.FOTO.matchesMouse(e)) {
			birakildi();
			return true;
		}
		return super.mouseReleased(e);
	}

	/** G bırakıldı: seçili dilim varsa gönder. Kısa basıştaysa çark açık kalır, uzun basışta seçim yoksa kapanır. */
	private void birakildi() {
		basili = false;
		if (secili >= 0 && !Ayar.get().cark.get(secili).bos()) sec(secili);
		else if (System.currentTimeMillis() - acilis >= KISA_BASIS_MS) onClose();
	}

	/** Dolu dilim: komutu gönder. Boş dilim: düzenlemeyi aç. */
	private void sec(int s) {
		Ayar.CarkDilim d = Ayar.get().cark.get(s);
		if (d.bos()) {
			duzenle(s);
			return;
		}
		Minecraft mc = this.minecraft;
		mc.gui.setScreen(null);
		calistir(mc, d.komut);
	}

	private void duzenle(int s) {
		this.minecraft.gui.setScreen(new CarkDuzenleEkrani(null, s));
	}

	@Override
	public void onClose() {
		this.minecraft.gui.setScreen(null);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
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
	public static void tick(Minecraft mc) {
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
