package com.kcz.client;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Ekrandaki KCZ göstergeleri. Dört parça var ve her biri "HUD'u düzenle" ekranında sürüklenip
 * istenen yere konabilir:
 *  - bilgi : FPS, ping, koordinat ve yön (tuş göstergesi kapalıysa CPS de burada)
 *  - tuslar: W A S D, fare tuşları (CPS fare tuşlarının içinde küçük yazılır) ve zıplama
 *  - zirh  : zırh parçaları ve kalan dayanıklılık
 *  - iksir : iksir etkileri ve kalan süre
 */
public final class Hud {
	private Hud() {
	}

	public static final String[] PARCALAR = { "bilgi", "tuslar", "zirh", "iksir", "esya" };
	public static final String[] PARCA_ADI = { Dil.t("Bilgi"), Dil.t("Tuşlar"), Dil.t("Zırh"), Dil.t("İksirler"), Dil.t("Eşya") };

	/** Düzenleme ekranı açıkken: her parça boş olsa bile örnekle çizilir ve çerçevelenir */
	public static boolean duzenleme = false;
	/** Son çizimde her parçanın yeri: {x, y, w, h}; çizilmediyse w = 0 */
	public static final int[][] sinir = new int[PARCALAR.length][4];

	// FPS'i kendimiz sayıyoruz: her çizim bir kare
	private static int kare = 0;
	private static int fps = 0;
	private static String fpsYazisi = "0";
	private static int sonPing = -1;
	private static String pingYazisi = "";
	private static long saniyeBasi = 0L;

	/* ---------- FPS geçmişi (KCZ Menü'deki grafik için) ---------- */
	/** Son 120 saniyenin FPS'i ve o saniyedeki en uzun kare süresi (ms) */
	public static final int GECMIS = 120;
	public static final int[] fpsGecmisi = new int[GECMIS];
	public static final float[] enUzunKare = new float[GECMIS];
	public static int gecmisSira = 0, gecmisSayisi = 0;
	private static long sonKareZamani = 0L;
	private static float buSaniyeEnUzun = 0f;

	/** Oyunun ölçtüğü FPS (arayüz gizliyken de doğru) */
	public static int sonFps() {
		try {
			return Minecraft.getInstance().getFps();
		} catch (Throwable t) {
			return fps;
		}
	}

	// Renkler (her karede temadan alınır)
	private static int zemin, vurgu, yazi, soluk;

	public static void ciz(GuiGraphicsExtractor g, DeltaTracker delta) {
		// Pencereye dönünce FPS sınırı bir sonraki tiki beklemeden, aynı karede kalksın
		Performans.kareBasi(Minecraft.getInstance());
		long simdi = System.nanoTime();
		if (sonKareZamani != 0L) {
			buSaniyeEnUzun = Math.max(buSaniyeEnUzun, (simdi - sonKareZamani) / 1.0e6f);
		}
		sonKareZamani = simdi;
		kare++;
		if (saniyeBasi == 0L) {
			saniyeBasi = simdi;
		} else if (simdi - saniyeBasi >= 1_000_000_000L) {
			fps = Math.round(kare * 1.0e9f / (simdi - saniyeBasi));
			fpsYazisi = String.valueOf(fps);
			fpsGecmisi[gecmisSira] = fps;
			enUzunKare[gecmisSira] = buSaniyeEnUzun;
			gecmisSira = (gecmisSira + 1) % GECMIS;
			gecmisSayisi = Math.min(GECMIS, gecmisSayisi + 1);
			buSaniyeEnUzun = 0f;
			kare = 0;
			saniyeBasi = simdi;
		}

		Minecraft mc = Minecraft.getInstance();
		for (int[] s : sinir) s[2] = 0;
		if (mc.player == null) return;
		Ayar a = Ayar.get();
		Font font = mc.font;
		zemin = Ayar.renk(a.tema.zemin2, 0xB0, 0xB00D0D10);
		vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		yazi = 0xFFF1F5F9;
		soluk = 0xFFB8BEC6;

		int ew = g.guiWidth(), eh = g.guiHeight();
		if (a.cps) tiklamaSay(simdi);

		// Varsayılan yerler: bilgi sol üstte, tuşlar onun altında, zırh solda ortada, iksirler sağ üstte
		boolean sag = "sag-ust".equals(a.konum);
		int[] b = bilgi(g, font, mc, a, -1, -1, true);
		int bx = sag ? ew - b[0] - 4 : 4;
		int[] by = yer(a, 0, bx, 4, b[0], b[1], ew, eh);
		if (b[1] > 0) bilgi(g, font, mc, a, by[0], by[1], false);

		if (a.tuslar || duzenleme) {
			int[] t = tuslar(g, font, mc, a, -1, -1, true);
			int[] ty = yer(a, 1, sag ? ew - t[0] - 4 : 4, (b[1] > 0 ? by[1] + b[1] + 4 : 4), t[0], t[1], ew, eh);
			tuslar(g, font, mc, a, ty[0], ty[1], false);
		}
		if (a.zirh || duzenleme) {
			int[] z = zirh(g, font, mc, -1, -1, true);
			if (z[1] > 0) {
				int[] zy = yer(a, 2, 4, eh / 2 - z[1] / 2, z[0], z[1], ew, eh);
				zirh(g, font, mc, zy[0], zy[1], false);
			}
		}
		if (a.eldeki || a.okSayisi || a.totem || a.hiz || a.saat) {
			int[] e = esya(g, font, mc, a, -1, -1, true);
			if (e[1] > 0) {
				int[] ey = yer(a, 4, ew / 2 + 96, eh - e[1] - 4, e[0], e[1], ew, eh);
				esya(g, font, mc, a, ey[0], ey[1], false);
			}
		}
		if (a.iksir || duzenleme) {
			int[] k = iksir(g, font, mc, -1, -1, true);
			if (k[1] > 0) {
				int[] ky = yer(a, 3, ew - k[0] - 4, sag ? eh / 3 : 4, k[0], k[1], ew, eh);
				iksir(g, font, mc, ky[0], ky[1], false);
			}
		}
	}

