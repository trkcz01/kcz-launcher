package com.kcz.client;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * KCZ Menü > Düşük sistem / Güçlü sistem > ⋮ : ayrıntılar.
 * Her özellik tek tek açılıp kapanır; altta son 2 dakikanın FPS grafiği var.
 */
public class SistemEkrani extends Screen {
	private final Screen onceki;
	private final boolean dusuk;

	private record Satir(String ad, BooleanSupplier acik, Supplier<String> deger, Runnable tik) {
	}

	private final List<Satir> satirlar = new ArrayList<>();
	private final List<Button> dugmeler = new ArrayList<>();

	private static final int SATIR_H = 18, ARA_H = 3, PAD = 10, GRAFIK_H = 46;
	private static final int[] GORUS_ALT = {4, 6, 8, 10, 12};
	private static final int[] HEDEF_FPS = {30, 60, 100};

	private int pw, ph, px, py, sw, solX, sagX, y0;

	public SistemEkrani(Screen onceki, boolean dusuk) {
		super(Component.literal(dusuk ? Dil.t("Düşük sistem") : Dil.t("Güçlü sistem")));
		this.onceki = onceki;
		this.dusuk = dusuk;
		Ayar a = Ayar.get();
		if (dusuk) {
			satirlar.add(new Satir(Dil.t("Düşük sistem"), () -> a.dusukSistem, null, () -> {
				a.dusukSistem = !a.dusukSistem;
				if (a.dusukSistem) a.gucluSistem = false;
			}));
			Ayar.Dusuk d = a.dusuk;
			satirlar.add(new Satir(Dil.t("Hareketli dokuları durdur"), () -> d.animasyon, null, () -> d.animasyon = !d.animasyon));
			satirlar.add(new Satir(Dil.t("Uzaktaki yaratıkları gizle"), () -> d.uzakVarlik, null, () -> d.uzakVarlik = !d.uzakVarlik));
			satirlar.add(new Satir(Dil.t("Parçacık sınırı"), () -> d.parcacik, null, () -> d.parcacik = !d.parcacik));
			satirlar.add(new Satir(Dil.t("Menüdeyken 30 FPS"), () -> d.menuFps, null, () -> d.menuFps = !d.menuFps));
			satirlar.add(new Satir(Dil.t("Uzak tabela yazılarını gizle"), () -> d.tabela, null, () -> d.tabela = !d.tabela));
			satirlar.add(new Satir(Dil.t("Yağmur ve karı azalt"), () -> d.yagis, null, () -> d.yagis = !d.yagis));
			satirlar.add(new Satir(Dil.t("Sade gökyüzü"), () -> d.gokyuzu, null, () -> d.gokyuzu = !d.gokyuzu));
			satirlar.add(new Satir(Dil.t("Uzak isimleri gizle"), () -> d.isimEtiketi, null, () -> d.isimEtiketi = !d.isimEtiketi));
			satirlar.add(new Satir(Dil.t("Dinamik görüş mesafesi"), () -> d.dinamikGorus, null, () -> d.dinamikGorus = !d.dinamikGorus));
			satirlar.add(new Satir(Dil.t("Görüş en az"), null, () -> String.valueOf(d.gorusAlt), () -> d.gorusAlt = sonraki(GORUS_ALT, d.gorusAlt)));
			satirlar.add(new Satir(Dil.t("Hedef FPS"), null, () -> String.valueOf(a.hedefFps), () -> a.hedefFps = sonraki(HEDEF_FPS, a.hedefFps)));
		} else {
			satirlar.add(new Satir(Dil.t("Güçlü sistem"), () -> a.gucluSistem, null, () -> {
				a.gucluSistem = !a.gucluSistem;
				if (a.gucluSistem) a.dusukSistem = false;
			}));
			Ayar.Guclu g = a.guclu;
			satirlar.add(new Satir(Dil.t("Kenar yumuşatma"), () -> g.kenar, null, () -> g.kenar = !g.kenar));
			satirlar.add(new Satir(Dil.t("Keskinleştirme"), () -> g.keskin, null, () -> g.keskin = !g.keskin));
			satirlar.add(new Satir(Dil.t("Canlı renkler"), () -> g.renk, null, () -> g.renk = !g.renk));
			satirlar.add(new Satir(Dil.t("Hareket bulanıklığı"), () -> g.bulaniklik, null, () -> g.bulaniklik = !g.bulaniklik));
			satirlar.add(new Satir(Dil.t("FPS = ekranın Hz'i"), () -> g.hzFps, null, () -> g.hzFps = !g.hzFps));
		}
	}

