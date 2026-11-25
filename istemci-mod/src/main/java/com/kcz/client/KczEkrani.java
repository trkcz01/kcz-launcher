package com.kcz.client;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * KCZ Client menüsü (ESC ekranındaki "KCZ Menü" düğmesi). Renkleri launcher'da seçili temadan gelir.
 * Solda sekmeler (Ekran, Zoom, Performans, Eklentiler), sağda o sekmenin ayarları.
 * Her satırın altında oyunun kendi düğmesi var: tıklama ve klavye (Tab/Enter) onunla çalışır,
 * görünüşü ise bizim çizdiğimiz panel.
 */
public class KczEkrani extends Screen {
	private final Screen onceki;

	/** Bir ayar satırı: anahtar (acik != null), seçim (deger != null) ya da düğme (ikisi de null). detay: ⋮ */
	private record Satir(String ad, String aciklama, BooleanSupplier acik, Supplier<String> deger, Runnable tik, Runnable detay) {
	}

	private static final String[] SEKMELER = { "Ekran", "Eşya", "Nişangah", "Hareket", "Zoom", "Performans", "Eklentiler", "Arkadaşlar" };
	private static final String[] SEKME_ACIKLAMA = {
			"Göstergeler · hemen uygulanır",
			"Eşya göstergeleri · HUD'u düzenle ile taşı",
			"Ortadaki nişan işareti",
			"Koşma ve eğilme",
			"C basılı tut · tekerlekle yaklaş / uzaklaş",
			"Hemen uygulanır · ⋮ ile ayrıntılar",
			"Oyunu kapatıp açınca uygulanır",
			"Mesaj at · sunucuna çağır · yanına katıl" };
	private static final int EKLENTI_SEKMESI = 6, ARKADAS_SEKMESI = 7, NISANGAH_SEKMESI = 2;
	private static int sekme = 0;

	private static final float[] BASLANGIC = { 1.5f, 2f, 3f, 4f, 6f, 8f };
	private static final float[] EN_FAZLA = { 4f, 8f, 16f, 32f, 64f, 128f };
	private static final int SATIR_H = 20, ARA_H = 3, PAD = 10, SEKME_W = 104, DETAY_W = 20, BASLIK_H = 36;

	private final List<Satir> satirlar = new ArrayList<>();
	/** Arkadaşlar sekmesinde her satırın ne olduğu (Arkadas, Davet ya da null) */
	private final List<Object> arkTur = new ArrayList<>();
	private final List<Button> dugmeler = new ArrayList<>();
	private final List<Button> sekmeDugmeleri = new ArrayList<>();

	// Yerleşim
	private int pw, ph, px, py, icX, icW, y0;

	/** Belirli bir sekmeyle aç (ör. Esc ekranındaki Arkadaşlar düğmesi) */
	public static KczEkrani sekmeyle(Screen onceki, boolean arkadaslar) {
		if (arkadaslar) sekme = ARKADAS_SEKMESI;
		else if (sekme == ARKADAS_SEKMESI) sekme = 0;
		return new KczEkrani(onceki);
	}

	public KczEkrani(Screen onceki) {
		super(Component.literal("KCZ Client"));
		this.onceki = onceki;
	}