	/** Parçanın yeri: kaydedilmişse oradan, yoksa varsayılan; ekranın dışına taşmaz. Sınırı kaydeder. */
	private static int[] yer(Ayar a, int sira, int vx, int vy, int w, int h, int ew, int eh) {
		float[] k = a.hudKonum.get(PARCALAR[sira]);
		int x = vx, y = vy;
		if (k != null && k.length == 2) {
			x = Math.round(k[0] * ew);
			y = Math.round(k[1] * eh);
		}
		x = Math.max(0, Math.min(ew - w, x));
		y = Math.max(0, Math.min(eh - h, y));
		int[] s = sinir[sira];
		s[0] = x;
		s[1] = y;
		s[2] = w;
		s[3] = h;
		return new int[] { x, y };
	}

	/* ---------- Bilgi: FPS, ping, CPS, koordinat, yön ---------- */
	private static final int SATIR = 15;

	private static int[] bilgi(GuiGraphicsExtractor g, Font font, Minecraft mc, Ayar a, int x, int y, boolean olc) {
		int w = 0, h = 0;
		if (a.fps) {
			w = Math.max(w, kutu(g, font, "FPS", fpsYazisi, x, y + h, yazi, olc));
			h += SATIR;
		}
		if (a.ping) {
			int p = ping(mc);
			if (p >= 0 || duzenleme) {
				if (p != sonPing) {
					sonPing = p;
					pingYazisi = p < 0 ? "–" : p + Dil.t(" ms");
				}
				w = Math.max(w, kutu(g, font, Dil.t("Ping"), pingYazisi, x, y + h, yazi, olc));
				h += SATIR;
			}
		}
		if (a.cps && !a.tuslar) {
			w = Math.max(w, kutu(g, font, "CPS", cpsYazisi(), x, y + h, yazi, olc));
			h += SATIR;
		}
		if (a.koordinat) {
			int bx = (int) Math.floor(mc.player.getX());
			int by = (int) Math.floor(mc.player.getY());
			int bz = (int) Math.floor(mc.player.getZ());
			if (bx != sonX || by != sonY || bz != sonZ) {
				sonX = bx;
				sonY = by;
				sonZ = bz;
				xyzYazisi = bx + " " + by + " " + bz;
			}
			w = Math.max(w, kutu(g, font, "XYZ", xyzYazisi, x, y + h, yazi, olc));
			h += SATIR;
			w = Math.max(w, kutu(g, font, Dil.t("Yön"), yon(mc.player.getYRot()), x, y + h, yazi, olc));
			h += SATIR;
		}
		return new int[] { w, Math.max(0, h - 2) };
	}

