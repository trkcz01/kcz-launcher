package com.kcz.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.sounds.SoundEvents;

/**
 * KCZ menüsünün başlığındaki tema maskotu: launcher'ın sol üstündekinin aynısı (çizimler MaskotCizim).
 * Boşta kıpırdar; fare üstüne gelince kendi numarasını yapıp başlığın öbür ucuna geçer:
 * Enderman ışınlanır, Creeper tıslayıp patlar ve öbür tarafa düşer, Ghast ateş topu atıp süzülür,
 * yarasa uyanıp uçar, kedi zıplar. Hepsi zamana bağlı çizilir (kare hızından bağımsız).
 */
final class Maskot {
	static String turu(String tema) {
		return switch (tema == null ? "" : tema) {
			case "end" -> "enderman";
			case "nether" -> "ghast";
			case "dunya" -> "creeper";
			case "siyah" -> "yarasa";
			case "gri" -> "kedi";
			default -> null;
		};
	}

	/** Küçük bir parçacık (GUI koordinatlarında) */
	private static final class Toz {
		float x, y, vx, vy, omur, toplam, boyut, buyu;
		int renk;
	}

	private final String tur;
	private final MaskotCizim.Sprite sp;
	private final float o;
	private final Random rnd = new Random();
	private final List<Toz> tozlar = new ArrayList<>();
	private int taraf = 0;
	private long eylem = -1;
	private int asama = 0;
	private long sonKare = 0, sonToz = 0;
	private boolean oncekiUstunde = true; // menü açılırken fare zaten üstündeyse hemen oynamasın
	private float solX, sagX, zemin, tavan;

	Maskot(String tur) {
		this.tur = tur;
		this.sp = MaskotCizim.HEPSI.get(tur);
		this.o = switch (tur) {
			case "enderman" -> 1f;
			case "kedi" -> 1.4f;
			default -> 1.2f;
		};
	}

	String tur() {
		return tur;
	}

	private float genislik() {
		return sp.w() * o;
	}

	private float yukseklik() {
		return sp.h() * o;
	}

	private float kx(int t) {
		float w = genislik();
		if (sagX - solX < w * 2 + 12) return solX; // yer yoksa tek yerde kalır
		return t == 0 ? solX : sagX - w;
	}

	private float ky() {
		return switch (tur) {
			case "ghast" -> zemin - yukseklik() - 3;
			case "yarasa" -> tavan + 1;
			default -> zemin - yukseklik();
		};
	}

	private static float yumusak(float k) {
		k = Math.max(0, Math.min(1, k));
		return k * k * (3 - 2 * k);
	}

	private static float arada(long t, long bas, long sure) {
		return Math.max(0, Math.min(1, (t - bas) / (float) sure));
	}

