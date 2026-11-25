package com.kcz.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;

/**
 * Hesaplar: ana menünün ve Esc menüsünün sağ üstündeki düğmeyle açılır.
 * - Microsoft hesapları: launcher'da kayıtlı; geçiş ve ekleme launcher üzerinden.
 * - İsimle giriş (çevrimdışı): isim yazılıp o isimle girilir; isimler listede kalır.
 */
public class HesapEkrani extends Screen {
	private static final int PW = 250;
	private static final int SATIR = 24;

	private final Screen onceki;
	private int gorulenSurum = -1;
	private boolean gorulenBagli;
	private int px, py, ph;
	/** Yazıların yeri (init'te hesaplanır) */
	private int bosY = -1, kodY = -1, ipucuY = -1;

	/** "İsimle gir" açık mı ve kutudaki yazı (ekran yenilenince kaybolmasın) */
	private boolean isimModu = false;
	private String isimYazisi = "";
	private EditBox isimKutusu;

	public HesapEkrani(Screen onceki) {
		super(Component.literal("Hesaplar"));
		this.onceki = onceki;
	}

	private boolean bagli() {
		return Arkadaslar.bagli();
	}

	@Override
	protected void init() {
		gorulenSurum = Hesaplar.surum();
		gorulenBagli = bagli();
		boolean bagli = gorulenBagli;
		boolean mesgul = Hesaplar.mesgul();
		String g = Hesaplar.girisDurum();
		boolean girisAcik = g.equals("bekliyor") || g.equals("kod");
		if (girisAcik) {
			isimModu = false;
		}
		if (isimKutusu != null) {
			isimYazisi = isimKutusu.getValue();
		}
		isimKutusu = null;
		bosY = kodY = ipucuY = -1;

		int ms = Hesaplar.liste().size();
		int cd = Hesaplar.cevrimdisiAdlar().size();
		int satirSayisi = Math.max(1, ms + cd) + (girisAcik ? 4 : isimModu ? 2 : 1);
		ph = 58 + satirSayisi * SATIR + 52;
		px = (this.width - PW) / 2;
		py = Math.max(10, (this.height - ph) / 2);
		int x = px + 12;
		int w = PW - 24;
		int y = py + 46;

		// Microsoft hesapları (launcher'dan)
		for (Hesaplar.Hesap h : Hesaplar.liste()) {
			boolean burada = Hesaplar.oyundakiMi(this.minecraft, h);
			Button b = addRenderableWidget(Button.builder(
					Component.literal(burada ? h.ad() + "  §a● oyunda" : h.ad()),
					btn -> sec(h.ad(), false, () -> Hesaplar.gec(this.minecraft, h))).bounds(x, y, w, 20).build());
			b.active = bagli && !mesgul && !burada;
			y += SATIR;
		}
		// İsimle girilen (çevrimdışı) hesaplar
		for (String ad : Hesaplar.cevrimdisiAdlar()) {
			boolean burada = Hesaplar.oyundakiAdMi(this.minecraft, ad);
			Button b = addRenderableWidget(Button.builder(
					Component.literal(ad + (burada ? "  §a● oyunda" : "  §7· çevrimdışı")),
					btn -> sec(ad, true, () -> Hesaplar.cevrimdisiGec(this.minecraft, ad))).bounds(x, y, w - 24, 20).build());
			b.active = !mesgul && !burada;
			Button sil = addRenderableWidget(Button.builder(Component.literal("×"), btn -> {
				Hesaplar.cevrimdisiSil(ad);
				rebuildWidgets();
			}).bounds(x + w - 20, y, 20, 20).build());
			sil.active = !burada;
			y += SATIR;
		}
		if (ms + cd == 0) {
			bosY = y + 6;
			y += SATIR;
		}

		if (girisAcik) {
			kodY = y;
			y += SATIR * 2; // kod kutusu
			int yarim = (w - 6) / 2;
			Button ac = addRenderableWidget(Button.builder(Component.literal("Tarayıcıyı aç"),
					b -> Hesaplar.tarayiciAc(this.minecraft)).bounds(x, y, yarim, 20).build());
			ac.active = g.equals("kod");
			Button kopyala = addRenderableWidget(Button.builder(Component.literal("Kodu kopyala"), b -> {
				this.minecraft.keyboardHandler.setClipboard(Hesaplar.girisKod());
				b.setMessage(Component.literal("Kopyalandı ✔"));
			}).bounds(x + yarim + 6, y, yarim, 20).build());
			kopyala.active = g.equals("kod");
			y += SATIR;
			addRenderableWidget(Button.builder(Component.literal("Vazgeç"),
					b -> Hesaplar.girisIptal(this.minecraft)).bounds(x, y, w, 20).build());
		} else if (isimModu) {
			ipucuY = y + 6;
			y += SATIR;
			isimKutusu = new EditBox(this.font, x, y + 1, w - 96, 18, Component.literal("İsim"));
			isimKutusu.setMaxLength(16);
			isimKutusu.setHint(Component.literal("Oyuncu adı"));
			isimKutusu.setValue(isimYazisi);
			// Sadece harf, rakam ve _ kalsın (26.x EditBox'ta filtre yok; yazılanı temizle)
			isimKutusu.setResponder(s -> {
				String temiz = s.replaceAll("[^A-Za-z0-9_]", "");
				if (!temiz.equals(s)) {
					isimKutusu.setValue(temiz);
				}
			});
			addRenderableWidget(isimKutusu);
			Button gir = addRenderableWidget(Button.builder(Component.literal("Gir"), b -> isimleGir())
					.bounds(x + w - 92, y, 44, 20).build());
			gir.active = !mesgul;
			addRenderableWidget(Button.builder(Component.literal("Vazgeç"), b -> {
				isimModu = false;
				isimYazisi = "";
				rebuildWidgets();
			}).bounds(x + w - 44, y, 44, 20).build());
			setInitialFocus(isimKutusu);
		} else {
			int yarim = (w - 6) / 2;
			Button ekle = addRenderableWidget(Button.builder(Component.literal("+ Microsoft hesabı"),
					b -> Hesaplar.ekle(this.minecraft)).bounds(x, y, yarim, 20).build());
			ekle.active = bagli && !mesgul;
			Button isim = addRenderableWidget(Button.builder(Component.literal("+ İsimle gir"), b -> {
				isimModu = true;
				rebuildWidgets();
			}).bounds(x + yarim + 6, y, yarim, 20).build());
			isim.active = !mesgul;
		}

		addRenderableWidget(Button.builder(Component.literal("Kapat"), b -> onClose())
				.bounds(px + PW / 2 - 50, py + ph - 28, 100, 20).build());
	}