	/** Etiketli küçük kutu; genişliğini döner. olc = sadece ölç, çizme. */
	private static int kutu(GuiGraphicsExtractor g, Font font, String ad, String deger, int x, int y, int renk, boolean olc) {
		int w = font.width(ad) + font.width(deger) + 14;
		if (!olc) {
			g.fill(x, y, x + w, y + 13, zemin);
			g.fill(x, y, x + 2, y + 13, vurgu);
			g.text(font, ad, x + 6, y + 3, soluk, false);
			g.text(font, deger, x + 10 + font.width(ad), y + 3, renk, false);
		}
		return w;
	}

	/* ---------- Tuşlar (CPS fare tuşlarının içinde) ---------- */
	private static final int TUS = 15, ARA = 2;

	private static int[] tuslar(GuiGraphicsExtractor g, Font font, Minecraft mc, Ayar a, int x, int y, boolean olc) {
		int genis = TUS * 3 + ARA * 2;
		int fareH = a.cps ? 20 : TUS;
		int h = TUS + ARA + TUS + ARA + fareH + ARA + 9;
		if (olc) return new int[] { genis, h };
		int yy = y;
		tus(g, font, "W", mc.options.keyUp, x + TUS + ARA, yy, TUS, TUS, null);
		yy += TUS + ARA;
		tus(g, font, "A", mc.options.keyLeft, x, yy, TUS, TUS, null);
		tus(g, font, "S", mc.options.keyDown, x + TUS + ARA, yy, TUS, TUS, null);
		tus(g, font, "D", mc.options.keyRight, x + (TUS + ARA) * 2, yy, TUS, TUS, null);
		yy += TUS + ARA;
		int yarim = (genis - ARA) / 2;
		tus(g, font, "LMB", mc.options.keyAttack, x, yy, yarim, fareH, a.cps ? solCps + Dil.t(" CPS") : null);
		tus(g, font, "RMB", mc.options.keyUse, x + yarim + ARA, yy, genis - yarim - ARA, fareH, a.cps ? sagCps + Dil.t(" CPS") : null);
		yy += fareH + ARA;
		tus(g, font, "—", mc.options.keyJump, x, yy, genis, 9, null);
		return new int[] { genis, h };
	}

	private static void tus(GuiGraphicsExtractor g, Font font, String ad, KeyMapping k, int x, int y, int w, int h, String alt) {
		boolean basili = k.isDown() && !duzenleme;
		g.fill(x, y, x + w, y + h, basili ? vurgu : zemin);
		int renk = basili ? Ayar.ustYazi(vurgu) : yazi;
		if (alt == null) {
			g.text(font, ad, x + (w - font.width(ad)) / 2, y + (h - 8) / 2, renk, false);
			return;
		}
		// Üstte tuş adı, altında küçük CPS
		g.text(font, ad, x + (w - font.width(ad)) / 2, y + 2, renk, false);
		float o = 0.6f;
		g.pose().pushMatrix();
		g.pose().translate(x + (w - font.width(alt) * o) / 2f, y + 12f);
		g.pose().scale(o, o);
		g.text(font, alt, 0, 0, basili ? renk : soluk, false);
		g.pose().popMatrix();
	}

	/* ---------- Zırh ---------- */
	private static final EquipmentSlot[] ZIRH = { EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET };

	private static int[] zirh(GuiGraphicsExtractor g, Font font, Minecraft mc, int x, int y, boolean olc) {
		int w = 0, h = 0;
		for (EquipmentSlot yuva : ZIRH) {
			ItemStack e = mc.player.getItemBySlot(yuva);
			if (e.isEmpty()) continue;
			String yuzde;
			int renk = yazi;
			if (e.isDamageableItem() && e.getMaxDamage() > 0) {
				int kalan = e.getMaxDamage() - e.getDamageValue();
				int p = Math.round(kalan * 100f / e.getMaxDamage());
				yuzde = p + "%";
				renk = p > 50 ? yazi : p > 20 ? 0xFFFACC15 : 0xFFF87171;
			} else {
				yuzde = "∞";
			}
			int sw = 16 + 4 + font.width(yuzde) + 6;
			if (!olc) {
				g.fill(x, y + h, x + sw, y + h + 18, zemin);
				g.item(e, x + 1, y + h + 1);
				g.text(font, yuzde, x + 20, y + h + 5, renk, false);
			}
			w = Math.max(w, sw);
			h += 20;
		}
		if (h == 0 && duzenleme) {
			w = kutu(g, font, Dil.t("Zırh"), "100%", x, y, yazi, olc);
			h = 15;
		}
		return new int[] { w, Math.max(0, h - 2) };
	}