	private void ses(net.minecraft.sounds.SoundEvent s, float perde, float ses) {
		try {
			Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(s, perde, ses));
		} catch (Exception e) {
			// ses çalınamazsa önemli değil
		}
	}

	/**
	 * solX/sagX: maskotun durabileceği yatay aralık, zemin: ayaklarının bastığı çizgi, tavan: yarasanın asıldığı yer.
	 */
	void ciz(GuiGraphicsExtractor g, float solX, float sagX, float zemin, float tavan, int mx, int my) {
		this.solX = solX;
		this.sagX = sagX;
		this.zemin = zemin;
		this.tavan = tavan;
		long simdi = System.currentTimeMillis();
		float dt = sonKare == 0 ? 0 : Math.min(0.1f, (simdi - sonKare) / 1000f);
		sonKare = simdi;

		float x = kx(taraf), y = ky(), w = genislik(), h = yukseklik();
		boolean ustunde = mx >= x - 2 && mx <= x + w + 2 && my >= y - 2 && my <= y + h + 2;
		if (eylem < 0 && ustunde && !oncekiUstunde) {
			eylem = simdi;
			asama = 0;
		}
		oncekiUstunde = ustunde;

		long t = eylem < 0 ? -1 : simdi - eylem;
		switch (tur) {
			case "enderman" -> enderman(g, simdi, t);
			case "creeper" -> creeper(g, simdi, t);
			case "ghast" -> ghast(g, simdi, t);
			case "yarasa" -> yarasa(g, simdi, t);
			case "kedi" -> kedi(g, simdi, t);
			default -> {
			}
		}
		tozlariCiz(g, dt);
	}

	/* ---------- Çizim yardımcıları ---------- */

	private void parca(GuiGraphicsExtractor g, MaskotCizim.Sprite s, String ad, int sabit, float alfa) {
		for (int[] k : s.kosular(ad)) {
			int renk = sabit != 0 ? sabit : k[3];
			if (alfa < 1f) renk = ((int) ((renk >>> 24) * Math.max(0, alfa)) << 24) | (renk & 0xFFFFFF);
			g.fill(k[0], k[1], k[0] + k[2], k[1] + 1, renk);
		}
	}

	/** Parçayı (px, py) noktası etrafında 'derece' kadar döndürerek çizer (çizim koordinatlarında) */
	private void donukParca(GuiGraphicsExtractor g, MaskotCizim.Sprite s, String ad, float px, float py, float derece, float alfa) {
		var p = g.pose();
		p.pushMatrix();
		p.translate(px, py);
		p.rotate((float) Math.toRadians(derece));
		p.translate(-px, -py);
		parca(g, s, ad, 0, alfa);
		p.popMatrix();
	}

	/** Çizim koordinatına geç: sol üst (x, y), ölçek, alt-orta etrafında sx/sy ve isteğe bağlı dönüş */
	private void bas(GuiGraphicsExtractor g, float x, float y, float sx, float sy, float derece, float pivX, float pivY) {
		var p = g.pose();
		p.pushMatrix();
		p.translate(x, y);
		p.scale(o, o);
		p.translate(pivX, pivY);
		if (derece != 0) p.rotate((float) Math.toRadians(derece));
		p.scale(sx, sy);
		p.translate(-pivX, -pivY);
	}

	private void bitir(GuiGraphicsExtractor g) {
		g.pose().popMatrix();
	}

	private void patlat(float cx, float cy, int sayi, int[] renkler, float yayX, float yayY, float hizAlt, float hizUst,
			float omurAlt, float omurUst, float boyutAlt, float boyutUst, float yukari, float buyu) {
		for (int i = 0; i < sayi; i++) {
			Toz z = new Toz();
			z.x = cx + (rnd.nextFloat() * 2 - 1) * yayX;
			z.y = cy + (rnd.nextFloat() * 2 - 1) * yayY;
			double a = rnd.nextDouble() * Math.PI * 2;
			float v = hizAlt + rnd.nextFloat() * (hizUst - hizAlt);
			z.vx = (float) Math.cos(a) * v;
			z.vy = (float) Math.sin(a) * v + yukari;
			z.toplam = z.omur = omurAlt + rnd.nextFloat() * (omurUst - omurAlt);
			z.boyut = boyutAlt + rnd.nextFloat() * (boyutUst - boyutAlt);
			z.buyu = buyu;
			z.renk = renkler[rnd.nextInt(renkler.length)];
			tozlar.add(z);
		}
	}

	private void tozlariCiz(GuiGraphicsExtractor g, float dt) {
		var p = g.pose();
		for (int i = tozlar.size() - 1; i >= 0; i--) {
			Toz z = tozlar.get(i);
			z.omur -= dt;
			if (z.omur <= 0) {
				tozlar.remove(i);
				continue;
			}
			z.x += z.vx * dt;
			z.y += z.vy * dt;
			z.vx *= (float) Math.pow(0.08, dt);
			z.vy *= (float) Math.pow(0.08, dt);
			float k = z.omur / z.toplam;
			float b = z.boyut * (z.buyu + (1 - z.buyu) * k);
			int alfa = (int) (255 * Math.min(1, k * 1.6f));
			p.pushMatrix();
			p.translate(z.x - b / 2, z.y - b / 2);
			p.scale(b, b);
			g.fill(0, 0, 1, 1, alfa << 24 | (z.renk & 0xFFFFFF));
			p.popMatrix();
		}
	}

	/* ---------- Enderman: ışınlanma ---------- */
	private static final int[] MOR = { 0xFFC084FC, 0xFFA855F7, 0xFFE9D5FF, 0xFF7E22CE, 0xFFF0ABFC };

	private void enderman(GuiGraphicsExtractor g, long simdi, long t) {
		float w = genislik(), h = yukseklik();
		// arada bir etrafında mor portal tozu
		if (t < 0 && simdi - sonToz > 900) {
			sonToz = simdi;
			float x = kx(taraf);
			patlat(x + rnd.nextFloat() * w, ky() + 4 + rnd.nextFloat() * (h - 8), 1, MOR, 1, 1, 1, 4, 1.4f, 2f, 1f, 1.6f, -7, 0.2f);
		}
		float sx = 1, sy = 1, alfa = 1, dx = 0, dy = 0;
		boolean kizgin = false;
		if (t >= 0) {
			kizgin = t < 920;
			if (t < 260) {
				dx = (rnd.nextFloat() - 0.5f) * 1.2f;
				dy = (rnd.nextFloat() - 0.5f) * 0.6f;
			}
			if (t >= 260 && asama == 0) {
				asama = 1;
				ses(SoundEvents.ENDERMAN_TELEPORT, 1f, 0.35f);
				patlat(kx(taraf) + w / 2, ky() + h / 2, 22, MOR, w / 2, h / 2, 6, 26, 0.5f, 0.9f, 1.2f, 2.4f, 0, 0.4f);
			}
			if (t >= 260 && t < 410) {
				float k = arada(t, 260, 150);
				sx = 1 - 0.85f * k;
				sy = 1 + 0.25f * k;
				alfa = 1 - k;
			}
			if (t >= 410 && asama == 1) {
				asama = 2;
				taraf = 1 - taraf;
				patlat(kx(taraf) + w / 2, ky() + h / 2, 22, MOR, w / 2, h / 2, 6, 26, 0.5f, 0.9f, 1.2f, 2.4f, 0, 0.4f);
			}
			if (t >= 410 && t < 500) alfa = 0;
			if (t >= 500 && t < 670) {
				float k = arada(t, 500, 170);
				sx = 0.15f + 0.85f * k;
				sy = 1.25f - 0.25f * k;
				alfa = k;
			}
			if (t >= 920) eylem = -1;
		}
		float sallan = (float) Math.sin(simdi / 4500.0 * Math.PI * 2) * 1.2f;
		float kol = (float) Math.sin(simdi / 4500.0 * Math.PI * 2) * 4f;
		bas(g, kx(taraf) + dx, ky() + dy, sx, sy, t < 0 ? sallan : 0, 5, 27);
		parca(g, sp, "govde", 0, alfa);
		donukParca(g, sp, "kolS", 1, 8, -kol, alfa);
		donukParca(g, sp, "kolD", 9, 8, kol, alfa);
		parca(g, sp, "gozler", 0, alfa);
		// gözler parlar (kızınca daha çok)
		float parla = kizgin ? 0.75f : 0.25f + 0.25f * (float) (0.5 + 0.5 * Math.sin(simdi / 3000.0 * Math.PI * 2));
		parca(g, sp, "gozler", 0xFFFFFFFF, parla * alfa * 0.6f);
		bitir(g);
	}

	/* ---------- Creeper: tıslar, patlar, öbür tarafa düşer ---------- */
	private static final int[] DUMAN = { 0xFFF9FAFB, 0xFFE5E7EB, 0xFFD1D5DB, 0xFF9CA3AF, 0xFF6B7280 };

	private void creeper(GuiGraphicsExtractor g, long simdi, long t) {
		float w = genislik(), h = yukseklik();
		float sx = 1, sy = 1, beyaz = 0, dy = 0, alfa = 1;
		if (t >= 0) {
			if (asama == 0) {
				asama = 1;
				ses(SoundEvents.CREEPER_PRIMED, 1f, 0.35f);
			}
			if (t < 1150) {
				float k = arada(t, 0, 1150);
				sx = 1 + 0.28f * k * k;
				sy = 1 + 0.2f * k * k;
				beyaz = Math.sin(Math.pow(k, 1.7) * 30) > 0 ? 0.85f : 0f;
				if (k > 0.94f) beyaz = 0.95f;
			} else if (asama == 1) {
				asama = 2;
				try {
					Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.GENERIC_EXPLODE, 1.6f));
				} catch (Exception e) {
					// ses yoksa geç
				}
				patlat(kx(taraf) + w / 2, ky() + h / 2, 26, DUMAN, 3, 3, 10, 34, 0.5f, 0.9f, 2.2f, 4.5f, 0, 1.6f);
				patlat(kx(taraf) + w / 2, ky() + h / 2, 8, new int[] { 0xFFFDE68A, 0xFFFFFFFF }, 1, 1, 6, 18, 0.2f, 0.38f, 1.5f, 2.5f, 0, 0.4f);
			}
			if (t >= 1150 && t < 1900) alfa = 0;
			if (t >= 1900 && asama == 2) {
				asama = 3;
				taraf = 1 - taraf;
			}
			if (t >= 1900 && t < 2460) {
				float k = arada(t, 1900, 560);
				if (k < 0.7f) {
					float u = 1 - k / 0.7f;
					dy = -34 * u * u;
				} else if (k < 0.85f) {
					dy = -3 * (float) Math.sin((k - 0.7f) / 0.15f * Math.PI);
					sx = 1.08f;
					sy = 0.9f;
				}
			}
			if (t >= 2460) {
				eylem = -1;
				patlat(kx(taraf) + w / 2, ky() + h, 6, new int[] { 0xFF9CA3AF, 0xFFD1D5DB }, w / 2, 0, 3, 8, 0.3f, 0.5f, 1f, 1.8f, -3, 0.4f);
			}
		}
		if (alfa <= 0) return;
		// arada bir etrafına bakar
		float bak = 0;
		long d = simdi % 7000;
		if (t < 0 && d > 3850 && d < 4340) bak = -0.6f;
		else if (t < 0 && d >= 4340 && d < 5950) bak = 0.6f;
		bas(g, kx(taraf), ky() + dy, sx, sy, 0, 4, 19);
		var p = g.pose();
		p.pushMatrix();
		p.translate(bak, 0);
		parca(g, sp, "kafa", 0, alfa);
		p.popMatrix();
		parca(g, sp, "govde", 0, alfa);
		parca(g, sp, "bacaklar", 0, alfa);
		if (beyaz > 0) {
			p.pushMatrix();
			p.translate(bak, 0);
			parca(g, sp, "kafa", 0xFFFFFFFF, beyaz);
			p.popMatrix();
			parca(g, sp, "govde", 0xFFFFFFFF, beyaz);
			parca(g, sp, "bacaklar", 0xFFFFFFFF, beyaz);
		}
		bitir(g);
	}

	/* ---------- Ghast: ateş topu atar, öbür tarafa süzülür ---------- */
	private static final int[] ATES = { 0xFFFDE047, 0xFFF97316, 0xFFEF4444, 0xFFFB923C, 0xFFFFFBE0 };
	private long atesSure = 0;

	private void ghast(GuiGraphicsExtractor g, long simdi, long t) {
		float w = genislik(), h = yukseklik();
		float x = kx(taraf);
		boolean kizgin = false;
		MaskotCizim.Sprite top = MaskotCizim.HEPSI.get("ates");
		if (t >= 0) {
			float x0 = kx(taraf), x1 = kx(1 - taraf);
			if (atesSure == 0) atesSure = (long) Math.max(450, Math.abs(x1 - x0) * 4.5f);
			long patla = 320 + atesSure;
			kizgin = t < patla;
			if (t >= 320 && asama == 0) {
				asama = 1;
				ses(SoundEvents.GHAST_SHOOT, 1f, 0.3f);
			}
			if (t >= 320 && t < patla) {
				float k = arada(t, 320, atesSure);
				float ax = x0 + w / 2 + (x1 - x0) * k, ay = ky() + h * 0.42f - 8 * (float) Math.sin(k * Math.PI);
				if (simdi - sonToz > 45) {
					sonToz = simdi;
					patlat(ax, ay, 1, new int[] { 0xFFFDE047, 0xFFFB923C }, 0, 0, 1, 5, 0.25f, 0.4f, 0.8f, 1.6f, 0, 0.3f);
				}
				var p = g.pose();
				p.pushMatrix();
				p.translate(ax, ay);
				p.rotate(k * (float) Math.PI * 2);
				p.scale(o, o);
				p.translate(-2.5f, -2.5f);
				parca(g, top, "top", 0, 1);
				p.popMatrix();
			}
			if (t >= patla && asama == 1) {
				asama = 2;
				float vx = x1 + w / 2, vy = ky() + h * 0.42f;
				patlat(vx, vy, 22, ATES, 1, 1, 8, 28, 0.35f, 0.7f, 1.2f, 2.8f, 0, 0.4f);
				patlat(vx, vy, 8, new int[] { 0xFF52525B, 0xFF71717A }, 1, 1, 4, 12, 0.6f, 0.9f, 2f, 3.2f, -8, 1.5f);
			}
			long kay = patla + 250;
			if (t >= kay && t < kay + 1500) x = x0 + (x1 - x0) * yumusak(arada(t, kay, 1500));
			if (t >= kay + 1500) {
				taraf = 1 - taraf;
				x = kx(taraf);
				eylem = -1;
				atesSure = 0;
			}
		}
		float suzul = -1.5f + 1.5f * (float) Math.cos(simdi / 3400.0 * Math.PI * 2);
		bas(g, x, ky() + suzul, 1, 1, 0, 6, 18);
		parca(g, sp, "govde", kizgin ? 0 : 0, 1);
		parca(g, sp, kizgin ? "yuzK" : "yuzS", 0, 1);
		String[] dokunac = { "t0", "t1", "t2", "t3", "t4" };
		int[] tx = { 1, 3, 5, 7, 10 };
		float[] faz = { 0, 0.4f, 0.9f, 1.3f, 0.6f };
		for (int i = 0; i < 5; i++) {
			float a = 9 * (float) Math.sin((simdi / 1800.0 + faz[i] / 1.8) * Math.PI * 2);
			donukParca(g, sp, dokunac[i], tx[i] + 0.5f, 11, a, 1);
		}
		bitir(g);
	}

	/* ---------- Yarasa: uyanır, öbür tarafa uçar ---------- */
	private void yarasa(GuiGraphicsExtractor g, long simdi, long t) {
		MaskotCizim.Sprite ucan = MaskotCizim.HEPSI.get("yarasaUcan");
		if (t >= 0 && t < 1300) {
			if (asama == 0) {
				asama = 1;
				ses(SoundEvents.BAT_TAKEOFF, 1f, 0.25f);
			}
			float k = yumusak(arada(t, 0, 1300));
			float x0 = kx(taraf), x1 = kx(1 - taraf);
			float uw = ucan.w() * o, aw = genislik();
			float x = x0 + (x1 - x0) * k - (uw - aw) / 2;
			float lin = arada(t, 0, 1300);
			float y = ky() + (float) Math.sin(lin * Math.PI) * 14 + (float) Math.sin(lin * Math.PI * 4) * 3;
			var p = g.pose();
			p.pushMatrix();
			p.translate(x, y);
			p.scale(o, o);
			parca(g, ucan, (simdi / 80) % 2 == 0 ? "kanatA" : "kanatB", 0, 1);
			p.popMatrix();
			return;
		}
		float salla = 5 * (float) Math.sin(simdi / 3600.0 * Math.PI * 2);
		if (t >= 1300) {
			if (asama == 1) {
				asama = 2;
				taraf = 1 - taraf;
			}
			float k = arada(t, 1300, 500);
			salla = 10 * (1 - k) * (float) Math.cos(k * Math.PI * 1.5);
			if (t >= 1800) eylem = -1;
		}
		bas(g, kx(taraf), ky(), 1, 1, salla, 4, 0);
		parca(g, sp, "asili", 0, 1);
		bitir(g);
	}

	/* ---------- Kedi: çömelip öbür tarafa zıplar ---------- */
	private void kedi(GuiGraphicsExtractor g, long simdi, long t) {
		float sx = 1, sy = 1, dx = 0, dy = 0, kuyruk = 9 * (float) Math.sin(simdi / 2800.0 * Math.PI * 2);
		float x = kx(taraf);
		if (t >= 0) {
			float x0 = kx(taraf), x1 = kx(1 - taraf);
			if (asama == 0) {
				asama = 1;
				try {
					Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.CAT_PURREOW_BABY, 1f));
				} catch (Exception e) {
					// ses yoksa geç
				}
			}
			if (t < 160) {
				float k = arada(t, 0, 160);
				sx = 1 + 0.08f * k;
				sy = 1 - 0.18f * k;
			} else if (t < 780) {
				float k = arada(t, 160, 620);
				dx = (x1 - x0) * k;
				dy = -4 * 14 * k * (1 - k);
				kuyruk = -35;
			} else {
				if (asama == 1) {
					asama = 2;
					taraf = 1 - taraf;
					patlat(kx(taraf) + genislik() / 2, ky() + yukseklik(), 5, new int[] { 0xFFA1A1AA, 0xFFD4D4D8 }, genislik() / 3, 0, 2, 6, 0.25f, 0.4f, 1f, 1.6f, -2, 0.4f);
				}
				x = kx(taraf);
				float k = arada(t, 780, 300);
				sx = 1 + 0.12f * (1 - k);
				sy = 1 - 0.15f * (1 - k);
				if (t >= 1080) eylem = -1;
			}
		}
		bas(g, x + dx, ky() + dy, sx, sy, 0, 5.5f, 13);
		donukParca(g, sp, "kuyruk", 7, 12, kuyruk, 1);
		parca(g, sp, "govde", 0, 1);
		boolean kirp = simdi % 5000 > 4700 && simdi % 5000 < 4850;
		parca(g, sp, kirp ? "gozKapali" : "gozAcik", 0, 1);
		bitir(g);
	}
}