	private void satirlariKur() {
		satirlar.clear();
		arkTur.clear();
		Ayar a = Ayar.get();
		switch (sekme) {
			case 0 -> {
				satirlar.add(anahtar("FPS", "Saniyedeki kare", () -> a.fps, () -> a.fps = !a.fps));
				satirlar.add(anahtar("Ping", "Sunucuya gecikme", () -> a.ping, () -> a.ping = !a.ping));
				satirlar.add(anahtar("Tuş göstergesi", "WASD, fare, zıplama", () -> a.tuslar, () -> a.tuslar = !a.tuslar));
				satirlar.add(anahtar("CPS", a.tuslar ? "Fare tuşlarının içinde" : "Saniyedeki tıklama", () -> a.cps, () -> a.cps = !a.cps));
				satirlar.add(anahtar("Koordinat ve yön", "XYZ ve baktığın yön", () -> a.koordinat, () -> a.koordinat = !a.koordinat));
				satirlar.add(anahtar("Zırh", "Parçaların dayanıklılığı", () -> a.zirh, () -> a.zirh = !a.zirh));
				satirlar.add(anahtar("İksirler", "Etkiler ve kalan süre", () -> a.iksir, () -> a.iksir = !a.iksir));
				satirlar.add(new Satir("HUD'u düzenle", "sürükle bırak", null, null,
						() -> this.minecraft.gui.setScreen(new HudDuzenleEkrani(this)), null));
			}
			case 1 -> {
				satirlar.add(anahtar("Eldeki eşya", "Kalan dayanıklılık", () -> a.eldeki, () -> a.eldeki = !a.eldeki));
				satirlar.add(anahtar("Ok sayısı", "Envanterdeki oklar", () -> a.okSayisi, () -> a.okSayisi = !a.okSayisi));
				satirlar.add(anahtar("Totem sayısı", "Ölümsüzlük totemleri", () -> a.totem, () -> a.totem = !a.totem));
				satirlar.add(anahtar("Hız", "Saniyede kaç blok", () -> a.hiz, () -> a.hiz = !a.hiz));
				satirlar.add(anahtar("Gerçek saat", "Bilgisayarın saati", () -> a.saat, () -> a.saat = !a.saat));
				satirlar.add(new Satir("HUD'u düzenle", "sürükle bırak", null, null,
						() -> this.minecraft.gui.setScreen(new HudDuzenleEkrani(this)), null));
			}
			case 2 -> {
				satirlar.add(anahtar("Özel nişangah", "Kapalıyken oyunun kendisi", () -> a.nisangah, () -> a.nisangah = !a.nisangah));
				satirlar.add(new Satir("Şekil", null, null, () -> ad(Nisangah.SEKILLER, Nisangah.SEKIL_ADI, a.nisangahSekil),
						() -> a.nisangahSekil = secimAdim(Nisangah.SEKILLER, a.nisangahSekil), null));
				satirlar.add(new Satir("Renk", null, null, () -> ad(Nisangah.RENKLER, Nisangah.RENK_ADI, a.nisangahRenk),
						() -> a.nisangahRenk = secimAdim(Nisangah.RENKLER, a.nisangahRenk), null));
				satirlar.add(new Satir("Boyut", null, null, () -> new String[] { "Küçük", "Orta", "Büyük" }[Math.max(1, Math.min(3, a.nisangahBoyut)) - 1],
						() -> a.nisangahBoyut = (int) adim(new float[] { 1, 2, 3 }, a.nisangahBoyut), null));
				satirlar.add(anahtar("Hedefte kırmızı", "Yaratığa bakınca renk değişir", () -> a.nisangahDinamik, () -> a.nisangahDinamik = !a.nisangahDinamik));
			}
			case 3 -> {
				satirlar.add(anahtar("Koşmayı açık tut", "Ctrl'e basmadan koş", () -> a.surekliKos, () -> a.surekliKos = !a.surekliKos));
				satirlar.add(anahtar("Eğilmeyi açık tut", "Shift'e bir kere bas", () -> a.egilmeTut, () -> a.egilmeTut = !a.egilmeTut));
			}
			case 4 -> {
				satirlar.add(anahtar("Yakınlaştırma", "C tuşu, tekerlekle ayarla", () -> a.zoom, () -> a.zoom = !a.zoom));
				satirlar.add(new Satir("İlk zoom", null, null, () -> kat(a.zoomBaslangic), () -> a.zoomBaslangic = adim(BASLANGIC, a.zoomBaslangic), null));
				satirlar.add(new Satir("En fazla zoom", null, null, () -> kat(a.zoomKat), () -> a.zoomKat = adim(EN_FAZLA, a.zoomKat), null));
			}
			case 5 -> {
				satirlar.add(new Satir("Düşük sistem", "zayıf bilgisayar", () -> a.dusukSistem, null, () -> {
					a.dusukSistem = !a.dusukSistem;
					if (a.dusukSistem) a.gucluSistem = false;
				}, () -> this.minecraft.gui.setScreen(new SistemEkrani(this, true))));
				satirlar.add(new Satir("Güçlü sistem", "görüntü kalitesi", () -> a.gucluSistem, null, () -> {
					a.gucluSistem = !a.gucluSistem;
					if (a.gucluSistem) a.dusukSistem = false;
				}, () -> this.minecraft.gui.setScreen(new SistemEkrani(this, false))));
				var op = this.minecraft.options;
				satirlar.add(new Satir("Görüş mesafesi", null, null, () -> op.renderDistance().get() + " chunk", () -> {
					op.renderDistance().set((int) adim(new float[] { 4, 6, 8, 10, 12, 16, 20, 24, 28, 32 }, op.renderDistance().get()));
					op.save();
				}, null));
				satirlar.add(anahtar("Arka planda FPS düşür", "Alt-Tab'da bilgisayarı yormaz", () -> a.arkaplanFps, () -> a.arkaplanFps = !a.arkaplanFps));
				if (Kenarliksiz.destekleniyor())
					satirlar.add(anahtar("Kenarlıksız tam ekran", "Alt-Tab'da kararma olmaz", () -> a.kenarliksiz, () -> a.kenarliksiz = !a.kenarliksiz));
			}
			case ARKADAS_SEKMESI -> arkadasSatirlari();
			default -> {
				satirlar.add(anahtar("KCZ Optimizasyon", "Daha fazla FPS", () -> a.optimizasyon, () -> a.optimizasyon = !a.optimizasyon));
				satirlar.add(anahtar("KCZ sesli sohbet", "Yakındakiler duyar · B: konuş", () -> a.yakinSes, () -> a.yakinSes = !a.yakinSes));
				satirlar.add(anahtar("Sesli: sadece arkadaşlar", "IP adresin yabancıya gitmez", () -> a.sesSadeceArkadas, () -> a.sesSadeceArkadas = !a.sesSadeceArkadas));
				satirlar.add(anahtar("Simple Voice Chat", "Sunucuda da kurulu olmalı", () -> a.sesliSohbet, () -> a.sesliSohbet = !a.sesliSohbet));
				satirlar.add(anahtar("Uzak görüş", "Sunucu sınırından uzağı göster", () -> a.uzakGorus, () -> a.uzakGorus = !a.uzakGorus));
				satirlar.add(anahtar("Oyun kaydı", "Flashback ile video", () -> a.kayit, () -> a.kayit = !a.kayit));
			}
		}
	}