	/* ---------- İksirler ---------- */
	private static int[] iksir(GuiGraphicsExtractor g, Font font, Minecraft mc, int x, int y, boolean olc) {
		int w = 0, h = 0;
		for (MobEffectInstance etki : mc.player.getActiveEffects()) {
			String ad = etki.getEffect().value().getDisplayName().getString();
			if (etki.getAmplifier() > 0) ad += " " + (etki.getAmplifier() + 1);
			String sure = etki.isInfiniteDuration() ? "∞" : sure(etki.getDuration());
			int renk = !etki.isInfiniteDuration() && etki.getDuration() < 200 ? 0xFFFACC15 : yazi;
			w = Math.max(w, kutu(g, font, ad, sure, x, y + h, renk, olc));
			h += SATIR;
		}
		if (h == 0 && duzenleme) {
			w = kutu(g, font, Dil.t("İksir"), "1:30", x, y, yazi, olc);
			h = SATIR;
		}
		return new int[] { w, Math.max(0, h - 2) };
	}

	/* ---------- Eşya: eldeki eşya, ok, totem, hız, saat ---------- */
	private static int okAdet = 0, totemAdet = 0;
	private static long sonSayim = 0L;
	private static double sonX2, sonZ2;
	private static long sonHizZamani = 0L;
	private static String hizYazisi = "0.0";
	private static final java.time.format.DateTimeFormatter SAAT = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
	/** Saat ve hız yazıları her karede yeniden oluşturulmasın (bellek temizliği yükü) */
	private static String saatYazisi = "";
	private static long saatZamani = 0L;
	private static String hizEtiketi = "0.0 b/s";

	private static String saat() {
		long s = System.currentTimeMillis();
		if (s - saatZamani >= 1000L) {
			saatZamani = s;
			saatYazisi = java.time.LocalTime.now().format(SAAT);
		}
		return saatYazisi;
	}

	private static void say(Minecraft mc) {
		long simdi = System.currentTimeMillis();
		if (simdi - sonSayim < 250) return;
		sonSayim = simdi;
		int ok = 0, totem = 0;
		var env = mc.player.getInventory();
		for (int i = 0; i < env.getContainerSize(); i++) {
			ItemStack s = env.getItem(i);
			if (s.isEmpty()) continue;
			var it = s.getItem();
			if (it == Items.ARROW || it == Items.SPECTRAL_ARROW || it == Items.TIPPED_ARROW) ok += s.getCount();
			else if (it == Items.TOTEM_OF_UNDYING) totem += s.getCount();
		}
		okAdet = ok;
		totemAdet = totem;
		// Hız: yatay, saniyede kaç blok (yarım saniyelik ortalama)
		if (sonHizZamani == 0L || simdi - sonHizZamani >= 500) {
			double x = mc.player.getX(), z = mc.player.getZ();
			if (sonHizZamani != 0L) {
				double m = Math.sqrt((x - sonX2) * (x - sonX2) + (z - sonZ2) * (z - sonZ2));
				hizYazisi = String.format(java.util.Locale.ROOT, "%.1f", m * 1000.0 / (simdi - sonHizZamani));
				hizEtiketi = hizYazisi + " b/s";
			}
			sonX2 = x;
			sonZ2 = z;
			sonHizZamani = simdi;
		}
	}