	private void isimleGir() {
		String ad = isimKutusu == null ? "" : isimKutusu.getValue().strip();
		if (!Hesaplar.gecerliAd(ad)) {
			Hesaplar.cevrimdisiGec(this.minecraft, ad); // durum satırına kuralı yazar
			return;
		}
		isimModu = false;
		isimYazisi = "";
		sec(ad, true, () -> Hesaplar.cevrimdisiGec(this.minecraft, ad));
	}

	/** Dünyadayken önce sor: sunucudan çıkılıp yeni hesapla tekrar girilecek. */
	private void sec(String ad, boolean cevrimdisi, Runnable gec) {
		if (this.minecraft.level == null) {
			gec.run();
			rebuildWidgets();
			return;
		}
		boolean tek = this.minecraft.isLocalServer();
		Component baslik = Component.literal(ad + " hesabına geçilsin mi?");
		String m = tek
				? "Dünya kaydedilip ana menüye dönülecek, sonra hesap değişecek."
				: "Sunucudan çıkılıp " + ad + " hesabıyla aynı sunucuya tekrar bağlanılacak.";
		if (cevrimdisi && !tek) {
			m += " Çevrimdışı hesapla sadece premium istemeyen sunuculara girilebilir.";
		}
		this.minecraft.gui.setScreen(new ConfirmScreen(onay -> {
			if (onay) {
				gec.run();
			}
			this.minecraft.gui.setScreen(this);
		}, baslik, Component.literal(m)));
	}

	@Override
	public boolean keyPressed(KeyEvent e) {
		if (e.isConfirmation() && isimKutusu != null && isimKutusu.isFocused()) {
			isimleGir();
			return true;
		}
		return super.keyPressed(e);
	}

	@Override
	public void tick() {
		super.tick();
		if (Hesaplar.surum() != gorulenSurum || bagli() != gorulenBagli) {
			rebuildWidgets();
		}
	}

	@Override
	public void onClose() {
		this.minecraft.gui.setScreen(onceki);
	}

	@Override
	public boolean isPauseScreen() {
		return true;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float d) {
		Ayar a = Ayar.get();
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		g.fill(0, 0, this.width, this.height, 0x99000000);
		g.fill(px - 1, py - 1, px + PW + 1, py + ph + 1, Ayar.ac(zemin, 0.09f));
		g.fill(px, py, px + PW, py + ph, zemin);
		g.fill(px, py, px + 2, py + ph, vurgu);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float d) {
		super.extractRenderState(g, mx, my, d);
		Ayar a = Ayar.get();
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int x = px + 12;
		g.text(this.font, "Hesaplar", x, py + 10, 0xFFF1F5F9, false);
		g.text(this.font, "Oyundaki hesap: " + this.minecraft.getUser().getName(), x, py + 24, 0xFF9CA3AF, false);

		if (bosY >= 0) {
			g.text(this.font, bagli() ? "Kayıtlı hesap yok." : "Hesap listesi bekleniyor…", x, bosY, 0xFF9CA3AF, false);
		}
		if (ipucuY >= 0) {
			g.text(this.font, "Premium istemeyen sunucular ve tek oyunculu için:", x, ipucuY, 0xFFCBD5E1, false);
		}

		String gd = Hesaplar.girisDurum();
		if (kodY >= 0 && gd.equals("bekliyor")) {
			g.text(this.font, "Giriş kodu hazırlanıyor…", x, kodY + 6, 0xFFCBD5E1, false);
		} else if (kodY >= 0 && gd.equals("kod")) {
			g.text(this.font, "Tarayıcıda açılan sayfaya bu kodu gir:", x, kodY, 0xFFCBD5E1, false);
			// Kod büyük yazılsın
			g.pose().pushMatrix();
			g.pose().translate(px + PW / 2f, kodY + 14);
			g.pose().scale(2f, 2f);
			g.centeredText(this.font, Hesaplar.girisKod(), 0, 0, vurgu);
			g.pose().popMatrix();
		}

		// Alt bilgi: son işlem, giriş hatası veya launcher durumu
		int alt = py + ph - 42;
		if (gd.equals("hata") && !Hesaplar.girisHata().isEmpty()) {
			g.centeredText(this.font, this.font.plainSubstrByWidth(Hesaplar.girisHata(), PW - 16), px + PW / 2, alt, 0xFFF87171);
		} else if (!Hesaplar.durum().isEmpty()) {
			g.centeredText(this.font, this.font.plainSubstrByWidth(Hesaplar.durum(), PW - 16), px + PW / 2, alt,
					Hesaplar.durumHata() ? 0xFFF87171 : 0xFF86EFAC);
		} else if (!bagli()) {
			g.centeredText(this.font, "Launcher kapalı: Microsoft hesapları için açık olmalı.", px + PW / 2, alt, 0xFFF87171);
		}
	}
}