	/** Arkadaşlar sekmesi: önce gelen davetler (Katıl), sonra arkadaşlar (Davet et). En fazla 7 satır. */
	private void arkadasSatirlari() {
		var mc = this.minecraft;
		if (!Arkadaslar.bagli()) {
			satirlar.add(new Satir("Launcher bağlı değil", "KCZ Launcher açık olmalı", null, null, () -> {
			}, null));
			arkTur.add(null);
			return;
		}
		int kalan = 6;
		var davetler = Arkadaslar.davetler();
		for (int i = davetler.size() - 1; i >= 0 && kalan > 0; i--, kalan--) {
			var d = davetler.get(i);
			satirlar.add(new Satir(d.ad(), d.sunucu(), null, null, () -> Arkadaslar.katil(mc, d.sunucu()), null));
			arkTur.add(d);
		}
		var liste = Arkadaslar.liste();
		if (liste.isEmpty() && kalan > 0) {
			satirlar.add(new Satir("Henüz arkadaşın yok", "Launcher > Arkadaşlar'dan ID ile ekle", null, null, () -> {
			}, null));
			arkTur.add(null);
			return;
		}
		String burasi = Arkadaslar.sunucu(mc);
		for (int i = 0; i < liste.size() && kalan > 0; i++, kalan--) {
			var a = liste.get(i);
			String durum = a.oyunda() ? (a.sunucu() != null && !a.sunucu().isEmpty()
					? (a.sunucu().equalsIgnoreCase(burasi) ? "Seninle aynı sunucuda" : "Oyunda · " + a.sunucu()) : "Oyunda")
					: a.cevrimici() ? "Launcher açık" : Arkadaslar.cevrimdisiYazi(a);
			satirlar.add(new Satir(a.ad(), durum, null, null, () -> mc.gui.setScreen(new SohbetEkrani(this, a)), null));
			arkTur.add(a);
		}
	}

	private int arkadasImza = 0;