	private static int[] esya(GuiGraphicsExtractor g, Font font, Minecraft mc, Ayar a, int x, int y, boolean olc) {
		if (olc) say(mc);
		int w = 0, h = 0;
		if (a.eldeki) {
			ItemStack e = mc.player.getMainHandItem();
			if (!e.isEmpty() && e.isDamageableItem() && e.getMaxDamage() > 0) {
				int kalan = e.getMaxDamage() - e.getDamageValue();
				int p = Math.round(kalan * 100f / e.getMaxDamage());
				String yazi2 = kalan + " (" + p + "%)";
				int renk = p > 50 ? yazi : p > 20 ? 0xFFFACC15 : 0xFFF87171;
				int sw = 16 + 4 + font.width(yazi2) + 6;
				if (!olc) {
					g.fill(x, y + h, x + sw, y + h + 18, zemin);
					g.item(e, x + 1, y + h + 1);
					g.text(font, yazi2, x + 20, y + h + 5, renk, false);
				}
				w = Math.max(w, sw);
				h += 20;
			}
		}
		if (a.okSayisi) {
			w = Math.max(w, kutu(g, font, Dil.t("Ok"), String.valueOf(okAdet), x, y + h, okAdet == 0 ? 0xFFF87171 : yazi, olc));
			h += SATIR;
		}
		if (a.totem) {
			w = Math.max(w, kutu(g, font, Dil.t("Totem"), String.valueOf(totemAdet), x, y + h, totemAdet == 0 ? 0xFFF87171 : yazi, olc));
			h += SATIR;
		}
		if (a.hiz) {
			w = Math.max(w, kutu(g, font, Dil.t("Hız"), hizEtiketi, x, y + h, yazi, olc));
			h += SATIR;
		}
		if (a.saat) {
			w = Math.max(w, kutu(g, font, Dil.t("Saat"), saat(), x, y + h, yazi, olc));
			h += SATIR;
		}
		return new int[] { w, Math.max(0, h - 2) };
	}

	/* ---------- Yardımcılar ---------- */
	private static final String[] YONLER = { Dil.t("Güney"), Dil.t("Güneybatı"), Dil.t("Batı"), Dil.t("Kuzeybatı"), Dil.t("Kuzey"), Dil.t("Kuzeydoğu"), Dil.t("Doğu"), Dil.t("Güneydoğu") };
	private static int sonX = Integer.MIN_VALUE, sonY, sonZ;
	private static String xyzYazisi = "";

	private static String yon(float yaw) {
		float d = ((yaw % 360f) + 360f) % 360f;
		return YONLER[Math.round(d / 45f) & 7];
	}

	private static String sure(int tik) {
		int sn = tik / 20;
		return (sn / 60) + ":" + (sn % 60 < 10 ? "0" : "") + (sn % 60);
	}

	// CPS: saldırı/kullan tuşları her karede okunur, basılma anları son 1 saniyede sayılır
	private static final long[] solTik = new long[64], sagTik = new long[64];
	private static int solSira = 0, sagSira = 0;
	private static boolean solBasili = false, sagBasili = false;
	private static int solCps = 0, sagCps = 0;
	private static int sonSolCps = -1, sonSagCps = -1;
	private static String cpsYazi = "0 | 0";

	private static void tiklamaSay(long simdi) {
		Minecraft mc = Minecraft.getInstance();
		boolean sol = mc.options.keyAttack.isDown();
		boolean sagB = mc.options.keyUse.isDown();
		if (sol && !solBasili) solTik[solSira++ & 63] = simdi;
		if (sagB && !sagBasili) sagTik[sagSira++ & 63] = simdi;
		solBasili = sol;
		sagBasili = sagB;
		solCps = tiklamaSayisi(solTik, simdi);
		sagCps = tiklamaSayisi(sagTik, simdi);
	}

	private static String cpsYazisi() {
		if (solCps != sonSolCps || sagCps != sonSagCps) {
			sonSolCps = solCps;
			sonSagCps = sagCps;
			cpsYazi = solCps + " | " + sagCps;
		}
		return cpsYazi;
	}

	private static int tiklamaSayisi(long[] dizi, long simdi) {
		int n = 0;
		for (long t : dizi) {
			if (t != 0L && simdi - t < 1_000_000_000L) n++;
		}
		return n;
	}

	private static int ping(Minecraft mc) {
		try {
			ClientPacketListener baglanti = mc.getConnection();
			if (baglanti == null || mc.isLocalServer()) return -1;
			PlayerInfo bilgi = baglanti.getPlayerInfo(mc.player.getUUID());
			return bilgi == null ? -1 : bilgi.getLatency();
		} catch (Throwable t) {
			return -1;
		}
	}
}