	private static int sonraki(int[] liste, int simdi) {
		for (int i = 0; i < liste.length; i++) {
			if (liste[i] > simdi) return liste[i];
		}
		return liste[0];
	}

	/** İlk satır (ana anahtar) tam genişlikte, diğerleri iki sütun */
	private void yerlesim() {
		int sutunSatir = (satirlar.size() - 1 + 1) / 2;
		pw = Math.min(440, this.width - 16);
		ph = 34 + SATIR_H + 8 + sutunSatir * (SATIR_H + ARA_H) + 8 + 12 + GRAFIK_H + 22;
		px = (this.width - pw) / 2;
		py = Math.max(6, (this.height - ph) / 2);
		sw = (pw - PAD * 3) / 2;
		solX = px + PAD;
		sagX = px + PAD * 2 + sw;
		y0 = py + 34;
	}

	private int satirX(int i) {
		if (i == 0) return solX;
		return (i - 1) % 2 == 0 ? solX : sagX;
	}

	private int satirY(int i) {
		if (i == 0) return y0;
		return y0 + SATIR_H + 8 + ((i - 1) / 2) * (SATIR_H + ARA_H);
	}

	private int satirW(int i) {
		return i == 0 ? pw - PAD * 2 : sw;
	}

	private int grafikY() {
		int sutunSatir = (satirlar.size() - 1 + 1) / 2;
		return y0 + SATIR_H + 8 + sutunSatir * (SATIR_H + ARA_H) + 8 + 12;
	}

	@Override
	protected void init() {
		yerlesim();
		dugmeler.clear();
		for (int i = 0; i < satirlar.size(); i++) {
			Satir s = satirlar.get(i);
			Button b = Button.builder(Component.empty(), btn -> {
				s.tik().run();
				Ayar.kaydet();
			}).bounds(satirX(i), satirY(i), satirW(i), SATIR_H).build();
			dugmeler.add(this.addRenderableWidget(b));
		}
	}

	@Override
	public void onClose() {
		Ayar.kaydet();
		this.minecraft.gui.setScreen(this.onceki);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		Ayar a = Ayar.get();
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int zemin2 = Ayar.renk(a.tema.zemin2, 0xFF, 0xFF0D0D10);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int kart = Ayar.ac(zemin, 0.06f);
		int kartUstu = Ayar.ac(zemin, 0.13f);
		int yazi = 0xFFF1F5F9;
		int soluk = 0xFF9CA3AF;

		g.fill(px, py, px + pw, py + ph, zemin2);
		g.fill(px + 1, py + 1, px + pw - 1, py + ph - 1, zemin);
		g.fill(px, py, px + pw, py + 2, vurgu);

		int lx = px + 10, ly = py + 10;
		g.fill(lx, ly, lx + 16, ly + 16, vurgu);
		g.text(this.font, "K", lx + 5, ly + 4, Ayar.ustYazi(vurgu), false);
		g.text(this.font, (dusuk ? Dil.t("Düşük sistem") : Dil.t("Güçlü sistem")) + Dil.t(" · ayrıntılar"), lx + 22, ly + 4, yazi, true);
		String ipucu = Dil.t("Esc ile geri dön");
		g.text(this.font, ipucu, px + pw - 10 - this.font.width(ipucu), ly + 4, soluk, false);

		boolean anaAcik = satirlar.get(0).acik().getAsBoolean();
		for (int i = 0; i < satirlar.size(); i++) {
			Satir s = satirlar.get(i);
			int x = satirX(i), y = satirY(i), w = satirW(i);
			Button b = dugmeler.size() > i ? dugmeler.get(i) : null;
			boolean ust = (mx >= x && mx < x + w && my >= y && my < y + SATIR_H) || (b != null && b.isFocused());
			g.fill(x, y, x + w, y + SATIR_H, ust ? kartUstu : kart);
			// Ana anahtar kapalıyken ayrıntılar soluk görünür (ayarlanabilir ama etkisiz)
			int renk = i == 0 || anaAcik ? yazi : soluk;
			g.text(this.font, s.ad(), x + 7, y + (SATIR_H - 8) / 2, renk, false);
			if (s.acik() != null) {
				boolean acik = s.acik().getAsBoolean();
				int tw = 22, th = 10;
				int tx = x + w - tw - 7, ty = y + (SATIR_H - th) / 2;
				g.fill(tx, ty, tx + tw, ty + th, acik ? (i == 0 || anaAcik ? vurgu : Ayar.ac(0xFF4B5563, 0.2f)) : 0xFF4B5563);
				int dx = acik ? tx + tw - 9 : tx + 1;
				g.fill(dx, ty + 1, dx + 8, ty + th - 1, 0xFFFFFFFF);
			} else {
				String d = "‹ " + s.deger().get() + " ›";
				g.text(this.font, d, x + w - 7 - this.font.width(d), y + (SATIR_H - 8) / 2, vurgu, false);
			}
		}

		grafik(g, vurgu, kart, yazi, soluk);
	}