	@Override
	public void tick() {
		super.tick();
		// Arkadaşlar sekmesi açıkken liste değişince yenile
		if (sekme == ARKADAS_SEKMESI) {
			int imza = java.util.Objects.hash(Arkadaslar.bagli(), Arkadaslar.liste(), Arkadaslar.davetler());
			if (imza != arkadasImza) {
				arkadasImza = imza;
				this.rebuildWidgets();
			}
		}
	}

	private static Satir anahtar(String ad, String aciklama, BooleanSupplier acik, Runnable tik) {
		return new Satir(ad, aciklama, acik, null, tik, null);
	}

	/** Son tıklamanın yatay konumu: değerin solundaki ‹ azaltır, sağındaki › artırır */
	private double sonTikX = Double.MAX_VALUE;

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean cift) {
		sonTikX = e.x();
		return super.mouseClicked(e, cift);
	}

	@Override
	public boolean keyPressed(KeyEvent olay) {
		sonTikX = Double.MAX_VALUE; // klavyede Enter: artır
		if (KczClient.MENU.matches(olay)) {
			onClose();
			return true;
		}
		return super.keyPressed(olay);
	}

	/** Seçim satırında: tıklama değerin ortasından soldaysa bir önceki, sağdaysa bir sonraki değer (uçlarda durur) */
	private float adim(float[] liste, float simdi) {
		boolean geri = sonTikX < icX + icW - 12 - this.font.width("‹ " + kat(simdi) + " ›") / 2.0;
		if (geri) {
			// Şu andakinden küçük en büyük değer (yoksa en küçükte kalır)
			for (int i = liste.length - 1; i >= 0; i--) {
				if (liste[i] < simdi - 0.01f) return liste[i];
			}
			return liste[0];
		}
		// Şu andakinden büyük en küçük değer (yoksa en büyükte kalır)
		for (float f : liste) {
			if (f > simdi + 0.01f) return f;
		}
		return liste[liste.length - 1];
	}


	/** Her satırın ekrandaki kutusu {x, y, w, h}: anahtarlar iki sütun kart, diğerleri tam genişlik */
	private final List<int[]> kutular = new ArrayList<>();
	private static final int KART_H = 30, TAM_H = 24, BOSLUK = 6;

	private void yerlesim() {
		pw = Math.min(500, this.width - 16);
		ph = Math.min(this.height - 12, 290);
		px = (this.width - pw) / 2;
		py = Math.max(6, (this.height - ph) / 2);
		icX = px + SEKME_W + PAD;
		icW = pw - SEKME_W - PAD * 2;
		y0 = py + BASLIK_H + 36;
		kutular.clear();
		int y = y0, sutun = 0;
		int kw = (icW - BOSLUK) / 2;
		for (Satir s : satirlar) {
			boolean kart = s.acik() != null && s.detay() == null;
			if (kart) {
				kutular.add(new int[] { icX + sutun * (kw + BOSLUK), y, kw, KART_H });
				sutun++;
				if (sutun == 2) {
					sutun = 0;
					y += KART_H + BOSLUK;
				}
			} else {
				if (sutun != 0) {
					sutun = 0;
					y += KART_H + BOSLUK;
				}
				int h = s.detay() != null || sekme == ARKADAS_SEKMESI ? KART_H : TAM_H;
				kutular.add(new int[] { icX, y, icW, h });
				y += h + BOSLUK;
			}
		}
	}

	@Override
	protected void init() {
		if (sekme == NISANGAH_SEKMESI) sekme = 0;
		satirlariKur();
		yerlesim();
		dugmeler.clear();
		sekmeDugmeleri.clear();
		// Sekmeler
		for (int i = 0; i < SEKMELER.length; i++) {
			final int s = i;
			Button b = Button.builder(Component.empty(), btn -> {
				sekme = s;
				this.rebuildWidgets();
			}).bounds(px + 6, sekmeY(i), SEKME_W - 12, SATIR_H).build();
			b.visible = i != NISANGAH_SEKMESI;
			sekmeDugmeleri.add(this.addRenderableWidget(b));
		}
		// Satırlar (her kartın altında oyunun kendi düğmesi: tıklama ve Tab/Enter onunla çalışır)
		for (int i = 0; i < satirlar.size(); i++) {
			Satir s = satirlar.get(i);
			int[] k = kutular.get(i);
			int genis = s.detay() != null ? k[2] - DETAY_W - 3 : k[2];
			Button b = Button.builder(Component.empty(), btn -> {
				s.tik().run();
				Ayar.kaydet();
				// CPS kartının açıklaması tuş göstergesine bağlı
				if (sekme == 0) this.rebuildWidgets();
			}).bounds(k[0], k[1], genis, k[3]).build();
			dugmeler.add(this.addRenderableWidget(b));
			if (s.detay() != null) {
				this.addRenderableWidget(Button.builder(Component.empty(), btn -> {
					Ayar.kaydet();
					s.detay().run();
				}).bounds(k[0] + k[2] - DETAY_W, k[1], DETAY_W, k[3]).build());
			}
		}
	}

	@Override
	public void onClose() {
		Ayar.kaydet();
		this.minecraft.gui.setScreen(this.onceki);
	}



	/** Küçük (yarı boy) yazı */
	private void kucukYazi(GuiGraphicsExtractor g, String m, float x, float y, int renk) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(0.75f, 0.75f);
		g.text(this.font, m, 0, 0, renk, false);
		g.pose().popMatrix();
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// Önce oyunun kendi çizimi (arka plan ve düğmeler), sonra üstüne tamamen örten bizim panelimiz
		super.extractRenderState(g, mx, my, delta);
		Ayar a = Ayar.get();

		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int zemin2 = Ayar.renk(a.tema.zemin2, 0xFF, 0xFF0D0D10);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int kart = Ayar.ac(zemin, 0.05f);
		int kartUstu = Ayar.ac(zemin, 0.11f);
		int yazi = 0xFFF1F5F9;
		int soluk = 0xFF9CA3AF;
		int cokSoluk = 0xFF6B7280;

		int cizgi = Ayar.ac(zemin, 0.07f);
		int yesil = 0xFF4ADE80, sari = 0xFFFACC15, gri = 0xFF6B7280;

		// Arka planı karart, panel: ince kenarlı, köşeleri yumuşak
		g.fill(0, 0, this.width, this.height, 0x66000000);
		kutu(g, px - 1, py - 1, pw + 2, ph + 2, Ayar.ac(zemin, 0.09f));
		kutu(g, px, py, pw, ph, zemin);
		// Üst çubuk
		g.fill(px + 1, py + BASLIK_H, px + pw - 1, py + BASLIK_H + 1, cizgi);
		int lx = px + 12, ly = py + (BASLIK_H - 16) / 2;
		kutu(g, lx, ly, 16, 16, vurgu);
		g.text(this.font, "K", lx + 5, ly + 4, Ayar.ustYazi(vurgu), false);
		g.text(this.font, "KCZ Client", lx + 24, ly + 4, yazi, false);
		String esc = "Esc ile kapat";
		kucukYazi(g, esc, px + pw - 12 - this.font.width(esc) * 0.75f, py + (BASLIK_H - 6) / 2f, cokSoluk);

		// Sol menü
		g.fill(px + SEKME_W, py + BASLIK_H + 1, px + SEKME_W + 1, py + ph - 1, cizgi);
		for (int i = 0; i < SEKMELER.length; i++) {
			if (i == NISANGAH_SEKMESI) continue;
			int x = px + 6, y = sekmeY(i), w = SEKME_W - 12;
			Button b = i < sekmeDugmeleri.size() ? sekmeDugmeleri.get(i) : null;
			boolean secili = i == sekme;
			boolean ust = (mx >= x && mx < x + w && my >= y && my < y + SATIR_H) || (b != null && b.isFocused());
			if (secili) kutu(g, x, y, w, SATIR_H, Ayar.ac(zemin, 0.08f));
			else if (ust) kutu(g, x, y, w, SATIR_H, Ayar.ac(zemin, 0.04f));
			if (secili) g.fill(x + 1, y + 6, x + 3, y + SATIR_H - 6, vurgu);
			g.text(this.font, SEKMELER[i], x + 10, y + (SATIR_H - 8) / 2, secili ? yazi : ust ? 0xFFD1D5DB : soluk, false);
			if (i == ARKADAS_SEKMESI) {
				g.fill(x + 4, y + SATIR_H + 4, x + w - 4, y + SATIR_H + 5, cizgi);
				int n = Arkadaslar.davetler().size() + Arkadaslar.okunmamisToplam();
				if (n > 0) {
					String r = String.valueOf(n);
					int rw = this.font.width(r) + 6, rx = x + w - rw - 4, ry = y + (SATIR_H - 10) / 2;
					kutu(g, rx, ry, rw, 10, yesil);
					g.text(this.font, r, rx + 3, ry + 1, 0xFF052E16, false);
				}
			}
		}
		kucukYazi(g, "kcz-launcher", px + 12, py + ph - 12, cokSoluk);

		// İçerik başlığı
		g.text(this.font, SEKMELER[sekme], icX, py + BASLIK_H + 10, yazi, false);
		kucukYazi(g, SEKME_ACIKLAMA[sekme], icX, py + BASLIK_H + 22, soluk);
		String not = sekme == EKLENTI_SEKMESI ? "Oyunu yeniden açınca uygulanır"
				: sekme == ARKADAS_SEKMESI ? arkadasOzet() : "Launcher ile eşitlenir";
		kucukYazi(g, not, px + pw - 12 - this.font.width(not) * 0.75f, py + BASLIK_H + 12, cokSoluk);

		for (int i = 0; i < satirlar.size() && i < kutular.size(); i++) {
			Satir s = satirlar.get(i);
			int[] k = kutular.get(i);
			int x = k[0], y = k[1], w = k[2], h = k[3];
			Button b = i < dugmeler.size() ? dugmeler.get(i) : null;
			int genis = s.detay() != null ? w - DETAY_W - 3 : w;
			boolean ust = (mx >= x && mx < x + genis && my >= y && my < y + h) || (b != null && b.isFocused());
			boolean acik = s.acik() != null && s.acik().getAsBoolean();
			kutu(g, x, y, genis, h, ust ? Ayar.ac(zemin, 0.10f) : cizgi);
			kutu(g, x + 1, y + 1, genis - 2, h - 2, ust ? kartUstu : kart);

			Object tur = i < arkTur.size() ? arkTur.get(i) : null;
			if (tur instanceof Arkadaslar.Arkadas a2) {
				int renk = a2.oyunda() ? yesil : a2.cevrimici() ? sari : gri;
				kutu(g, x + 9, y + (h - 6) / 2, 6, 6, renk);
				g.text(this.font, a2.ad(), x + 22, y + 6, yazi, false);
				kucukYazi(g, s.aciklama(), x + 22, y + 18, a2.oyunda() ? 0xFF86EFAC : soluk);
				int yeni = Arkadaslar.okunmamis(a2.uuid());
				if (yeni > 0) hap(g, yeni + " yeni mesaj", x + genis - 8, y, h, yesil, 0xFF052E16);
				else hap(g, "Mesaj", x + genis - 8, y, h, ust ? vurgu : Ayar.ac(zemin, 0.16f), ust ? Ayar.ustYazi(vurgu) : yazi);
				continue;
			}
			if (tur instanceof Arkadaslar.Davet d2) {
				kutu(g, x + 1, y + 1, 2, h - 2, yesil);
				g.text(this.font, d2.ad() + " seni çağırıyor", x + 12, y + 6, yazi, false);
				kucukYazi(g, d2.sunucu(), x + 12, y + 18, 0xFF86EFAC);
				hap(g, "Katıl", x + genis - 8, y, h, yesil, 0xFF052E16);
				continue;
			}

			if (s.acik() != null) {
				// Başlık + açıklama, sağda anahtar
				boolean ikiSatir = s.aciklama() != null && h >= 28;
				int ty = ikiSatir ? y + 6 : y + (h - 8) / 2;
				g.text(this.font, s.ad(), x + 9, ty, acik ? yazi : 0xFFD1D5DB, false);
				if (ikiSatir) kucukYazi(g, s.aciklama(), x + 9, y + 18, soluk);
				int tw = 20, th = 10;
				int tx = x + genis - tw - 9, tyy = y + (h - th) / 2;
				kutu(g, tx, tyy, tw, th, acik ? vurgu : 0xFF3A3F48);
				int dx = acik ? tx + tw - 9 : tx + 1;
				kutu(g, dx, tyy + 1, 8, th - 2, acik ? Ayar.ustYazi(vurgu) : 0xFFD1D5DB);
			} else if (s.deger() != null) {
				g.text(this.font, s.ad(), x + 9, y + (h - 8) / 2, yazi, false);
				String d = "‹ " + s.deger().get() + " ›";
				int dw = this.font.width(d) + 12;
				int dx = x + genis - dw - 6;
				kutu(g, dx, y + 4, dw, h - 8, Ayar.ac(zemin, 0.14f));
				g.text(this.font, d, dx + 6, y + (h - 8) / 2, ust ? yazi : vurgu, false);
			} else {
				g.text(this.font, s.ad(), x + 9, y + (h - 8) / 2, yazi, false);
				String d = (s.aciklama() != null ? s.aciklama() + "  " : "") + "›";
				kucukYazi(g, d, x + genis - 8 - this.font.width(d) * 0.75f, y + (h - 6) / 2f, ust ? yazi : soluk);
			}
			if (s.detay() != null) {
				int dx0 = x + w - DETAY_W;
				boolean dUst = mx >= dx0 && mx < x + w && my >= y && my < y + h;
				kutu(g, dx0, y, DETAY_W, h, dUst ? Ayar.ac(zemin, 0.10f) : cizgi);
				kutu(g, dx0 + 1, y + 1, DETAY_W - 2, h - 2, dUst ? kartUstu : kart);
				int nx = dx0 + DETAY_W / 2 - 1;
				int ny0 = y + (h - 10) / 2;
				for (int n = 0; n < 3; n++) {
					g.fill(nx, ny0 + n * 4, nx + 2, ny0 + n * 4 + 2, dUst ? yazi : soluk);
				}
			}
		}
	}

	/** Sekmenin y'si: Arkadaşlar en üstte, altında ince çizgiyle diğerleri */
	private int sekmeY(int i) {
		// Nişangah sekmesi kaldırıldı (yerini kapatmak için sonrakiler bir yukarı kayar)
		int p = i == ARKADAS_SEKMESI ? 0 : i < NISANGAH_SEKMESI ? i + 1 : i;
		return py + BASLIK_H + 8 + p * (SATIR_H + 2) + (p > 0 ? 8 : 0);
	}

	/** Köşeleri 1 piksel kırpılmış dikdörtgen (yumuşak görünüm) */
	private static void kutu(GuiGraphicsExtractor g, int x, int y, int w, int h, int renk) {
		if (w < 3 || h < 3) {
			g.fill(x, y, x + w, y + h, renk);
			return;
		}
		g.fill(x + 1, y, x + w - 1, y + h, renk);
		g.fill(x, y + 1, x + 1, y + h - 1, renk);
		g.fill(x + w - 1, y + 1, x + w, y + h - 1, renk);
	}

	/** Satırın sağında küçük düğme görünümlü etiket */
	private void hap(GuiGraphicsExtractor g, String m, int sag, int y, int h, int zemin, int renk) {
		int w = this.font.width(m) + 14;
		kutu(g, sag - w, y + (h - 16) / 2, w, 16, zemin);
		g.text(this.font, m, sag - w + 7, y + (h - 16) / 2 + 4, renk, false);
	}

	private static String arkadasOzet() {
		var l = Arkadaslar.liste();
		long c = l.stream().filter(x -> x.cevrimici() || x.oyunda()).count();
		return l.isEmpty() ? "Launcher üzerinden" : c + "/" + l.size() + " çevrimiçi";
	}

	/** Liste değerinin görünen adı */
	private static String ad(String[] kimlik, String[] adlar, String simdi) {
		for (int i = 0; i < kimlik.length; i++) {
			if (kimlik[i].equals(simdi)) return adlar[i];
		}
		return adlar[0];
	}

	/** Metin seçimlerinde ‹ › : soldan tıklama önceki, sağdan sonraki (başa sarar) */
	private String secimAdim(String[] liste, String simdi) {
		int i = 0;
		while (i < liste.length && !liste[i].equals(simdi)) i++;
		if (i >= liste.length) i = 0;
		String gorunen = "‹ " + simdi + " ›";
		boolean geri = sonTikX < icX + icW - 12 - this.font.width(gorunen) / 2.0;
		return liste[(i + (geri ? liste.length - 1 : 1)) % liste.length];
	}

	private static String kat(float k) {
		return (k == Math.round(k) ? String.valueOf(Math.round(k)) : String.valueOf(k)) + "x";
	}
}