	/** Son 2 dakikanın FPS'i: çubuklar. Takılma olan saniyeler (100 ms'den uzun kare) kırmızı. */
	private void grafik(GuiGraphicsExtractor g, int vurgu, int kart, int yazi, int soluk) {
		int gx = solX, gy = grafikY(), gw = pw - PAD * 2;
		int n = Hud.gecmisSayisi;
		int enCok = 30;
		long toplam = 0;
		int takilma = 0;
		for (int i = 0; i < n; i++) {
			int idx = (Hud.gecmisSira - n + i + Hud.GECMIS) % Hud.GECMIS;
			enCok = Math.max(enCok, Hud.fpsGecmisi[idx]);
			toplam += Hud.fpsGecmisi[idx];
			if (Hud.enUzunKare[idx] > 100f) takilma++;
		}
		String baslik = n == 0 ? Dil.t("FPS GEÇMİŞİ · ölçülüyor...")
				: Dil.t("FPS GEÇMİŞİ · ortalama ") + (toplam / n) + Dil.t(" · şimdi ") + Hud.sonFps() + (takilma > 0 ? " · " + takilma + Dil.t(" takılma") : "");
		g.text(this.font, baslik, gx, gy - 12, soluk, false);
		g.fill(gx, gy, gx + gw, gy + GRAFIK_H, kart);
		if (n == 0) return;
		float cubuk = gw / (float) Hud.GECMIS;
		for (int i = 0; i < n; i++) {
			int idx = (Hud.gecmisSira - n + i + Hud.GECMIS) % Hud.GECMIS;
			int h = Math.max(1, Math.round((GRAFIK_H - 4) * Hud.fpsGecmisi[idx] / (float) enCok));
			int x0 = gx + Math.round((Hud.GECMIS - n + i) * cubuk);
			int x1 = Math.max(x0 + 1, gx + Math.round((Hud.GECMIS - n + i + 1) * cubuk) - 1);
			int renk = Hud.enUzunKare[idx] > 100f ? 0xFFEF4444 : vurgu;
			g.fill(x0, gy + GRAFIK_H - h, x1, gy + GRAFIK_H, renk);
		}
		// Hedef FPS çizgisi
		int hedef = Ayar.get().hedefFps;
		if (hedef <= enCok) {
			int hy = gy + GRAFIK_H - Math.round((GRAFIK_H - 4) * hedef / (float) enCok);
			g.fill(gx, hy, gx + gw, hy + 1, 0x80FFFFFF);
		}
		String alt = enCok + Dil.t(" FPS");
		g.text(this.font, alt, gx + gw - this.font.width(alt) - 3, gy + 3, soluk, false);
	}
}
